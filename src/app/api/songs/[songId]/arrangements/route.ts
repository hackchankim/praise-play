// POST /api/songs/[songId]/arrangements — 장르 프리셋 기반 편곡 생성 (Task 019).
// 실제 노트 생성(Tonal Voicing 기반 엔진)은 persist-arrangement.ts(server-only)가 담당한다 —
// 이 라우트는 인증·입력 검증 후 그 함수 하나를 호출하는 얇은 어댑터다.
import { z } from "zod";
import type { GenerateArrangementRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { persistGeneratedArrangement } from "@/lib/arrangement/persist-arrangement";
import { NotFoundError, ValidationError } from "@/lib/repositories/errors";
import { GENRE_PRESETS } from "@/lib/song-model/types";

const requestSchema = z.object({
  genrePreset: z.enum(GENRE_PRESETS),
}) satisfies z.ZodType<GenerateArrangementRequest>;

export async function POST(request: Request, context: { params: Promise<{ songId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { songId } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
      400,
    );
  }

  try {
    const result = await persistGeneratedArrangement(songId, parsed.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof NotFoundError) return apiError("NOT_FOUND", error.message, 404);
    if (error instanceof ValidationError) return apiError("INVALID_REQUEST", error.message, 400);
    return apiError("INTERNAL_ERROR", "편곡 생성에 실패했습니다.", 500);
  }
}
