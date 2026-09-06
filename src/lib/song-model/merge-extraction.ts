// 텍스트 추출(가사·코드·조표) 결과와 구조 추출(마디·박자) 결과를 하나의 섹션 트리로 병합한다
// (Task 016). 구조 추출은 텍스트 추출(primary)이 확정한 줄 목록을 고정 입력으로 받아 그 순서
// 그대로 답하므로(Task 032, extraction-schemas.ts 헤더 주석 참고), 두 결과는 "텍스트 추출
// sections/lines를 순서대로 편 전체 줄 목록에서 몇 번째 줄인가"라는 하나의 전역 인덱스로만
// 대응시키면 된다 — sectionIndex/lineIndex 같은 별도 좌표는 더 이상 없다. 구조 추출 결과의
// 줄 개수가 이 전역 줄 개수와 다르면(모델이 줄을 빠뜨리거나 합쳤다는 뜻) 대응 자체를 신뢰할 수
// 없으므로 이럴 땐 DEFAULT_BEATS_PER_LINE으로 대체하고 해당 줄의 코드 전체를 needsReview로
// 표시해 교정 UI(Task 018)에서 사람이 확인하게 한다.
//
// 코드 하나하나의 박 위치(beatOffset)도 마찬가지 원칙이다 — 구조 추출이 마디 구조를 근거로
// chordBeats(코드별 박 위치)를 직접 답하고 두 self-consistency 호출이 그 값(개수까지)까지
// 일치하면 그대로 쓰고, 그렇지 않으면 실제 음악과 무관할 수 있는 "가사 글자 위치 비례" 추정
// (estimateBeatOffset)으로 되돌아가며 그 경우도 needsReview로 표시한다 — 예전엔 beatsInLine만
// 맞으면 이 글자-비례 추정을 검증 없이 그대로 신뢰해, 코드 여러 개가 실제로는 서로 다른 박에
// 있는데도 뭉쳐 찍히는 등 부정확한 결과가 검토 필요 표시 없이 그대로 저장됐다(실사용 피드백).
//
// 코드의 charOffset(가사 글자 위치)도 같은 이유로 self-consistency가 필요하다 — 실사용자
// 피드백으로 beatOffset(몇 번째 박인지)은 마디 구조 기반으로 정확한데 charOffset(그 박에 어느
// 글자가 붙는지)이 픽셀 정렬 눈대중이라 자주 어긋난다는 게 드러났다. beatOffset과 달리 charOffset
// 에는 대체할 만한 안전한 추정치가 없어서(estimateBeatOffset은 charOffset을 "입력"으로 쓰지
// "출력"하지 않는다), 두 텍스트 추출 호출이 정확히 일치하지 않으면 primary의 값을 그대로 쓰되
// needsReview로 표시해 최소한 사람이 확인하게만 한다 — beatsInLine·chordBeats처럼 조용히 틀린
// 채 저장되는 일은 없어야 한다.
//
// 섹션의 repeat_target_section_id는 여기서 채우지 않는다(항상 null) — 도돌이표 기반 섹션 반복
// 추론은 Task 017(섹션 자동 추론기)의 책임이다.
import { createId } from "@/lib/repositories/mock-utils";
import { estimateBeatOffset, quantizeToHalfBeat } from "@/lib/song-model/beat-offset";
import type {
  StructureExtractionResult,
  TextExtractionResult,
} from "@/lib/song-model/extraction-schemas";
import type { SectionType } from "@/lib/song-model/types";

/** 구조 추출이 이 줄을 놓쳤을 때 쓰는 대체값. 4/4 기준 한 마디에 해당하는 무난한 기본값이다. */
const DEFAULT_BEATS_PER_LINE = 4;

/**
 * beatsInLine(줄 전체가 차지하는 박 수) self-consistency에만 쓰는 오차범위다. chordBeats(코드별
 * 박 위치)는 이제 이 허용치 대신 quantizeToHalfBeat 기반 그리드 비교를 쓴다(agreeingChordBeats
 * 참고, 그리고 그 그리드를 쓰는 이유는 beat-offset.ts의 quantizeToHalfBeat 주석 참고).
 */
const BEATS_MATCH_TOLERANCE = 0.5;

export interface MergedChordEvent {
  id: string;
  chord: string;
  charOffset: number;
  beatOffset: number;
  needsReview: boolean;
}

export interface MergedLine {
  id: string;
  lyrics: string;
  orderIndex: number;
  startBeat: number;
  chordEvents: MergedChordEvent[];
}

export interface MergedSection {
  id: string;
  type: SectionType;
  orderIndex: number;
  startBeat: number;
  lengthBeats: number;
  /** 항상 null로 시작한다 — 도돌이표 기반 반복 추론은 Task 017의 applyPostProcessing()이 채운다. */
  repeatTargetSectionId: string | null;
  lines: MergedLine[];
}

export interface MergedExtractionResult {
  key: string;
  tempo: number;
  timeSignature: string;
  sections: MergedSection[];
}

interface StructureLineLookup {
  beatsInLine: number;
  /** primary/secondary 두 호출이 이 줄에서 불일치했는가 */
  mismatched: boolean;
  /**
   * 코드별 박 위치 — primary/secondary가 개수까지 정확히 일치했을 때만 채워진다(그렇지
   * 않으면 어느 쪽도 신뢰할 수 없으므로 null). 실제로 이 줄의 코드 개수와도 맞는지는
   * 호출부(mergeExtractionResults)가 한 번 더 확인한다 — 텍스트 추출과 구조 추출은 서로
   * 다른 LLM 호출이라 코드 개수 자체가 어긋날 수 있다.
   */
  chordBeats: number[] | null;
}

/**
 * a/b가 길이까지 정확히 같고, 각 원소를 반박(0.5) 그리드로 양자화했을 때 정확히 같으면 그
 * 양자화된 값을 반환한다 — "원값이 대충 비슷한가"(예전의 ±0.5 오차범위)가 아니라 "같은 그리드
 * 위치를 말했는가"를 기준으로 삼는다(왜 그리드 단위인지는 beat-offset.ts의 quantizeToHalfBeat
 * 주석 참고).
 *
 * 그리드 스냅은 새로운 위험을 하나 만든다 — 같은 줄의 서로 다른 코드 두 개가 원래는 구분되는
 * 값이었는데(예: 2.1, 2.2) 그리드에 스냅하면 우연히 같은 값(2.0)으로 겹칠 수 있다(code review
 * 지적, 실측 확인 — 겹치면 뒤 코드가 deriveCells의 "칸당 코드 1개" 규칙에 밀려 화면에 아예 안
 * 보이는데도 needsReview 없이 조용히 저장됐다). 이 파일의 다른 모든 신뢰성 판정이 줄 단위이므로
 * (구획·charOffset 등), 같은 기준으로 겹침이 하나라도 있으면 그 줄 chordBeats 전체를 신뢰하지
 * 않는다 — 일부만 골라 믿을 방법이 없다.
 */
function agreeingChordBeats(a: number[] | undefined, b: number[] | undefined): number[] | null {
  if (!a || !b || a.length !== b.length) return null;
  const quantizedA = a.map(quantizeToHalfBeat);
  const quantizedB = b.map(quantizeToHalfBeat);
  const allMatch = quantizedA.every((beat, index) => beat === quantizedB[index]);
  if (!allMatch) return null;
  const hasCollision = new Set(quantizedA).size !== quantizedA.length;
  return hasCollision ? null : quantizedA;
}

/** 텍스트 추출 결과를 구획 구분 없이 순서대로 편 전체 줄 개수 — 구조 추출 결과와의 대응 기준. */
function totalLineCount(result: TextExtractionResult): number {
  return result.sections.reduce((sum, section) => sum + section.lines.length, 0);
}

/**
 * primary/secondary 두 텍스트 추출 호출의 charOffset이 완전히 일치하는 줄만 "확인됨"으로
 * 표시한다. beatOffset과 달리 charOffset은 정수 글자 인덱스라 오차범위를 둘 이유가 없다 —
 * 몇 글자만 어긋나도 실제로는 다른 음절을 가리키므로 정확히 같을 때만 신뢰한다.
 *
 * 텍스트 추출은 구조 추출과 달리 두 호출 다 구획/줄 경계를 각자 독립적으로 판단한다(둘 다
 * 텍스트 추출이라 어느 한쪽에 고정 입력을 줄 "확정된 파티션"이 없다) — 그래서 구획 개수 자체가
 * 두 호출 사이에서 어긋나면 sectionIndex:lineIndex 키가 서로 다른 물리적 줄을 가리킬 수 있고,
 * 그 구획은 통째로 확인 대상에서 뺀다. (이 축의 불일치는 Task 032가 다루는 범위 밖이다 —
 * 구조 추출 쪽만 텍스트 추출의 고정 파티션을 받도록 바꿨다.)
 */
function buildCharOffsetConfirmedLines(
  primary: TextExtractionResult,
  secondary: TextExtractionResult,
): Set<string> {
  const secondaryLineCounts = secondary.sections.map((section) => section.lines.length);
  const confirmed = new Set<string>();

  primary.sections.forEach((section, sectionIndex) => {
    if (secondaryLineCounts[sectionIndex] !== section.lines.length) return;
    const secondarySection = secondary.sections[sectionIndex]!;

    section.lines.forEach((line, lineIndex) => {
      const secondaryLine = secondarySection.lines[lineIndex];
      if (!secondaryLine || secondaryLine.chords.length !== line.chords.length) return;
      const allMatch = line.chords.every(
        (chord, chordIndex) => chord.charOffset === secondaryLine.chords[chordIndex]!.charOffset,
      );
      if (allMatch) confirmed.add(`${sectionIndex}:${lineIndex}`);
    });
  });

  return confirmed;
}

/**
 * 구조 추출 primary/secondary 결과를, 텍스트 추출을 순서대로 편 전체 줄 목록의 전역 인덱스로
 * 대응시킨다. 구조 추출은 이제 그 줄 목록을 고정 입력으로 받아 같은 순서로만 답하므로(Task 032),
 * 두 결과 각각의 lines 배열 길이가 expectedLineCount와 정확히 같을 때만(=모델이 줄을 빠뜨리거나
 * 합치지 않았을 때만) 배열 순서를 그대로 전역 인덱스로 신뢰한다 — 하나라도 다르면 어느 인덱스가
 * 실제로 어느 줄을 가리키는지 알 수 없으므로 통째로 비운다(호출부는 빈 조회를 "구조 정보 없음"
 * 으로 취급해 이미 안전하게 DEFAULT_BEATS_PER_LINE·needsReview=true로 폴백한다).
 */
function buildStructureLookup(
  expectedLineCount: number,
  primary: StructureExtractionResult,
  secondary: StructureExtractionResult,
): Map<number, StructureLineLookup> {
  const lookup = new Map<number, StructureLineLookup>();
  if (primary.lines.length !== expectedLineCount || secondary.lines.length !== expectedLineCount) {
    return lookup;
  }

  primary.lines.forEach((line, index) => {
    const secondaryLine = secondary.lines[index]!;
    const mismatched =
      Math.abs(secondaryLine.beatsInLine - line.beatsInLine) > BEATS_MATCH_TOLERANCE;
    lookup.set(index, {
      beatsInLine: line.beatsInLine,
      mismatched,
      chordBeats: agreeingChordBeats(line.chordBeats, secondaryLine.chordBeats),
    });
  });
  return lookup;
}

export function mergeExtractionResults(
  textPrimary: TextExtractionResult,
  textSecondary: TextExtractionResult,
  structurePrimary: StructureExtractionResult,
  structureSecondary: StructureExtractionResult,
): MergedExtractionResult {
  const structureLookup = buildStructureLookup(
    totalLineCount(textPrimary),
    structurePrimary,
    structureSecondary,
  );
  const charOffsetConfirmedLines = buildCharOffsetConfirmedLines(textPrimary, textSecondary);

  let globalLineIndex = 0;
  let songBeatCursor = 0;
  const sections: MergedSection[] = textPrimary.sections.map((section, sectionIndex) => {
    let sectionBeatCursor = 0;

    const lines: MergedLine[] = section.lines.map((line, lineIndex) => {
      const structureEntry = structureLookup.get(globalLineIndex);
      globalLineIndex += 1;
      const beatsInLine = structureEntry?.beatsInLine ?? DEFAULT_BEATS_PER_LINE;
      // chordBeats는 primary/secondary가 서로 일치했을 때만 채워지지만(buildStructureLookup),
      // 그 개수가 실제 이 줄의 코드 개수와도 맞아야 안전하다 — 텍스트 추출과 구조 추출은 서로
      // 다른 LLM 호출이라 코드 개수 인식 자체가 어긋날 수 있다.
      const chordBeats =
        structureEntry?.chordBeats?.length === line.chords.length
          ? structureEntry.chordBeats
          : null;
      // charOffset도 두 텍스트 추출 호출이 정확히 일치할 때만 "확인됨"으로 본다 — 어긋나면
      // primary의 charOffset을 그대로 쓰되(대체할 안전한 추정치가 없다) 검토 대상으로 표시한다.
      const charOffsetConfirmed = charOffsetConfirmedLines.has(`${sectionIndex}:${lineIndex}`);
      // 구조 정보가 아예 없거나(텍스트 추출만 이 줄을 봤음) 두 호출이 불일치했으면 신뢰할 수
      // 없다. 코드가 있는 줄인데 마디 구조를 근거로 한 코드별 박 위치(chordBeats)를 못 얻었으면
      // (개수가 안 맞거나 자기 일관성이 깨졌으면) 글자 비례 추정으로 되돌아가야 하므로 이것도
      // 검토 대상이다 — 예전처럼 beatsInLine만 맞으면 조용히 넘어가지 않는다. charOffset이
      // 두 호출 사이에서 확인되지 않은 것도 마찬가지로 검토 대상이다.
      const needsReview =
        structureEntry === undefined ||
        structureEntry.mismatched ||
        (line.chords.length > 0 && chordBeats === null) ||
        (line.chords.length > 0 && !charOffsetConfirmed);

      const lineStartBeat = sectionBeatCursor;
      sectionBeatCursor += beatsInLine;

      const chordEvents: MergedChordEvent[] = line.chords.map((chord, chordIndex) => ({
        id: createId("chord"),
        chord: chord.chord,
        charOffset: chord.charOffset,
        // 마디 구조를 근거로 한 코드별 박 위치를 신뢰할 수 있으면 그대로 쓰고(범위 밖이면
        // clamp), 그렇지 않으면 예전의 글자 위치 비례 추정으로 되돌아간다. clamp 상한인
        // beatsInLine 자체는 그리드에 맞다는 보장이 없다(구조 추출 스키마가 정수·반박 단위를
        // 강제하지 않는다) — clamp로 잘린 뒤에도 다시 그리드로 스냅해야, 이미 agreeingChordBeats
        // 에서 그리드에 맞춰 둔 값이 clamp 한 번으로 도로 어긋나는 일이 없다(code review 지적).
        beatOffset: chordBeats
          ? quantizeToHalfBeat(Math.max(0, Math.min(chordBeats[chordIndex]!, beatsInLine)))
          : estimateBeatOffset(
              chord.charOffset,
              line.lyrics.length,
              beatsInLine,
              chordIndex,
              line.chords.length,
            ),
        needsReview,
      }));

      return {
        id: createId("line"),
        lyrics: line.lyrics,
        orderIndex: lineIndex,
        startBeat: lineStartBeat,
        chordEvents,
      };
    });

    const lengthBeats = sectionBeatCursor;
    const sectionStartBeat = songBeatCursor;
    songBeatCursor += lengthBeats;

    return {
      id: createId("section"),
      type: section.type,
      orderIndex: sectionIndex,
      startBeat: sectionStartBeat,
      lengthBeats,
      repeatTargetSectionId: null,
      lines,
    };
  });

  return {
    key: textPrimary.key,
    // songs.tempo는 integer 컬럼이다 — 구조 추출 스키마는 소수 BPM도 허용하므로 반올림한다.
    tempo: Math.round(structurePrimary.tempo),
    timeSignature: structurePrimary.timeSignature,
    sections,
  };
}
