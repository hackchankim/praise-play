// 업로드 전 이미지를 리사이즈·재인코딩해 비전 LLM 입력 토큰을 절감한다 (Task 015).
// 리드시트 사진은 연속톤 이미지라 PNG 무손실 보존의 이점이 거의 없고, 어차피 Task 016의
// 비전 LLM 호출도 JPEG 입력을 표준으로 다루므로 전부 JPEG로 통일해 재인코딩한다.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * 긴 변을 MAX_DIMENSION 이하로 축소하고 JPEG로 재인코딩한 새 File을 반환한다. 디코딩에
 * 실패하면(예: 브라우저의 HEIC 미지원) 원본 File을 그대로 반환한다 — 리사이즈는 최적화일 뿐
 * 업로드 자체를 막을 이유는 아니다.
 */
export async function resizeImageForUpload(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^./]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
