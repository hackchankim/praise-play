import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default async function SetlistPage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">찬양콘티 구성</h1>
        <p className="text-sm text-muted-foreground">
          찬양콘티 ID: {setlistId} · 곡 순서 배치 UI 자리 (Task 010, 020에서 구현)
        </p>
      </div>

      <Link href={routes.setlistPlay(setlistId)} className={cn(buttonVariants(), "w-fit")}>
        예배 시작 (더미)
      </Link>
    </div>
  );
}
