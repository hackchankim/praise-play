import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Route Handler/Server Component에서 요청마다 새로 생성해 사용한다.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
    // Clerk Third-Party Auth 연동 자리: Clerk 세션 JWT를 accessToken()으로 전달하면
    // Supabase RLS가 auth.jwt()를 통해 Clerk user_id를 인식한다. 실제 연동은 Task 014.
    // accessToken: async () => (await auth()).getToken(),
  });
}
