// 텍스트 추출(가사·코드·조표) 결과와 구조 추출(마디·박자) 결과를 하나의 섹션 트리로 병합한다
// (Task 016). 두 결과는 sectionIndex/lineIndex로만 대응되므로(extraction-schemas.ts 참고),
// 구조 추출이 특정 줄을 놓쳤거나 self-consistency 두 호출이 불일치하면 그 줄의 박자 정보는
// 신뢰할 수 없다는 뜻이다 — 이럴 땐 DEFAULT_BEATS_PER_LINE으로 대체하고 해당 줄의 코드 전체를
// needsReview로 표시해 교정 UI(Task 018)에서 사람이 확인하게 한다.
//
// 섹션의 repeat_target_section_id는 여기서 채우지 않는다(항상 null) — 도돌이표 기반 섹션 반복
// 추론은 Task 017(섹션 자동 추론기)의 책임이다.
import { createId } from "@/lib/repositories/mock-utils";
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
}

/**
 * 가사 문자열 내 위치(charOffset) 비례로 코드의 박자 오프셋을 근사한다. 리드시트 코드 배치가
 * 가사 길이에 대략 비례한다는 흔한 가정이다 — 정확도 100%를 노리지 않는다(교정 UI가 최종 방어선).
 * 가사가 없는 간주 줄이면(lyricsLength === 0) 코드들을 줄 전체 박자에 걸쳐 균등 분배한다.
 */
function estimateBeatOffset(
  charOffset: number,
  lyricsLength: number,
  beatsInLine: number,
  chordIndex: number,
  chordCount: number,
): number {
  if (lyricsLength > 0) {
    const ratio = Math.min(1, charOffset / lyricsLength);
    return Math.round(ratio * beatsInLine * 100) / 100;
  }
  if (chordCount <= 1) return 0;
  return Math.round((chordIndex / chordCount) * beatsInLine * 100) / 100;
}

function buildStructureLookup(
  primary: StructureExtractionResult,
  secondary: StructureExtractionResult,
): Map<string, StructureLineLookup> {
  const secondaryBeatsByKey = new Map<string, number>();
  for (const section of secondary.sections) {
    for (const line of section.lines) {
      secondaryBeatsByKey.set(`${section.sectionIndex}:${line.lineIndex}`, line.beatsInLine);
    }
  }

  const lookup = new Map<string, StructureLineLookup>();
  for (const section of primary.sections) {
    for (const line of section.lines) {
      const key = `${section.sectionIndex}:${line.lineIndex}`;
      const secondaryBeats = secondaryBeatsByKey.get(key);
      const mismatched =
        secondaryBeats === undefined ||
        Math.abs(secondaryBeats - line.beatsInLine) > BEATS_MATCH_TOLERANCE;
      lookup.set(key, { beatsInLine: line.beatsInLine, mismatched });
    }
  }
  return lookup;
}

export function mergeExtractionResults(
  text: TextExtractionResult,
  structurePrimary: StructureExtractionResult,
  structureSecondary: StructureExtractionResult,
): MergedExtractionResult {
  const structureLookup = buildStructureLookup(structurePrimary, structureSecondary);

  let songBeatCursor = 0;
  const sections: MergedSection[] = text.sections.map((section, sectionIndex) => {
    let sectionBeatCursor = 0;

    const lines: MergedLine[] = section.lines.map((line, lineIndex) => {
      const structureEntry = structureLookup.get(`${sectionIndex}:${lineIndex}`);
      const beatsInLine = structureEntry?.beatsInLine ?? DEFAULT_BEATS_PER_LINE;
      // 구조 정보가 아예 없거나(텍스트 추출만 이 줄을 봤음) 두 호출이 불일치했으면 신뢰할 수 없다.
      const needsReview = structureEntry === undefined || structureEntry.mismatched;

      const lineStartBeat = sectionBeatCursor;
      sectionBeatCursor += beatsInLine;

      const chordEvents: MergedChordEvent[] = line.chords.map((chord, chordIndex) => ({
        id: createId("chord"),
        chord: chord.chord,
        charOffset: chord.charOffset,
        beatOffset: estimateBeatOffset(
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
