// GET/DELETE /api/songs 클라이언트 래퍼 (Task 020).
// upload-image.ts/song-correction-client.ts와 같은 패턴 — ApiErrorBody를 사람이 읽을 메시지로
// 바꿔 던진다.
import type { ApiErrorBody, ListSongsResponse } from "@/lib/api/contracts";

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error.message ?? fallback;
}

export async function fetchSongs(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ListSongsResponse> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  const qs = search.toString();

  const res = await fetch(`/api/songs${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `곡 목록 조회에 실패했습니다 (status ${res.status}).`),
    );
  }
  return res.json() as Promise<ListSongsResponse>;
}

export async function deleteSong(songId: string): Promise<void> {
  const res = await fetch(`/api/songs/${songId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `곡 삭제에 실패했습니다 (status ${res.status}).`));
  }
}
