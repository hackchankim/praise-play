"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsRight, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/domain/error-state";
import { PageHeader } from "@/components/domain/page-header";
import { routes } from "@/lib/routes";
import { songRepository } from "@/lib/repositories/song-repository";
import type { GetSongTreeResponse } from "@/lib/api/contracts";
import type { SectionType } from "@/lib/song-model/types";
import { ImageViewer } from "./image-viewer";
import { SongMetaForm } from "./song-meta-form";
import { SectionCard } from "./section-card";
import {
  addChord,
  addLine,
  buildSaveCorrectionRequest,
  clearDraft,
  collectReviewTargets,
  computeAbsoluteStartBeats,
  computeSectionDisplayLabels,
  loadDraft,
  mergeSectionWithNext,
  removeChord,
  removeLine,
  reorderLines,
  saveDraft,
  splitSectionAtLine,
  toEditableSections,
  toEditableSong,
  updateChord,
  updateLineLyrics,
  updateLineStartBeat,
  type EditableSection,
  type EditableSong,
} from "./correction-types";

interface CorrectionViewProps {
  songId: string;
}

type LoadStatus = "loading" | "not_found" | "error" | "ready";

function updateSectionAt(
  sections: EditableSection[],
  clientKey: string,
  updater: (section: EditableSection) => EditableSection,
): EditableSection[] {
  return sections.map((section) => (section.clientKey === clientKey ? updater(section) : section));
}

export function CorrectionView({ songId }: CorrectionViewProps) {
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [tree, setTree] = useState<GetSongTreeResponse | null>(null);
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [songMeta, setSongMeta] = useState<EditableSong>({
    key: "C",
    tempo: 100,
    timeSignature: "4/4",
  });
  const [dirty, setDirty] = useState(false);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [mobileTab, setMobileTab] = useState<"original" | "editor">("original");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  // 데스크톱(좌우 분할)과 모바일(탭 전환)은 DOM 구조 자체가 다르다. Tailwind의 hidden/md:*로 두
  // 레이아웃을 동시에 마운트해 두고 CSS로만 보이기/숨기기를 하면, 코드 칩마다 두 개의 DOM 노드가
  // 동시에 존재하게 되어 chordNodeRefs 같은 uiKey 기반 참조가 어느 쪽을 가리킬지 불안정해진다
  // (예: "다음 검토 항목" 스크롤이 화면에 없는 숨겨진 사본을 가리켜 아무 일도 안 일어나는 버그).
  // 그래서 뷰포트를 감지해 둘 중 하나만 실제로 렌더링한다.
  // 768px(태블릿 세로)는 좌우 분할 에디터를 담기엔 너무 좁다 — 코드 칩 배치용 모노스페이스
  // 가사 입력란이 실측 108px까지 줄어들어 텍스트가 잘렸다(QA 확인). 1024px(lg)부터만 분할하고,
  // 그 아래는 태블릿도 모바일과 같은 탭 전환 레이아웃을 쓴다.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const [reviewIndex, setReviewIndex] = useState(-1);
  const [highlightedChordUiKey, setHighlightedChordUiKey] = useState<string | null>(null);

  const chordNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const reviewHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialUpdatedAtRef = useRef<string>("");

  // ===== 곡 트리 로드 =====
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    songRepository
      .getTree(songId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setStatus("not_found");
          return;
        }
        setTree(result);
        initialUpdatedAtRef.current = result.song.updatedAt;

        const draft = loadDraft(songId, result.song.updatedAt);
        if (draft) {
          setSongMeta(draft.song);
          setSections(draft.sections);
          setDraftBannerVisible(true);
        } else {
          setSongMeta(toEditableSong(result.song));
          setSections(toEditableSections(result.song));
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

  // 탭/브라우저 닫기로 인한 유실을 막기 위한 최소한의 경고 (실제 저장은 아니다)
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ===== 가사 문자 오프셋 ↔ 픽셀 변환용 모노스페이스 글자폭 측정 =====
  const [charWidthPx, setCharWidthPx] = useState(8.4);
  const probeRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const width = probeRef.current?.getBoundingClientRect().width;
    if (width) setCharWidthPx(width);
  }, []);

  const mutate = (fn: (sections: EditableSection[]) => EditableSection[]) => {
    setSections((prev) => fn(prev));
    setDirty(true);
  };

  const startBeats = useMemo(() => computeAbsoluteStartBeats(sections), [sections]);
  const displayLabels = useMemo(() => computeSectionDisplayLabels(sections), [sections]);
  const reviewTargets = useMemo(() => collectReviewTargets(sections), [sections]);

  const handleNextReview = () => {
    if (reviewTargets.length === 0) return;
    const nextIndex = (reviewIndex + 1) % reviewTargets.length;
    const target = reviewTargets[nextIndex];
    setReviewIndex(nextIndex);
    setMobileTab("editor");
    if (reviewHighlightTimeoutRef.current) clearTimeout(reviewHighlightTimeoutRef.current);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chordNodeRefs.current
          .get(target.chordUiKey)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    setHighlightedChordUiKey(target.chordUiKey);
    reviewHighlightTimeoutRef.current = setTimeout(() => setHighlightedChordUiKey(null), 1600);
  };

  const registerChordNode = (chordUiKey: string, node: HTMLDivElement | null) => {
    if (node) chordNodeRefs.current.set(chordUiKey, node);
    else chordNodeRefs.current.delete(chordUiKey);
  };

  // ===== 저장 / 임시 저장 / 이탈 =====

  async function performSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const request = buildSaveCorrectionRequest(songMeta, sections, initialUpdatedAtRef.current);
      await songRepository.saveCorrection(songId, request);
      clearDraft(songId);
      setDirty(false);
      router.push(routes.songArrangement(songId));
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "저장에 실패했습니다. 다시 시도해주세요.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function tempSaveAndLeave() {
    saveDraft(songId, initialUpdatedAtRef.current, songMeta, sections);
    setDirty(false);
    setLeaveDialogOpen(false);
    router.push(routes.home());
  }

  function discardAndLeave() {
    setDirty(false);
    setLeaveDialogOpen(false);
    router.push(routes.home());
  }

  function handleLeaveClick() {
    if (dirty) {
      setLeaveDialogOpen(true);
    } else {
      router.push(routes.home());
    }
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
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

  if (status === "not_found" || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">곡을 찾을 수 없습니다</p>
        <p className="text-sm text-muted-foreground">곡 ID: {songId}</p>
        <Button onClick={() => router.push(routes.home())}>홈으로 이동</Button>
      </div>
    );
  }

  const editorPanel = (
    <div className="flex flex-col gap-4">
      <SongMetaForm
        song={songMeta}
        onChange={(patch) => {
          setSongMeta((prev) => ({ ...prev, ...patch }));
          setDirty(true);
        }}
      />

      {sections.map((section, index) => {
        const repeatOptions = sections
          .map((candidate, candidateIndex) => ({ candidate, label: displayLabels[candidateIndex] }))
          .filter(({ candidate }) => candidate.clientKey !== section.clientKey)
          .map(({ candidate, label }) => ({ clientKey: candidate.clientKey, label }));

        return (
          <SectionCard
            key={section.clientKey}
            section={section}
            displayLabel={displayLabels[index]}
            startBeat={startBeats[index]}
            repeatOptions={repeatOptions}
            canMergeNext={index < sections.length - 1}
            charWidthPx={charWidthPx}
            highlightedChordUiKey={highlightedChordUiKey}
            onChangeType={(type: SectionType) =>
              mutate((prev) => updateSectionAt(prev, section.clientKey, (s) => ({ ...s, type })))
            }
            onChangeLengthBeats={(lengthBeats) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) => ({ ...s, lengthBeats })),
              )
            }
            onChangeRepeatTarget={(repeatTarget) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) => ({ ...s, repeatTarget })),
              )
            }
            onMergeNext={() => mutate((prev) => mergeSectionWithNext(prev, index))}
            onAddLine={() => mutate((prev) => updateSectionAt(prev, section.clientKey, addLine))}
            onRemoveLine={(lineUiKey) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) => removeLine(s, lineUiKey)),
              )
            }
            onReorderLines={(activeUiKey, overUiKey) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) =>
                  reorderLines(s, activeUiKey, overUiKey),
                ),
              )
            }
            onSplitAt={(lineIndex) => mutate((prev) => splitSectionAtLine(prev, index, lineIndex))}
            onLyricsChange={(lineUiKey, lyrics) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) =>
                  updateLineLyrics(s, lineUiKey, lyrics),
                ),
              )
            }
            onLineStartBeatChange={(lineUiKey, startBeat) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) =>
                  updateLineStartBeat(s, lineUiKey, startBeat),
                ),
              )
            }
            onAddChord={(lineUiKey, charOffset) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) => addChord(s, lineUiKey, charOffset)),
              )
            }
            onUpdateChord={(lineUiKey, chordUiKey, patch) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) =>
                  updateChord(s, lineUiKey, chordUiKey, patch),
                ),
              )
            }
            onRemoveChord={(lineUiKey, chordUiKey) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) =>
                  removeChord(s, lineUiKey, chordUiKey),
                ),
              )
            }
            registerChordNode={registerChordNode}
          />
        );
      })}
    </div>
  );

  const imagePanel = <ImageViewer imageUrls={tree.imageUrls} />;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute font-mono text-sm"
      >
        0
      </span>

      <PageHeader
        title={`교정: ${tree.song.title}`}
        description={`곡 ID: ${songId} · 원본 이미지·가사·코드를 확인하고 확정하세요.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleLeaveClick}>
              <Home />
              나가기
            </Button>
            <Button variant="outline" size="sm" onClick={tempSaveAndLeave}>
              임시 저장 후 나가기
            </Button>
            <Button size="sm" onClick={performSave} disabled={isSaving}>
              {isSaving ? "저장 중..." : "저장"}
            </Button>
          </div>
        }
      />

      {draftBannerVisible && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>이전에 임시 저장한 내용을 불러왔습니다.</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              clearDraft(songId);
              setSongMeta(toEditableSong(tree.song));
              setSections(toEditableSections(tree.song));
              setDraftBannerVisible(false);
              setDirty(false);
            }}
          >
            원본으로 초기화
          </Button>
        </div>
      )}

      {saveError && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={reviewTargets.length > 0 ? "destructive" : "outline"}>
          검토 필요 {reviewTargets.length}건
        </Badge>
        {reviewTargets.length > 0 && (
          <Button variant="outline" size="xs" onClick={handleNextReview}>
            다음 검토 항목
            <ChevronsRight />
          </Button>
        )}
      </div>

      {/* 데스크톱: 좌우 분할. 모바일: 탭 전환. 코드 칩 참조가 중복되지 않도록 한쪽만 마운트한다 */}
      {isDesktop ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          <div className="h-[calc(100vh-14rem)]">{imagePanel}</div>
          <div className="h-[calc(100vh-14rem)] overflow-y-auto pr-1">{editorPanel}</div>
        </div>
      ) : (
        <Tabs
          value={mobileTab}
          onValueChange={(value) => setMobileTab(value as "original" | "editor")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="original">원본</TabsTrigger>
            <TabsTrigger value="editor">편집</TabsTrigger>
          </TabsList>
          <TabsContent value="original">
            <div className="h-[calc(100vh-18rem)]">{imagePanel}</div>
          </TabsContent>
          <TabsContent value="editor">{editorPanel}</TabsContent>
        </Tabs>
      )}

      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>저장하지 않은 변경 사항이 있습니다</DialogTitle>
            <DialogDescription>
              지금 나가면 편집한 내용이 사라질 수 있습니다. 임시 저장 후 나가거나, 저장하지 않고
              나갈 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveDialogOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={discardAndLeave}>
              저장하지 않고 나가기
            </Button>
            <Button onClick={tempSaveAndLeave}>임시 저장 후 나가기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
