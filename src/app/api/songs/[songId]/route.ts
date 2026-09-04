// GET /api/songs/[songId] — 곡 트리 + 임시 저장 조회 (Task 018).
// 교정 페이지가 이 라우트를 통해서만 곡 데이터를 읽도록 바뀐다(이전까지는 브라우저가 Supabase를
// 직접 호출했다) — PATCH 저장 쪽에 서버 재검증을 넣는 것과 짝을 맞추기 위해서다. 조회 자체는
// 재검증할 게 없어 이 라우트는 사실상 songRepository.getTree()에 임시 저장 조회를 얹은 얇은 래퍼다.
import type { GetSongTreeResponse, SaveCorrectionRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { songRepository } from "@/lib/repositories/song-repository";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

interface SongDraftRow {
  payload: SaveCorrectionRequest;
}

export async function GET(_request: Request, context: { params: Promise<{ songId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { songId } = await context.params;

  // 곡 트리와 임시 저장 조회는 서로 결과를 필요로 하지 않으니(둘 다 songId만으로 결정된다)
  // 동시에 요청한다 — 매 페이지 로드마다 순차 왕복 2번을 낼 이유가 없다.
  const [tree, draftResult] = await Promise.all([
    songRepository.getTree(songId),
    supabaseRepositoryClient
      .from("song_drafts")
      .select("payload")
      .eq("song_id", songId)
      .maybeSingle<SongDraftRow>(),
  ]);
  if (!tree) return apiError("NOT_FOUND", "곡을 찾을 수 없습니다.", 404);

  // maybeSingle()은 행이 없으면 { data: null, error: null }을 준다 — error가 채워졌다면 "임시
  // 저장이 없다"가 아니라 진짜 조회 실패이므로, 그걸 조용히 "임시 저장 없음"으로 뭉개면 사용자가
  // 실제로는 존재하는 임시 저장을 못 보고 원본을 그대로 보게 된다(코드 리뷰에서 지적받아 수정).
  if (draftResult.error) return apiError("INTERNAL_ERROR", "임시 저장 조회에 실패했습니다.", 500);

  // 임시 저장이 기준으로 삼은 updatedAt이 지금의 songs.updatedAt과 다르면(그 사이 다른 경로로
  // 저장이 이뤄졌다는 뜻) 더 이상 유효한 임시 저장이 아니다 — 되살리지 않는다.
  const draftRow = draftResult.data;
  const draftCorrection =
    draftRow && draftRow.payload.updatedAt === tree.song.updatedAt ? draftRow.payload : null;

  const response: GetSongTreeResponse = { ...tree, draftCorrection };
  return Response.json(response);
}
