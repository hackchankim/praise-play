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
    // AWS SDK v3는 기본값(WHEN_SUPPORTED)이면 PutObject presigned URL에도 CRC32 체크섬을
    // 자동으로 서명에 끼워 넣는다. 브라우저의 실제 PUT은(우리가 만든 게 아니라 순수 XHR이라)
    // 그 체크섬 헤더를 보내지 않으므로 R2가 요청을 거부하는데, 그 응답에 CORS 헤더가 없어
    // 브라우저에는 실제 원인과 무관하게 "CORS 정책에 막힘"으로 보인다(실제 재현·확인함).
    // 우리가 체크섬 검증을 직접 요청하지 않으니 WHEN_REQUIRED로 꺼둔다.
    requestChecksumCalculation: "WHEN_REQUIRED",
    // 버킷 이름에 점(.)이 포함되는 등 virtual-hosted 스타일 URL이 깨지는 경우
    // forcePathStyle: true 를 추가해야 할 수 있다 (Task 015에서 실제 버킷명 확정 후 재검토).
  });
}
