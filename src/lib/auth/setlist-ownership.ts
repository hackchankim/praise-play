// 세트리스트 소유권 확인 (Task 020).
// RLS(setlists_owner)만으로는 "존재하지 않음"과 "남의 것"을 구분할 수 없다 — RLS가 걸러낸
// 남의 행은 그냥 0건 조회로 보인다. 테스트 체크리스트가 명시적으로 403을 요구하므로("타
// 사용자의 세트리스트 ID로 API 호출 시 403이 반환되는가"), RLS를 우회하는 service-role
// 클라이언트로 소유자를 직접 확인해 404/403을 구분한다. 이후 실제 읽기/쓰기는 그대로 anon
// 키 + RLS 경로(setlistRepository)를 쓴다 — 이 함수는 상태 코드 판단에만 쓰인다.
import { supabaseServiceClient } from "@/lib/supabase/service-client";

export type SetlistOwnership = "owned" | "not_found" | "forbidden";

export async function checkSetlistOwnership(
  setlistId: string,
  userId: string,
): Promise<SetlistOwnership> {
  const { data, error } = await supabaseServiceClient
    .from("setlists")
    .select("owner_id")
    .eq("id", setlistId)
    .maybeSingle<{ owner_id: string }>();
  if (error) throw new Error(`찬양콘티 소유권 확인 실패: ${error.message}`);
  if (!data) return "not_found";
  return data.owner_id === userId ? "owned" : "forbidden";
}
