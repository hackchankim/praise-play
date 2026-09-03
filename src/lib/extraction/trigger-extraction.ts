// POST /api/songs/[songId]/extract 트리거 클라이언트 헬퍼 (Task 016).
import type { ApiErrorBody } from "@/lib/api/contracts";

export async function triggerExtraction(songId: string): Promise<void> {
  const res = await fetch(`/api/songs/${songId}/extract`, { method: "POST" });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(errorBody?.error.message ?? `추출 시작에 실패했습니다 (status ${res.status}).`);
  }
}
