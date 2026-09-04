// PATCH /api/setlists/[setlistId]/items — 세트리스트 항목 전체 교체 (Task 020).
// 추가·제거·순서변경을 모두 이 단일 엔드포인트로 표현한다(setlistRepository.updateItems()와
// 같은 이유). arrangementId가 실제로 songId 소속인지는 여기서 다시 검증하지 않는다 —
// replace_setlist_items RPC(20260904080000 마이그레이션) 안에서 이미 강제되고, 어긋나면
// PT422로 던져 setlistRepository가 ValidationError로 변환한다.
import { z } from "zod";
import type { UpdateSetlistItemsRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { checkSetlistOwnership } from "@/lib/auth/setlist-ownership";
import { setlistRepository } from "@/lib/repositories/setlist-repository";
import { NotFoundError, ValidationError } from "@/lib/repositories/errors";

const itemsSchema = z.object({
  items: z.array(
    z.object({
      songId: z.string().min(1),
      arrangementId: z.string().min(1),
      orderIndex: z.number().int().min(0),
    }),
  ),
}) satisfies z.ZodType<UpdateSetlistItemsRequest>;

export async function PATCH(request: Request, context: { params: Promise<{ setlistId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { setlistId } = await context.params;

  const ownership = await checkSetlistOwnership(setlistId, auth.userId);
  if (ownership === "not_found") return apiError("NOT_FOUND", "찬양콘티를 찾을 수 없습니다.", 404);
  if (ownership === "forbidden") {
    return apiError("FORBIDDEN", "이 찬양콘티에 접근할 권한이 없습니다.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = itemsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
      400,
    );
  }

  try {
    const result = await setlistRepository.updateItems(setlistId, parsed.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof NotFoundError) return apiError("NOT_FOUND", error.message, 404);
    if (error instanceof ValidationError) return apiError("INVALID_REQUEST", error.message, 400);
    return apiError("INTERNAL_ERROR", "찬양콘티 항목 저장에 실패했습니다.", 500);
  }
}
