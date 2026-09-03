// presigned URL로 파일을 R2에 직접 PUT한다 (Task 015). fetch가 아니라 XMLHttpRequest를 쓰는
// 이유는 하나뿐이다 — fetch는 업로드 진행률(바이트 단위)을 알려줄 표준 방법이 없고, XHR의
// upload.onprogress만 이걸 제공한다.
export function uploadFileToR2(
  url: string,
  file: File | Blob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`업로드에 실패했습니다 (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
    xhr.send(file);
  });
}
