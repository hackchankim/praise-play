"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { InstrumentTrack } from "@/lib/song-model/types";

interface PreviewPlayerProps {
  tracks: InstrumentTrack[];
  tempo: number;
}

function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 반주 미리듣기 UI만 담당한다. 실제 오디오 재생(smplr 어댑터)은 Task 021에서 연결되고,
 * 여기서는 진행 시간을 흉내내는 타이머로 재생/일시정지/진행바 상호작용만 보여준다.
 */
export function PreviewPlayer({ tracks, tempo }: PreviewPlayerProps) {
  const totalBeats = tracks
    .flatMap((track) => track.notes)
    .reduce((max, note) => Math.max(max, note.beat + note.duration), 0);
  const durationSeconds = tempo > 0 ? (totalBeats / tempo) * 60 : 0;

  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.2;
        if (next >= durationSeconds) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, durationSeconds]);

  const progressPercent = durationSeconds > 0 ? (elapsed / durationSeconds) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setPlaying((prev) => !prev)}
        disabled={durationSeconds === 0}
        aria-label={playing ? "일시정지" : "미리듣기 재생"}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="flex-1">
        <Progress value={progressPercent} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {formatSeconds(elapsed)} / {formatSeconds(durationSeconds)}
      </span>
    </div>
  );
}
