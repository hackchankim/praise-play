// 텍스트 추출(가사·코드·조표) 결과와 구조 추출(마디·박자) 결과를 하나의 섹션 트리로 병합한다
// (Task 016). 두 결과는 sectionIndex/lineIndex로만 대응되므로(extraction-schemas.ts 참고),
// 구조 추출이 특정 줄을 놓쳤거나 self-consistency 두 호출이 불일치하면 그 줄의 박자 정보는
// 신뢰할 수 없다는 뜻이다 — 이럴 땐 DEFAULT_BEATS_PER_LINE으로 대체하고 해당 줄의 코드 전체를
// needsReview로 표시해 교정 UI(Task 018)에서 사람이 확인하게 한다.
//
// 코드 하나하나의 박 위치(beatOffset)도 마찬가지 원칙이다 — 구조 추출이 마디 구조를 근거로
// chordBeats(코드별 박 위치)를 직접 답하고 두 self-consistency 호출이 그 값(개수까지)까지
// 일치하면 그대로 쓰고, 그렇지 않으면 실제 음악과 무관할 수 있는 "가사 글자 위치 비례" 추정
// (estimateBeatOffset)으로 되돌아가며 그 경우도 needsReview로 표시한다 — 예전엔 beatsInLine만
// 맞으면 이 글자-비례 추정을 검증 없이 그대로 신뢰해, 코드 여러 개가 실제로는 서로 다른 박에
// 있는데도 뭉쳐 찍히는 등 부정확한 결과가 검토 필요 표시 없이 그대로 저장됐다(실사용 피드백).
//
// 섹션의 repeat_target_section_id는 여기서 채우지 않는다(항상 null) — 도돌이표 기반 섹션 반복
// 추론은 Task 017(섹션 자동 추론기)의 책임이다.
import { createId } from "@/lib/repositories/mock-utils";
import { estimateBeatOffset } from "@/lib/song-model/beat-offset";
import type {
  StructureExtractionResult,
  TextExtractionResult,
} from "@/lib/song-model/extraction-schemas";
import type { SectionType } from "@/lib/song-model/types";

/** 구조 추출이 이 줄을 놓쳤을 때 쓰는 대체값. 4/4 기준 한 마디에 해당하는 무난한 기본값이다. */
const DEFAULT_BEATS_PER_LINE = 4;

/** 이 오차 이내면 self-consistency 두 호출이 사실상 같은 값을 말한 것으로 본다(부동소수 오차 흡수). */
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

/** a/b가 길이까지 정확히 같고 각 원소가 오차범위 안에서 같으면 a를(신뢰할 수 있는 값으로) 반환한다. */
function agreeingChordBeats(a: number[] | undefined, b: number[] | undefined): number[] | null {
  if (!a || !b || a.length !== b.length) return null;
  const allWithinTolerance = a.every(
    (beat, index) => Math.abs(beat - b[index]!) <= BEATS_MATCH_TOLERANCE,
  );
  return allWithinTolerance ? a : null;
}

/**
 * sectionIndex별 줄 개수. 텍스트 추출과 구조 추출(2회)이 같은 이미지를 보고도 구획을 서로 다르게
 * 나눌 수 있다 — TEXT_EXTRACTION_PROMPT에는 "연속된 줄을 한 구획으로 묶어라"는 지시가 있지만
 * STRUCTURE_EXTRACTION_PROMPT에는 없다(그 문구가 콘텐츠 필터링을 유발해 뺐다 — 위 프롬프트 정의
 * 주석 참고). 그 결과 어느 한쪽이 구획을 더 잘게 쪼개면, 같은 "sectionIndex:lineIndex" 키가
 * 서로 다른 물리적 줄을 가리키게 된다 — primary/secondary가 우연히 서로는 일치해도(둘 다 텍스트
 * 추출과 다르게 쪼갰다면) 그 키의 beatsInLine/chordBeats가 실제로는 엉뚱한 줄의 값이면서
 * needsReview 없이 통과할 위험이 있다(code review 지적). 그래서 줄 개수 자체가 텍스트 추출과
 * 다른 구획은, 두 구조 추출 호출이 서로 일치하더라도 통째로 신뢰하지 않는다.
 */
function sectionLineCounts(result: StructureExtractionResult): Map<number, number> {
  const counts = new Map<number, number>();
  for (const section of result.sections) counts.set(section.sectionIndex, section.lines.length);
  return counts;
}

function buildStructureLookup(
  text: TextExtractionResult,
  primary: StructureExtractionResult,
  secondary: StructureExtractionResult,
): Map<string, StructureLineLookup> {
  const primaryLineCounts = sectionLineCounts(primary);
  const secondaryLineCounts = sectionLineCounts(secondary);
  const trustworthySectionIndexes = new Set(
    text.sections
      .map((section, sectionIndex) => sectionIndex)
      .filter(
        (sectionIndex) =>
          primaryLineCounts.get(sectionIndex) === text.sections[sectionIndex]!.lines.length &&
          secondaryLineCounts.get(sectionIndex) === text.sections[sectionIndex]!.lines.length,
      ),
  );

  const secondaryByKey = new Map<
    string,
    StructureExtractionResult["sections"][number]["lines"][number]
  >();
  for (const section of secondary.sections) {
    for (const line of section.lines) {
      secondaryByKey.set(`${section.sectionIndex}:${line.lineIndex}`, line);
    }
  }

  const lookup = new Map<string, StructureLineLookup>();
  for (const section of primary.sections) {
    // 이 구획의 줄 개수가 텍스트 추출과 다르면 sectionIndex:lineIndex 키 자체가 신뢰할 수 없다
    // — 아예 채우지 않는다. 호출부는 없는 키를 "구조 정보 없음"으로 취급해 이미 안전하게
    // DEFAULT_BEATS_PER_LINE·needsReview=true로 폴백한다.
    if (!trustworthySectionIndexes.has(section.sectionIndex)) continue;
    for (const line of section.lines) {
      const key = `${section.sectionIndex}:${line.lineIndex}`;
      const secondaryLine = secondaryByKey.get(key);
      const mismatched =
        secondaryLine === undefined ||
        Math.abs(secondaryLine.beatsInLine - line.beatsInLine) > BEATS_MATCH_TOLERANCE;
      lookup.set(key, {
        beatsInLine: line.beatsInLine,
        mismatched,
        chordBeats: agreeingChordBeats(line.chordBeats, secondaryLine?.chordBeats),
      });
    }
  }
  return lookup;
}

export function mergeExtractionResults(
  text: TextExtractionResult,
  structurePrimary: StructureExtractionResult,
  structureSecondary: StructureExtractionResult,
): MergedExtractionResult {
  const structureLookup = buildStructureLookup(text, structurePrimary, structureSecondary);

  let songBeatCursor = 0;
  const sections: MergedSection[] = text.sections.map((section, sectionIndex) => {
    let sectionBeatCursor = 0;

    const lines: MergedLine[] = section.lines.map((line, lineIndex) => {
      const structureEntry = structureLookup.get(`${sectionIndex}:${lineIndex}`);
      const beatsInLine = structureEntry?.beatsInLine ?? DEFAULT_BEATS_PER_LINE;
      // chordBeats는 primary/secondary가 서로 일치했을 때만 채워지지만(buildStructureLookup),
      // 그 개수가 실제 이 줄의 코드 개수와도 맞아야 안전하다 — 텍스트 추출과 구조 추출은 서로
      // 다른 LLM 호출이라 코드 개수 인식 자체가 어긋날 수 있다.
      const chordBeats =
        structureEntry?.chordBeats?.length === line.chords.length
          ? structureEntry.chordBeats
          : null;
      // 구조 정보가 아예 없거나(텍스트 추출만 이 줄을 봤음) 두 호출이 불일치했으면 신뢰할 수
      // 없다. 코드가 있는 줄인데 마디 구조를 근거로 한 코드별 박 위치(chordBeats)를 못 얻었으면
      // (개수가 안 맞거나 자기 일관성이 깨졌으면) 글자 비례 추정으로 되돌아가야 하므로 이것도
      // 검토 대상이다 — 예전처럼 beatsInLine만 맞으면 조용히 넘어가지 않는다.
      const needsReview =
        structureEntry === undefined ||
        structureEntry.mismatched ||
        (line.chords.length > 0 && chordBeats === null);

      const lineStartBeat = sectionBeatCursor;
      sectionBeatCursor += beatsInLine;

      const chordEvents: MergedChordEvent[] = line.chords.map((chord, chordIndex) => ({
        id: createId("chord"),
        chord: chord.chord,
        charOffset: chord.charOffset,
        // 마디 구조를 근거로 한 코드별 박 위치를 신뢰할 수 있으면 그대로 쓰고(범위 밖이면
        // clamp), 그렇지 않으면 예전의 글자 위치 비례 추정으로 되돌아간다.
        beatOffset: chordBeats
          ? Math.max(0, Math.min(chordBeats[chordIndex]!, beatsInLine))
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
    key: text.key,
    // songs.tempo는 integer 컬럼이다 — 구조 추출 스키마는 소수 BPM도 허용하므로 반올림한다.
    tempo: Math.round(structurePrimary.tempo),
    timeSignature: structurePrimary.timeSignature,
    sections,
  };
}
