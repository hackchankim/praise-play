import { SignIn } from "@clerk/nextjs";

// Clerk 컴포넌트는 이메일 인증 코드 재발송, 비밀번호 재설정 등 하위 단계로 내부 라우팅을
// 하므로 optional catch-all 라우트([[...sign-in]])여야 한다 — 고정 경로면 그 하위 단계에서
// 404가 난다.
export default function SignInPage() {
  return <SignIn />;
}
