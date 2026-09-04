"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Guitar, Piano, Drum, Waves, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/domain/error-state";
import { PageHeader } from "@/components/domain/page-header";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { songRepository } from "@/lib/repositories/song-repository";
import { arrangementRepository } from "@/lib/repositories/arrangement-repository";
import { generateArrangementForSong } from "@/lib/api/arrangement-client";
import type {
  ArrangementWithTracks,
  GenrePreset,
  Instrument,
  SongTree,
} from "@/lib/song-model/types";
import { GENRE_PRESET_LIST, INSTRUMENT_LABEL } from "./genre-presets";
import { PreviewPlayer } from "./preview-player";
import { AddToSetlistDialog } from "./add-to-setlist-dialog";

type LoadStatus = "loading" | "not_found" | "error" | "ready";

const INSTRUMENT_ICON: Record<Instrument, typeof Piano> = {
  piano: Piano,
  guitar: Guitar,
  bass: Waves,
  drums: Drum,
};

interface ArrangementViewProps {
  songId: string;
}

export function ArrangementView({ songId }: ArrangementViewProps) {
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [song, setSong] = useState<SongTree | null>(null);
  const [arrangement, setArrangement] = useState<ArrangementWithTracks | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<GenrePreset>("praise_upbeat");
  const [generating, setGenerating] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([songRepository.getTree(songId), arrangementRepository.listBySong(songId)])
      .then(([tree, arrangements]) => {
        if (cancelled) return;
        if (!tree) {
          setStatus("not_found");
          return;
        }
        setSong(tree.song);
        const latest = [...arrangements].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (latest) {
          setArrangement(latest);
          setSelectedPreset(latest.genrePreset);
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [songId, loadRetryKey]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await generateArrangementForSong(songId, { genrePreset: selectedPreset });
      setArrangement(result.arrangement);
      toast.success("편곡을 생성했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "편곡 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }, [songId, selectedPreset]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <ErrorState
        title="곡을 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        onRetry={() => {
          setStatus("loading");
          setLoadRetryKey((key) => key + 1);
        }}
      />
    );
  }

  if (status === "not_found" || !song) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">곡을 찾을 수 없습니다</p>
        <p className="text-sm text-muted-foreground">곡 ID: {songId}</p>
        <Button onClick={() => router.push(routes.home())}>홈으로 이동</Button>
      </div>
    );
  }

  const notExtracted = song.status === "draft";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title={`편곡 설정: ${song.title}`}
        description={`${song.key} · ${song.tempo} BPM · ${song.timeSignature}`}
      />

      {notExtracted && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
          아직 추출·교정이 끝나지 않은 곡입니다. 코드 진행이 확정되어야 편곡을 생성할 수 있습니다.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GENRE_PRESET_LIST.map((meta) => {
          const selected = selectedPreset === meta.preset;
          return (
            <Card
              key={meta.preset}
              role="button"
              tabIndex={0}
              // 카드 안에 악기별 설명 문단이 여러 줄 들어있어, 이름을 따로 안 주면 스크린리더가
              // 카드 전체 텍스트를 통째로 버튼 이름으로 읽는다(QA 확인) — 짧은 이름으로 대체.
              aria-label={`${meta.label} 프리셋 선택`}
              aria-pressed={selected}
              onClick={() => setSelectedPreset(meta.preset)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelectedPreset(meta.preset);
              }}
              className={cn(
                "cursor-pointer transition-colors hover:border-primary/50",
                selected && "border-primary ring-1 ring-primary",
              )}
            >
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{meta.label}</CardTitle>
                {selected && <Check className="size-4 shrink-0 text-primary" />}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">{meta.description}</p>
                <div className="flex flex-col gap-1">
                  {(Object.keys(meta.instrumentSummary) as Instrument[]).map((instrument) => {
                    const Icon = INSTRUMENT_ICON[instrument];
                    return (
                      <div key={instrument} className="flex items-start gap-1.5 text-xs">
                        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="text-muted-foreground">
                            {INSTRUMENT_LABEL[instrument]}
                          </span>{" "}
                          {meta.instrumentSummary[instrument]}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="border-t pt-2 text-[11px] text-muted-foreground">
                  {meta.sectionDensity}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={handleGenerate} disabled={notExtracted || generating} className="w-fit">
        <Wand2 />
        {generating ? "생성 중..." : arrangement ? "이 프리셋으로 다시 생성" : "이 프리셋으로 생성"}
      </Button>

      {arrangement && (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">생성된 편곡</h2>
            <Badge variant="secondary">
              {GENRE_PRESET_LIST.find((m) => m.preset === arrangement.genrePreset)?.label ??
                arrangement.genrePreset}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {arrangement.instrumentTracks.map((track) => {
              const Icon = INSTRUMENT_ICON[track.instrument];
              return (
                <div
                  key={track.id}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{INSTRUMENT_LABEL[track.instrument]}</span>
                  <span className="ml-auto text-muted-foreground">{track.notes.length}개 노트</span>
                </div>
              );
            })}
          </div>

          <PreviewPlayer
            key={arrangement.id}
            tracks={arrangement.instrumentTracks}
            tempo={song.tempo}
            timeSignature={song.timeSignature}
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => setAddDialogOpen(true)}>세트리스트에 추가</Button>
            <Link href={routes.home()} className={cn(buttonVariants({ variant: "outline" }))}>
              저장만 하고 나중에 사용
            </Link>
          </div>
        </div>
      )}

      {arrangement && (
        <AddToSetlistDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          songId={songId}
          arrangementId={arrangement.id}
          onAdded={(setlistId) => router.push(routes.setlist(setlistId))}
        />
      )}
    </div>
  );
}
