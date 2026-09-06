// 교정 페이지가 Task 018의 Route Handler와 통신할 때 쓰는 얇은 fetch 래퍼들.
// upload-image.ts의 postJson과 같은 패턴이다 — ApiErrorBody를 파싱해 사람이 읽을 메시지로
// 바꿔 던진다. fetch()/res.json() 자체는 항상 fetchOrThrowNetworkError/
// parseJsonOrThrowNetworkError를 거친다 — errors.ts 참고(순수 코드 버그의 TypeError를
// 네트워크 오류로 오분류하지 않기 위함).
import type {
  ApiErrorBody,
  GetSongTreeResponse,
  SaveCorrectionRequest,
  SaveCorrectionResponse,
} from "@/lib/api/contracts";
import { fetchOrThrowNetworkError, parseJsonOrThrowNetworkError } from "@/lib/errors";

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error.message ?? fallback;
}

export class OptimisticLockConflictError extends Error {}

export async function fetchSongTree(songId: string): Promise<GetSongTreeResponse | null> {
  const res = await fetchOrThrowNetworkError(`/api/songs/${songId}`);
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(await parseErrorMessage(res, `곡 조회에 실패했습니다 (status ${res.status}).`));
  return parseJsonOrThrowNetworkError<GetSongTreeResponse>(res);
}

export async function saveSongCorrection(
  songId: string,
  request: SaveCorrectionRequest,
): Promise<SaveCorrectionResponse> {
  const res = await fetchOrThrowNetworkError(`/api/songs/${songId}/correction`, {
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
  return parseJsonOrThrowNetworkError<SaveCorrectionResponse>(res);
}

/**
 * 임시 저장은 베스트 에포트다 — 실패해도 사용자의 편집 흐름을 막지 않는다(다음 자동 저장이
 * 재시도한다). signal을 받는 이유: 사용자가 "저장하지 않고 나가기"를 눌러 임시 저장을
 * 지우는 도중에, 그 직전에 예약돼 있던(또는 이미 나가고 있는) 자동 저장 PUT이 나중에 도착해
 * 방금 지운 draft를 되살릴 수 있다(code review 지적, 재현 가능함을 확인) — 호출부
 * (correction-view.tsx)가 나가는 시점에 이 signal로 진행 중인 자동 저장을 취소한다.
 */
export async function saveDraftCorrection(
  songId: string,
  request: SaveCorrectionRequest,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/songs/${songId}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * "저장하지 않고 나가기"(discardAndLeave)는 성공 여부를 확인해야 한다 — 이게 실패한 채
 * 조용히 넘어가면 서버에 임시 저장이 그대로 남아, 다음에 이 곡 교정 화면을 열었을 때 "버린"
 * 편집 내용이 도로 살아난다(code review 지적, 실제로 이런 되살아남 부류의 버그를 이번에
 * 여러 곳에서 고쳤다). saveDraftCorrection과 같은 이유로 예외 대신 boolean으로 결과를 알린다
 * — 호출부가 실패 시 사용자에게 알리고 페이지에 남을지 스스로 판단하게 한다.
 */
export async function deleteDraftCorrection(songId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/songs/${songId}/draft`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}
