"use client";

import { useRef } from "react";
import Link from "next/link";
import { Home, Locate, MonitorSmartphone, Pause, Play, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SectionBadge } from "@/components/domain/section-badge";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import {
  computeSectionDisplayLabels,
  currentLineIndex,
  currentSection,
  type PlaybackState,
  type QueueEntry,
} from "./playback-state";
import { SetlistLyricsFeed, type SetlistLyricsFeedHandle } from "./setlist-lyrics-feed";

interface PlaybackScreenProps {
  queue: QueueEntry[];
  state: PlaybackState;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onJumpTo: (songIndex: number, sectionIndex: number) => void;
  onCancelPending: () => void;
}

export function PlaybackScreen({
  queue,
  state,
  onTogglePlay,
  onToggleLoop,
  onJumpTo,
  onCancelPending,
}: PlaybackScreenProps) {
  const feedRef = useRef<SetlistLyricsFeedHandle>(null);

  const song = queue[state.songIndex].song;
  const section = currentSection(state, queue);
  const currentSongLabels = computeSectionDisplayLabels(song.sections);

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
          몇 절이 떨어져 있든 한 번에 이동할 수 있다. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {song.sections.map((sec, index) => {
          const isCurrent = index === state.sectionIndex;
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
              <SectionBadge type={sec.type} label={currentSongLabels[index]} />
            </button>
          );
        })}
      </div>

      <SetlistLyricsFeed
        ref={feedRef}
        queue={queue}
        currentSongIndex={state.songIndex}
        currentSectionIndex={state.sectionIndex}
        currentLineIndex={currentLineIndex(section, state.elapsedBeats)}
        loopSection={state.loopSection}
        pendingSongIndex={state.pending?.songIndex ?? null}
        pendingSectionIndex={state.pending?.sectionIndex ?? null}
        onJumpTo={onJumpTo}
        onToggleLoop={onToggleLoop}
      />

      {/* 가사를 스크롤하는 영역과 재생 컨트롤을 명확히 분리한다 — 이전처럼 버튼을 가사 위에
          띄우면 손가락이 가사를 가리고, 스크롤 중 실수로 버튼을 누를 위험도 있다. */}
      <div className="flex items-center justify-center gap-3 border-t pt-3">
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
          aria-label={state.isPlaying ? "일시정지" : "재생"}
          className="rounded-full"
        >
          {state.isPlaying ? <Pause /> : <Play />}
        </Button>
      </div>
    </div>
  );
}
