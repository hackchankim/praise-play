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
import { beatsPerBar } from "@/lib/song-model/time-signature";

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

/**
 * 마디 수가 많은 줄을 measuresPerLine마디 이하 단위("카드")로 잘게 쪼갠다("재구성"). 코드가
 * 하나도 없는 줄은 쪼갤 기준(=박자를 아는 지점)이 없으므로 그대로 둔다.
 *
 * 쪼개는 경계는 "그 줄 자신의 시작"을 0박으로 보는 마디 그리드(beatsPerLine의 배수)다 — 코드
 * 하나의 위치가 아니라 깔끔한 마디 경계에 맞춰 자른다. 그래야:
 * (1) 이미 measuresPerLine 이내로 짧은 줄(버킷이 하나뿐)은 정말 아무것도 안 바뀌는 진짜
 *     no-op이 된다(원래 줄 객체를 그대로 재사용) — 버킷 0의 그리드 시작은 항상 그 줄 자신의
 *     startBeat이므로 옮길 필요가 없다.
 * (2) 한 버킷 안의 코드들은 항상 grid 시작점(bucketIndex*beatsPerLine) 기준 0 이상의 상대
 *     beatOffset을 받는다 — floor(beatOffset/beatsPerLine)로 버킷을 나눴으니 그 버킷의 그리드
 *     시작보다 앞선 코드가 있을 수 없다(첫 코드 위치를 기준으로 삼으면 코드 순서가 뒤섞인
 *     경우 음수가 나올 수 있었는데, 그런 여지가 구조적으로 없어진다).
 * 각 코드의 실제 절대 박자 위치(section.startBeat + line.startBeat + chord.beatOffset)는 쪼개기
 * 전후로 정확히 보존된다 — 이건 재생에 쓰이는 값이라 절대 달라지면 안 된다.
 */
export function reorganizeIntoMeasures(
  sections: EditableSection[],
  timeSignature: string,
  measuresPerLine: number,
): EditableSection[] {
  const beatsPerLine = beatsPerBar(timeSignature) * Math.max(1, measuresPerLine);

  return sections.map((section) => {
    const newLines: EditableLine[] = [];
    for (const line of section.lines) {
      // 버킷 계산·재배치는 beatOffset(실제 시간 순서) 기준이어야 한다 — charOffset은 사용자가
      // 자유 입력하는 값이라 beatOffset과 순서가 어긋날 수 있다(code review 지적).
      const chords = [...line.chordEvents].sort((a, b) => a.beatOffset - b.beatOffset);
      if (chords.length === 0) {
        newLines.push(line);
        continue;
      }

      // 음수 beatOffset(이전 버전 UI로 만들어진 레거시 데이터 등)이 음수 버킷·음수 startBeat으로
      // 이어지지 않도록 0으로 바닥을 둔다(code review 지적).
      const bucketOf = (chord: EditableChordEvent) =>
        Math.max(0, Math.floor(chord.beatOffset / beatsPerLine));
      const splitIndices = [0];
      for (let i = 1; i < chords.length; i += 1) {
        if (bucketOf(chords[i]!) !== bucketOf(chords[i - 1]!)) splitIndices.push(i);
      }

      // 버킷이 하나뿐이면(=이미 measuresPerLine 이내) 진짜 아무것도 바꾸지 않는다 — id/uiKey
      // 를 새로 발급하거나 startBeat을 옮기면 저장 시 이 줄이 삭제·재생성된 것처럼 취급돼
      // DB 식별자가 불필요하게 churn된다(code review 지적).
      if (splitIndices.length === 1) {
        newLines.push(line);
        continue;
      }

      // 가사 텍스트를 자르는 기준은 더 이상 charOffset이 아니다(Task 032 3단계) — charOffset은
      // 이제 updateLineLyrics(자유 텍스트 편집)·addChord가 갱신하지 않으므로, 사용자가 재구성
      // 전에 가사를 고치거나 코드를 추가/이동했으면 완전히 낡은 값일 수 있다(code review 지적,
      // 실측 재현: charOffset 기준으로 자르면 새로 입력한 가사와 무관한 지점에서 잘렸다).
      // 그래서 버킷 개수만큼 글자 수를 균등 분할한다 — 정확한 경계는 아니지만, 그 뒤 각 줄의
      // 가사는 통째로 자유 편집 텍스트 하나이므로 사용자가 바로 고치면 된다(beatOffset 기준
      // 코드 배치 자체는 여전히 정확하다).
      const totalBuckets = splitIndices.length;
      splitIndices.forEach((startIdx, splitOrder) => {
        const bucketIndex = bucketOf(chords[startIdx]!);
        const gridStartBeat = bucketIndex * beatsPerLine;
        const groupChords = chords.filter((c) => bucketOf(c) === bucketIndex);
        const textStart = Math.round((line.lyrics.length * splitOrder) / totalBuckets);
        const textEnd =
          splitOrder === totalBuckets - 1
            ? line.lyrics.length
            : Math.round((line.lyrics.length * (splitOrder + 1)) / totalBuckets);
        const newLyricsLength = Math.max(0, textEnd - textStart);

        newLines.push({
          uiKey: createLineUiKey(),
          // id를 새로 발급하지 않고 비워 둔다 — 원래 줄 하나가 여러 줄로 쪼개지므로 어느 하나도
          // "그 줄"이 아니다. 저장 시 전부 신규 줄로 upsert된다(원래 줄은 자연히 사라진다).
          id: undefined,
          lyrics: line.lyrics.slice(textStart, textEnd),
          orderIndex: 0, // 아래에서 섹션 전체 기준으로 다시 매긴다.
          startBeat: line.startBeat + gridStartBeat,
          chordEvents: groupChords.map((chord) => ({
            ...chord,
            // charOffset은 더 이상 화면 표시에 쓰이지 않지만(위 주석 참고), 저장 스키마 호환을
            // 위해 필드 자체는 유지한다 — 최소한 이 줄의 새 가사 길이 밖으로 나가지 않도록
            // 범위 안으로 자른다.
            charOffset: Math.max(0, Math.min(chord.charOffset - textStart, newLyricsLength)),
            beatOffset: chord.beatOffset - gridStartBeat,
          })),
        });
      });
    }

    return { ...section, lines: newLines.map((line, i) => ({ ...line, orderIndex: i })) };
  });
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
// Task 032 3단계 이후로는 가사를 코드 charOffset에 맞춰 잘라 보여주려는 시도를 완전히
// 그만뒀다(실사용 피드백 — 글자 단위 매핑은 실사용에서 거의 항상 신뢰할 수 없었다). 코드는
// beatOffset 기준 순서로만 나열하고, 가사는 줄(=보통 마디 하나) 전체를 하나의 자유 편집
// 텍스트로 다룬다 — updateLineLyrics 참고. charOffset 필드는 저장 스키마 호환을 위해 남아있지만
// 더 이상 어떤 화면 표시에도 쓰이지 않는다.

/** 가사가 없는 새 줄에 코드를 하나 추가한다 — 코드 기호·박자는 추가 직후 사용자가 편집한다. */
export function addChord(section: EditableSection, lineUiKey: string): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => {
      if (line.uiKey !== lineUiKey) return line;
      const newChord: EditableChordEvent = {
        uiKey: createChordUiKey(),
        chord: "C",
        charOffset: 0,
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
  patch: Partial<Pick<EditableChordEvent, "chord" | "beatOffset" | "needsReview">>,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => {
      if (line.uiKey !== lineUiKey) return line;
      return {
        ...line,
        chordEvents: line.chordEvents.map((chord) =>
          chord.uiKey === chordUiKey ? { ...chord, ...patch } : chord,
        ),
      };
    }),
  };
}

/** 줄(=보통 마디 하나) 전체의 가사를 자유 텍스트로 고친다. */
export function updateLineLyrics(
  section: EditableSection,
  lineUiKey: string,
  lyrics: string,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => (line.uiKey === lineUiKey ? { ...line, lyrics } : line)),
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
      // 코드 칩은 이제 항상 화면에 그려진다(칸 충돌로 숨겨질 여지가 없다 — Task 032 3단계) —
      // needsReview인 코드를 그대로 모두 대상으로 센다.
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

// ===== 임시 저장(서버 저장, Task 018) =====
// 임시 저장은 songs.updated_at(낙관적 잠금 기준값)을 건드리지 않도록 별도 song_drafts
// 테이블에 저장한다(route.ts/draft-client.ts 참고) — 여기서는 그 payload와 편집 상태 사이의
// 순수 변환만 담당한다. SaveCorrectionRequest를 그대로 draft payload로 쓴다: 이미 저장 요청과
// 똑같은 모양이라 별도 타입을 만들 필요가 없다.

/** 서버에서 불러온 draft(SaveCorrectionRequest 모양)를 편집 상태로 되돌린다. */
export function fromSaveCorrectionRequest(request: SaveCorrectionRequest): {
  song: EditableSong;
  sections: EditableSection[];
} {
  return {
    song: request.song,
    sections: request.sections.map((section) => ({
      clientKey: section.clientKey,
      id: section.id,
      type: section.type,
      lengthBeats: section.lengthBeats,
      repeatTarget: section.repeatTarget,
      lines: section.lines.map((line) => ({
        uiKey: line.id ?? createLineUiKey(),
        id: line.id,
        lyrics: line.lyrics,
        orderIndex: line.orderIndex,
        startBeat: line.startBeat,
        chordEvents: line.chordEvents.map((chord) => ({
          uiKey: chord.id ?? createChordUiKey(),
          id: chord.id,
          chord: chord.chord,
          charOffset: chord.charOffset,
          beatOffset: chord.beatOffset,
          needsReview: chord.needsReview,
        })),
      })),
    })),
  };
}
