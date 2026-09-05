import { describe, expect, it } from "vitest";
import { mergeExtractionResults } from "./merge-extraction";
import type { StructureExtractionResult, TextExtractionResult } from "./extraction-schemas";

function textResult(
  chords: { chord: string; charOffset: number }[],
  lyrics = "0123456789",
): TextExtractionResult {
  return {
    key: "G",
    sections: [{ type: "verse", lines: [{ lyrics, chords }] }],
  };
}

function structureResult(beatsInLine: number, chordBeats?: number[]): StructureExtractionResult {
  return {
    tempo: 100,
    timeSignature: "4/4",
    sections: [{ sectionIndex: 0, lines: [{ lineIndex: 0, beatsInLine, chordBeats }] }],
  };
}

describe("mergeExtractionResults — chordBeats(마디 구조 근거 코드별 박 위치)", () => {
  it("primary/secondary의 chordBeats가 개수까지 일치하면 그 값을 그대로 beatOffset으로 쓰고 needsReview를 세우지 않는다", () => {
    const text = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 3 },
    ]);
    const primary = structureResult(8, [0, 5]);
    const secondary = structureResult(8, [0, 5]);

    const result = mergeExtractionResults(text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.map((c) => c.beatOffset)).toEqual([0, 5]);
    expect(chords.every((c) => !c.needsReview)).toBe(true);
  });

  it("chordBeats 개수가 실제 코드 개수와 다르면(텍스트 추출과 구조 추출의 코드 인식이 어긋남) 글자 비례 추정으로 되돌아가고 needsReview를 세운다", () => {
    const text = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
      { chord: "D", charOffset: 8 },
    ]);
    const primary = structureResult(8, [0, 4]); // 코드는 3개인데 chordBeats는 2개뿐
    const secondary = structureResult(8, [0, 4]);

    const result = mergeExtractionResults(text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    // 글자 비례 추정(estimateBeatOffset)으로 되돌아갔다는 뜻 — chordBeats를 그대로 쓴 게 아니다.
    expect(chords[0]!.beatOffset).toBe(0);
    expect(chords.every((c) => c.needsReview)).toBe(true);
  });

  it("primary/secondary의 chordBeats가 서로 어긋나면(self-consistency 실패) 글자 비례 추정으로 되돌아가고 needsReview를 세운다", () => {
    const text = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
    ]);
    const primary = structureResult(8, [0, 3]);
    const secondary = structureResult(8, [0, 6]); // 3과 6 — 오차범위(0.5)를 크게 벗어남

    const result = mergeExtractionResults(text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.every((c) => c.needsReview)).toBe(true);
  });

  it("chordBeats가 아예 없으면(구조 추출이 이 기능을 답하지 않음) 글자 비례 추정으로 되돌아가고 needsReview를 세운다", () => {
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(8);
    const secondary = structureResult(8);

    const result = mergeExtractionResults(text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords[0]!.needsReview).toBe(true);
  });

  it("코드가 하나도 없는 줄이 있어도 그 뒤 줄의 박자 위치·검토 여부는 정상적으로 처리된다", () => {
    // "코드가 없다"는 사실 자체만으로 needsReview가 세워지지 않는지는 그 줄의 chordEvents가
    // 비어 있어 직접 관찰할 수 없다 — 대신 그 줄 처리가 다음 줄(실제 코드가 있고 모든 조건이
    // 일치하는 줄)의 박자 커서·신뢰 판정을 망가뜨리지 않는지로 확인한다.
    const text: TextExtractionResult = {
      key: "G",
      sections: [
        {
          type: "verse",
          lines: [
            { lyrics: "", chords: [] },
            { lyrics: "abcd", chords: [{ chord: "C", charOffset: 0 }] },
          ],
        },
      ],
    };
    const structure = (): StructureExtractionResult => ({
      tempo: 100,
      timeSignature: "4/4",
      sections: [
        {
          sectionIndex: 0,
          lines: [
            { lineIndex: 0, beatsInLine: 4 },
            { lineIndex: 1, beatsInLine: 4, chordBeats: [1] },
          ],
        },
      ],
    });

    const result = mergeExtractionResults(text, structure(), structure());
    const lines = result.sections[0]!.lines;
    expect(lines[0]!.chordEvents).toHaveLength(0);
    // 코드 없는 줄도 자기 beatsInLine(4)만큼은 박자 커서를 밀어야 다음 줄이 올바른 위치에서 시작한다.
    expect(lines[1]!.startBeat).toBe(4);
    expect(lines[1]!.chordEvents[0]!.beatOffset).toBe(1);
    expect(lines[1]!.chordEvents[0]!.needsReview).toBe(false);
  });

  it("chordBeats 값이 beatsInLine을 넘으면 그 줄의 박자 폭 안으로 자른다", () => {
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(4, [99]);
    const secondary = structureResult(4, [99]);

    const result = mergeExtractionResults(text, primary, secondary);
    expect(result.sections[0]!.lines[0]!.chordEvents[0]!.beatOffset).toBe(4);
  });
});

describe("mergeExtractionResults — 텍스트 추출과 구조 추출의 구획 나누기가 어긋난 경우", () => {
  it("두 구조 추출 호출이 서로는 일치해도 텍스트 추출과 줄 개수가 다르면 그 구획을 통째로 신뢰하지 않는다", () => {
    // 회귀 테스트: code review 지적 — TEXT_EXTRACTION_PROMPT에만 "연속된 줄을 한 구획으로
    // 묶어라" 지시가 있고 STRUCTURE_EXTRACTION_PROMPT에는 없어서(콘텐츠 필터링 회피), 두 구조
    // 추출 호출이 텍스트 추출과 다르게(하지만 서로는 똑같이) 줄을 합쳐버릴 수 있다. 이땐
    // sectionIndex:lineIndex 키가 서로 다른 물리적 줄을 가리키므로, primary/secondary가
    // 우연히 일치해도 그 값을 신뢰하면 안 된다.
    const text: TextExtractionResult = {
      key: "G",
      sections: [
        {
          type: "verse",
          lines: [
            { lyrics: "aaaa", chords: [{ chord: "G", charOffset: 0 }] },
            { lyrics: "bbbb", chords: [{ chord: "C", charOffset: 0 }] },
          ],
        },
      ],
    };
    // 구조 추출 두 호출 다 이 구획을 (텍스트 추출과 달리) 한 줄로 합쳐버렸다 — 서로는 완전히 일치.
    const misalignedStructure = (): StructureExtractionResult => ({
      tempo: 100,
      timeSignature: "4/4",
      sections: [{ sectionIndex: 0, lines: [{ lineIndex: 0, beatsInLine: 16, chordBeats: [0] }] }],
    });

    const result = mergeExtractionResults(text, misalignedStructure(), misalignedStructure());
    const lines = result.sections[0]!.lines;
    // 텍스트 추출 기준 줄이 2개이므로 결과도 2줄이어야 하고(구획 자체는 텍스트 추출 기준),
    // 구조 추출의 (잘못 정렬된) beatsInLine=16을 그대로 쓰면 안 된다 — 기본값(4)으로 폴백하고
    // 검토 필요로 표시해야 한다.
    expect(lines).toHaveLength(2);
    expect(lines[0]!.chordEvents[0]!.needsReview).toBe(true);
    expect(lines[1]!.chordEvents[0]!.needsReview).toBe(true);
    expect(lines[1]!.startBeat).toBe(4); // DEFAULT_BEATS_PER_LINE만큼만 밀림 — 16이 아니라.
  });
});
