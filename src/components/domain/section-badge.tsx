import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { SectionType } from "@/lib/song-model/types";

const SECTION_LABEL: Record<SectionType, string> = {
  verse: "절",
  chorus: "후렴",
  bridge: "브릿지",
  interlude: "간주",
  intro: "인트로",
  outro: "아웃트로",
};

const sectionBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      type: {
        verse: "bg-secondary text-secondary-foreground",
        chorus: "bg-primary text-primary-foreground",
        bridge: "bg-accent text-accent-foreground",
        interlude: "border border-border text-muted-foreground",
        intro: "border border-border text-muted-foreground",
        outro: "border border-border text-muted-foreground",
      } satisfies Record<SectionType, string>,
    },
  },
);

interface SectionBadgeProps {
  type: SectionType;
  /** 기본 라벨(절/후렴 등) 대신 표시할 텍스트 — 예: 절 순서를 나타내는 "1절"/"2절" */
  label?: string;
  className?: string;
}

export function SectionBadge({ type, label, className }: SectionBadgeProps) {
  return (
    <span className={cn(sectionBadgeVariants({ type }), className)}>
      {label ?? SECTION_LABEL[type]}
    </span>
  );
}
