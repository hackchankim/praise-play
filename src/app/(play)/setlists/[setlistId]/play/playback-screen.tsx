"use client";

import { useRef } from "react";
import Link from "next/link";
import { Home, Locate, MonitorSmartphone, Pause, Play, SkipForward, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SectionBadge } from "@/components/domain/section-badge";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import type { ActivationStatus } from "./use-live-playback";
import {
  computeSectionDisplayLabels,
  currentLineIndex,
  sectionIndexAtBeat,
  setlistProgressSeconds,
  type PlaybackState,
  type QueueEntry,
} from "./playback-state";
import { SetlistLyricsFeed, type SetlistLyricsFeedHandle } from "./setlist-lyrics-feed";

function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface PlaybackScreenProps {
  queue: QueueEntry[];
  state: PlaybackState;
  activationStatus: ActivationStatus;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onJumpTo: (songIndex: number, sectionIndex: number, targetBeat?: number) => void;
  onCancelPending: () => void;
}

export function PlaybackScreen({
  queue,
  state,
  activationStatus,
  onTogglePlay,
  onToggleLoop,
  onJumpTo,
  onCancelPending,
}: PlaybackScreenProps) {
  const feedRef = useRef<SetlistLyricsFeedHandle>(null);

  const song = queue[state.songIndex].song;
  const sectionIndex = sectionIndexAtBeat(song.sections, state.absoluteBeat);
  const section = song.sections[sectionIndex];
  const currentSongLabels = computeSectionDisplayLabels(song.sections);

  const { elapsedSeconds: setlistElapsedSeconds, totalSeconds: setlistTotalSeconds } =
    setlistProgressSeconds(state, queue);
  const setlistProgressPercent =
    setlistTotalSeconds > 0
      ? Math.min(100, (setlistElapsedSeconds / setlistTotalSeconds) * 100)
      : 0;

  const pendingLabel = (() => {
    if (!state.pending) return null;
    if (state.pending.songIndex !== state.songIndex) {
      return `다음 곡: ${queue[state.pending.songIndex].song.title}`;
    }
    return currentSongLabels[state.pending.sectionIndex];
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{song.title}</h1>
          <p className="text-xs text-muted-foreground">
            {song.key} · {song.tempo} BPM · {song.timeSignature}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {queue.length}곡 중 {state.songIndex + 1}번째
          </Badge>
          <Badge variant="outline" className="gap-1">
            <MonitorSmartphone className="size-3" />
            화면 꺼짐 방지 켜짐
          </Badge>
          <Link
            href={routes.home()}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <Home />
            예배 종료
          </Link>
        </div>
      </div>

      {state.pending && (
        <div className="flex w-fit items-center gap-2 self-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          다음 마디에서 전환 예정 · {pendingLabel}
          <button
            type="button"
            onClick={onCancelPending}
            className="ml-1 text-primary/70 hover:text-primary"
            aria-label="전환 예약 취소"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* 지금 곡의 절/후렴을 스크롤 없이 바로 탭할 수 있는 빠른 이동 줄 — 예를 들어 4절을 부르다
          1절로 돌아가려면 원래는 위로 스크롤해 찾아야 했는데, 이 줄이 항상 상단에 고정돼 있어
          몇 절이 떨어져 있든 한 번에 이동할 수 있다. 다른 화면(교정·편곡)의 SectionBadge보다
          한 단계 크게 키운다 — 재생 중 손가락으로 탭하는 용도라 기본 크기는 너무 작게 느껴진다는
          피드백을 반영했다. overflow-x-auto만 주면 overflow-y가 강제로 auto가 되어(CSS 스펙상
          두 축 중 하나만 visible이 아니면 나머지도 auto로 바뀐다) 선택 표시용 ring이 잘려 보인다
          — 맨 처음/맨 끝 칩은 좌우로도 스크롤 영역 경계에 바로 붙어 있어 ring이 잘리므로, 상하좌우
          모두에 ring이 들어갈 여유 패딩을 준다. */}
      <div className="flex gap-2 overflow-x-auto p-1.5">
        {song.sections.map((sec, index) => {
          const isCurrent = index === sectionIndex;
          const isPending =
            state.pending?.songIndex === state.songIndex && state.pending?.sectionIndex === index;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => onJumpTo(state.songIndex, index)}
              aria-label={`${currentSongLabels[index]}으로 이동`}
              className={cn(
                "shrink-0 rounded-full p-0.5 transition-colors",
                isCurrent && "ring-2 ring-primary",
                isPending && !isCurrent && "ring-2 ring-primary/50",
              )}
            >
              <SectionBadge
                type={sec.type}
                label={currentSongLabels[index]}
                className="h-8 px-3 text-sm"
              />
            </button>
          );
        })}
        {state.songIndex + 1 < queue.length && (
          <button
            type="button"
            onClick={() => onJumpTo(state.songIndex + 1, 0)}
            aria-label={`다음 곡(${queue[state.songIndex + 1].song.title})으로 이동`}
            className={cn(
              "shrink-0 rounded-full p-0.5 transition-colors",
              state.pending?.songIndex === state.songIndex + 1 && "ring-2 ring-primary/50",
            )}
          >
            <span className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-border px-3 text-sm font-medium text-muted-foreground">
              <SkipForward className="size-3.5" />
              다음 곡
            </span>
          </button>
        )}
      </div>

      <SetlistLyricsFeed
        ref={feedRef}
        queue={queue}
        currentSongIndex={state.songIndex}
        currentSectionIndex={sectionIndex}
        currentLineIndex={currentLineIndex(section, state.absoluteBeat - section.startBeat)}
        isPlaying={state.isPlaying}
        loopSection={state.loopSection}
        pendingSongIndex={state.pending?.songIndex ?? null}
        pendingSectionIndex={state.pending?.sectionIndex ?? null}
        onJumpTo={onJumpTo}
        onToggleLoop={onToggleLoop}
      />

      {/* 가사를 스크롤하는 영역과 재생 컨트롤을 명확히 분리한다 — 이전처럼 버튼을 가사 위에
          띄우면 손가락이 가사를 가리고, 스크롤 중 실수로 버튼을 누를 위험도 있다. 진행 바는
          예배 전체(세트리스트에 담긴 모든 곡 합산) 길이 기준이다. 곡마다 템포가 달라 beat를
          그대로 이어붙일 수 없으므로 초 단위로 환산해 합산한다(setlistProgressSeconds). */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
            {formatSeconds(setlistElapsedSeconds)}
          </span>
          <Progress value={setlistProgressPercent} className="flex-1" />
          <span className="w-9 shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {formatSeconds(setlistTotalSeconds)}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon-lg"
            onClick={() => feedRef.current?.scrollToCurrent()}
            aria-label="현재 위치로 이동"
            className="rounded-full"
          >
            <Locate />
          </Button>
          <Button
            size="playback-icon"
            onClick={onTogglePlay}
            disabled={activationStatus === "activating"}
            aria-label={state.isPlaying ? "일시정지" : "재생"}
            className="rounded-full"
          >
            {state.isPlaying ? <Pause /> : <Play />}
          </Button>
        </div>
        {activationStatus === "failed" && (
          <p className="text-center text-xs text-destructive">
            오디오를 활성화하지 못했습니다. 재생 버튼을 다시 눌러주세요.
          </p>
        )}
      </div>
    </div>
  );
}
