"use client";

import {
  Check,
  Drum,
  Guitar,
  Loader2,
  Music2,
  Piano,
  Play,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { INSTRUMENT_LABEL } from "@/lib/song-model/labels";
import type { Instrument } from "@/lib/song-model/types";
import type { ActivationStatus, AssetLoadStatus } from "./use-live-playback";

const INSTRUMENT_ICON: Record<Instrument, typeof Piano> = {
  piano: Piano,
  guitar: Guitar,
  bass: Waves,
  drums: Drum,
};

const ALL_INSTRUMENTS: Instrument[] = ["piano", "guitar", "bass", "drums"];

interface PreloadingScreenProps {
  songTitles: string[];
  /**
   * 악기별 실제 로딩 진행 상황(Task 024) — engine.ts의 onLoadProgress를 그대로 반영한
   * use-live-playback.ts의 state다. 편곡 트랙(songTitles가 나타내는 곡별 데이터)은 이 화면에
   * 도달하기 전(play-view.tsx의 "loading" 단계)에 이미 다 받아 온 상태라 여기서는 항상
   * "완료"로 표시한다 — 실제로 지금 로딩 중인 건 사운드폰트뿐이다.
   */
  loadProgress: Partial<Record<Instrument, { status: AssetLoadStatus; percent: number }>>;
  activationStatus: ActivationStatus;
  /**
   * "예배 시작"/"재시도" 버튼 클릭(=사용자 제스처) 콜백. 실제 오디오(smplr AudioContext)는
   * 브라우저 정책상 사용자 제스처 없이 활성화할 수 없어서다 — 이 버튼 클릭이 그 제스처다
   * (Task 022/024). 로딩이 끝나면(실패한 악기 없이) 호출부(play-view.tsx)가 알아서 재생
   * 화면으로 넘긴다 — 이 컴포넌트는 넘어갈지 말지를 결정하지 않는다.
   */
  onStart: () => void;
  /** 일부 악기가 끝내 로딩되지 않았을 때, 그 악기 없이 그대로 재생 화면으로 진행한다. */
  onProceedAnyway: () => void;
}

export function PreloadingScreen({
  songTitles,
  loadProgress,
  activationStatus,
  onStart,
  onProceedAnyway,
}: PreloadingScreenProps) {
  // activationStatus가 한 번이라도 idle이 아니었거나(activating/failed) 진행 이벤트가 하나라도
  // 왔으면(loadProgress에 항목이 생김) "이미 시작해 봤다"는 뜻이다 — 초기 idle과 "성공적으로
  // 끝난 뒤의 idle"을 이걸로 구분한다.
  const hasStarted = activationStatus !== "idle" || Object.keys(loadProgress).length > 0;
  const failedInstruments = ALL_INSTRUMENTS.filter(
    (instrument) => loadProgress[instrument]?.status === "failed",
  );
  const isLoading = activationStatus === "activating";
  const hasTotalFailure = activationStatus === "failed";
  const hasPartialFailure =
    !isLoading && !hasTotalFailure && hasStarted && failedInstruments.length > 0;

  const instrumentAssets = ALL_INSTRUMENTS.map((instrument) => ({
    kind: "soundfont" as const,
    id: `soundfont-${instrument}`,
    label: `${INSTRUMENT_LABEL[instrument]} 사운드폰트`,
    status: loadProgress[instrument]?.status,
    percent: loadProgress[instrument]?.percent ?? 0,
  }));
  // 편곡 트랙은 이 화면에 오기 전에 이미 다 받아 왔다(play-view.tsx의 "loading" 단계) — 여기서
  // 다시 로딩되는 게 아니라 목록에 "이미 끝난 항목"으로만 보여준다.
  const trackAssets = songTitles.map((title, index) => ({
    kind: "track" as const,
    id: `track-${index}`,
    label: `${title} 편곡 트랙`,
    status: "done" as const,
    percent: 100,
  }));
  const assets = [...instrumentAssets, ...trackAssets];

  const totalPercent =
    assets.length > 0
      ? Math.round(assets.reduce((sum, asset) => sum + asset.percent, 0) / assets.length)
      : 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {hasTotalFailure ? (
          <>
            <TriangleAlert className="size-8 text-destructive" />
            <h1 className="text-xl font-semibold">오디오를 활성화하지 못했어요</h1>
            <p className="text-sm text-muted-foreground">
              오디오를 활성화하지 못했습니다. 버튼을 다시 눌러주세요.
            </p>
          </>
        ) : hasPartialFailure ? (
          <>
            <TriangleAlert className="size-8 text-destructive" />
            <h1 className="text-xl font-semibold">일부 악기를 불러오지 못했어요</h1>
            <p className="text-sm text-muted-foreground">
              {failedInstruments.map((instrument) => INSTRUMENT_LABEL[instrument]).join(", ")}{" "}
              사운드폰트를 불러오지 못했습니다. 재시도하거나, 그 악기 없이 진행할 수 있습니다.
            </p>
          </>
        ) : isLoading ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <h1 className="text-xl font-semibold">반주를 준비하고 있어요</h1>
            <p className="text-sm text-muted-foreground">
              악기 사운드와 편곡 트랙을 미리 불러오는 중입니다.
            </p>
          </>
        ) : (
          <h1 className="text-xl font-semibold">예배를 시작할 준비가 됐어요</h1>
        )}
      </div>

      {hasTotalFailure && (
        <Button size="lg" onClick={onStart} className="gap-2">
          <Play />
          다시 시도
        </Button>
      )}
      {hasPartialFailure && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="lg" variant="outline" onClick={onStart}>
            재시도
          </Button>
          <Button size="lg" onClick={onProceedAnyway} className="gap-2">
            <Play /> 이 악기 없이 진행
          </Button>
        </div>
      )}
      {!hasStarted && (
        <Button size="lg" onClick={onStart} className="gap-2">
          <Play />
          예배 시작
        </Button>
      )}

      <div className="w-full max-w-md">
        <Progress value={totalPercent} />
        <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
          {totalPercent}%
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        {assets.map((asset) => {
          const status = asset.status ?? "loading";
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
              ) : status === "failed" ? (
                <TriangleAlert className="size-4 shrink-0 text-destructive" />
              ) : (
                <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {hasStarted ? `${asset.percent}%` : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
