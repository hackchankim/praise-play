"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Image as ImageIcon, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/domain/page-header";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import {
  EXTRACTION_STAGES,
  EXTRACTION_STAGE_LABELS,
  runExtractionSimulator,
  type ExtractionProgressEvent,
  type ExtractionStage,
} from "@/lib/repositories/extraction-progress";

const LAST_STAGE = EXTRACTION_STAGES[EXTRACTION_STAGES.length - 1];

type ImageCardStatus = "pending" | "in_progress" | "done";

interface ExtractingViewProps {
  songId: string;
  imageCount: number;
  failAtStage?: ExtractionStage;
}

export function ExtractingView({ songId, imageCount, failAtStage }: ExtractingViewProps) {
  const router = useRouter();
  const [event, setEvent] = useState<ExtractionProgressEvent | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    // 재시도(retryKey > 0)는 같은 단계에서 다시 실패하지 않고 정상 완료되는 경로로 진행한다 —
    // 결정론적 목 시뮬레이터라 failAtStage를 유지하면 재시도해도 항상 같은 지점에서 실패하기 때문.
    // event/navigating 초기화는 이 효과가 아니라 재시도 버튼 클릭 핸들러에서 수행한다
    // (effect 안에서 곧바로 setState를 호출하면 불필요한 캐스케이딩 렌더가 발생하므로).
    const activeFailAtStage = retryKey === 0 ? failAtStage : undefined;
    return runExtractionSimulator(setEvent, { failAtStage: activeFailAtStage });
  }, [retryKey, failAtStage]);

  useEffect(() => {
    if (event?.status === "completed" && event.stage === LAST_STAGE) {
      const timer = setTimeout(() => {
        setNavigating(true);
        router.push(routes.songCorrection(songId));
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [event, router, songId]);

  const currentStageIndex = event ? EXTRACTION_STAGES.indexOf(event.stage) : -1;
  const overallProgress = event?.overallProgress ?? 0;
  const hasFailed = event?.status === "failed";

  // 시뮬레이터는 단계별 진행률만 방출하고 이미지별 진행률은 없다. 전체 진행률을 이미지 수만큼
  // 균등 분할해 "이미지별 카드"가 순차적으로 완료되는 것처럼 흉내낸다.
  const imageStatuses = useMemo<ImageCardStatus[]>(() => {
    // 첫 이벤트가 도착하기 전(event === null)에는 overallProgress가 0이라 0번째 구간의
    // rangeStart(0)와 같아져 아직 아무 것도 처리되지 않았는데 "처리 중"으로 보일 수 있다.
    // 이벤트가 실제로 도착하기 전까지는 전부 대기 상태로 고정한다.
    if (!event) return Array.from({ length: imageCount }, () => "pending");

    return Array.from({ length: imageCount }, (_, index) => {
      const rangeEnd = ((index + 1) / imageCount) * 100;
      const rangeStart = (index / imageCount) * 100;
      if (overallProgress >= rangeEnd) return "done";
      if (overallProgress >= rangeStart) return "in_progress";
      return "pending";
    });
  }, [imageCount, overallProgress, event]);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <PageHeader
        title="추출 진행 중"
        description={
          hasFailed
            ? "추출 중 문제가 발생했습니다."
            : "악보를 분석해 가사·코드·구조를 추출하고 있습니다."
        }
      />

      <ol className="flex flex-wrap gap-2">
        {EXTRACTION_STAGES.map((stage, index) => {
          const isPastStage = currentStageIndex > index;
          const isFinalDoneStage = currentStageIndex === index && event?.status === "completed";
          const isDone = isPastStage || isFinalDoneStage;
          const isCurrent = currentStageIndex === index && !isDone;

          return (
            <li
              key={stage}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                isDone && "border-primary/50 bg-primary/10 text-primary",
                isCurrent && !hasFailed && "border-primary bg-primary text-primary-foreground",
                isCurrent && hasFailed && "border-destructive bg-destructive/10 text-destructive",
                !isDone && !isCurrent && "border-border text-muted-foreground",
              )}
            >
              {isDone ? <Check className="size-3.5" /> : null}
              {EXTRACTION_STAGE_LABELS[stage]}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>전체 진행률</span>
          <span>{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {imageStatuses.map((status, index) => (
          <div
            key={index}
            className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center"
          >
            <ImageIcon
              className={cn(
                "size-6",
                status === "done" && "text-primary",
                status === "in_progress" && "text-foreground",
                status === "pending" && "text-muted-foreground",
              )}
            />
            <span className="text-xs text-muted-foreground">이미지 {index + 1}</span>
            <span className="text-xs font-medium">
              {status === "done" ? "완료" : status === "in_progress" ? "처리 중" : "대기 중"}
            </span>
          </div>
        ))}
      </div>

      {hasFailed && (
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{event?.error}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setEvent(null);
                setNavigating(false);
                setRetryKey((key) => key + 1);
              }}
            >
              재시도
            </Button>
            <Link
              href={routes.songsUpload()}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              업로드 페이지로 돌아가기
            </Link>
          </div>
        </div>
      )}

      {navigating && (
        <p className="text-sm text-muted-foreground">완료됐습니다. 교정 페이지로 이동합니다...</p>
      )}
    </div>
  );
}
