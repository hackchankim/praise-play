// 교정 페이지가 Task 018의 Route Handler와 통신할 때 쓰는 얇은 fetch 래퍼들.
// upload-image.ts의 postJson과 같은 패턴이다 — ApiErrorBody를 파싱해 사람이 읽을 메시지로
// 바꿔 던진다.
import type {
  ApiErrorBody,
  GetSongTreeResponse,
  SaveCorrectionRequest,
  SaveCorrectionResponse,
} from "@/lib/api/contracts";

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error.message ?? fallback;
}

export class OptimisticLockConflictError extends Error {}

export async function fetchSongTree(songId: string): Promise<GetSongTreeResponse | null> {
  const res = await fetch(`/api/songs/${songId}`);
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(await parseErrorMessage(res, `곡 조회에 실패했습니다 (status ${res.status}).`));
  return res.json() as Promise<GetSongTreeResponse>;
}

export async function saveSongCorrection(
  songId: string,
  request: SaveCorrectionRequest,
): Promise<SaveCorrectionResponse> {
  const res = await fetch(`/api/songs/${songId}/correction`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (res.status === 409) {
    throw new OptimisticLockConflictError(
      await parseErrorMessage(res, "다른 곳에서 먼저 저장되었습니다."),
    );
  }
  if (!res.ok)
    throw new Error(await parseErrorMessage(res, `저장에 실패했습니다 (status ${res.status}).`));
  return res.json() as Promise<SaveCorrectionResponse>;
}

/** 임시 저장은 베스트 에포트다 — 실패해도 사용자의 편집 흐름을 막지 않는다(다음 자동 저장이 재시도한다). */
export async function saveDraftCorrection(
  songId: string,
  request: SaveCorrectionRequest,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/songs/${songId}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteDraftCorrection(songId: string): Promise<void> {
  try {
    await fetch(`/api/songs/${songId}/draft`, { method: "DELETE" });
  } catch {
    // 무시 — 베스트 에포트.
  }
}
