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
import { estimateBeatOffset } from "@/lib/song-model/beat-offset";
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

      splitIndices.forEach((startIdx, splitOrder) => {
        const bucketIndex = bucketOf(chords[startIdx]!);
        const gridStartBeat = bucketIndex * beatsPerLine;
        const groupChords = chords.filter((c) => bucketOf(c) === bucketIndex);
        const laterChords = chords.filter((c) => bucketOf(c) > bucketIndex);
        // 텍스트를 자르는 기준은 charOffset이어야 하므로(beatOffset 순서와 어긋날 수 있는
        // 데이터를 대비해) 이 버킷/이후 버킷 코드들 중 각각 가장 이른 글자 위치를 쓴다.
        // 첫 덩어리는 코드보다 앞선 가사(간주 등 코드 없는 도입부 텍스트)까지 함께 가져간다.
        const textStart = splitOrder === 0 ? 0 : Math.min(...groupChords.map((c) => c.charOffset));
        // charOffset 순서가 beatOffset 순서와 어긋나 있으면(자유 입력·병합 과정에서 생긴 레거시
        // 데이터) 다음 버킷의 최솟값이 textStart보다 앞설 수 있다 — 그러면 slice가 빈 문자열이
        // 되거나(끝<시작) 뒤 버킷이 이 구간 글자를 대신 가져가 버린다. textStart 이상으로
        // 바닥을 둬서 최소한 음수 길이 slice와 글자 유실은 막는다(code review 지적).
        const textEnd = Math.max(
          textStart,
          laterChords.length > 0
            ? Math.min(...laterChords.map((c) => c.charOffset))
            : line.lyrics.length,
        );
        const newLyricsLength = textEnd - textStart;

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
            // 위 textEnd 클램프로 이 줄의 실제 길이보다 큰 charOffset이 나올 수 있어(레거시
            // 데이터) 새 가사 길이 안으로 한 번 더 자른다(code review 지적).
            charOffset: Math.max(0, Math.min(chord.charOffset - textStart, newLyricsLength)),
            beatOffset: chord.beatOffset - gridStartBeat,
          })),
        });
      });
    }

    return { ...section, lines: newLines.map((line, i) => ({ ...line, orderIndex: i })) };
  });
}

/** 한 마디 카드 안의 박자 칸 하나 — 코드(있으면)와 그 칸에 속하는 가사 조각. */
export interface BeatCell {
  chordUiKey: string | null;
  text: string;
}

/**
 * 줄 하나를 cellCount개의 박자 칸으로 나눈다(화면 표시·편집 전용 — 저장되는 형태가 아니라
 * line.lyrics/chordEvents로부터 매번 다시 계산한다). 코드가 있는 칸은 그 코드의 charOffset이
 * 칸 경계가 되고, 코드가 없는 칸들은 이웃한 경계 사이(또는 줄 시작/끝) 구간을 남은 칸 수만큼
 * 글자 수 균등 분할한다 — 그래야 사용자가 칸 글자를 고쳐 line.lyrics 길이가 바뀌어도(아래
 * updateCellText가 매번 이 함수와 같은 규칙으로 line.lyrics를 다시 조립하므로) 다음에 다시
 * 계산해도 방금 편집한 경계가 그대로 재현된다 — 별도로 "칸 경계"를 저장할 필요가 없다.
 */
export function deriveCells(line: EditableLine, cellCount: number): BeatCell[] {
  const count = Math.max(1, Math.round(cellCount));
  const lyrics = line.lyrics;

  // 칸마다 반올림한 beatOffset이 그 칸의 인덱스와 같은 코드를 배정한다. 같은 칸에 여러 코드가
  // 몰리면(코드 변화가 한 박보다 빠른 원곡 등) 그중 beatOffset이 가장 이른 것만 배정한다 —
  // "칸당 코드 1개" 원칙.
  const cellChord: (EditableChordEvent | null)[] = new Array(count).fill(null);
  for (const chord of line.chordEvents) {
    const idx = Math.min(count - 1, Math.max(0, Math.round(chord.beatOffset)));
    const existing = cellChord[idx];
    if (!existing || chord.beatOffset < existing.beatOffset) cellChord[idx] = chord;
  }

  // 칸 경계(글자 오프셋). 코드가 배정된 칸은 그 코드의 charOffset을 경계로 쓴다. 코드가 없는
  // 칸들은 앞뒤로 가장 가까운 "확정된 경계"(코드 위치, 또는 줄의 시작 0/끝 lyricsLength) 사이를
  // 남은 칸 수만큼 균등 분할한다.
  //
  // 0번 칸은 그 코드의 charOffset이 0보다 커도(코드보다 앞선 간주 가사가 있는 경우 —
  // reorganizeIntoMeasures가 실제로 이런 줄을 만든다) 항상 0에서 시작한다 — 즉 0번 칸에 배정된
  // 코드는 "글자 위치 0에 있는 코드"로 취급한다. 그 코드의 원래 charOffset이 그보다 컸더라도
  // 무시한다: 한 번이라도 이 줄을 다시 저장하면(updateCellText가 0번 칸의 시작 위치 0을 그대로
  // charOffset으로 되돌려 쓴다) 그 값 자체가 0이 되므로, "원래 값을 기억해뒀다가 참조점으로만
  // 쓰는" 방식은 재파생(rederive)할 때마다 결과가 달라지는 불안정을 낳는다(실측 확인 — code
  // review 두 번째 라운드에서 직접 재현됨: deriveCells → updateCellText → deriveCells를 반복하면
  // 칸 경계가 편집 없이도 계속 흔들렸다). 코드보다 앞선 가사가 100% 그대로 0번 칸에 다 담긴다는
  // 보장은 이 방식으로는 포기하지만(최초 한 번은 균등 분할에 섞여 들어갈 수 있다), 대신 같은
  // 입력에 대해 항상 같은 결과가 나오는 안정성(idempotency)을 지킨다 — 그게 없으면 사용자가
  // 전혀 안 건드린 칸의 내용이 다른 칸을 편집할 때마다 계속 재배치되어 훨씬 더 혼란스럽다.
  //
  // 경계 값 자체도 항상 비내림(non-decreasing)으로 유지한다 — 코드의 charOffset이 beatOffset과
  // 순서가 어긋난 레거시 데이터(자유 입력·병합 과정에서 생길 수 있음)가 있으면 뒤 칸의
  // charOffset이 앞 칸보다 작을 수 있다. 그대로 두면 앞 칸이 음수 길이로 잘려 통째로 비어버리고
  // 그 텍스트가 엉뚱한 뒤 칸으로 넘어간다(code review 지적) — 앞 칸의 경계값 이하로 내려가지
  // 않도록 바닥을 둬서 최소한 슬라이스가 항상 앞으로만 진행하게 한다.
  // 코드의 charOffset이 이 줄 가사 길이보다 클 수 있다(레거시 데이터 — toEditableSections는
  // 로드 시 이 값을 검증·클램프하지 않는다) — 그대로 boundary 기준으로 쓰면 그 칸 하나가
  // 그 뒤 모든 칸의 텍스트를 통째로 삼켜버린다(code review 지적). 경계로 쓰기 전에 항상
  // 이 줄의 실제 길이 안으로 잘라 둔다.
  const clampedCharOffset = (chord: EditableChordEvent) =>
    Math.min(chord.charOffset, lyrics.length);

  const boundary: number[] = new Array(count).fill(0);
  let cursor = 0;
  while (cursor < count) {
    if (cellChord[cursor]) {
      boundary[cursor] =
        cursor === 0 ? 0 : Math.max(boundary[cursor - 1]!, clampedCharOffset(cellChord[cursor]!));
      cursor += 1;
      continue;
    }
    let runEnd = cursor;
    while (runEnd < count && !cellChord[runEnd]) runEnd += 1;
    // cursor가 0이면(줄 맨 앞이 코드 없이 시작) 이 구간엔 "먼저 자리를 차지하는 앞선 코드
    // 칸"이 없으므로 runLength칸이 [rangeStart, rangeEnd) 전체를 균등 분할한다(i/runLength).
    // cursor>0이면 바로 앞 칸(코드가 배정된 칸)이 이 구간의 첫 몫을 이미 차지하고 있으므로,
    // 전체를 (runLength+1)조각으로 나눠 그중 1..runLength번째 조각의 시작점만 이 칸들에 준다
    // — 그래야 코드 칸 바로 다음 칸이 코드 칸과 같은 시작점(0폭)이 되는 일이 없다.
    const rangeStart = cursor === 0 ? 0 : boundary[cursor - 1]!;
    const rangeEnd = Math.max(
      rangeStart,
      runEnd < count ? clampedCharOffset(cellChord[runEnd]!) : lyrics.length,
    );
    const span = Math.max(0, rangeEnd - rangeStart);
    const runLength = runEnd - cursor;
    const denom = cursor === 0 ? runLength : runLength + 1;
    for (let i = 0; i < runLength; i += 1) {
      const numerator = cursor === 0 ? i : i + 1;
      boundary[cursor + i] = rangeStart + Math.round((span * numerator) / denom);
    }
    cursor = runEnd;
  }

  return boundary.map((start, i) => {
    const end = i + 1 < count ? boundary[i + 1] : lyrics.length;
    return {
      chordUiKey: cellChord[i]?.uiKey ?? null,
      text: lyrics.slice(start, Math.max(start, end)),
    };
  });
}

/**
 * 칸 하나의 가사 텍스트를 고친다. 전체 줄을 칸 배열로 다시 나눈 뒤(deriveCells) 그 칸만 바꿔
 * 다시 이어붙이고, 코드가 배정된 칸들은 새로 조립된 텍스트 기준 charOffset으로 다시 계산한다
 * (beatOffset은 칸 인덱스 그대로 — 칸 기반 편집에서는 코드 위치가 항상 정수 박이다).
 */
export function updateCellText(
  section: EditableSection,
  lineUiKey: string,
  cellIndex: number,
  cellCount: number,
  newText: string,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => {
      if (line.uiKey !== lineUiKey) return line;
      const cells = deriveCells(line, cellCount);
      if (cellIndex < 0 || cellIndex >= cells.length) return line;
      const nextTexts = cells.map((cell, i) => (i === cellIndex ? newText : cell.text));
      const nextLyrics = nextTexts.join("");

      const offsets: number[] = [];
      let running = 0;
      for (const text of nextTexts) {
        offsets.push(running);
        running += text.length;
      }

      return {
        ...line,
        lyrics: nextLyrics,
        chordEvents: line.chordEvents.map((chord) => {
          const cellIdx = cells.findIndex((cell) => cell.chordUiKey === chord.uiKey);
          if (cellIdx !== -1) return { ...chord, charOffset: offsets[cellIdx]! };
          // 같은 칸에 코드가 몰려(deriveCells의 "칸당 코드 1개" 규칙) 어느 칸에도 배정되지
          // 못한 코드다 — 정확한 새 위치는 알 수 없지만, 최소한 새로 조립된 가사 길이를 넘는
          // charOffset을 그대로 들고 있지 않도록 잘라 둔다(code review 지적 — 안 그러면
          // 텍스트를 계속 줄일 때마다 이 코드의 charOffset만 갈수록 범위 밖으로 벌어진다).
          return { ...chord, charOffset: Math.min(chord.charOffset, nextLyrics.length) };
        }),
      };
    }),
  };
}

/** 빈 칸에 새 코드를 만든다 — charOffset은 그 칸의 현재 시작 글자 위치, beatOffset은 칸 인덱스. */
export function addChordAtCell(
  section: EditableSection,
  lineUiKey: string,
  cellIndex: number,
  cellCount: number,
): EditableSection {
  return {
    ...section,
    lines: section.lines.map((line) => {
      if (line.uiKey !== lineUiKey) return line;
      const cells = deriveCells(line, cellCount);
      const cell = cells[cellIndex];
      if (!cell || cell.chordUiKey !== null) return line;
      let charOffset = 0;
      for (let i = 0; i < cellIndex; i += 1) charOffset += cells[i]!.text.length;
      const newChord: EditableChordEvent = {
        uiKey: createChordUiKey(),
        chord: "C",
        charOffset,
        beatOffset: cellIndex,
        needsReview: false,
      };
      return { ...line, chordEvents: [...line.chordEvents, newChord] };
    }),
  };
}

/**
 * 섹션의 모든 줄에 대해 lineBeatsSpan을 한 번에 계산한다(uiKey → span). section-card가 줄마다
 * lineBeatsSpan을 따로 부르면 그때마다 전체 줄을 다시 정렬해 O(N^2 log N)이 된다(code review
 * 지적) — 한 번만 정렬해서 인접한 줄끼리 순회하면 O(N log N)으로 끝난다.
 */
export function computeLineBeatsSpans(section: EditableSection): Map<string, number> {
  const sorted = [...section.lines].sort((a, b) => a.startBeat - b.startBeat);
  const result = new Map<string, number>();
  sorted.forEach((line, index) => {
    const next = sorted[index + 1];
    const span = (next ? next.startBeat : section.lengthBeats) - line.startBeat;
    result.set(line.uiKey, span > 0 ? span : 1);
  });
  return result;
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

/**
 * 이 줄이 차지하는 박자 폭. 다음 줄의 startBeat(줄들이 항상 startBeat 오름차순은 아닐 수 있어
 * 정렬 후 계산)까지, 마지막 줄이면 섹션 lengthBeats까지를 이 줄의 몫으로 본다.
 */
export function lineBeatsSpan(section: EditableSection, line: EditableLine): number {
  return computeLineBeatsSpans(section).get(line.uiKey) ?? Math.max(1, section.lengthBeats);
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

      const chordIndex = line.chordEvents.findIndex((chord) => chord.uiKey === chordUiKey);
      // 드래그로 charOffset만 바뀌고 beatOffset은 호출부가 함께 지정하지 않았다면(수동 입력과
      // 구분하는 지점) 가사 위치 비례로 beatOffset을 다시 계산해 둘을 동기화한다 — 추출 잡
      // 병합(merge-extraction.ts)의 초기 추정과 같은 공식을 쓴다.
      const shouldSyncBeat = patch.charOffset !== undefined && patch.beatOffset === undefined;
      const lineSpan = shouldSyncBeat ? lineBeatsSpan(section, line) : 0;

      return {
        ...line,
        chordEvents: line.chordEvents.map((chord, index) => {
          if (chord.uiKey !== chordUiKey) return chord;
          const nextCharOffset =
            patch.charOffset === undefined
              ? chord.charOffset
              : Math.max(0, Math.min(patch.charOffset, line.lyrics.length));
          return {
            ...chord,
            ...patch,
            charOffset: nextCharOffset,
            beatOffset: shouldSyncBeat
              ? estimateBeatOffset(
                  nextCharOffset,
                  line.lyrics.length,
                  lineSpan,
                  chordIndex === -1 ? index : chordIndex,
                  line.chordEvents.length,
                )
              : (patch.beatOffset ?? chord.beatOffset),
          };
        }),
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
    const beatsSpans = computeLineBeatsSpans(section);
    for (const line of section.lines) {
      // 같은 칸에 코드가 몰려(deriveCells의 "칸당 코드 1개" 규칙) 어느 칸에도 배정되지 못한
      // 코드는 화면에 칩으로 그려지지 않아 registerChordNode도 호출되지 않는다 — "다음 검토
      // 항목"이 그런 코드를 가리키면 스크롤·강조가 조용히 아무 일도 하지 않는다(code review
      // 지적). 실제로 화면에 보여 도달 가능한 코드만 검토 대상으로 센다.
      const cellCount = Math.max(1, Math.round(beatsSpans.get(line.uiKey) ?? 1));
      const reachableUiKeys = new Set(
        deriveCells(line, cellCount)
          .map((cell) => cell.chordUiKey)
          .filter((uiKey): uiKey is string => uiKey !== null),
      );
      for (const chord of line.chordEvents) {
        if (chord.needsReview && reachableUiKeys.has(chord.uiKey)) {
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
