// Cloudflare R2 (S3 호환) 클라이언트 — 업로드 이미지 저장 전용.
//
// R2는 브라우저 <form> 기반 직접 POST 업로드를 지원하지 않으므로, presigned PUT URL을
// 서버가 발급하고 브라우저가 그 URL로 직접 PUT하는 방식을 쓴다 (발급 로직은 Task 015).
//
// 버킷에 적용해야 할 CORS 정책 (Cloudflare 대시보드 R2 > 버킷 > Settings > CORS Policy):
//   [
//     {
//       "AllowedOrigins": ["http://localhost:3000", "https://<production-domain>"],
//       "AllowedMethods": ["PUT"],
//       "AllowedHeaders": ["content-type"],
//       "MaxAgeSeconds": 3600
//     }
//   ]

import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

export function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // 버킷 이름에 점(.)이 포함되는 등 virtual-hosted 스타일 URL이 깨지는 경우
    // forcePathStyle: true 를 추가해야 할 수 있다 (Task 015에서 실제 버킷명 확정 후 재검토).
  });
}
