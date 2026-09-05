"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  OptimisticLockConflictError,
  deleteDraftCorrection,
  fetchSongTree,
  saveDraftCorrection,
  saveSongCorrection,
} from "@/lib/api/song-correction-client";
import type { GetSongTreeResponse } from "@/lib/api/contracts";
import type { SectionType } from "@/lib/song-model/types";
import { ImageViewer } from "./image-viewer";
import { SongMetaForm } from "./song-meta-form";
import { SectionCard } from "./section-card";
import {
  addChordAtCell,
  addLine,
  buildSaveCorrectionRequest,
  collectReviewTargets,
  computeAbsoluteStartBeats,
  computeSectionDisplayLabels,
  fromSaveCorrectionRequest,
  lineBeatsSpan,
  mergeSectionWithNext,
  reorganizeIntoMeasures,
  removeChord,
  removeLine,
  reorderLines,
  splitSectionAtLine,
  toEditableSections,
  toEditableSong,
  updateCellText,
  updateChord,
  updateLineStartBeat,
  type EditableLine,
  type EditableSection,
  type EditableSong,
} from "./correction-types";

/** section-card.tsx가 LineRow에 넘기는 cellCount와 같은 규칙(round(lineBeatsSpan)) */
function lineCellCount(section: EditableSection, line: EditableLine): number {
  return Math.max(1, Math.round(lineBeatsSpan(section, line)));
}

// 마지막 편집 후 이 정도 지나면 서버에 임시 저장한다(저장 없이 이탈해도 이어서 교정 가능해야
// 한다는 PRD 요구 — 명시적으로 "임시 저장 후 나가기"를 누르지 않아도 보호되게 한다).
const AUTO_SAVE_DEBOUNCE_MS = 2500;

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

/**
 * 방금 추출된 원본 그대로(줄 하나가 여러 마디를 통째로 담은 상태)는 화면에 그대로 보여주기엔
 * 유용하지 않다 — "재구성" 버튼을 눌렀을 때와 같은 1마디 카드 상태를 기본값으로 삼는다.
 * 최초 로드와 "원본으로 초기화" 둘 다 같은 원본 데이터에서 시작하므로 같은 기본값을 써야 한다.
 * measuresPerLine은 항상 1로 고정한다 — "줄당 마디 수" 토글은 저장되지 않는 순수 UI 상태라
 * (measuresPerLine 참고) 그 값을 여기 반영하면 두 진입점이 서로 다른 기본값을 낼 수 있다.
 */
function defaultSections(song: GetSongTreeResponse["song"]): EditableSection[] {
  return reorganizeIntoMeasures(toEditableSections(song), song.timeSignature, 1);
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
  // "재구성" 버튼이 몇 마디 단위로 줄을 쪼갤지 — 저장되지 않는 순수 UI 설정값이다.
  const [measuresPerLine, setMeasuresPerLine] = useState<1 | 2>(1);

  const chordNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const reviewHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialUpdatedAtRef = useRef<string>("");

  // ===== 곡 트리 로드 =====
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchSongTree(songId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setStatus("not_found");
          return;
        }
        setTree(result);
        initialUpdatedAtRef.current = result.song.updatedAt;

        if (result.draftCorrection) {
          const draft = fromSaveCorrectionRequest(result.draftCorrection);
          setSongMeta(draft.song);
          setSections(draft.sections);
          setDraftBannerVisible(true);
        } else {
          // draftCorrection이 없다는 뜻은 사용자가 아직 이 곡을 한 번도 교정 편집하지
          // 않았다는 것이므로, 방금 추출된 원본을 기본값(reorganizeIntoMeasures) 그대로
          // 보여준다. 반대로 draftCorrection이 있으면(위 branch) 사용자가 이미 직접
          // 재구성/편집한 상태일 수 있어(예: 2마디를 골랐거나 카드를 더 잘게 손봤을 수
          // 있다) defaultSections를 쓰지 않고 저장된 그대로 복원한다.
          setSongMeta(toEditableSong(result.song));
          setSections(defaultSections(result.song));
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

  const mutate = (fn: (sections: EditableSection[]) => EditableSection[]) => {
    setSections((prev) => fn(prev));
    setDirty(true);
  };

  // ===== 자동 저장(서버 임시 저장, 디바운스) =====
  // "임시 저장 후 나가기" 버튼을 누르지 않고 그냥 탭을 닫아도 이어서 교정할 수 있어야 한다는
  // PRD 요구를 만족시키려면 명시적 조작 없이도 주기적으로 저장돼야 한다.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || status !== "ready") return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const request = buildSaveCorrectionRequest(songMeta, sections, initialUpdatedAtRef.current);
      void saveDraftCorrection(songId, request);
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [songId, songMeta, sections, dirty, status]);

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

  const handleReorganize = () => {
    mutate((prev) => reorganizeIntoMeasures(prev, songMeta.timeSignature, measuresPerLine));
  };

  // ===== 저장 / 임시 저장 / 이탈 =====

  async function performSave() {
    // 섹션이 하나도 없는 상태로 저장되면, 이 곡이 나중에 세트리스트에 들어가 재생될 때
    // 재생 화면이 section을 역참조하다 크래시한다(code review 지적, playback-screen.tsx의
    // 방어 코드로 크래시 자체는 막았지만 애초에 저장을 막는 편이 낫다). 버튼도 disabled로
    // 막아 두지만(아래 JSX), 여기서도 한 번 더 확인한다.
    if (sections.length === 0) {
      setSaveError("섹션이 하나도 없습니다. 최소 한 개 이상의 섹션이 필요합니다.");
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      const request = buildSaveCorrectionRequest(songMeta, sections, initialUpdatedAtRef.current);
      // 저장(save_song_correction RPC)이 성공하면 서버가 같은 트랜잭션에서 임시 저장 행도
      // 함께 지운다 — 여기서 따로 지울 필요가 없다.
      await saveSongCorrection(songId, request);
      setDirty(false);
      router.push(routes.songArrangement(songId));
    } catch (error) {
      if (error instanceof OptimisticLockConflictError) {
        setSaveError("다른 곳에서 먼저 저장되었습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.");
      } else {
        setSaveError(
          error instanceof Error ? error.message : "저장에 실패했습니다. 다시 시도해주세요.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function tempSaveAndLeave() {
    const request = buildSaveCorrectionRequest(songMeta, sections, initialUpdatedAtRef.current);
    await saveDraftCorrection(songId, request);
    setDirty(false);
    setLeaveDialogOpen(false);
    router.push(routes.home());
  }

  function discardAndLeave() {
    // 자동 저장으로 이미 서버에 임시 저장이 남아 있을 수 있다 — "버린다"는 의도를 지키려면
    // 다음 접속 시 되살아나지 않도록 함께 지운다.
    void deleteDraftCorrection(songId);
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
            timeSignature={songMeta.timeSignature}
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
            onLineStartBeatChange={(lineUiKey, startBeat) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) =>
                  updateLineStartBeat(s, lineUiKey, startBeat),
                ),
              )
            }
            onUpdateCellText={(lineUiKey, cellIndex, text) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) => {
                  const line = s.lines.find((l) => l.uiKey === lineUiKey);
                  const cellCount = line ? lineCellCount(s, line) : 1;
                  return updateCellText(s, lineUiKey, cellIndex, cellCount, text);
                }),
              )
            }
            onAddChordAtCell={(lineUiKey, cellIndex) =>
              mutate((prev) =>
                updateSectionAt(prev, section.clientKey, (s) => {
                  const line = s.lines.find((l) => l.uiKey === lineUiKey);
                  const cellCount = line ? lineCellCount(s, line) : 1;
                  return addChordAtCell(s, lineUiKey, cellIndex, cellCount);
                }),
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
            <Button size="sm" onClick={performSave} disabled={isSaving || sections.length === 0}>
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
              void deleteDraftCorrection(songId);
              setSongMeta(toEditableSong(tree.song));
              setSections(defaultSections(tree.song));
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

      {sections.length === 0 && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          섹션이 하나도 없어 저장할 수 없습니다. 추출이 실패했을 수 있습니다 — 곡을 다시
          업로드해주세요.
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

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">줄당 마디 수</span>
          <div className="flex rounded-md border p-0.5">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMeasuresPerLine(n)}
                aria-pressed={measuresPerLine === n}
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  measuresPerLine === n
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {n}마디
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={handleReorganize}
            title="모든 줄을 설정한 마디 수 이하로 다시 나눕니다"
          >
            재구성
          </Button>
        </div>
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
