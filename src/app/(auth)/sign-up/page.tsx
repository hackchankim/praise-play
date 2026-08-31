import Link from "next/link";
import { routes } from "@/lib/routes";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold">회원가입</h1>
      <p className="text-sm text-muted-foreground">
        Clerk 회원가입 폼 자리 (Task 007, 014에서 구현)
      </p>
      <Link href={routes.signIn()} className="text-sm text-primary underline underline-offset-4">
        이미 계정이 있으신가요? 로그인
      </Link>
    </div>
  );
}
