// POST /api/songs/[songId]/extract — 비전 LLM 추출 잡을 시작한다 (Task 016).
// 업로드 페이지가 songs 레코드 생성 직후 한 번 호출하고, 추출 진행 화면의 "재시도" 버튼도
// 실패 후 같은 엔드포인트를 다시 호출한다 — 곡이 draft 상태인 한 몇 번을 호출해도 안전하다
// (persist_extraction_result가 draft가 아니면 거부하므로 이중 실행으로 데이터가 두 번 쓰이지
// 않는다).
import { inngest } from "@/lib/inngest/client";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

export async function POST(_request: Request, context: { params: Promise<{ songId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { songId } = await context.params;

  // RLS가 소유자 본인 곡만 조회를 허용하므로, 이 조회 자체가 소유권 검증을 겸한다 — 남의 곡의
  // songId를 넣으면 그냥 not found로 취급된다.
  const { data: song, error } = await supabaseRepositoryClient
    .from("songs")
    .select("status")
    .eq("id", songId)
    .maybeSingle<{ status: string }>();
  if (error) return apiError("INTERNAL_ERROR", "곡 조회에 실패했습니다.", 500);
  if (!song) return apiError("NOT_FOUND", "곡을 찾을 수 없습니다.", 404);
  if (song.status !== "draft") {
    return apiError("INVALID_STATE", "이미 추출이 완료된 곡입니다.", 409);
  }

  await inngest.send({ name: "song/extraction.requested", data: { songId } });
  return new Response(null, { status: 202 });
}
