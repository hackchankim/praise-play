// 반주 사전 로딩 진행 상태 시뮬레이터 (Task 011).
// Task 024(반주 사전 로딩 구현)가 실제 사운드폰트/편곡 트랙 페치로 교체할 목 스트림.
// "예배 시작" 시 필요한 자산을 두 종류로 나눈다: 악기별 사운드폰트(고정 4종)와 곡별 편곡
// 트랙 데이터(세트리스트 곡 수만큼). 자산을 하나씩 순차로 로딩하는 것처럼 보여준다.

import { runAbortableGenerator, sleep } from "@/lib/repositories/simulator-utils";

export type PreloadAssetKind = "soundfont" | "track";

export interface PreloadAsset {
  id: string;
  label: string;
  kind: PreloadAssetKind;
}

export type PreloadAssetStatus = "pending" | "loading" | "done";

export interface PreloadProgressEvent {
  assetId: string;
  /** 해당 자산의 진행률 (0~100) */
  progress: number;
  status: PreloadAssetStatus;
  /** 전체 자산 기준 누적 진행률 (0~100) */
  overallProgress: number;
  /** 전체 자산 로딩이 모두 끝났는지 */
  allDone: boolean;
}

export interface PreloadSimulatorOptions {
  /** 자산 하나를 로딩하는 데 걸리는 대략적인 시간 (ms). 기본 500ms */
  assetDurationMs?: number;
  /** 진행률 이벤트를 방출하는 간격 (ms). 기본 80ms */
  tickIntervalMs?: number;
  signal?: AbortSignal;
}

export async function* simulatePreloadProgress(
  assets: PreloadAsset[],
  options: PreloadSimulatorOptions = {},
): AsyncGenerator<PreloadProgressEvent, void, void> {
  const { assetDurationMs = 500, tickIntervalMs = 80, signal } = options;
  const totalAssets = assets.length;
  const ticksPerAsset = Math.max(1, Math.round(assetDurationMs / tickIntervalMs));

  for (let assetIndex = 0; assetIndex < totalAssets; assetIndex += 1) {
    const asset = assets[assetIndex];

    for (let tick = 1; tick <= ticksPerAsset; tick += 1) {
      await sleep(tickIntervalMs, signal);

      const progress = Math.min(100, Math.round((tick / ticksPerAsset) * 100));
      const overallProgress = Math.min(
        100,
        Math.round(((assetIndex + progress / 100) / totalAssets) * 100),
      );
      const isLastTickOfPipeline = assetIndex === totalAssets - 1 && progress === 100;

      yield {
        assetId: asset.id,
        progress,
        status: progress === 100 ? "done" : "loading",
        overallProgress,
        allDone: isLastTickOfPipeline,
      };
    }
  }
}

/** 콜백 스타일 래퍼. 반환된 함수를 호출하면 이후 이벤트 방출을 중단한다 (언마운트 시 정리). */
export function runPreloadSimulator(
  assets: PreloadAsset[],
  onEvent: (event: PreloadProgressEvent) => void,
  options: PreloadSimulatorOptions = {},
): () => void {
  return runAbortableGenerator(
    (signal) => simulatePreloadProgress(assets, { ...options, signal }),
    onEvent,
  );
}
