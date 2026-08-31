import Link from "next/link";
import { routes } from "@/lib/routes";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <p className="text-lg font-semibold">페이지를 찾을 수 없습니다.</p>
      <Link href={routes.home()} className="text-sm text-primary underline underline-offset-4">
        홈으로 돌아가기
      </Link>
    </div>
  );
}
