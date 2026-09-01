"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Drum, Guitar, Loader2, Music2, Piano, Waves } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { INSTRUMENT_LABEL } from "@/lib/song-model/labels";
import type { Instrument } from "@/lib/song-model/types";
import {
  runPreloadSimulator,
  type PreloadAsset,
  type PreloadAssetStatus,
} from "@/lib/repositories/preload-progress";

const INSTRUMENT_ICON: Record<Instrument, typeof Piano> = {
  piano: Piano,
  guitar: Guitar,
  bass: Waves,
  drums: Drum,
};

interface PreloadingScreenProps {
  songTitles: string[];
  onComplete: () => void;
}

export function PreloadingScreen({ songTitles, onComplete }: PreloadingScreenProps) {
  const assets = useMemo<PreloadAsset[]>(
    () => [
      ...(["piano", "guitar", "bass", "drums"] as Instrument[]).map((instrument) => ({
        id: `soundfont-${instrument}`,
        label: `${INSTRUMENT_LABEL[instrument]} 사운드폰트`,
        kind: "soundfont" as const,
      })),
      ...songTitles.map((title, index) => ({
        id: `track-${index}`,
        label: `${title} 편곡 트랙`,
        kind: "track" as const,
      })),
    ],
    [songTitles],
  );

  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const [statusById, setStatusById] = useState<Record<string, PreloadAssetStatus>>({});
  const [overallProgress, setOverallProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const stop = runPreloadSimulator(assets, (event) => {
      setProgressById((prev) => ({ ...prev, [event.assetId]: event.progress }));
      setStatusById((prev) => ({ ...prev, [event.assetId]: event.status }));
      setOverallProgress(event.overallProgress);
      if (event.allDone) onCompleteRef.current();
    });
    return stop;
  }, [assets]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <h1 className="text-xl font-semibold">반주를 준비하고 있어요</h1>
        <p className="text-sm text-muted-foreground">
          악기 사운드와 편곡 트랙을 미리 불러오는 중입니다.
        </p>
      </div>

      <div className="w-full max-w-md">
        <Progress value={overallProgress} />
        <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
          {overallProgress}%
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        {assets.map((asset) => {
          const status = statusById[asset.id] ?? "pending";
          const progress = progressById[asset.id] ?? 0;
          const Icon =
            asset.kind === "soundfont"
              ? INSTRUMENT_ICON[asset.id.replace("soundfont-", "") as Instrument]
              : Music2;
          return (
            <div
              key={asset.id}
              className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{asset.label}</span>
              {status === "done" ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {status === "loading" ? `${progress}%` : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
