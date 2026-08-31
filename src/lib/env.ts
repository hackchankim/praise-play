// 환경 변수 런타임 검증. 값이 누락되면 이 모듈이 처음 임포트되는 시점(=서버 부팅 시점)에
// 즉시 실패한다 — 잘못된 배포가 요청 처리 도중에야 드러나는 것을 막기 위함.
// 로컬 개발 시에는 .env.example을 복사한 .env.local(placeholder 값도 무방)이 있어야 한다.
//
// server/client를 분리하고 runtimeEnv에서 각 NEXT_PUBLIC_* 키를 개별 process.env.X 형태로
// 나열하는 이유: Next.js는 클라이언트 번들에 값을 인라이닝할 때 이런 정적 dot-access만
// 텍스트 치환한다. process.env 객체를 통째로 스키마에 넘기면(예: schema.parse(process.env))
// 브라우저에서는 그 객체가 비어 있어 NEXT_PUBLIC_* 값조차 조용히 사라진다.
// @t3-oss/env-nextjs가 이 규칙을 강제해준다.

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),

    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    R2_PUBLIC_URL: z.string().url(),

    ANTHROPIC_API_KEY: z.string().min(1),

    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,

    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,

    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});

export type Env = typeof env;
