// GET/PATCH/DELETE /api/setlists/[setlistId] — 세트리스트 상세 조회·이름 변경·삭제 (Task 020).
// 소유권 확인은 setlist-ownership.ts로 위임한다 — RLS만으로는 404/403을 구분할 수 없어서다.
import { z } from "zod";
import type { UpdateSetlistRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { checkSetlistOwnership } from "@/lib/auth/setlist-ownership";
import { setlistRepository } from "@/lib/repositories/setlist-repository";
import { NotFoundError } from "@/lib/repositories/errors";

const updateSchema = z.object({
  name: z.string().min(1),
}) satisfies z.ZodType<UpdateSetlistRequest>;

async function resolveOwnership(setlistId: string, userId: string) {
  const ownership = await checkSetlistOwnership(setlistId, userId);
  if (ownership === "not_found") {
    return apiError("NOT_FOUND", "찬양콘티를 찾을 수 없습니다.", 404);
  }
  if (ownership === "forbidden") {
    return apiError("FORBIDDEN", "이 찬양콘티에 접근할 권한이 없습니다.", 403);
  }
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ setlistId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { setlistId } = await context.params;
  const ownershipError = await resolveOwnership(setlistId, auth.userId);
  if (ownershipError) return ownershipError;

  const detail = await setlistRepository.getById(setlistId);
  if (!detail) return apiError("NOT_FOUND", "찬양콘티를 찾을 수 없습니다.", 404);
  return Response.json(detail);
}

export async function PATCH(request: Request, context: { params: Promise<{ setlistId: string }> }) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { setlistId } = await context.params;
  const ownershipError = await resolveOwnership(setlistId, auth.userId);
  if (ownershipError) return ownershipError;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
      400,
    );
  }

  try {
    const setlist = await setlistRepository.updateName(setlistId, parsed.data);
    return Response.json({ setlist });
  } catch (error) {
    if (error instanceof NotFoundError) return apiError("NOT_FOUND", error.message, 404);
    return apiError("INTERNAL_ERROR", "이름 변경에 실패했습니다.", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ setlistId: string }> },
) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const { setlistId } = await context.params;
  const ownershipError = await resolveOwnership(setlistId, auth.userId);
  if (ownershipError) return ownershipError;

  try {
    await setlistRepository.delete(setlistId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof NotFoundError) return apiError("NOT_FOUND", error.message, 404);
    return apiError("INTERNAL_ERROR", "찬양콘티 삭제에 실패했습니다.", 500);
  }
}
