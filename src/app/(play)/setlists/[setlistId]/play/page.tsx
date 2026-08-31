import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default async function SetlistPlayPage({
  params,
}: {
  params: Promise<{ setlistId: string }>;
}) {
  const { setlistId } = await params;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">실시간 재생</h1>
        <p className="text-sm text-muted-foreground">
          찬양콘티 ID: {setlistId} · 사전 로딩·섹션 전환 UI 자리 (Task 011, 021~025에서 구현)
        </p>
      </div>

      <Link href={routes.home()} className={cn(buttonVariants({ variant: "outline" }))}>
        예배 종료 → 홈으로 (더미)
      </Link>
    </div>
  );
}
