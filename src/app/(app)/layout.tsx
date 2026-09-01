import Link from "next/link";
import { Home, ListMusic, LogOut } from "lucide-react";
import { routes } from "@/lib/routes";

const NAV_ITEMS = [
  { href: routes.home(), label: "홈", icon: Home },
  // 찬양콘티 전체 목록 페이지는 MVP 범위에 없어(라우트 표는 ROADMAP.md 참고), 홈의 찬양콘티
  // 섹션(#setlists)으로 스크롤 이동시킨다.
  { href: `${routes.home()}#setlists`, label: "찬양콘티", icon: ListMusic },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <Link href={routes.home()} className="text-base font-semibold">
          PraisePlay
        </Link>
        <nav className="hidden items-center gap-4 sm:flex">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            disabled
            className="flex items-center gap-1 text-sm text-muted-foreground opacity-50"
          >
            <LogOut className="size-4" />
            로그아웃
          </button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      {/* 콘텐츠가 뷰포트보다 길면(예: 곡이 많은 홈 화면) 하단까지 스크롤해야만 탭바가 보이던
          문제(QA 확인) — sticky로 항상 화면 하단에 붙어 있게 한다 */}
      <nav className="sticky bottom-0 z-10 flex h-16 items-center justify-around border-t bg-background sm:hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
