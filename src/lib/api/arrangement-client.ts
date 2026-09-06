// POST /api/songs/[songId]/arrangements 클라이언트 래퍼 (Task 019).
// upload-image.ts/song-correction-client.ts와 같은 패턴 — ApiErrorBody를 사람이 읽을 메시지로
// 바꿔 던진다. fetch()/res.json() 자체는 항상 errors.ts의 헬퍼를 거친다.
import type {
  ApiErrorBody,
  GenerateArrangementRequest,
  GenerateArrangementResponse,
} from "@/lib/api/contracts";
import { fetchOrThrowNetworkError, parseJsonOrThrowNetworkError } from "@/lib/errors";

export async function generateArrangementForSong(
  songId: string,
  request: GenerateArrangementRequest,
): Promise<GenerateArrangementResponse> {
  const res = await fetchOrThrowNetworkError(`/api/songs/${songId}/arrangements`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(body?.error.message ?? `편곡 생성에 실패했습니다 (status ${res.status}).`);
  }
  return parseJsonOrThrowNetworkError<GenerateArrangementResponse>(res);
}
