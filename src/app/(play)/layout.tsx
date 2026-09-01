export default function PlayLayout({ children }: { children: React.ReactNode }) {
  // 재생 화면(가사 뷰)이 내부 스크롤을 갖고 헤더/컨트롤은 화면에 고정되게 하려면, 이 레이아웃부터
  // 뷰포트 높이로 상한을 둬야 한다 — min-h-full만으로는 자식이 얼마든지 더 커질 수 있어(body가
  // 대신 스크롤되며) 하단 재생 컨트롤이 화면 밖으로 밀려난다.
  return <div className="flex h-dvh flex-col overflow-hidden bg-background">{children}</div>;
}
