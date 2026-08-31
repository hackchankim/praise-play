// 추출 진행 상태 시뮬레이터 (Task 006).
// Task 008(악보 업로드/추출 진행 화면)과 Task 016(비전 LLM 추출 파이프라인)이 소비할 목 스트림.
// 실제 파이프라인이 없는 Phase 2에서, 업로드 → 텍스트 추출 → 구조 추출 → 병합 → 검증 5단계를
// 시간 경과에 따라 진행률과 함께 방출한다. Phase 3에서는 이 스트림을 실제 Inngest 잡의
// 진행 상태 구독(예: Supabase Realtime)으로 교체하면 되므로, 이벤트 형태를 그 용도에 맞춰 설계했다.

export const EXTRACTION_STAGES = [
  "upload",
  "text_extraction",
  "structure_extraction",
  "merge",
  "validation",
] as const;

export type ExtractionStage = (typeof EXTRACTION_STAGES)[number];

export const EXTRACTION_STAGE_LABELS: Record<ExtractionStage, string> = {
  upload: "업로드",
  text_extraction: "텍스트 추출",
  structure_extraction: "구조 추출",
  merge: "병합",
  validation: "검증",
};

export type ExtractionEventStatus = "in_progress" | "completed" | "failed";

export interface ExtractionProgressEvent {
  stage: ExtractionStage;
  stageLabel: string;
  /** 현재 단계 내 진행률 (0~100) */
  stageProgress: number;
  /** 전체 파이프라인 기준 누적 진행률 (0~100) */
  overallProgress: number;
  status: ExtractionEventStatus;
  /** status가 "failed"일 때만 채워진다 */
  error?: string;
}

export interface ExtractionSimulatorOptions {
  /** 각 단계가 진행되는 데 걸리는 대략적인 시간 (ms). 기본 1200ms */
  stageDurationMs?: number;
  /** 진행률 이벤트를 방출하는 간격 (ms). 기본 150ms */
  tickIntervalMs?: number;
  /** 지정하면 해당 단계 중간에 실패 이벤트를 방출하고 스트림을 종료한다 (재시도 UI 시연용) */
  failAtStage?: ExtractionStage;
  /** 지정하면 취소 시 진행 중인 대기를 즉시 중단한다 (최대 tickIntervalMs만큼 늦게 반응하지 않도록) */
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 추출 파이프라인 진행 상태를 시간 경과에 따라 방출하는 비동기 제너레이터.
 * `for await (const event of simulateExtractionProgress()) { ... }` 형태로 소비한다.
 */
export async function* simulateExtractionProgress(
  options: ExtractionSimulatorOptions = {},
): AsyncGenerator<ExtractionProgressEvent, void, void> {
  const { stageDurationMs = 1200, tickIntervalMs = 150, failAtStage, signal } = options;
  const totalStages = EXTRACTION_STAGES.length;
  const ticksPerStage = Math.max(1, Math.round(stageDurationMs / tickIntervalMs));

  for (let stageIndex = 0; stageIndex < totalStages; stageIndex += 1) {
    const stage = EXTRACTION_STAGES[stageIndex];

    for (let tick = 1; tick <= ticksPerStage; tick += 1) {
      await sleep(tickIntervalMs, signal);

      const stageProgress = Math.min(100, Math.round((tick / ticksPerStage) * 100));
      const overallProgress = Math.min(
        100,
        Math.round(((stageIndex + stageProgress / 100) / totalStages) * 100),
      );
      const isLastTickOfPipeline = stageIndex === totalStages - 1 && stageProgress === 100;

      // 실패 시뮬레이션: 지정된 단계가 절반쯤 진행됐을 때 실패 이벤트를 내보내고 스트림을 끝낸다
      if (failAtStage === stage && stageProgress >= 50) {
        yield {
          stage,
          stageLabel: EXTRACTION_STAGE_LABELS[stage],
          stageProgress,
          overallProgress,
          status: "failed",
          error: `${EXTRACTION_STAGE_LABELS[stage]} 단계에서 오류가 발생했습니다.`,
        };
        return;
      }

      yield {
        stage,
        stageLabel: EXTRACTION_STAGE_LABELS[stage],
        stageProgress,
        overallProgress,
        status: isLastTickOfPipeline ? "completed" : "in_progress",
      };
    }
  }
}

/**
 * 콜백 스타일이 더 편한 소비처(예: React useEffect)를 위한 래퍼.
 * 반환된 함수를 호출하면 이후 이벤트 방출을 중단한다 (예: 언마운트 시 정리).
 */
export function runExtractionSimulator(
  onEvent: (event: ExtractionProgressEvent) => void,
  options: ExtractionSimulatorOptions = {},
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      for await (const event of simulateExtractionProgress({
        ...options,
        signal: controller.signal,
      })) {
        onEvent(event);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
    }
  })();

  return () => {
    controller.abort();
  };
}
