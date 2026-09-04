"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Repeat } from "lucide-react";
import { SectionBadge } from "@/components/domain/section-badge";
import { cn } from "@/lib/utils";
import { computeSectionDisplayLabels, type QueueEntry } from "./playback-state";

export interface SetlistLyricsFeedHandle {
  /** 지금 재생 중인 위치로 스크롤한다. 둘러보다가도 바로 복귀할 수 있게 하는 버튼용 */
  scrollToCurrent: () => void;
}

interface SetlistLyricsFeedProps {
  queue: QueueEntry[];
  currentSongIndex: number;
  currentSectionIndex: number;
  currentLineIndex: number;
  isPlaying: boolean;
  loopSection: boolean;
  pendingSongIndex: number | null;
  pendingSectionIndex: number | null;
  onJumpTo: (songIndex: number, sectionIndex: number, targetBeat?: number) => void;
  onToggleLoop: () => void;
}

/**
 * 세트리스트 전곡 가사를 하나로 이어붙인 연속 스크롤. 정적인 "다음 섹션/점프/다음 곡" 버튼 대신
 * 가사 자체가 이동 수단이다 — 어떤 절이든(같은 곡이든 다른 곡이든) 탭하면 그 지점으로 이동한다.
 * 재생 중인 곡만 기본으로 펼쳐지고, 나머지 곡은 제목만 보이다가 탭하면 펼쳐진다.
 */
export const SetlistLyricsFeed = forwardRef<SetlistLyricsFeedHandle, SetlistLyricsFeedProps>(
  function SetlistLyricsFeed(
    {
      queue,
      currentSongIndex,
      currentSectionIndex,
      currentLineIndex,
      isPlaying,
      loopSection,
      pendingSongIndex,
      pendingSectionIndex,
      onJumpTo,
      onToggleLoop,
    },
    ref,
  ) {
    const [manuallyExpanded, setManuallyExpanded] = useState<Set<number>>(new Set());
    const currentSectionRef = useRef<HTMLDivElement>(null);

    // 재생 중엔 100ms마다 리렌더되지만 queue(=세트리스트 곡 목록) 자체는 로드 후 거의 바뀌지
    // 않는다. 절 번호 매김을 매 tick마다 곡 수만큼 다시 계산하지 않도록 queue에만 묶어 둔다.
    const displayLabelsBySong = useMemo(
      () => queue.map((entry) => computeSectionDisplayLabels(entry.song.sections)),
      [queue],
    );

    useEffect(() => {
      currentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [currentSongIndex, currentSectionIndex]);

    useImperativeHandle(ref, () => ({
      scrollToCurrent: () => {
        currentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }));

    const toggleExpand = (songIndex: number) => {
      setManuallyExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(songIndex)) next.delete(songIndex);
        else next.add(songIndex);
        return next;
      });
    };

    return (
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card/50 px-3 py-4">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          {queue.map((entry, songIndex) => {
            const isCurrentSong = songIndex === currentSongIndex;
            const isExpanded = isCurrentSong || manuallyExpanded.has(songIndex);
            const displayLabels = displayLabelsBySong[songIndex];

            return (
              <div key={songIndex} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => !isCurrentSong && toggleExpand(songIndex)}
                  disabled={isCurrentSong}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-semibold",
                    isCurrentSong ? "text-primary" : "text-foreground hover:bg-muted/60",
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 truncate">
                    {songIndex + 1}. {entry.song.title}
                  </span>
                  {isCurrentSong && (
                    <span className="ml-auto shrink-0 text-xs font-normal text-primary">
                      {isPlaying ? "재생 중" : "일시정지"}
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="flex flex-col gap-6 pb-2 pl-1">
                    {entry.song.sections.map((section, sectionIndex) => {
                      const isCurrentSection =
                        isCurrentSong && sectionIndex === currentSectionIndex;
                      const isPending =
                        pendingSongIndex === songIndex && pendingSectionIndex === sectionIndex;

                      return (
                        <div
                          key={section.id}
                          ref={isCurrentSection ? currentSectionRef : undefined}
                          className={cn(
                            "flex scroll-mt-6 flex-col items-center gap-2 rounded-lg p-3 transition-colors",
                            isCurrentSection && "bg-primary/10",
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onJumpTo(songIndex, sectionIndex)}
                              aria-label={`${displayLabels[sectionIndex]}으로 이동`}
                              className={cn(
                                "min-h-11 min-w-11 rounded-full p-2 transition-colors hover:bg-primary/10 active:bg-primary/20",
                                isPending && !isCurrentSection && "ring-2 ring-primary/50",
                              )}
                            >
                              <SectionBadge
                                type={section.type}
                                label={displayLabels[sectionIndex]}
                              />
                            </button>
                            {isCurrentSection && (
                              <button
                                type="button"
                                onClick={onToggleLoop}
                                aria-pressed={loopSection}
                                aria-label="이 구간 반복"
                                className={cn(
                                  "flex size-11 items-center justify-center rounded-full transition-colors",
                                  loopSection
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted",
                                )}
                              >
                                <Repeat className="size-4" />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col items-center gap-1.5 text-center">
                            {section.lines.length === 0 ? (
                              <p className="text-sm text-muted-foreground/60">(가사 없음)</p>
                            ) : (
                              section.lines.map((line, lineIndex) => {
                                const status = !isCurrentSong
                                  ? "neutral"
                                  : sectionIndex < currentSectionIndex ||
                                      (isCurrentSection && lineIndex < currentLineIndex)
                                    ? "past"
                                    : isCurrentSection && lineIndex === currentLineIndex
                                      ? "current"
                                      : "upcoming";
                                // 줄 단위 점프("마지막 소절 반복" 등, ROADMAP Task 022) — 섹션
                                // 점프와 정확히 같은 메커니즘을 재사용하되 목표 beat만 섹션 시작이
                                // 아니라 이 줄의 시작(섹션 기준 상대값을 절대 beat로 환산)으로 준다.
                                return (
                                  <button
                                    key={line.id}
                                    type="button"
                                    onClick={() =>
                                      onJumpTo(
                                        songIndex,
                                        sectionIndex,
                                        section.startBeat + line.startBeat,
                                      )
                                    }
                                    aria-label={`이 줄(${line.lyrics || "빈 줄"})로 이동`}
                                    className={cn(
                                      "min-h-11 rounded-md px-2 py-0.5 text-lg leading-snug transition-colors hover:bg-primary/10 sm:text-xl",
                                      status === "current" && "font-semibold text-foreground",
                                      status !== "current" && "text-muted-foreground",
                                      // 이미 부른 줄과 아직 안 부른 줄을 구분하는 신호가 필요하지만,
                                      // 이전엔 opacity로 더 옅게 만들어 WCAG AA(4.5:1)에 못 미쳤다
                                      // (실측 2.34:1). 텍스트 대비는 건드리지 않고 취소선으로만
                                      // "이미 지나간 줄"임을 표시한다.
                                      status === "past" &&
                                        "line-through decoration-muted-foreground/70",
                                    )}
                                  >
                                    {line.lyrics || " "}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
