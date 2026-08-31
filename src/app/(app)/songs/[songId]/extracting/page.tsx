import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default async function SongExtractingPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">추출 진행 중</h1>
        <p className="text-sm text-muted-foreground">
          곡 ID: {songId} · 단계별 진행률 UI 자리 (Task 008, 016에서 구현)
        </p>
      </div>

      <Link href={routes.songCorrection(songId)} className={cn(buttonVariants(), "w-fit")}>
        교정 페이지로 이동 (더미)
      </Link>
    </div>
  );
}
