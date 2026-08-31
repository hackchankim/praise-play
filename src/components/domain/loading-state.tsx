import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = "불러오는 중...", className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="size-5 animate-spin" />
      <p>{message}</p>
    </div>
  );
}
