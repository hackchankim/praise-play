import Link from "next/link";
import { routes } from "@/lib/routes";

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold">로그인</h1>
      <p className="text-sm text-muted-foreground">Clerk 로그인 폼 자리 (Task 007, 014에서 구현)</p>
      <Link href={routes.signUp()} className="text-sm text-primary underline underline-offset-4">
        계정이 없으신가요? 회원가입
      </Link>
    </div>
  );
}
