// 이 그룹의 페이지들은 리포지토리를 통해 Supabase에 접근하는데, 그 클라이언트가 요청마다
// Clerk 세션 토큰을 붙이려고 서버에서 auth()(=headers())를 호출한다(src/lib/supabase/
// repository-client.ts, Task 014). 그래서 빌드 시점 정적 프리렌더가 불가능한, 요청마다
// 달라지는 페이지다 — 명시하지 않으면 Next.js가 정적 생성을 시도하다가 "headers()가 요청
// 스코프 밖에서 호출됨" 에러로 빌드가 실패한다.
export const dynamic = "force-dynamic";

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  // 재생 화면(가사 뷰)이 내부 스크롤을 갖고 헤더/컨트롤은 화면에 고정되게 하려면, 이 레이아웃부터
  // 뷰포트 높이로 상한을 둬야 한다 — min-h-full만으로는 자식이 얼마든지 더 커질 수 있어(body가
  // 대신 스크롤되며) 하단 재생 컨트롤이 화면 밖으로 밀려난다.
  return <div className="flex h-dvh flex-col overflow-hidden bg-background">{children}</div>;
}
