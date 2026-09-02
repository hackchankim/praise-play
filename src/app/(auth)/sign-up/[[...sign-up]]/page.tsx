import { SignUp } from "@clerk/nextjs";

// 이 인스턴스는 가입 시 이메일 인증 코드 확인이 필수(Clerk 대시보드 설정)라, 그 하위 단계로
// 내부 라우팅한다 — 고정 경로가 아니라 optional catch-all 라우트([[...sign-up]])여야 한다.
export default function SignUpPage() {
  return <SignUp />;
}
