// Clerk user_id ↔ users 테이블 동기화 (Task 014).
// 최초 로그인 시 레코드를 만든다 — Clerk 웹훅(CLERK_WEBHOOK_SECRET) 없이, 보호된 페이지를
// 렌더링할 때마다 "없으면 만든다"를 멱등하게 호출하는 방식을 택했다. ON CONFLICT DO NOTHING이라
// 이미 있는 사용자에게는 실질적으로 UPDATE 없는 빈 upsert 한 번(추가 라운드트립)만 발생한다 —
// 웹훅 인프라를 새로 갖추는 것보다 이 정도 비용이 지금 규모에서는 더 단순하다.
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

export async function ensureUser(id: string, displayName: string): Promise<void> {
  const { error } = await supabaseRepositoryClient
    .from("users")
    .upsert({ id, display_name: displayName }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`사용자 동기화 실패: ${error.message}`);
}
