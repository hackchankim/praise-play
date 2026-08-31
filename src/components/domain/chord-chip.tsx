import { cn } from "@/lib/utils";

interface ChordChipProps {
  chord: string;
  /** 코드 문법 검증 실패 등 교정이 필요한 경우 시각적으로 강조 (Task 009, 017) */
  needsReview?: boolean;
  className?: string;
}

export function ChordChip({ chord, needsReview, className }: ChordChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-md border bg-card px-1.5 text-xs font-semibold",
        needsReview
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-border text-foreground",
        className,
      )}
    >
      {chord}
    </span>
  );
}
