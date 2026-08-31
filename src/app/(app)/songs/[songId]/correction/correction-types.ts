// 교정 페이지(Task 009) 전용 편집 세션 상태 타입과 순수 변환 함수.
// SongTree(서버 조회 모양)와 SaveCorrectionRequest(저장 요청 모양) 사이를 오가는 "편집 중" 형태를
// 별도로 두는 이유: 병합·분할로 아직 id가 없는 새 섹션이 생길 수 있고, 각 줄/코드도 드래그·삭제 등
// UI 조작을 위해 리액트 key로 쓸 안정적인 식별자(uiKey)가 id와 별개로 필요하기 때문이다.

import type {
  SaveCorrectionRequest,
  UpsertChordEvent,
  UpsertLine,
  UpsertSection,
} from "@/lib/api/contracts";
import { SECTION_TYPES, type SectionType, type SongTree } from "@/lib/song-model/types";
import { SECTION_LABEL } from "@/components/domain/section-badge";

export interface EditableChordEvent {
  /** 이 편집 세션 내에서만 쓰는 안정적 식별자 (React key, 드래그 대상 식별용). 서버로는 전송하지 않는다 */
  uiKey: string;
  id?: string;
  chord: string;
  charOffset: number;
  beatOffset: number;
  needsReview: boolean;
}

export interface EditableLine {
  uiKey: string;
  id?: string;
  lyrics: string;
  orderIndex: number;
  startBeat: number;
  chordEvents: EditableChordEvent[];
}

export interface EditableSection {
  /**
   * 이 편집 세션에서 섹션을 가리키는 키. 기존 섹션은 로드 시 id를 그대로 clientKey로 쓰고,
   * 분할로 새로 생긴 섹션은 id 없이 clientKey만 가진다. repeatTarget은 항상 이 clientKey(또는
   * 아직 분할 전이라 clientKey === id인 기존 섹션의 id)를 참조한다 — SaveCorrectionRequest의
   * clientKey 계약과 그대로 맞아떨어진다.
   */
  clientKey: string;
  id?: string;
  type: SectionType;
  lengthBeats: number;
  /** 반복 대상 섹션의 clientKey. 없으면 null */
  repeatTarget: string | null;
  lines: EditableLine[];
}

export interface EditableSong {
  key: string;
  tempo: number;
  timeSignature: string;
}

function randomKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSectionClientKey(): string {
  return randomKey("section");
}

export function createLineUiKey(): string {
  return randomKey("line");
}

export function createChordUiKey(): string {
  return randomKey("chord");
}

// ===== SongTree → 편집 상태 =====

export function toEditableSections(tree: SongTree): EditableSection[] {
  return [...tree.sections]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((section) => ({
      clientKey: section.id,
      id: section.id,
      type: section.type,
      lengthBeats: section.lengthBeats,
      repeatTarget: section.repeatTargetSectionId,
      lines: [...section.lines]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((line) => ({
          uiKey: line.id,
          id: line.id,
          lyrics: line.lyrics,
          orderIndex: line.orderIndex,
          startBeat: line.startBeat,
          chordEvents: [...line.chordEvents]
            .sort((a, b) => a.charOffset - b.charOffset)
            .map((chord) => ({
              uiKey: chord.id,
              id: chord.id,
              chord: chord.chord,
              charOffset: chord.charOffset,
              beatOffset: chord.beatOffset,
              needsReview: chord.needsReview,
            })),
        })),
    }));
}

export function toEditableSong(tree: SongTree): EditableSong {
  return { key: tree.key, tempo: tree.tempo, timeSignature: tree.timeSignature };
}

// ===== 곡 내 절대 beat 위치 계산 =====
// Section.startBeat은 곡 시작 기준 절대값이지만, 병합·분할 후에는 항상 lengthBeats 누적합으로
// 다시 계산하는 편이 저장된 값과 어긋날 위험이 없다 (분할로 뒤 섹션들의 orderIndex/길이가 바뀌어도
// startBeat을 매번 손으로 맞출 필요가 없다).
export function computeAbsoluteStartBeats(sections: EditableSection[]): number[] {
  const result: number[] = [];
  let cursor = 0;
  for (const section of sections) {
    result.push(cursor);
    cursor += section.lengthBeats;
  }
  return result;
}

/** 절 타입처럼 같은 유형이 여러 번 등장할 때 "1절"/"2절"처럼 순번을 붙인 표시용 라벨 */
export function computeSectionDisplayLabels(sections: EditableSection[]): string[] {
  const seenByType = new Map<SectionType, number>();
  return sections.map((section) => {
    if (section.type !== "verse") return SECTION_LABEL[section.type];
    const count = (seenByType.get(section.type) ?? 0) + 1;
    seenByType.set(section.type, count);
    return `${count}절`;
  });
}

export const SECTION_TYPE_OPTIONS = SECTION_TYPES.map((type) => ({
  type,
  label: SECTION_LABEL[type],
}));

// ===== 편집 상태 → SaveCorrectionRequest =====

export function buildSaveCorrectionRequest(
  song: EditableSong,
  sections: EditableSection[],
  updatedAt: string,
): SaveCorrectionRequest {
  const startBeats = computeAbsoluteStartBeats(sections);
  return {
    song,
    updatedAt,
    sections: sections.map((section, index) => {
      const chordEventsOf = (line: EditableLine): UpsertChordEvent[] =>
        line.chordEvents.map((chord) => ({
          id: chord.id,
          chord: chord.chord,
          charOffset: chord.charOffset,
          beatOffset: chord.beatOffset,
          needsReview: chord.needsReview,
        }));

      const lines: UpsertLine[] = section.lines.map((line, lineIndex) => ({
        id: line.id,
        lyrics: line.lyrics,
        orderIndex: lineIndex,
        startBeat: line.startBeat,
        chordEvents: chordEventsOf(line),
      }));

      const upsertSection: UpsertSection = {
        id: section.id,
        clientKey: section.clientKey,
        type: section.type,
        orderIndex: index,
        startBeat: startBeats[index],
        lengthBeats: section.lengthBeats,
        repeatTarget: section.repeatTarget,
        lines,
      };
      return upsertSection;
    }),
  };
}

// ===== 섹션 병합·분할 =====

/** index번째 섹션을 바로 다음 섹션과 합친다. 마지막 섹션이면 아무 것도 하지 않는다 */
export function mergeSectionWithNext(
  sections: EditableSection[],
  index: number,
): EditableSection[] {
  if (index < 0 || index >= sections.length - 1) return sections;
  const current = sections[index];
  const next = sections[index + 1];

  const mergedLines: EditableLine[] = [
    ...current.lines,
    ...next.lines.map((line) => ({ ...line, startBeat: line.startBeat + current.lengthBeats })),
  ].map((line, i) => ({ ...line, orderIndex: i }));

  const merged: EditableSection = {
    ...current,
    lengthBeats: current.lengthBeats + next.lengthBeats,
    lines: mergedLines,
  };

  const removedRefs = new Set([next.clientKey, next.id].filter((v): v is string => Boolean(v)));

  const result = [...sections.slice(0, index), merged, ...sections.slice(index + 2)];

  // 합쳐서 사라진 섹션을 반복 대상으로 삼던 섹션들은 살아남은(병합된) 섹션을 가리키도록 갱신하고,
  // 그 결과 자기 자신을 가리키게 되는 경우(반복 대상이 곧 자신)는 의미가 없으므로 null로 되돌린다.
  return result.map((section) => {
    if (!section.repeatTarget || !removedRefs.has(section.repeatTarget)) return section;
    const nextTarget = merged.clientKey;
    return { ...section, repeatTarget: nextTarget === section.clientKey ? null : nextTarget };
  });
}

/**
 * index번째 섹션을 lineIndex번째 줄 앞에서 둘로 나눈다. lineIndex가 0이거나 마지막 줄을 넘어서면
 * (나눌 지점이 없으므로) 아무 것도 하지 않는다. 뒤쪽 섹션은 새 clientKey를 받고 id는 없다 —
 * 저장 시 신규 섹션으로 upsert된다.
 */
export function splitSectionAtLine(
  sections: EditableSection[],
  sectionIndex: number,
  lineIndex: number,
): EditableSection[] {
  const section = sections[sectionIndex];
  if (!section || lineIndex <= 0 || lineIndex >= section.lines.length) return sections;

  const splitStartBeat = section.lines[lineIndex].startBeat;
  const firstLines = section.lines
    .slice(0, lineIndex)
    .map((line, i) => ({ ...line, orderIndex: i }));
  const secondLines = section.lines.slice(lineIndex).map((line, i) => ({
    ...line,
    orderIndex: i,
    startBeat: Math.max(0, line.startBeat - splitStartBeat),
  }));

  const first: EditableSection = {
    ...section,
    lengthBeats: Math.max(1, splitStartBeat),
    lines: firstLines,
  };
  const second: EditableSection = {
    clientKey: createSectionClientKey(),
    id: undefined,
    type: section.type,
    lengthBeats: Math.max(1, section.lengthBeats - splitStartBeat),
    repeatTarget: null,
    lines: secondLines,
  };

  return [...sections.slice(0, sectionIndex), first, second, ...sections.slice(sectionIndex + 1)];
}

// ===== 줄 조작 =====

export function addLine(section: EditableSection): EditableSection {
  const lastLine = section.lines[section.lines.length - 1];
  const newLine: EditableLine = {
    uiKey: createLineUiKey(),
    lyrics: "",
    orderIndex: section.lines.length,
    startBeat: lastLine ? lastLine.startBeat + 4 : 0,
    chordEvents: [],
  };
  return { ...section, lines: [...section.lines, newLine] };
}

export function removeLine(section: EditableSection, lineUiKey: string): EditableSection {
  return {
    ...section,
    lines: section.lines
      .filter((line) => line.uiKey !== lineUiKey)
      .map((line, i) => ({ ...line, orderIndex: i })),
  };
}

export function reorderLines(
  section: EditableSection,
  activeUiKey: string,
  overUiKey: string,
): EditableSection {
  const oldIndex = section.lines.findIndex((line) => line.uiKey === activeUiKey);
  const newIndex = section.lines.findIndex((line) => line.uiKey === overUiKey);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return section;
  const reordered = [...section.lines];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return { ...section, lines: reordered.map((line, i) => ({ ...line, orderIndex: i })) };
}

export function updateLineLyrics(
  section: EditableSection,
  lineUiKey: string,
  lyrics: string,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) =>
      line.uiKey === lineUiKey
        ? {
            ...line,
            lyrics,
            // 가사가 짧아지면 그 뒤로 밀려난 코드 칩의 삽입 위치를 새 길이 안으로 당겨 온다.
            chordEvents: line.chordEvents.map((chord) => ({
              ...chord,
              charOffset: Math.min(chord.charOffset, lyrics.length),
            })),
          }
        : line,
    ),
  };
}

export function updateLineStartBeat(
  section: EditableSection,
  lineUiKey: string,
  startBeat: number,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => (line.uiKey === lineUiKey ? { ...line, startBeat } : line)),
  };
}

// ===== 코드 칩 조작 =====

export function addChord(
  section: EditableSection,
  lineUiKey: string,
  charOffset: number,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => {
      if (line.uiKey !== lineUiKey) return line;
      const newChord: EditableChordEvent = {
        uiKey: createChordUiKey(),
        chord: "C",
        charOffset: Math.max(0, Math.min(charOffset, line.lyrics.length)),
        beatOffset: 0,
        needsReview: false,
      };
      return { ...line, chordEvents: [...line.chordEvents, newChord] };
    }),
  };
}

export function updateChord(
  section: EditableSection,
  lineUiKey: string,
  chordUiKey: string,
  patch: Partial<Pick<EditableChordEvent, "chord" | "charOffset" | "beatOffset" | "needsReview">>,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => {
      if (line.uiKey !== lineUiKey) return line;
      return {
        ...line,
        chordEvents: line.chordEvents.map((chord) =>
          chord.uiKey === chordUiKey
            ? {
                ...chord,
                ...patch,
                charOffset:
                  patch.charOffset === undefined
                    ? chord.charOffset
                    : Math.max(0, Math.min(patch.charOffset, line.lyrics.length)),
              }
            : chord,
        ),
      };
    }),
  };
}

export function removeChord(
  section: EditableSection,
  lineUiKey: string,
  chordUiKey: string,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) =>
      line.uiKey === lineUiKey
        ? { ...line, chordEvents: line.chordEvents.filter((chord) => chord.uiKey !== chordUiKey) }
        : line,
    ),
  };
}

// ===== 검토 필요 코드 순회 =====

export interface ReviewTarget {
  sectionClientKey: string;
  lineUiKey: string;
  chordUiKey: string;
}

export function collectReviewTargets(sections: EditableSection[]): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      for (const chord of line.chordEvents) {
        if (chord.needsReview) {
          targets.push({
            sectionClientKey: section.clientKey,
            lineUiKey: line.uiKey,
            chordUiKey: chord.uiKey,
          });
        }
      }
    }
  }
  return targets;
}

// ===== 임시 저장(클라이언트 상태 유지) =====
// Phase 2에는 서버 임시저장이 없다(Task 018 소관). "임시 저장 후 나가기"는 sessionStorage에
// 편집 중 상태를 남겨 같은 브라우저 세션에서 이 곡 교정 페이지로 돌아왔을 때 이어서 작업할 수 있게
// 흉내만 낸다.

interface CorrectionDraft {
  updatedAt: string;
  song: EditableSong;
  sections: EditableSection[];
  savedAt: string;
}

function draftKey(songId: string): string {
  return `praise:correction-draft:${songId}`;
}

export function saveDraft(
  songId: string,
  updatedAt: string,
  song: EditableSong,
  sections: EditableSection[],
): void {
  if (typeof window === "undefined") return;
  const draft: CorrectionDraft = { updatedAt, song, sections, savedAt: new Date().toISOString() };
  try {
    window.sessionStorage.setItem(draftKey(songId), JSON.stringify(draft));
  } catch {
    // sessionStorage를 못 쓰는 환경(프라이빗 모드 등)이면 임시 저장은 조용히 무시한다.
  }
}

export function loadDraft(songId: string, currentUpdatedAt: string): CorrectionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(songId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as CorrectionDraft;
    // 그 사이 다른 경로로 곡이 갱신됐다면(낙관적 잠금 기준값이 바뀜) 낡은 임시 저장이므로 버린다.
    if (draft.updatedAt !== currentUpdatedAt) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(songId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(draftKey(songId));
  } catch {
    // 무시
  }
}
