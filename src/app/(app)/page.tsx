import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">홈</h1>
        <p className="text-sm text-muted-foreground">
          저장된 곡·세트리스트 목록 자리 (Task 006, 007에서 실제 데이터 연동)
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={routes.songsUpload()} className={cn(buttonVariants())}>
          악보 업로드
        </Link>
        <Link href={routes.setlist("demo")} className={cn(buttonVariants({ variant: "outline" }))}>
          세트리스트 예시 보기
        </Link>
      </div>
    </div>
  );
}
