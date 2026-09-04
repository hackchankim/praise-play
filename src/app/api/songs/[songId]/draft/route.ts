// PUT/DELETE /api/songs/[songId]/draft — 임시 저장 (Task 018).
// song_drafts는 songs.updated_at(낙관적 잠금 기준값)과 무관한 별도 테이블이라(마이그레이션
// 20260904000005 주석 참고) 여기서는 존재 여부·소유권 확인 없이 그냥 upsert/delete한다 —
// RLS(song_drafts_via_song_owner)가 소유권을, DB의 FK(song_id references songs)가 존재 여부를
// 이미 강제한다.
import { z } from "zod";
import type { SaveCorrectionRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";
import { SECTION_TYPES } from "@/lib/song-model/types";

// PATCH /correction과 값 제약은 같지만 임시 저장은 "저장하다 만" 상태를 담을 수 있어야 하므로
// (예: 빈 코드 기호로 새 칩만 추가해 둔 상태) chord 문자열의 min(1) 같은 엄격한 제약은 두지 않는다.
const draftSchema = z.object({
  song: z.object({
    key: z.string(),
    tempo: z.number(),
    timeSignature: z.string(),
  }),
  sections: z.array(
    z.object({
      id: z.string().min(1).optional(),
      clientKey: z.string().min(1),
      type: z.enum(SECTION_TYPES),
      orderIndex: z.number().int(),
      startBeat: z.number(),
      lengthBeats: z.number(),
      repeatTarget: z.string().nullable(),
      lines: z.array(
        z.object({
          id: z.string().min(1).optional(),
          lyrics: z.string(),
          orderIndex: z.number().int(),
          startBeat: z.number(),
          chordEvents: z.array(
            z.object({
              id: z.string().min(1).optional(),
              chord: z.string(),
              charOffset: z.number(),
              beatOffset: z.number(),
              needsReview: z.boolean(),
            }),
          ),
        }),
      ),
    }),
  ),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<SaveCorrectionRequest>;

export async function PUT(request: Request, context: { params: Promise<{ songId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { songId } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
      400,
    );
  }

  const { error } = await supabaseRepositoryClient.from("song_drafts").upsert({
    song_id: songId,
    payload: parsed.data,
    updated_at: new Date().toISOString(),
  });
  // 23503 = FK 위반(song_id가 songs에 없음) — 남의 곡이거나 존재하지 않는 곡이면 RLS가
  // songs 조회 자체를 걸러 FK도 함께 걸린다. 진짜 서버 오류(500)와 구분해준다.
  if (error?.code === "23503") return apiError("NOT_FOUND", "곡을 찾을 수 없습니다.", 404);
  if (error) return apiError("INTERNAL_ERROR", "임시 저장에 실패했습니다.", 500);

  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ songId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { songId } = await context.params;

  const { error } = await supabaseRepositoryClient
    .from("song_drafts")
    .delete()
    .eq("song_id", songId);
  if (error) return apiError("INTERNAL_ERROR", "임시 저장 삭제에 실패했습니다.", 500);

  return new Response(null, { status: 204 });
}
