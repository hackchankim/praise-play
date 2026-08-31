import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default async function SongArrangementPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">편곡 설정</h1>
        <p className="text-sm text-muted-foreground">
          곡 ID: {songId} · 장르 프리셋 선택·미리듣기 UI 자리 (Task 010, 019에서 구현)
        </p>
      </div>

      <Link href={routes.setlist("demo")} className={cn(buttonVariants(), "w-fit")}>
        찬양콘티로 이동 (더미)
      </Link>
    </div>
  );
}
