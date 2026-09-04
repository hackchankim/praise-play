"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { createSetlist } from "@/lib/api/setlists-client";

interface NewSetlistButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string;
  children: React.ReactNode;
}

/** 이름 없는 새 찬양콘티를 즉시 생성하고 구성 페이지로 이동한다. 이름은 그 페이지에서 편집한다. */
export function NewSetlistButton({ className, variant, size, children }: NewSetlistButtonProps) {
  const router = useRouter();
  const { user } = useUser();
  const [pending, setPending] = useState(false);

  return (
    <Button
      className={cn(className)}
      variant={variant}
      size={size}
      disabled={pending || !user}
      onClick={async () => {
        if (!user) return;
        setPending(true);
        try {
          const { setlist } = await createSetlist({ name: "새 찬양콘티" });
          router.push(routes.setlist(setlist.id));
        } catch {
          toast.error("찬양콘티를 만들지 못했습니다. 다시 시도해주세요.");
          setPending(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
