// Clerk user_id ↔ users 테이블 동기화 (Task 014).
// 매 요청마다 "없으면 만들고, 있으면 이름을 최신화"를 멱등하게 호출하는 방식을 택했다 — Clerk
// 웹훅(CLERK_WEBHOOK_SECRET) 인프라를 새로 갖추는 것보다 지금 규모에서는 더 단순하다. 일반
// upsert(ON CONFLICT DO UPDATE)라 사용자가 Clerk 쪽에서 이름을 바꾼 뒤에도 display_name이
// 계속 최신 상태로 반영된다 — ON CONFLICT DO NOTHING을 쓰면 최초 로그인 이후로는 영영 갱신되지
// 않는다.
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

export async function ensureUser(id: string, displayName: string): Promise<void> {
  const { error } = await supabaseRepositoryClient
    .from("users")
    .upsert({ id, display_name: displayName }, { onConflict: "id" });
  if (error) throw new Error(`사용자 동기화 실패: ${error.message}`);
}
