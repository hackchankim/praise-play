"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Drum, Guitar, Loader2, Music2, Piano, Play, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /**
   * 준비가 끝나면(로딩 시뮬레이션 완료) 자동으로 넘어가지 않고 "예배 시작" 버튼을 보여준다 —
   * 실제 오디오(smplr AudioContext)는 브라우저 정책상 사용자 제스처 없이 활성화할 수 없어서다
   * (Task 022). 버튼 클릭이 그 제스처이자 onStart 호출 시점이다. activate() 실패 시 재시도
   * 안내는 여기가 아니라 playback-screen.tsx가 보여준다 — onStart 호출과 동시에 phase가
   * "playing"으로 넘어가 이 화면은 곧바로 언마운트되므로, activate()가 실패하는 시점엔 이미
   * 이 컴포넌트가 화면에 없어 여기서 실패 상태를 받아도 보여줄 수가 없다(code review 지적 —
   * 이전엔 activationFailed prop이 있었지만 절대 true로 관측되지 않는 죽은 코드였다).
   */
  onStart: () => void;
}

export function PreloadingScreen({ songTitles, onStart }: PreloadingScreenProps) {
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stop = runPreloadSimulator(assets, (event) => {
      setProgressById((prev) => ({ ...prev, [event.assetId]: event.progress }));
      setStatusById((prev) => ({ ...prev, [event.assetId]: event.status }));
      setOverallProgress(event.overallProgress);
      if (event.allDone) setReady(true);
    });
    return stop;
  }, [assets]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {ready ? (
          <h1 className="text-xl font-semibold">반주 준비가 끝났어요</h1>
        ) : (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <h1 className="text-xl font-semibold">반주를 준비하고 있어요</h1>
            <p className="text-sm text-muted-foreground">
              악기 사운드와 편곡 트랙을 미리 불러오는 중입니다.
            </p>
          </>
        )}
      </div>

      {ready && (
        <Button size="lg" onClick={onStart} className="gap-2">
          <Play />
          예배 시작
        </Button>
      )}

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
