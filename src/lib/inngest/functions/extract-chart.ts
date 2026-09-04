// Inngest 잡: 업로드된 리드시트 이미지에서 가사/코드/조표/마디·박자 구조를 추출해 영속화한다
// (Task 016). song/extraction.requested 이벤트(songId)로 트리거되며, POST
// /api/songs/[songId]/extract 라우트가 업로드 완료 직후·재시도 버튼 클릭 시 이 이벤트를 보낸다.
//
// 진행 상태는 extraction_jobs 테이블에 단계마다 upsert해 남긴다 — step.run()이 아니라 일반
// await 호출로 실행한다는 점이 중요하다. step.run()의 결과는 메모이즈되어 재실행(재시도) 시
// 다시 돌지 않지만, 진행 상태 기록은 재시도로 함수 본문이 처음부터 리플레이될 때마다 실제
// 클라이언트 화면에 "다시 진행 중" 신호를 보내야 하므로 매번 실행돼야 한다.
//
// LLM 호출·이미지 다운로드가 실패하면 그냥 throw한다 — Inngest가 step.run() 단위로 지수
// 백오프 재시도를 자동으로 수행한다(함수 설정의 retries). 모든 재시도가 소진되면 onFailure가
// 호출되어 extraction_jobs를 최종 실패 상태로 남긴다.
import { inngest } from "@/lib/inngest/client";
import { supabaseServiceClient } from "@/lib/supabase/service-client";
import { env } from "@/lib/env";
import {
  extractLyricsAndChords,
  extractStructure,
  mediaTypeFromContentType,
  type ExtractionImage,
} from "@/lib/anthropic/extract";
import { mergeExtractionResults } from "@/lib/song-model/merge-extraction";
import { applyPostProcessing } from "@/lib/song-model/apply-post-processing";
import type { ExtractionJobStatus, ExtractionStage } from "@/lib/song-model/extraction-job";

async function markProgress(
  songId: string,
  stage: ExtractionStage,
  status: ExtractionJobStatus,
  error?: string,
): Promise<void> {
  const { error: dbError } = await supabaseServiceClient.from("extraction_jobs").upsert({
    song_id: songId,
    stage,
    status,
    error: error ?? null,
    updated_at: new Date().toISOString(),
  });
  if (dbError) throw new Error(`추출 진행 상태 기록 실패: ${dbError.message}`);
}

/**
 * 순수 읽기(다운로드)라 step.run으로 감싸지 않는다 — R2 객체는 불변이므로 함수가 리플레이돼
 * 다시 실행돼도 항상 같은 결과이고, 굳이 스텝 결과로 메모이즈해서 페이로드 크기를 늘릴 필요가
 * 없다(리사이즈된 이미지 여러 장의 base64를 스텝 출력으로 들고 있으면 Inngest 스텝 출력 크기
 * 제한에 걸릴 수 있다).
 */
async function loadImages(songId: string): Promise<ExtractionImage[]> {
  const { data, error } = await supabaseServiceClient
    .from("song_images")
    .select("object_key")
    .eq("song_id", songId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`이미지 목록 조회 실패: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`곡 ${songId}에 등록된 이미지가 없습니다.`);
  }

  return Promise.all(
    (data as { object_key: string }[]).map(async ({ object_key: objectKey }) => {
      const url = `${env.NEXT_PUBLIC_R2_PUBLIC_URL}/${objectKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`이미지 다운로드 실패 (status ${response.status}): ${objectKey}`);
      }
      const mediaType = mediaTypeFromContentType(response.headers.get("content-type"));
      const buffer = Buffer.from(await response.arrayBuffer());
      return { mediaType, base64: buffer.toString("base64") };
    }),
  );
}

export const extractChart = inngest.createFunction(
  {
    id: "extract-chart",
    triggers: { event: "song/extraction.requested" },
    retries: 3,
    onFailure: async ({ event }) => {
      const songId = (event.data.event.data as { songId?: string }).songId;
      if (!songId) return;
      const message = event.data.error.message || "추출 중 알 수 없는 오류가 발생했습니다.";

      // 실패 시점까지 진행됐던 마지막 단계를 유지한 채 상태만 failed로 바꾼다 — 어느 단계에서
      // 막혔는지가 재시도 UI/디버깅에 유용한 정보라 실패로 덮어쓰면서 잃고 싶지 않다.
      const { data: existing } = await supabaseServiceClient
        .from("extraction_jobs")
        .select("stage")
        .eq("song_id", songId)
        .maybeSingle<{ stage: ExtractionStage }>();

      await markProgress(songId, existing?.stage ?? "upload", "failed", message);
    },
  },
  async ({ event, step }) => {
    const { songId } = event.data as { songId: string };

    await markProgress(songId, "upload", "completed");
    const images = await loadImages(songId);

    // 텍스트 추출과 구조 추출(2회, self-consistency용)은 서로의 결과를 필요로 하지 않으므로
    // 동시에 실행한다 — 순차 실행 대비 파이프라인 지연시간을 절반 가까이 줄인다.
    //
    // 진행 상태는 extraction_jobs 한 행의 stage 컬럼 하나로만 표현되는데, 두 단계를 각각
    // 독립적으로 in_progress/completed 마킹하면 Promise.all이 끝난 뒤 "text_extraction
    // completed"를 "structure_extraction in_progress"보다 나중에 써서 stage 인덱스가
    // 뒤로 되돌아간다(EXTRACTION_STAGES 순서상 text_extraction이 structure_extraction보다
    // 앞 단계라서다) — 실시간 구독 중인 클라이언트의 진행률/단계 배지가 잠깐 역행해 보인다
    // (code review 지적, computeOverallProgress·extracting-view.tsx의 stage 인덱스 비교
    // 로직 추적으로 재현 가능함을 확인). 두 단계는 항상 같이 시작해 같이 끝나므로, 더 뒤
    // 단계(structure_extraction) 하나로만 진행을 보고해 역행 자체를 없앤다 — text_extraction
    // 배지는 structure_extraction이 진행되는 순간 "완료"로 함께 넘어간다(실제로도 같은
    // 시점에 시작·종료되므로 부정확한 표현이 아니다).
    await markProgress(songId, "structure_extraction", "in_progress");
    const [textResult, structurePrimary, structureSecondary] = await Promise.all([
      step.run("text-extraction", () => extractLyricsAndChords(images)),
      // self-consistency 체크: 같은 이미지로 구조 추출을 2회 호출해 불일치 지점을 찾는다
      // (docs/PLAN.md — 공간 추론/카운팅은 텍스트 판독보다 신뢰도가 낮다는 전제).
      step.run("structure-extraction-1", () => extractStructure(images)),
      step.run("structure-extraction-2", () => extractStructure(images)),
    ]);
    await markProgress(songId, "structure_extraction", "completed");

    await markProgress(songId, "merge", "in_progress");
    const merged = await step.run("merge", () =>
      mergeExtractionResults(textResult, structurePrimary, structureSecondary),
    );
    await markProgress(songId, "merge", "completed");

    await markProgress(songId, "validation", "in_progress");
    // 코드 문법 검증(chord-validator)과 섹션 자동 추론(infer-sections)을 잇는다 — 둘 다 LLM
    // 호출 없는 순수 함수라 재시도해도 부작용이 없다 (Task 017).
    const validated = await step.run("validate-and-infer", () => applyPostProcessing(merged));
    await step.run("persist", async () => {
      const { error } = await supabaseServiceClient.rpc("persist_extraction_result", {
        p_song_id: songId,
        p_key: validated.key,
        p_tempo: validated.tempo,
        p_time_signature: validated.timeSignature,
        p_sections: validated.sections,
      });
      if (!error) return;
      // persist_extraction_result는 곡이 이미 draft 상태가 아니면(=이미 한 번 성공적으로
      // 저장됐으면) PT409로 거부한다(migrations/20260904000002 확인). RPC 응답이 유실되는 등
      // 일시적 네트워크 오류로 이 스텝이 재시도되면, 실제로는 이전 시도에서 이미 정상 저장이
      // 끝났는데도 이 시점엔 "정상적인 중복 방지 충돌"을 만난다 — 이를 일반 Error로 던지면
      // Inngest가 계속 재시도하다 매번 같은 PT409에 부딪혀 결국 재시도를 소진하고
      // extraction_jobs를 failed로 남긴다. 사용자는 이미 추출이 끝났는데도 추출 화면에
      // 갇히고, 재시도해도 똑같은 409만 반복된다(code review 지적, SQL 마이그레이션 추적으로
      // 재현 가능함을 확인). 이 경우엔 "이미 저장됨"으로 보고 그냥 진행한다 — 실패로 처리하지
      // 않는다.
      if (error.code === "PT409") return;
      throw new Error(`추출 결과 저장 실패: ${error.message}`);
    });
    await markProgress(songId, "validation", "completed");

    return { songId, sectionCount: validated.sections.length };
  },
);
