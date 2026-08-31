// Next.js 16부터 미들웨어 파일명이 middleware.ts에서 proxy.ts로 바뀌었다
// (구 middleware.ts는 하위 호환을 위해 계속 인식되지만, 신규 프로젝트는 proxy.ts를 사용).
// 여기서는 보호 라우트 매처 골격만 배선한다 — 실제 리디렉션(auth.protect())은 Task 014에서 구현한다.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/", "/songs(.*)", "/setlists(.*)"]);

export default clerkMiddleware((_auth, req) => {
  if (isProtectedRoute(req)) {
    // Task 014: await auth.protect() 로 비로그인 사용자를 /sign-in으로 리디렉션
  }
});

export const config = {
  // 이 패턴이 이미 /api/*를 포함하므로(정적 파일 확장자만 제외) 별도 "/(api|trpc)(.*)" 항목은
  // 불필요하다 — Clerk quickstart 보일러플레이트에는 있지만 tRPC를 쓰지 않아 제거함.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
