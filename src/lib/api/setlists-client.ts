// /api/setlists 계열 클라이언트 래퍼 (Task 020).
// song-correction-client.ts와 같은 패턴 — ApiErrorBody를 사람이 읽을 메시지로 바꿔 던진다.
// 403(SetlistForbiddenError)은 다른 실패와 구분해 UI가 "찾을 수 없음"이 아니라 "권한 없음"
// 메시지를 보여줄 수 있게 한다.
import type {
  ApiErrorBody,
  CreateSetlistRequest,
  CreateSetlistResponse,
  GetSetlistResponse,
  ListSetlistsResponse,
  UpdateSetlistItemsRequest,
  UpdateSetlistRequest,
  UpdateSetlistResponse,
} from "@/lib/api/contracts";

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error.message ?? fallback;
}

export class SetlistForbiddenError extends Error {}

async function throwForStatus(res: Response, fallback: string): Promise<never> {
  if (res.status === 403) {
    throw new SetlistForbiddenError(
      await parseErrorMessage(res, "이 찬양콘티에 접근할 권한이 없습니다."),
    );
  }
  throw new Error(await parseErrorMessage(res, fallback));
}

export async function fetchSetlists(): Promise<ListSetlistsResponse> {
  const res = await fetch("/api/setlists");
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `찬양콘티 목록 조회에 실패했습니다 (status ${res.status}).`),
    );
  }
  return res.json() as Promise<ListSetlistsResponse>;
}

export async function fetchSetlist(setlistId: string): Promise<GetSetlistResponse | null> {
  const res = await fetch(`/api/setlists/${setlistId}`);
  if (res.status === 404) return null;
  if (!res.ok) return throwForStatus(res, `찬양콘티 조회에 실패했습니다 (status ${res.status}).`);
  return res.json() as Promise<GetSetlistResponse>;
}

export async function createSetlist(request: CreateSetlistRequest): Promise<CreateSetlistResponse> {
  const res = await fetch("/api/setlists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `찬양콘티 생성에 실패했습니다 (status ${res.status}).`),
    );
  }
  return res.json() as Promise<CreateSetlistResponse>;
}

export async function renameSetlist(
  setlistId: string,
  request: UpdateSetlistRequest,
): Promise<UpdateSetlistResponse> {
  const res = await fetch(`/api/setlists/${setlistId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok)
    return throwForStatus(res, `찬양콘티 이름 변경에 실패했습니다 (status ${res.status}).`);
  return res.json() as Promise<UpdateSetlistResponse>;
}

export async function updateSetlistItems(
  setlistId: string,
  request: UpdateSetlistItemsRequest,
): Promise<GetSetlistResponse> {
  const res = await fetch(`/api/setlists/${setlistId}/items`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    return throwForStatus(res, `찬양콘티 항목 저장에 실패했습니다 (status ${res.status}).`);
  }
  return res.json() as Promise<GetSetlistResponse>;
}

export async function deleteSetlist(setlistId: string): Promise<void> {
  const res = await fetch(`/api/setlists/${setlistId}`, { method: "DELETE" });
  if (!res.ok) await throwForStatus(res, `찬양콘티 삭제에 실패했습니다 (status ${res.status}).`);
}
