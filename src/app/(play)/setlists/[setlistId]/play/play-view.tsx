"use client";

import { useEffect, useMemo, useState } from "react";
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
import { arrangementRepository } from "@/lib/repositories/arrangement-repository";
import type { InstrumentTrack } from "@/lib/song-model/types";
import { type QueueEntry } from "./playback-state";
import { useLivePlayback } from "./use-live-playback";
import { PreloadingScreen } from "./preloading-screen";
import { PlaybackScreen } from "./playback-screen";

type Phase = "loading" | "not_found" | "error" | "empty" | "preloading" | "playing" | "ended";

interface PlayViewProps {
  setlistId: string;
}

export function PlayView({ setlistId }: PlayViewProps) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [tracksByIndex, setTracksByIndex] = useState<InstrumentTrack[][]>([]);
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
        // 곡 트리와 편곡 트랙(악기별 노트 이벤트)을 함께 읽어야 실제 오디오 재생이 가능하다
        // (Task 022) — Task 011까지는 가사 표시만 필요해 곡 트리만 읽었다.
        const [trees, arrangements] = await Promise.all([
          Promise.all(items.map((item) => songRepository.getTree(item.songId))),
          Promise.all(items.map((item) => arrangementRepository.getById(item.arrangementId))),
        ]);
        if (cancelled) return;
        if (trees.some((tree) => !tree) || arrangements.some((arrangement) => !arrangement)) {
          setPhase("error");
          return;
        }
        const nextQueue: QueueEntry[] = items.map((item, index) => ({
          song: trees[index]!.song,
          arrangementId: item.arrangementId,
        }));
        setQueue(nextQueue);
        setTracksByIndex(arrangements.map((arrangement) => arrangement!.instrumentTracks));
        setPhase("preloading");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [setlistId, loadRetryKey]);

  const {
    state,
    activationStatus,
    loadProgress,
    preloadAndActivate,
    togglePlay,
    toggleLoop,
    jumpTo,
    cancelPending,
  } = useLivePlayback(queue, tracksByIndex);

  // 세트리스트 마지막 곡이 자연히 끝났다는 사실(state.ended)을 별도 effect로 phase에 동기화하지
  // 않는다("You Might Not Need an Effect") — 대신 렌더링 시점에 파생시킨다. Task 011 시절과
  // 동일한 이유(effect + setPhase 왕복은 타이밍이 어긋나기 쉽다)로 이 패턴을 그대로 유지한다.
  const effectivePhase = state.ended && phase === "playing" ? "ended" : phase;

  /**
   * "예배 시작"/"재시도" 버튼 클릭(=AudioContext를 여는 사용자 제스처) 콜백(Task 024).
   * preloadAndActivate가 실제 로딩(사운드폰트 다운로드·디코딩 + 세트리스트 트랙 로드)까지
   * 끝낸 뒤에만 재생 화면으로 넘어간다 — 그래야 진입 직후 첫 재생에 지연이 없다는 완료
   * 기준을 만족한다. 실패한 악기가 있으면 자동으로 넘어가지 않고 preloading-screen이
   * 재시도/이대로 진행 선택 UI를 보여준다(activationStatus/loadProgress를 보고 그린다).
   * activate() 자체(AudioContext 확보)가 실패하면 reject되는데, activationStatus가
   * "failed"로 이미 반영되므로 여기서는 조용히 무시한다.
   */
  const handleStartWorship = () => {
    preloadAndActivate()
      .then(({ failedInstruments }) => {
        if (failedInstruments.length === 0) setPhase("playing");
      })
      .catch(() => {});
  };

  /** 일부 악기 로딩 실패를 감수하고 그대로 재생 화면으로 넘어간다 — engine은 이미 activate()된
   * 상태라(성공한 악기만으로 Sequencer가 구성돼 있다, engine.ts 참고) 추가 작업 없이 바로
   * 재생 가능하다. */
  const handleProceedAnyway = () => setPhase("playing");

  // queue는 로드 시 한 번만 set되므로 이 참조는 안정적이다 — 매 렌더 새 배열을 만들지 않도록
  // useMemo로 감싼다(PreloadingScreen이 렌더마다 이 목록으로 자산 체크리스트를 다시 만든다).
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
        <PreloadingScreen
          songTitles={songTitles}
          loadProgress={loadProgress}
          activationStatus={activationStatus}
          onStart={handleStartWorship}
          onProceedAnyway={handleProceedAnyway}
        />
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
      activationStatus={activationStatus}
      onTogglePlay={togglePlay}
      onToggleLoop={toggleLoop}
      onJumpTo={jumpTo}
      onCancelPending={cancelPending}
    />
  );
}
