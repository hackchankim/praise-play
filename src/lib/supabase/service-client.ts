// service_role 키를 쓰는 Supabase 클라이언트 — 백그라운드 잡(Inngest, Task 016) 전용이다.
//
// repository-client.ts의 anon 키 클라이언트와 달리 이 클라이언트는 RLS를 완전히 우회한다.
// Inngest 잡은 Next.js 요청 컨텍스트 밖에서 실행되므로 @clerk/nextjs/server의 auth()가 기대하는
// headers()/cookies()가 없다 — 즉 로그인 사용자의 세션 토큰을 얻을 방법이 애초에 없다. 그래서
// 여기서는 anon 키 대신 service_role 키로 인증하고, 소유권 검사가 필요한 쓰기는 대신 DB 함수
// 안에서(예: persist_extraction_result의 draft 상태 확인) 수행한다.
//
// SUPABASE_SERVICE_ROLE_KEY는 env.ts의 server 스키마에만 있어 "use client" 컴포넌트에서
// 이 모듈을 임포트하면 빌드 타임에 즉시 실패한다 — 브라우저에 노출될 여지가 원천 차단된다.
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const supabaseServiceClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
