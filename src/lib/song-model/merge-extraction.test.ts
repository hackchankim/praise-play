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

/** 텍스트 추출이 줄 하나짜리인 테스트용 구조 추출 결과 — lines 배열 길이가 1이어야 신뢰된다. */
function structureResult(beatsInLine: number, chordBeats?: number[]): StructureExtractionResult {
  return {
    tempo: 100,
    timeSignature: "4/4",
    lines: [{ beatsInLine, chordBeats }],
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

    const result = mergeExtractionResults(text, text, primary, secondary);
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

    const result = mergeExtractionResults(text, text, primary, secondary);
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

    const result = mergeExtractionResults(text, text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.every((c) => c.needsReview)).toBe(true);
  });

  it("그리드 스냅으로 서로 다른 코드 두 개가 같은 값에 겹치면(예: 2.1과 2.2 모두 2.0으로 스냅) 신뢰하지 않고 needsReview를 세운다", () => {
    // primary/secondary 모두 [2.1, 2.2]로 self-consistent하지만, 반박 그리드로 스냅하면 두
    // 코드 모두 2.0이 되어 서로 다른 코드였다는 정보가 사라진다 — 이대로 통과시키면 두 코드가
    // 화면에서 같은 칸을 두고 겹친다(code review 지적).
    const text = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
    ]);
    const primary = structureResult(8, [2.1, 2.2]);
    const secondary = structureResult(8, [2.1, 2.2]);

    const result = mergeExtractionResults(text, text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.every((c) => c.needsReview)).toBe(true);
  });

  it("chordBeats가 beatsInLine이 그리드에 안 맞아도(예: 4.3) clamp 후 값은 항상 그리드에 남는다", () => {
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(4.3, [5]);
    const secondary = structureResult(4.3, [5]);

    const result = mergeExtractionResults(text, text, primary, secondary);
    expect(result.sections[0]!.lines[0]!.chordEvents[0]!.beatOffset).toBe(4.5);
  });

  it("chordBeats가 아예 없으면(구조 추출이 이 기능을 답하지 않음) 글자 비례 추정으로 되돌아가고 needsReview를 세운다", () => {
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(8);
    const secondary = structureResult(8);

    const result = mergeExtractionResults(text, text, primary, secondary);
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
    // 텍스트 추출 전체 줄 수(2)와 정확히 같은 길이의 평평한 배열 — 0번째가 첫 줄, 1번째가 둘째 줄.
    const structure = (): StructureExtractionResult => ({
      tempo: 100,
      timeSignature: "4/4",
      lines: [{ beatsInLine: 4 }, { beatsInLine: 4, chordBeats: [1] }],
    });

    const result = mergeExtractionResults(text, text, structure(), structure());
    const lines = result.sections[0]!.lines;
    expect(lines[0]!.chordEvents).toHaveLength(0);
    // 코드 없는 줄도 자기 beatsInLine(4)만큼은 박자 커서를 밀어야 다음 줄이 올바른 위치에서 시작한다.
    expect(lines[1]!.startBeat).toBe(4);
    expect(lines[1]!.chordEvents[0]!.beatOffset).toBe(1);
    expect(lines[1]!.chordEvents[0]!.needsReview).toBe(false);
  });

  it("원값은 다르지만 반박(0.5) 그리드로 스냅하면 같은 위치면 일치로 보고 스냅된 값을 쓴다", () => {
    // 2.43과 2.61은 원값 자체는 다르지만 둘 다 그리드 위치 2.5를 말한 것으로 봐야 한다.
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(8, [2.43]);
    const secondary = structureResult(8, [2.61]);

    const result = mergeExtractionResults(text, text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords[0]!.beatOffset).toBe(2.5);
    expect(chords[0]!.needsReview).toBe(false);
  });

  it("옛 오차범위(±0.5) 안에 들어도 그리드로 스냅했을 때 서로 다른 위치면 불일치로 본다", () => {
    // 2.1(→그리드 2.0)과 2.4(→그리드 2.5)는 원값 차이(0.3)로는 옛 오차범위를 통과했지만,
    // 실제로는 정박과 반박이라는 서로 다른 결정이므로 이제는 불일치로 봐야 한다.
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(8, [2.1]);
    const secondary = structureResult(8, [2.4]);

    const result = mergeExtractionResults(text, text, primary, secondary);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords[0]!.needsReview).toBe(true);
  });

  it("chordBeats 값이 beatsInLine을 넘으면 그 줄의 박자 폭 안으로 자른다", () => {
    const text = textResult([{ chord: "G", charOffset: 0 }]);
    const primary = structureResult(4, [99]);
    const secondary = structureResult(4, [99]);

    const result = mergeExtractionResults(text, text, primary, secondary);
    expect(result.sections[0]!.lines[0]!.chordEvents[0]!.beatOffset).toBe(4);
  });
});

describe("mergeExtractionResults — 전역 줄 인덱스가 구획 경계를 가로질러 대응된다 (Task 032)", () => {
  it("텍스트 추출이 여러 구획으로 나눠도, 구조 추출의 평평한 lines 배열은 구획을 가로지르는 순서로 대응된다", () => {
    // 구조 추출은 더 이상 구획을 스스로 나누지 않으므로, 텍스트 추출이 몇 개 구획으로 나눴든
    // 상관없이 "전체에서 몇 번째 줄인가"라는 전역 인덱스 하나로만 대응돼야 한다.
    const text: TextExtractionResult = {
      key: "G",
      sections: [
        { type: "verse", lines: [{ lyrics: "aaaa", chords: [{ chord: "G", charOffset: 0 }] }] },
        { type: "chorus", lines: [{ lyrics: "bbbb", chords: [{ chord: "C", charOffset: 0 }] }] },
      ],
    };
    const structure: StructureExtractionResult = {
      tempo: 100,
      timeSignature: "4/4",
      // 0번째 = 1절(verse)의 줄, 1번째 = 후렴(chorus)의 줄 — 구획 경계와 무관하게 순서만 맞으면 된다.
      lines: [
        { beatsInLine: 4, chordBeats: [1] },
        { beatsInLine: 4, chordBeats: [2] },
      ],
    };

    const result = mergeExtractionResults(text, text, structure, structure);
    expect(result.sections[0]!.lines[0]!.chordEvents[0]!.beatOffset).toBe(1);
    expect(result.sections[0]!.lines[0]!.chordEvents[0]!.needsReview).toBe(false);
    expect(result.sections[1]!.lines[0]!.chordEvents[0]!.beatOffset).toBe(2);
    expect(result.sections[1]!.lines[0]!.chordEvents[0]!.needsReview).toBe(false);
  });
});

describe("mergeExtractionResults — 구조 추출이 주어진 줄 목록과 다른 개수로 답한 경우 (Task 032)", () => {
  it("구조 추출 결과의 lines 배열 길이가 텍스트 추출 전체 줄 수와 다르면(줄을 합치거나 빠뜨림) 두 호출이 서로 일치해도 통째로 신뢰하지 않는다", () => {
    // 구조 추출은 이제 텍스트 추출이 확정한 줄 목록을 고정 입력으로 받으므로 정상적으로는 이런
    // 일이 드물어야 하지만(Task 032의 핵심 동기), 모델이 그래도 지시를 어기고 줄을 합칠 가능성
    // 자체는 남아있다 — 그 경우를 안전하게 처리하는지 확인하는 회귀 테스트.
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
    // 구조 추출 두 호출 다 이 두 줄을 (지시를 어기고) 한 줄로 합쳐버렸다 — 서로는 완전히 일치.
    const misalignedStructure = (): StructureExtractionResult => ({
      tempo: 100,
      timeSignature: "4/4",
      lines: [{ beatsInLine: 16, chordBeats: [0] }],
    });

    const result = mergeExtractionResults(text, text, misalignedStructure(), misalignedStructure());
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

describe("mergeExtractionResults — charOffset(가사 글자 위치) self-consistency", () => {
  it("두 텍스트 추출 호출의 charOffset이 정확히 일치하면 needsReview를 세우지 않는다", () => {
    const primary = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
    ]);
    const secondary = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
    ]);
    const structure = structureResult(8, [0, 4]);

    const result = mergeExtractionResults(primary, secondary, structure, structure);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.every((c) => !c.needsReview)).toBe(true);
    // charOffset은 여전히 primary(첫 번째 인자) 기준이다.
    expect(chords.map((c) => c.charOffset)).toEqual([0, 5]);
  });

  it("두 텍스트 추출 호출의 charOffset이 하나라도 어긋나면 needsReview를 세우되 primary의 charOffset은 그대로 쓴다", () => {
    // beatOffset(chordBeats)은 정확한데 charOffset(어느 글자에 붙는지)만 픽셀 눈대중이라
    // 어긋나는 실제 사례(실사용 피드백)를 재현한다 — 대체할 안전한 추정치가 없으므로 값 자체는
    // 그대로 두고 검토 필요만 세운다.
    const primary = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
    ]);
    const secondary = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 8 }, // primary와 3글자 어긋남
    ]);
    const structure = structureResult(8, [0, 4]);

    const result = mergeExtractionResults(primary, secondary, structure, structure);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.every((c) => c.needsReview)).toBe(true);
    expect(chords.map((c) => c.charOffset)).toEqual([0, 5]);
  });

  it("두 텍스트 추출 호출의 코드 개수가 다르면 확인 불가로 보고 needsReview를 세운다", () => {
    const primary = textResult([
      { chord: "G", charOffset: 0 },
      { chord: "C", charOffset: 5 },
    ]);
    const secondary = textResult([{ chord: "G", charOffset: 0 }]); // 코드 1개뿐
    const structure = structureResult(8, [0, 4]);

    const result = mergeExtractionResults(primary, secondary, structure, structure);
    const chords = result.sections[0]!.lines[0]!.chordEvents;
    expect(chords.every((c) => c.needsReview)).toBe(true);
  });

  it("두 텍스트 추출 호출끼리 구획의 줄 개수가 다르면 그 구획을 통째로 확인 불가로 보되 다른 줄은 멀쩡히 처리된다", () => {
    const primary: TextExtractionResult = {
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
    // secondary가 이 구획을 한 줄로 합쳐버렸다 — sectionIndex:lineIndex 키가 서로 다른 물리적
    // 줄을 가리키게 되므로 그 구획은 통째로 신뢰하지 않는다(텍스트 추출 두 호출 사이의 문제라
    // 구조 추출 쪽 Task 032 변경과는 무관 — buildCharOffsetConfirmedLines 주석 참고).
    const secondary: TextExtractionResult = {
      key: "G",
      sections: [
        { type: "verse", lines: [{ lyrics: "aaaabbbb", chords: [{ chord: "G", charOffset: 0 }] }] },
      ],
    };
    // primary(=textPrimary)와 전체 줄 개수(2)가 같은 구조 추출 결과를 준다 — 이 테스트가
    // 확인하려는 건 구조 추출과의 불일치가 아니라 텍스트 추출 두 호출끼리의 구획 불일치이므로,
    // 구조 쪽 needsReview 원인이 섞이지 않게 한다.
    const structure: StructureExtractionResult = {
      tempo: 100,
      timeSignature: "4/4",
      lines: [
        { beatsInLine: 4, chordBeats: [0] },
        { beatsInLine: 4, chordBeats: [0] },
      ],
    };

    const result = mergeExtractionResults(primary, secondary, structure, structure);
    const lines = result.sections[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]!.chordEvents[0]!.needsReview).toBe(true);
    expect(lines[1]!.chordEvents[0]!.needsReview).toBe(true);
  });
});
