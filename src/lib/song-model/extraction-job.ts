// extraction_jobs 테이블 행 모양과 진행 단계 정의 (Task 016).
// 서버(Inngest 잡)와 클라이언트(추출 진행 화면의 Realtime 구독) 양쪽에서 공유하는 순수 타입/상수라
// 부작용이 없다 — 어느 쪽에서 임포트해도 안전하다.

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

export type ExtractionJobStatus = "in_progress" | "completed" | "failed";

export interface ExtractionJobRow {
  songId: string;
  stage: ExtractionStage;
  status: ExtractionJobStatus;
  error: string | null;
  updatedAt: string;
}

export interface ExtractionJobDbRow {
  song_id: string;
  stage: ExtractionStage;
  status: ExtractionJobStatus;
  error: string | null;
  updated_at: string;
}

export function mapExtractionJobRow(row: ExtractionJobDbRow): ExtractionJobRow {
  return {
    songId: row.song_id,
    stage: row.stage,
    status: row.status,
    error: row.error,
    updatedAt: row.updated_at,
  };
}

/** 단계 인덱스 + 단계 내 상태로 전체 파이프라인 기준 진행률(0~100)을 근사한다. */
export function computeOverallProgress(job: ExtractionJobRow | null): number {
  if (!job) return 0;
  const totalStages = EXTRACTION_STAGES.length;
  const stageIndex = EXTRACTION_STAGES.indexOf(job.stage);
  if (stageIndex === -1) return 0;
  const stageFraction = job.status === "completed" ? 1 : job.status === "failed" ? 0.5 : 0.5;
  return Math.min(100, Math.round(((stageIndex + stageFraction) / totalStages) * 100));
}
