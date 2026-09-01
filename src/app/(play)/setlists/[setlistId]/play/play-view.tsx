"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/domain/error-state";
import { EmptyState } from "@/components/domain/empty-state";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { setlistRepository } from "@/lib/repositories/setlist-repository";
import { songRepository } from "@/lib/repositories/song-repository";
import {
  createInitialPlaybackState,
  tick,
  type PlaybackState,
  type QueueEntry,
} from "./playback-state";
import { PreloadingScreen } from "./preloading-screen";
import { PlaybackScreen } from "./playback-screen";

type Phase = "loading" | "not_found" | "error" | "empty" | "preloading" | "playing" | "ended";

const TICK_MS = 100;

interface PlayViewProps {
  setlistId: string;
}

export function PlayView({ setlistId }: PlayViewProps) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [state, setState] = useState<PlaybackState>(createInitialPlaybackState);
  const [loadRetryKey, setLoadRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setlistRepository
      .getById(setlistId)
      .then(async (detail) => {
        if (cancelled) return;
        if (!detail) {
          setPhase("not_found");
          return;
        }
        const items = [...detail.setlist.items].sort((a, b) => a.orderIndex - b.orderIndex);
        if (items.length === 0) {
          setPhase("empty");
          return;
        }
        const trees = await Promise.all(items.map((item) => songRepository.getTree(item.songId)));
        if (cancelled) return;
        if (trees.some((tree) => !tree)) {
          setPhase("error");
          return;
        }
        const nextQueue: QueueEntry[] = items.map((item, index) => ({
          song: trees[index]!.song,
          arrangementId: item.arrangementId,
        }));
        setQueue(nextQueue);
        setPhase("preloading");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [setlistId, loadRetryKey]);

  // ===== 더미 마디 시계 =====
  // queue는 로드 후 거의 바뀌지 않아 ref로 충분하지만, state는 100ms마다 바뀌므로 ref로
  // 미러링하지 않는다 — 대신 모든 소비처(tick 인터벌, 버튼 핸들러의 goTo)가 setState 함수형
  // 업데이터의 prev를 직접 읽어 항상 React가 들고 있는 진짜 최신 값을 쓰게 한다.
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      setState((prev) => {
        if (!prev.isPlaying) return prev;
        const song = queueRef.current[prev.songIndex].song;
        const deltaBeats = (song.tempo / 60) * (TICK_MS / 1000);
        const next = tick(prev, queueRef.current, deltaBeats);
        // effectivePhase가 렌더 시점에 "ended"로 파생되는 동안 phase 자체는 계속 "playing"에
        // 머물러 있어([phase] 의존성이 다시 바뀌지 않아) 이 effect의 클린업이 실행되지 않는다.
        // 세트리스트가 끝나는 순간 타이머 스스로 멈춰야 한다.
        if (next.ended) clearInterval(interval);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [phase]);

  // 세트리스트 마지막 곡이 자연히 끝났다는 사실(state.ended)을 별도 effect로 phase에 동기화하지
  // 않는다("You Might Not Need an Effect") — 대신 렌더링 시점에 파생시킨다. effect + setPhase
  // 왕복에 기대면 그 타이밍이 tick 인터벌의 setState 업데이터 실행과 정확히 맞물린다는 보장이
  // 약해, 실제로 "예배가 끝났습니다" 화면 전환이 간헐적으로 누락되는 버그가 있었다.
  const effectivePhase = state.ended && phase === "playing" ? "ended" : phase;

  const handleTogglePlay = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const handleToggleLoop = useCallback(() => {
    setState((prev) => ({ ...prev, loopSection: !prev.loopSection }));
  }, []);

  const handleCancelPending = useCallback(() => {
    setState((prev) => ({ ...prev, pending: null }));
  }, []);

  /**
   * 재생 중이 아니면 대기할 오디오가 없으므로 즉시 이동하고, 재생 중이면 다음 마디까지 예약한다.
   * 가사(같은 곡이든 다른 곡이든)를 탭하는 것이 유일한 이동 수단이라, 목표 지점은 항상 호출부가
   * 직접 넘겨준다. 지금 재생 중인 섹션(화면에서 가장 크고 눈에 띄는, 그래서 가장 실수로 누르기
   * 쉬운 지점)을 다시 탭한 경우는 무시한다 — 그렇지 않으면 다음 마디에서 같은 섹션 처음으로
   * 조용히 재시작돼버린다.
   */
  const handleJumpTo = useCallback((songIndex: number, sectionIndex: number) => {
    setState((prev) => {
      if (songIndex === prev.songIndex && sectionIndex === prev.sectionIndex) return prev;
      if (!prev.isPlaying) {
        return { ...prev, songIndex, sectionIndex, elapsedBeats: 0, pending: null };
      }
      return { ...prev, pending: { songIndex, sectionIndex } };
    });
  }, []);

  // queue는 로드 시 한 번만 set되므로 이 참조는 안정적이다. 여기서 매번 새 배열을 만들어
  // 넘기면 PreloadingScreen의 useMemo(assets)가 매 렌더마다 새로 계산되어 시뮬레이터가
  // 재시작(진행률 0%로 리셋)돼버린다.
  const songTitles = useMemo(() => queue.map((entry) => entry.song.title), [queue]);

  // (play) 라우트 그룹은 헤더/내비게이션이 없는 풀스크린 레이아웃이라(재생 화면 자체는
  // 상단에 자체 "예배 종료" 버튼을 둔다), 아직 재생 화면에 도달하지 못한 단계(로딩/에러/사전
  // 로딩)에서는 홈으로 나갈 방법이 전혀 없다. 각 단계에 작게라도 탈출구를 둔다.
  const homeExitLink = (
    <Link
      href={routes.home()}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "absolute top-4 left-4")}
    >
      <Home />
      나가기
    </Link>
  );

  // (play) 레이아웃이 h-dvh + overflow-hidden으로 뷰포트 높이를 강제하므로(재생 화면이 페이지
  // 스크롤 대신 가사 영역만 내부 스크롤하게 하려고), 다른 단계의 콘텐츠가 뷰포트보다 길어지면
  // (예: 곡이 많은 세트리스트의 사전 로딩 자산 목록) 잘려서 안 보이게 된다. 각 단계도 스스로
  // min-h-0 + overflow-y-auto로 내부 스크롤할 수 있게 해둔다.
  if (effectivePhase === "loading") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6">
        {homeExitLink}
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full max-w-md" />
      </div>
    );
  }

  if (effectivePhase === "error") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        {homeExitLink}
        <ErrorState
          className="flex-1"
          title="찬양콘티를 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
          onRetry={() => {
            setPhase("loading");
            setLoadRetryKey((key) => key + 1);
          }}
        />
      </div>
    );
  }

  if (effectivePhase === "not_found") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
        <p className="text-lg font-semibold">찬양콘티를 찾을 수 없습니다</p>
        <p className="text-sm text-muted-foreground">찬양콘티 ID: {setlistId}</p>
        <Button onClick={() => router.push(routes.home())}>홈으로 이동</Button>
      </div>
    );
  }

  if (effectivePhase === "empty") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <EmptyState
          title="곡이 없는 찬양콘티입니다"
          description="찬양콘티 구성 페이지에서 곡을 먼저 추가해주세요."
          action={
            <Button onClick={() => router.push(routes.setlist(setlistId))}>
              찬양콘티 구성으로 이동
            </Button>
          }
        />
      </div>
    );
  }

  if (effectivePhase === "preloading") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        {homeExitLink}
        <PreloadingScreen songTitles={songTitles} onComplete={() => setPhase("playing")} />
      </div>
    );
  }

  if (effectivePhase === "ended") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
        <p className="text-lg font-semibold">예배가 끝났습니다</p>
        <p className="text-sm text-muted-foreground">수고하셨습니다.</p>
        <Link href={routes.home()} className={cn(buttonVariants(), "w-fit")}>
          <Home />
          홈으로 이동
        </Link>
      </div>
    );
  }

  return (
    <PlaybackScreen
      queue={queue}
      state={state}
      onTogglePlay={handleTogglePlay}
      onToggleLoop={handleToggleLoop}
      onJumpTo={handleJumpTo}
      onCancelPending={handleCancelPending}
    />
  );
}
