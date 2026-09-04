// PATCH /api/songs/[songId]/correction — 교정 저장 (Task 018).
// 브라우저가 Supabase RPC를 직접 호출하던 것(Task 013)을 이 라우트 뒤로 옮긴 핵심 이유: 클라이언트
// 검증은 신뢰하지 않는다. 여기서 Zod로 값 자체(음수 beat 등)를 재검증하고, 코드 문법은
// chord-validator.ts(Task 017)로 다시 계산해 클라이언트가 보낸 needsReview를 덮어쓴다 — 클라이언트가
// 조작한 값이 그대로 저장되는 걸 막는다.
import { z } from "zod";
import type { SaveCorrectionRequest, SaveCorrectionResponse } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { songRepository } from "@/lib/repositories/song-repository";
import { NotFoundError, OptimisticLockError, ValidationError } from "@/lib/repositories/errors";
import { SECTION_TYPES } from "@/lib/song-model/types";
import { validateChord } from "@/lib/song-model/chord-validator";

const chordEventSchema = z.object({
  id: z.string().min(1).optional(),
  chord: z.string().min(1),
  charOffset: z.number().int().min(0),
  beatOffset: z.number().min(0),
  needsReview: z.boolean(),
});

const lineSchema = z.object({
  id: z.string().min(1).optional(),
  lyrics: z.string(),
  orderIndex: z.number().int().min(0),
  startBeat: z.number().min(0),
  chordEvents: z.array(chordEventSchema),
});

const sectionSchema = z.object({
  id: z.string().min(1).optional(),
  clientKey: z.string().min(1),
  type: z.enum(SECTION_TYPES),
  orderIndex: z.number().int().min(0),
  startBeat: z.number().min(0),
  lengthBeats: z.number().positive(),
  repeatTarget: z.string().min(1).nullable(),
  lines: z.array(lineSchema),
});

const requestSchema = z.object({
  song: z.object({
    key: z.string().min(1),
    tempo: z.number().int().positive(),
    timeSignature: z.string().min(1),
  }),
  sections: z.array(sectionSchema),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<SaveCorrectionRequest>;

/**
 * 코드 표기는 항상 서버 기준으로 정규화하고, 문법 자체가 깨진 경우(정규식·Tonal 파싱 실패)만
 * needsReview를 강제로 켠다 — 이건 사람이 "확인했다"고 넘길 수 있는 문제가 아니라 애초에 재생이
 * 불가능한 데이터이기 때문이다. 반면 unusualForKey(조표 대비 이례적 근음)는 차용화음·이차딸림
 * 화음처럼 실제로 흔히 쓰이는 정상적인 진행일 수 있는 조언성 신호일 뿐이라, 사람이 검토 후
 * "검토 필요" 체크를 풀었다면(needsReview: false) 그 판단을 존중한다 — 여기서 다시 강제로 켜면
 * 그 종류의 경고는 영원히 해제할 수 없는 버그가 된다(코드 리뷰에서 지적받아 수정).
 */
function revalidateChords(request: SaveCorrectionRequest): SaveCorrectionRequest {
  return {
    ...request,
    sections: request.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        chordEvents: line.chordEvents.map((chordEvent) => {
          const validation = validateChord(chordEvent.chord, request.song.key);
          const isBroken = !validation.syntaxValid || !validation.parsedByTonal;
          return {
            ...chordEvent,
            chord: validation.normalized,
            needsReview: chordEvent.needsReview || isBroken,
          };
        }),
      })),
    })),
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ songId: string }> }) {
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

  const revalidated = revalidateChords(parsed.data);

  try {
    const result: SaveCorrectionResponse = await songRepository.saveCorrection(songId, revalidated);
    return Response.json(result);
  } catch (error) {
    if (error instanceof NotFoundError) return apiError("NOT_FOUND", error.message, 404);
    if (error instanceof OptimisticLockError) return apiError("CONFLICT", error.message, 409);
    if (error instanceof ValidationError) return apiError("INVALID_REQUEST", error.message, 400);
    return apiError("INTERNAL_ERROR", "저장에 실패했습니다.", 500);
  }
}
