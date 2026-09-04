"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSong } from "@/lib/api/songs-client";

interface DeleteSongButtonProps {
  songId: string;
  songTitle: string;
  className?: string;
}

/**
 * SongCard 안에서 카드 전체를 덮는 <Link>(song-card.tsx 참고) 위에 겹쳐 놓이는 버튼이라,
 * 클릭이 카드 이동으로 새는 것을 막기 위해 stopPropagation/preventDefault를 둔다.
 */
export function DeleteSongButton({ songId, songTitle, className }: DeleteSongButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={className}
      disabled={pending}
      aria-label={`${songTitle} 삭제`}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (
          !window.confirm(
            `"${songTitle}"을(를) 삭제하시겠습니까? 편곡과 이 곡이 포함된 찬양콘티 항목도 함께 제거됩니다.`,
          )
        ) {
          return;
        }
        setPending(true);
        try {
          await deleteSong(songId);
          toast.success("곡을 삭제했습니다.");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "곡 삭제에 실패했습니다.");
          setPending(false);
        }
      }}
    >
      <Trash2 />
    </Button>
  );
}
