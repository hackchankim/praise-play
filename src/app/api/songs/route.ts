// GET /api/songs — 곡 목록 조회 (Task 020).
// setlist-view.tsx/add-song-dialog.tsx가 songRepository.list()를 브라우저에서 직접 호출하던
// 것을 이 라우트 뒤로 옮긴다 — Task 018에서 정착된 패턴(클라이언트는 더 이상 리포지토리를 통해
// Supabase를 직접 호출하지 않고 Route Handler를 거친다)을 여기도 맞춘다. 홈 화면(Server
// Component)은 이 라우트를 거치지 않고 songRepository.list()를 여전히 직접 호출한다 —
// 서버 컴포넌트 자체가 이미 서버 실행이라 왕복을 하나 더 만들 이유가 없다.
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { songRepository } from "@/lib/repositories/song-repository";

export async function GET(request: Request) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitParam !== null) {
    // Number.parseInt("20abc")는 뒤쪽 쓰레기를 조용히 무시하고 20을 반환한다 — 정수
    // 문자열인지 먼저 정규식으로 확인해야 오타가 조용히 통과하지 않는다(code review 지적).
    if (!/^\d+$/.test(limitParam)) {
      return apiError("INVALID_REQUEST", "limit은 양의 정수여야 합니다.", 400);
    }
    limit = Number.parseInt(limitParam, 10);
    if (limit <= 0) {
      return apiError("INVALID_REQUEST", "limit은 양의 정수여야 합니다.", 400);
    }
  }

  const result = await songRepository.list({ cursor, limit });
  return Response.json(result);
}
