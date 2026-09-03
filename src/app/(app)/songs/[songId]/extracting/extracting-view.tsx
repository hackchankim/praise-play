"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/domain/page-header";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";
import { triggerExtraction } from "@/lib/extraction/trigger-extraction";
import {
  EXTRACTION_STAGES,
  EXTRACTION_STAGE_LABELS,
  computeOverallProgress,
  mapExtractionJobRow,
  type ExtractionJobDbRow,
  type ExtractionJobRow,
} from "@/lib/song-model/extraction-job";

const LAST_STAGE = EXTRACTION_STAGES[EXTRACTION_STAGES.length - 1];

interface ExtractingViewProps {
  songId: string;
}

export function ExtractingView({ songId }: ExtractingViewProps) {
  const router = useRouter();
  const [job, setJob] = useState<ExtractionJobRow | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  // job이 끝까지 null로 남는 경우(잘못된/접근 권한 없는 songId, 또는 잡이 아예 트리거되지 않은
  // 경우)를 위한 안전망 — 실시간 구독만 믿으면 아무 신호 없이 화면이 영원히 멈춘다.
  const [timedOut, setTimedOut] = useState(false);
  const retryingRef = useRef(false);

  // extraction_jobs는 songs 소유자만 조회 가능한 RLS가 걸려 있다(Task 016 마이그레이션) — 이
  // 채널 구독도 같은 RLS로 걸러지므로 다른 사용자의 곡 진행 상황은 애초에 이벤트가 오지 않는다.
  //
  // 채널이 CLOSED/TIMED_OUT/CHANNEL_ERROR로 끊기면 직접 재구독한다 — 실제로 재현 확인한
  // 문제다: Clerk 세션 토큰 갱신 주기(약 1분)마다 소켓이 재인증을 시도하는데, 그 과정에서
  // 채널이 조용히 CLOSED로 전환되고 이후로는 어떤 postgres_changes 이벤트도 오지 않아 화면이
  // 그 시점 상태로 멈춰버린다(콘솔에 에러가 찍히지 않아 겉보기엔 정상처럼 보인다). 재연결
  // 직후에는 그 사이 놓쳤을 수 있는 갱신을 놓치지 않도록 현재 행을 다시 읽는다.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabaseRepositoryClient.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function refetch() {
      const { data } = await supabaseRepositoryClient
        .from("extraction_jobs")
        .select("*")
        .eq("song_id", songId)
        .maybeSingle<ExtractionJobDbRow>();
      if (!cancelled && data) setJob(mapExtractionJobRow(data));
    }

    function subscribe() {
      if (cancelled) return;
      // 재구독할 때마다 채널 이름을 새로 발급한다 — 같은 이름의 채널을 재사용하면 supabase-js가
      // 방금 CLOSED된 채널과 혼동해 재구독이 무시되는 경우가 있다.
      channel = supabaseRepositoryClient
        .channel(`extraction_jobs:${songId}:${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "extraction_jobs",
            filter: `song_id=eq.${songId}`,
          },
          (payload) => {
            setJob(mapExtractionJobRow(payload.new as ExtractionJobDbRow));
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            void refetch();
            return;
          }
          if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (channel) void supabaseRepositoryClient.removeChannel(channel);
            reconnectTimer = setTimeout(subscribe, 2000);
          }
        });
    }

    void refetch();
    subscribe();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) void supabaseRepositoryClient.removeChannel(channel);
    };
  }, [songId]);

  useEffect(() => {
    if (job?.status === "completed" && job.stage === LAST_STAGE) {
      const timer = setTimeout(() => {
        setNavigating(true);
        router.push(routes.songCorrection(songId));
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [job, router, songId]);

  // job 행이 15초 안에 한 번도 도착하지 않으면(초기 조회·구독 둘 다 헛수고였다는 뜻) 잘못된
  // songId이거나 잡이 트리거되지 않은 것으로 보고 안내 메시지로 전환한다. job이 도착하면 취소.
  useEffect(() => {
    if (job) return;
    const timer = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [job]);

  const handleRetry = useCallback(async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    setRetryError(null);
    try {
      await triggerExtraction(songId);
      setJob(null);
      setTimedOut(false);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "재시도에 실패했습니다.");
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  }, [songId]);

  const currentStageIndex = job ? EXTRACTION_STAGES.indexOf(job.stage) : -1;
  const overallProgress = computeOverallProgress(job);
  const hasFailed = job?.status === "failed";

  if (!job && timedOut) {
    return (
      <div className="flex flex-1 flex-col gap-8 p-6">
        <PageHeader title="추출 진행 중" description="추출 상태를 찾을 수 없습니다." />
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              이 곡의 추출 상태를 찾을 수 없습니다. 잘못된 링크이거나 접근 권한이 없을 수 있습니다.
            </p>
          </div>
          <Link
            href={routes.songsUpload()}
            className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
          >
            업로드 페이지로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

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
          const isFinalDoneStage = currentStageIndex === index && job?.status === "completed";
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

      {hasFailed && (
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {/* job.error는 원본 예외 메시지(DB 드라이버 텍스트, R2 객체 키 등 내부 정보 포함
                가능)라 그대로 노출하지 않는다 — 디버깅용 상세 내용은 extraction_jobs 테이블에
                남아 있으니 필요하면 거기서 확인한다. */}
            <p>추출 중 오류가 발생했습니다. 문제가 계속되면 다른 이미지로 다시 시도해주세요.</p>
          </div>
          {retryError && <p className="text-sm text-destructive">{retryError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "재시도 중..." : "재시도"}
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
