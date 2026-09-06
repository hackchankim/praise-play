// POST /api/songs/[songId]/extract 트리거 클라이언트 헬퍼 (Task 016).
// fetch() 자체는 항상 errors.ts의 헬퍼를 거친다.
import type { ApiErrorBody } from "@/lib/api/contracts";
import { fetchOrThrowNetworkError } from "@/lib/errors";

export async function triggerExtraction(songId: string): Promise<void> {
  const res = await fetchOrThrowNetworkError(`/api/songs/${songId}/extract`, { method: "POST" });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(errorBody?.error.message ?? `추출 시작에 실패했습니다 (status ${res.status}).`);
  }
}
