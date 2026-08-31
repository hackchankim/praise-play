import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default async function SongCorrectionPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">교정</h1>
        <p className="text-sm text-muted-foreground">
          곡 ID: {songId} · 원본 이미지·가사·코드 교정 에디터 자리 (Task 009, 018에서 구현)
        </p>
      </div>

      <Link href={routes.songArrangement(songId)} className={cn(buttonVariants(), "w-fit")}>
        편곡 설정으로 이동 (더미)
      </Link>
    </div>
  );
}
