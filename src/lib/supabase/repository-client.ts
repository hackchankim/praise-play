// 리포지토리 3종(Song/Arrangement/Setlist)이 공용으로 쓰는 Supabase 클라이언트 (Task 013).
// anon 키만 쓴다 — 이 클라이언트는 리포지토리 모듈을 통해 "use client" 컴포넌트에서 직접
// 임포트되므로(아직 Route Handler가 없다 — Task 018/020에서 그쪽으로 옮겨간다) 그대로 브라우저
// 번들에 들어간다. service_role 키를 여기서 쓰면 안 된다 — 모든 RLS를 우회하는 키가 브라우저에
// 노출된다.
//
// Task 014: Clerk 세션 토큰을 accessToken()으로 공급해 Supabase RLS가 auth.jwt()를 통해
// 요청자를 인식하게 한다(Clerk Third-Party Auth — 더 이상 권장되지 않는 JWT 템플릿 방식 대신
// Supabase가 네이티브로 지원하는 방식). accessToken은 요청마다 새로 호출되므로 만료된 토큰을
// 캐시해 쓸 걱정이 없다.
//
// 리포지토리가 module-scope 싱글턴이라(React 컴포넌트/훅이 아니다) useSession()을 쓸 수 없다.
// 브라우저에서는 ClerkProvider가 올려두는 전역 window.Clerk 인스턴스에서 직접 세션 토큰을
// 읽는다(Clerk 공식 문서 "Access the Clerk object outside of components" 패턴). 서버에서는
// @clerk/nextjs/server의 auth()를 쓰는데, 이 모듈은 next/headers를 사용해 클라이언트 번들에
// 정적으로 딸려가면 빌드가 깨지므로 동적 import로 분리한다 — 이 분기는 브라우저에서 실행되지
// 않으니 문제없다.
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

declare global {
  interface Window {
    Clerk?: {
      load(): Promise<void>;
      session?: { getToken(): Promise<string | null> } | null;
    };
  }
}

/**
 * window.Clerk 자체가 아직 정의되지 않은 순간(외부 스크립트가 아직 실행 전)을 기다린다.
 * 하이드레이션 직후 실행되는 첫 effect는 이 스크립트 실행보다 먼저 도달할 수 있어, window.Clerk
 * 존재 여부를 확인하지 않고 곧장 .load()를 옵셔널 체이닝으로 호출하면(예전 버전의 실수) 그냥
 * 조용히 스킵되어 토큰이 null로 빠진다 — 재현 확인: 재생 화면 첫 진입 시 이 레이스로 401이
 * 발생했다. 폴링 외에 Clerk가 "스크립트 실행 자체"를 기다리는 공식 API를 제공하지 않는다.
 */
async function waitForClerkGlobal(timeoutMs = 5000): Promise<Window["Clerk"]> {
  const start = Date.now();
  while (!window.Clerk && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return window.Clerk;
}

async function getClerkAccessToken(): Promise<string | null> {
  if (typeof window !== "undefined") {
    const clerk = await waitForClerkGlobal();
    // load()는 이미 로드된 뒤에 호출해도 즉시 반환하는 멱등 함수라, 매번 await해도 안전하다.
    await clerk?.load();
    return (await clerk?.session?.getToken()) ?? null;
  }
  const { auth } = await import("@clerk/nextjs/server");
  return (await auth()).getToken();
}

export const supabaseRepositoryClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { accessToken: getClerkAccessToken },
);
