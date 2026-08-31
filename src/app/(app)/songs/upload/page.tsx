import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export default function SongsUploadPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">악보 업로드</h1>
        <p className="text-sm text-muted-foreground">
          이미지 드래그앤드롭·미리보기 UI 자리 (Task 008에서 구현)
        </p>
      </div>

      <Link href={routes.songExtracting("demo")} className={cn(buttonVariants(), "w-fit")}>
        업로드 및 추출 시작 (더미)
      </Link>
    </div>
  );
}
