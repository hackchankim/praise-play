import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComponentGallery } from "./gallery";

// 개발자 전용 디자인 시스템 검증 페이지 — 프로덕션 빌드(next build는 NODE_ENV=production으로
// 실행되므로 Vercel Preview/Production 배포 모두 포함)에서는 존재하지 않는 라우트로 취급한다.
// 혹시 접근 제한이 새어나가는 경우를 대비해 검색엔진 색인도 명시적으로 차단한다.
// 정적 프리렌더링 시 notFound()가 실제 HTTP 404 상태 코드 대신 200으로 캐싱되는 것을 막기 위해
// 요청마다 동적으로 렌더링하도록 강제한다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ComponentGallery />;
}
