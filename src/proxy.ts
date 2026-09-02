// Next.js 16부터 미들웨어 파일명이 middleware.ts에서 proxy.ts로 바뀌었다
// (구 middleware.ts는 하위 호환을 위해 계속 인식되지만, 신규 프로젝트는 proxy.ts를 사용).
// 여기서는 보호 라우트 매처 골격만 배선한다 — 실제 리디렉션(auth.protect())은 Task 014에서 구현한다.

import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/", "/songs(.*)", "/setlists(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // 프로덕션에서는 개발자 전용 컴포넌트 갤러리(/_dev/ui)를 미들웨어 단계에서 차단한다.
  // 페이지 쪽 notFound()만으로는 App Router 스트리밍 특성상 실제 HTTP 상태가 200으로
  // 나갈 수 있어(React가 <html> 셸을 이미 200으로 보내기 시작한 뒤 트리거되기 때문),
  // 요청을 아예 여기서 끊어 진짜 404를 보장한다.
  if (process.env.NODE_ENV === "production" && req.nextUrl.pathname.startsWith("/_dev")) {
    return new NextResponse(null, { status: 404 });
  }

  if (isProtectedRoute(req)) {
    // 비로그인 사용자는 auth.protect()가 자동으로 /sign-in으로 리디렉션한다
    // (로그인 후 원래 요청한 경로로 돌아오도록 redirect_url을 함께 붙여준다).
    await auth.protect();
  }
});

export const config = {
  // 이 패턴이 이미 /api/*를 포함하므로(정적 파일 확장자만 제외) 별도 "/(api|trpc)(.*)" 항목은
  // 불필요하다 — Clerk quickstart 보일러플레이트에는 있지만 tRPC를 쓰지 않아 제거함.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
