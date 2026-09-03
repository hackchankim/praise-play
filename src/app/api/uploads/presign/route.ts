// POST /api/uploads/presign — 이 프로젝트의 첫 Route Handler (Task 015).
// R2는 브라우저 <form> 기반 직접 POST 업로드를 지원하지 않으므로, 여기서 presigned PUT URL을
// 발급하면 브라우저가 그 URL로 파일 바이트를 직접 R2에 PUT한다(서버를 거치지 않는다 — 그래서
// 크기 제한을 "업로드된 객체"가 아니라 "발급 요청 시점에 클라이언트가 신고한 크기"로 검증한다.
// presigned PUT은 S3 presigned POST와 달리 Content-Length 조건을 강제할 표준 방법이 없어,
// 완전한 서버 측 강제는 아니다 — 악의적 클라이언트가 신고한 크기보다 큰 바이트를 실제로 PUT하는
//것 자체는 막지 못한다. 다만 이 앱은 인증된 사용자 전용이고 파일 크기를 속여도 얻는 이득이
// 없으므로 지금 단계에서는 충분한 방어선이다).
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import type { PresignUploadResponse } from "@/lib/api/contracts";
import { apiError, requireUserId, UnauthorizedError } from "@/lib/auth/route-guard";
import { createR2Client } from "@/lib/r2/client";
import { env } from "@/lib/env";

const ACCEPTED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
const EXTENSION_BY_CONTENT_TYPE: Record<(typeof ACCEPTED_CONTENT_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const PRESIGN_EXPIRES_SECONDS = 300;

const requestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.enum(ACCEPTED_CONTENT_TYPES),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES, "파일 용량이 15MB를 초과합니다."),
});

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) return apiError("UNAUTHORIZED", error.message, 401);
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
      400,
    );
  }

  // fileSize는 위 zod 스키마에서 이미 상한 검증에 쓰였다 — 여기서 더 쓸 일은 없다.
  const { contentType } = parsed.data;
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  // 파일명을 그대로 키에 쓰지 않는다 — 경로 조작(../ 등)이나 특수문자로 인한 키 충돌을 원천
  // 차단한다. 사용자별 접두어는 감사/디버깅 편의용일 뿐 접근 제어에 쓰이진 않는다(객체 자체는
  // 버킷 전체가 공개 접근이라 R2_PUBLIC_URL로 누구나 읽을 수 있다 — Task013에서 이미 그렇게
  // 세팅함).
  const objectKey = `uploads/${userId}/${crypto.randomUUID()}.${extension}`;

  const client = createR2Client();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });

  const response: PresignUploadResponse = {
    uploadUrl,
    objectKey,
    expiresAt: new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString(),
  };
  return Response.json(response);
}
