// 리포지토리 3종(Song/Arrangement/Setlist)이 공용으로 쓰는 Supabase 클라이언트 (Task 013).
// anon 키만 쓴다 — 이 클라이언트는 리포지토리 모듈을 통해 "use client" 컴포넌트에서 직접
// 임포트되므로(아직 Route Handler가 없다 — Task 018/020에서 그쪽으로 옮겨간다) 그대로 브라우저
// 번들에 들어간다. service_role 키를 여기서 쓰면 안 된다 — 모든 RLS를 우회하는 키가 브라우저에
// 노출된다.
//
// src/lib/supabase/{browser,server}.ts는 Clerk 세션 쿠키를 Supabase Auth 흐름에 연결하기 위한
// 것(Task 014, Third-Party Auth)이라 서버/브라우저 구현이 갈리는데, 리포지토리는 지금 RLS가
// 임시로 permissive해서(supabase/migrations/20260903000000_rls_policies.sql) 세션이 필요 없다.
// 쿠키도 필요 없는 단순 REST 클라이언트라 서버·브라우저 어디서든 동일하게 동작한다.
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const supabaseRepositoryClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
