import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Home, ListMusic } from "lucide-react";
import { routes } from "@/lib/routes";
import { ensureUser } from "@/lib/repositories/user-repository";

const NAV_ITEMS = [
  { href: routes.home(), label: "홈", icon: Home },
  // 찬양콘티 전체 목록 페이지는 MVP 범위에 없어(라우트 표는 ROADMAP.md 참고), 홈의 찬양콘티
  // 섹션(#setlists)으로 스크롤 이동시킨다.
  { href: `${routes.home()}#setlists`, label: "찬양콘티", icon: ListMusic },
] as const;

// currentUser()와 리포지토리(Supabase 클라이언트가 Clerk 토큰을 붙이려 auth()=headers()를
// 호출한다, Task 014)가 이 레이아웃과 그 하위 모든 페이지를 요청마다 다르게 만든다 — 명시하지
// 않으면 Next.js가 빌드 시점 정적 생성을 시도하다가 "headers()가 요청 스코프 밖" 에러로 실패한다.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts가 이미 이 라우트 그룹 전체를 보호하므로 여기 도달했다면 로그인된 사용자다.
  // 최초 로그인 시 users 테이블에 레코드가 없을 수 있어(Clerk 계정과 우리 DB 레코드는 별개),
  // 매 렌더마다 멱등하게 동기화한다 — ensureUser()는 ON CONFLICT DO NOTHING이라 이미 있으면
  // 사실상 빈 upsert 한 번만 더 나간다.
  const user = await currentUser();
  if (user) {
    await ensureUser(user.id, user.fullName ?? user.username ?? user.id);
  }

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
          <UserButton />
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
        <UserButton />
      </nav>
    </div>
  );
}
