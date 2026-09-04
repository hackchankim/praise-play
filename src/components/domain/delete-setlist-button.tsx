"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSetlist } from "@/lib/api/setlists-client";

interface DeleteSetlistButtonProps {
  setlistId: string;
  setlistName: string;
  className?: string;
}

/** delete-song-button.tsx와 같은 이유로 stopPropagation/preventDefault를 둔다. */
export function DeleteSetlistButton({
  setlistId,
  setlistName,
  className,
}: DeleteSetlistButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={className}
      disabled={pending}
      aria-label={`${setlistName} 삭제`}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(`"${setlistName}"을(를) 삭제하시겠습니까?`)) return;
        setPending(true);
        try {
          await deleteSetlist(setlistId);
          toast.success("찬양콘티를 삭제했습니다.");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "찬양콘티 삭제에 실패했습니다.");
          setPending(false);
        }
      }}
    >
      <Trash2 />
    </Button>
  );
}
