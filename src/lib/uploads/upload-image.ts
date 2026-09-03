// presign 발급 → R2 직접 PUT을 한 이미지에 대해 순서대로 수행하는 오케스트레이터 (Task 015).
import type {
  ApiErrorBody,
  PresignUploadRequest,
  PresignUploadResponse,
} from "@/lib/api/contracts";
import { resizeImageForUpload } from "./resize-image";
import { uploadFileToR2 } from "./upload-to-r2";

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(errorBody?.error.message ?? `요청에 실패했습니다 (status ${res.status}).`);
  }
  return res.json() as Promise<TResponse>;
}

/** 이미지 하나를 리사이즈 후 R2에 업로드하고, 등록에 쓸 objectKey를 반환한다. */
export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const resized = await resizeImageForUpload(file);

  const presignRequest: PresignUploadRequest = {
    fileName: resized.name,
    contentType: resized.type,
    fileSize: resized.size,
  };
  const { uploadUrl, objectKey } = await postJson<PresignUploadResponse>(
    "/api/uploads/presign",
    presignRequest,
  );

  await uploadFileToR2(uploadUrl, resized, onProgress);
  return objectKey;
}

/**
 * 이미 R2에 올라갔지만 songs 레코드와 연결되지 못한 객체를 지운다. 베스트 에포트다 — 실패해도
 * 호출부의 진짜 에러(곡 생성 실패 등)를 가리면 안 되므로 여기서 예외를 던지지 않는다.
 */
export async function deleteUploadedImage(objectKey: string): Promise<void> {
  try {
    await fetch("/api/uploads/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectKey }),
    });
  } catch {
    // 무시 — 위 주석 참고.
  }
}
