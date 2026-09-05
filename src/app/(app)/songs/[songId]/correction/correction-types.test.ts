import { describe, expect, it } from "vitest";
import {
  addChordAtCell,
  collectReviewTargets,
  computeLineBeatsSpans,
  deriveCells,
  lineBeatsSpan,
  reorganizeIntoMeasures,
  updateCellText,
  updateChord,
  type EditableLine,
  type EditableSection,
} from "./correction-types";

// ROADMAP 테스트 체크리스트: "코드 칩을 드래그로 이동하면 char_offset과 beat_offset이 함께
// 갱신되는가". 실제 드래그(dnd-kit의 전역 포인터 센서가 얽혀 있어 합성 포인터 이벤트로 안정적
// 재현이 어려움)를 흉내내는 대신, 드래그가 최종적으로 호출하는 순수 함수(updateChord)를 직접
// 검증한다 — UI가 어떻게 그리든 이 함수가 옳으면 동기화는 옳다.
function buildSection(): EditableSection {
  return {
    clientKey: "s1",
    id: "s1",
    type: "verse",
    lengthBeats: 24,
    repeatTarget: null,
    lines: [
      {
        uiKey: "l1",
        id: "l1",
        lyrics: "0123456789", // 10자
        orderIndex: 0,
        startBeat: 0,
        chordEvents: [
          { uiKey: "c1", id: "c1", chord: "C", charOffset: 0, beatOffset: 0, needsReview: false },
        ],
      },
      {
        uiKey: "l2",
        id: "l2",
        lyrics: "abcde",
        orderIndex: 1,
        startBeat: 12,
        chordEvents: [],
      },
    ],
  };
}

describe("updateChord — 드래그 시 charOffset/beatOffset 동기화", () => {
  it("charOffset만 바뀌면(드래그) beatOffset을 줄 박자 폭 비례로 다시 계산한다", () => {
    // l1의 박자 폭은 l2.startBeat(12) - l1.startBeat(0) = 12. 가사 10자 중 5번째 위치(절반)로
    // 옮기면 beatOffset은 12 * 0.5 = 6이어야 한다.
    const section = buildSection();
    const result = updateChord(section, "l1", "c1", { charOffset: 5 });
    const chord = result.lines[0]!.chordEvents[0]!;
    expect(chord.charOffset).toBe(5);
    expect(chord.beatOffset).toBe(6);
  });

  it("charOffset과 beatOffset을 함께 지정하면(수동 입력) 준 값을 그대로 쓰고 자동 계산하지 않는다", () => {
    const section = buildSection();
    const result = updateChord(section, "l1", "c1", { charOffset: 5, beatOffset: 99 });
    const chord = result.lines[0]!.chordEvents[0]!;
    expect(chord.charOffset).toBe(5);
    expect(chord.beatOffset).toBe(99);
  });

  it("beatOffset만 수동으로 바꾸면 charOffset은 그대로고 동기화 계산도 타지 않는다", () => {
    const section = buildSection();
    const result = updateChord(section, "l1", "c1", { beatOffset: 3.5 });
    const chord = result.lines[0]!.chordEvents[0]!;
    expect(chord.charOffset).toBe(0);
    expect(chord.beatOffset).toBe(3.5);
  });

  it("가사가 없는 줄에서 charOffset을 옮겨도 beatOffset이 0으로 계산된다(0-division 방지)", () => {
    const section: EditableSection = {
      ...buildSection(),
      lines: [
        {
          uiKey: "l1",
          lyrics: "",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c1", chord: "C", charOffset: 0, beatOffset: 0, needsReview: false },
          ],
        },
      ],
    };
    const result = updateChord(section, "l1", "c1", { charOffset: 0 });
    expect(result.lines[0]!.chordEvents[0]!.beatOffset).toBe(0);
  });
});

describe("reorganizeIntoMeasures — 줄을 마디 단위로 재구성", () => {
  function buildLongLineSection(): EditableSection {
    return {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 16,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCDEFGHIJKLMNOP", // 16자
          orderIndex: 0,
          startBeat: 100, // 임의의 값 — 0이 아니어도 절대 박자가 보존되는지 확인하기 위함
          chordEvents: [
            { uiKey: "c0", id: "c0", chord: "C", charOffset: 0, beatOffset: 0, needsReview: false },
            { uiKey: "c1", id: "c1", chord: "G", charOffset: 4, beatOffset: 4, needsReview: false },
            {
              uiKey: "c2",
              id: "c2",
              chord: "Am",
              charOffset: 8,
              beatOffset: 8,
              needsReview: false,
            },
            {
              uiKey: "c3",
              id: "c3",
              chord: "F",
              charOffset: 12,
              beatOffset: 12,
              needsReview: false,
            },
          ],
        },
      ],
    };
  }

  it("4/4에서 1마디씩(measuresPerLine=1) 코드 하나당 한 줄로 쪼갠다", () => {
    const result = reorganizeIntoMeasures([buildLongLineSection()], "4/4", 1);
    const lines = result[0]!.lines;
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.lyrics)).toEqual(["ABCD", "EFGH", "IJKL", "MNOP"]);
    // 각 줄의 코드는 그 줄 시작 기준 0박이 되어야 한다(줄이 코드 하나만 담으므로).
    expect(lines.map((l) => l.chordEvents[0]!.beatOffset)).toEqual([0, 0, 0, 0]);
    expect(lines.map((l) => l.chordEvents[0]!.charOffset)).toEqual([0, 0, 0, 0]);
  });

  it("절대 박자 위치(line.startBeat + chord.beatOffset)는 쪼개기 전후로 정확히 보존된다", () => {
    const before = buildLongLineSection();
    const beforeAbsolute = before.lines[0]!.chordEvents.map(
      (c) => before.lines[0]!.startBeat + c.beatOffset,
    );

    const result = reorganizeIntoMeasures([before], "4/4", 1);
    const afterAbsolute = result[0]!.lines.map((l) => l.startBeat + l.chordEvents[0]!.beatOffset);

    expect(afterAbsolute).toEqual(beforeAbsolute);
  });

  it("measuresPerLine=2면 2마디(8박)씩 묶어 절반 길이로만 쪼갠다", () => {
    const result = reorganizeIntoMeasures([buildLongLineSection()], "4/4", 2);
    const lines = result[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.lyrics)).toEqual(["ABCDEFGH", "IJKLMNOP"]);
    expect(lines[0]!.chordEvents.map((c) => c.beatOffset)).toEqual([0, 4]);
    expect(lines[1]!.chordEvents.map((c) => c.beatOffset)).toEqual([0, 4]);
  });

  it("이미 measuresPerLine 이하로 짧은 줄은 진짜 no-op이다(같은 줄 객체를 그대로 재사용)", () => {
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "hello",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c0", chord: "C", charOffset: 0, beatOffset: 0, needsReview: false },
            { uiKey: "c1", chord: "G", charOffset: 3, beatOffset: 2, needsReview: false },
          ],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    expect(result[0]!.lines).toHaveLength(1);
    // 회귀 테스트: code review 지적 — 예전엔 no-op 케이스도 매번 새 uiKey를 발급하고 id를
    // undefined로 지워서, 저장 시 이 줄이 삭제·재생성된 것처럼 취급됐다(DB 식별자 churn).
    // 이제는 원래 id/uiKey를 그대로 유지한다.
    expect(result[0]!.lines[0]!.id).toBe("l1");
    expect(result[0]!.lines[0]!.uiKey).toBe("l1");
    expect(result[0]!.lines[0]).toEqual(section.lines[0]);
  });

  it("첫 코드가 마디 첫 박이 아니어도(픽업 음) no-op 줄의 시작박자는 옮기지 않는다", () => {
    // 회귀 테스트: code review 지적 — 예전엔 no-op 케이스에서도 startBeat을 "첫 코드의
    // beatOffset"만큼 옮겨(예: 픽업 음이 0.5박에 있으면 줄 시작이 0.5박 밀림) 불필요하게
    // 줄 경계가 바뀌었다. 이제는 버킷이 하나뿐이면 줄 자체를 그대로 재사용하므로 이런 이동이
    // 구조적으로 일어날 수 없다.
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "pickup",
          orderIndex: 0,
          startBeat: 10,
          chordEvents: [
            { uiKey: "c0", chord: "C", charOffset: 0, beatOffset: 0.5, needsReview: false },
          ],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    expect(result[0]!.lines[0]!.startBeat).toBe(10);
    expect(result[0]!.lines[0]!.chordEvents[0]!.beatOffset).toBe(0.5);
  });

  it("코드가 charOffset 순서와 beatOffset 순서가 어긋나 있어도 재배치 후 음수 beatOffset이 나오지 않는다", () => {
    // 회귀 테스트: code review 지적 — 예전엔 그룹의 "글자 위치가 가장 이른 코드"를 기준으로
    // beatOffset을 재배치해서, 그 코드의 beatOffset이 그룹 내 최솟값이 아니면(자유 입력으로
    // 순서가 어긋난 경우) 다른 코드가 음수 beatOffset을 받을 수 있었다. 이제는 항상 마디
    // 그리드(bucketIndex*beatsPerLine) 기준이라 그 버킷에 속한 어떤 코드도 음수가 될 수 없다.
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 8,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "0123456789",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            // cA/cB는 같은 버킷(0)에 속하지만 charOffset 순서(A가 먼저)와 beatOffset 순서(B가
            // 먼저)가 서로 어긋나 있다 — 자유 입력으로 순서가 뒤섞인 상태를 흉내낸다. cC는 다음
            // 버킷(1)에 둬서 실제로 분할 경로(no-op이 아닌)를 타게 한다.
            { uiKey: "cA", chord: "A", charOffset: 0, beatOffset: 3.9, needsReview: false },
            { uiKey: "cB", chord: "B", charOffset: 3, beatOffset: 0.1, needsReview: false },
            { uiKey: "cC", chord: "C", charOffset: 6, beatOffset: 4.5, needsReview: false },
          ],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    for (const line of result[0]!.lines) {
      for (const chord of line.chordEvents) {
        expect(chord.beatOffset).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("코드가 하나도 없는 줄은 쪼갤 기준이 없으므로 그대로 둔다", () => {
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "interlude",
      lengthBeats: 16,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    expect(result[0]!.lines).toEqual(section.lines);
  });
});

describe("deriveCells — 줄을 박자 칸으로 나눈다", () => {
  it("코드가 정수 박에 정확히 있으면 그 칸에 배정되고, 텍스트는 코드 위치 기준으로 잘린다", () => {
    const line: EditableLine = {
      uiKey: "l1",
      lyrics: "존귀하신주이름",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [
        { uiKey: "c0", chord: "G", charOffset: 0, beatOffset: 0, needsReview: false },
        { uiKey: "c1", chord: "C", charOffset: 4, beatOffset: 2, needsReview: false },
      ],
    };
    const cells = deriveCells(line, 4);
    expect(cells).toHaveLength(4);
    // 코드가 있는 칸은 정확히 그 코드의 charOffset에서 시작한다.
    expect(cells[0]!.chordUiKey).toBe("c0");
    expect(cells[0]!.text.startsWith("존")).toBe(true);
    expect(cells[2]!.chordUiKey).toBe("c1");
    expect(cells[2]!.text.startsWith("주")).toBe(true);
    // 코드 없는 칸(1, 3)은 이웃 경계 사이를 균등 분할한 텍스트를 가진다.
    expect(cells[1]!.chordUiKey).toBeNull();
    expect(cells[3]!.chordUiKey).toBeNull();
    // 칸들을 이어붙이면 원래 가사와 정확히 같아야 한다(글자가 빠지거나 겹치지 않음).
    expect(cells.map((c) => c.text).join("")).toBe(line.lyrics);
  });

  it("같은 칸에 코드가 두 개 몰리면 beatOffset이 더 이른 것만 배정한다", () => {
    const line: EditableLine = {
      uiKey: "l1",
      lyrics: "ab",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [
        { uiKey: "early", chord: "G", charOffset: 0, beatOffset: 0.9, needsReview: false },
        { uiKey: "late", chord: "C", charOffset: 1, beatOffset: 1.1, needsReview: false },
      ],
    };
    // 둘 다 반올림하면 1번 칸(beatOffset 0.9→1, 1.1→1)에 몰린다.
    const cells = deriveCells(line, 2);
    expect(cells[1]!.chordUiKey).toBe("early");
  });

  it("코드가 하나도 없으면 모든 칸이 비고 텍스트는 균등 분할된다", () => {
    const line: EditableLine = {
      uiKey: "l1",
      lyrics: "ABCDEFGH",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [],
    };
    const cells = deriveCells(line, 4);
    expect(cells.every((c) => c.chordUiKey === null)).toBe(true);
    expect(cells.map((c) => c.text).join("")).toBe(line.lyrics);
    expect(cells.map((c) => c.text)).toEqual(["AB", "CD", "EF", "GH"]);
  });
});

describe("updateCellText — 칸 하나의 가사를 고친다", () => {
  function buildCardSection(): EditableSection {
    return {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCDEFGH",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c0", chord: "G", charOffset: 0, beatOffset: 0, needsReview: false },
            { uiKey: "c1", chord: "C", charOffset: 4, beatOffset: 2, needsReview: false },
          ],
        },
      ],
    };
  }

  it("칸 텍스트를 바꾸면 줄 전체 가사가 다시 조립되고 뒤따르는 코드의 charOffset이 밀린다", () => {
    const section = buildCardSection();
    // 0번 칸("AB")을 훨씬 긴 텍스트로 바꾼다 — 이후 칸들의 글자 위치가 밀려야 한다.
    const result = updateCellText(section, "l1", 0, 4, "HELLO");
    const line = result.lines[0]!;
    expect(line.lyrics).toBe("HELLOCDEFGH");
    // c1은 원래 2번 칸("EF")에 배정돼 있었다 — 칸 배정 자체는 유지되고 charOffset만 새 위치로.
    const c1 = line.chordEvents.find((c) => c.uiKey === "c1")!;
    expect(c1.beatOffset).toBe(2); // 칸 기반 편집에서는 beatOffset(=칸 인덱스)이 바뀌지 않는다.
    const cellsAfter = deriveCells(line, 4);
    expect(cellsAfter[2]!.chordUiKey).toBe("c1");
  });

  it("존재하지 않는 줄/칸 인덱스는 아무것도 바꾸지 않는다", () => {
    const section = buildCardSection();
    const result = updateCellText(section, "nope", 0, 4, "x");
    expect(result).toEqual(section);
    const outOfRange = updateCellText(section, "l1", 99, 4, "x");
    expect(outOfRange.lines[0]!.lyrics).toBe(section.lines[0]!.lyrics);
  });
});

describe("addChordAtCell — 빈 칸에 새 코드를 만든다", () => {
  it("빈 칸에 코드를 만들면 charOffset은 그 칸 시작, beatOffset은 칸 인덱스다", () => {
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCDEFGH",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c0", chord: "G", charOffset: 0, beatOffset: 0, needsReview: false },
          ],
        },
      ],
    };
    const result = addChordAtCell(section, "l1", 2, 4);
    const line = result.lines[0]!;
    const newChord = line.chordEvents.find((c) => c.uiKey !== "c0")!;
    expect(newChord.beatOffset).toBe(2);
    expect(newChord.charOffset).toBe(4); // 2번 칸("EF")은 4번째 글자에서 시작
  });

  it("이미 코드가 있는 칸에는 새로 만들지 않는다", () => {
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCD",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c0", chord: "G", charOffset: 0, beatOffset: 0, needsReview: false },
          ],
        },
      ],
    };
    const result = addChordAtCell(section, "l1", 0, 4);
    expect(result.lines[0]!.chordEvents).toHaveLength(1);
  });
});

describe("computeLineBeatsSpans — 섹션 전체 줄의 박자 폭을 한 번에 계산한다", () => {
  it("lineBeatsSpan을 각 줄에 개별로 부른 결과와 동일하다", () => {
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 20,
      repeatTarget: null,
      lines: [
        { uiKey: "l1", lyrics: "a", orderIndex: 0, startBeat: 0, chordEvents: [] },
        { uiKey: "l2", lyrics: "b", orderIndex: 1, startBeat: 8, chordEvents: [] },
        { uiKey: "l3", lyrics: "c", orderIndex: 2, startBeat: 12, chordEvents: [] },
      ],
    };
    const spans = computeLineBeatsSpans(section);
    expect(spans.get("l1")).toBe(lineBeatsSpan(section, section.lines[0]!));
    expect(spans.get("l2")).toBe(lineBeatsSpan(section, section.lines[1]!));
    expect(spans.get("l3")).toBe(lineBeatsSpan(section, section.lines[2]!));
    expect([spans.get("l1"), spans.get("l2"), spans.get("l3")]).toEqual([8, 4, 8]);
  });
});

describe("reorganizeIntoMeasures — 뒤섞인 레거시 데이터에 대한 방어", () => {
  it("charOffset 순서가 3개 버킷에 걸쳐 beatOffset 순서와 완전히 어긋나 있어도 charOffset이 그 줄의 가사 길이를 넘지 않는다", () => {
    // 회귀 테스트: code review에서 실측 확인된 버그 — 예전엔 이런 입력에서 어느 줄의 코드
    // charOffset이 그 줄 가사 길이보다 훨씬 커진 채로(예: 10글자 줄에 charOffset 40) 그대로
    // 저장됐다.
    const lyrics = "0123456789".repeat(5); // 50자
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 16,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics,
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "cA", chord: "A", charOffset: 40, beatOffset: 0.5, needsReview: false },
            { uiKey: "cB", chord: "B", charOffset: 20, beatOffset: 4.5, needsReview: false },
            { uiKey: "cC", chord: "C", charOffset: 10, beatOffset: 8.5, needsReview: false },
          ],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    for (const line of result[0]!.lines) {
      for (const chord of line.chordEvents) {
        expect(chord.charOffset).toBeGreaterThanOrEqual(0);
        expect(chord.charOffset).toBeLessThanOrEqual(line.lyrics.length);
      }
    }
  });

  it("음수 beatOffset(레거시 데이터)이 섞여 있어도 결과 줄의 시작박자가 음수가 되지 않는다", () => {
    // 회귀 테스트: code review 지적 — 음수 beatOffset이 버킷 계산에서 음수 버킷(-1 등)으로
    // 이어져, 그 버킷의 그리드 시작(bucketIndex*beatsPerLine)이 음수가 되고 결과 줄의
    // startBeat까지 음수로 밀렸다.
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 16,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "0123456789",
          orderIndex: 0,
          startBeat: 10,
          chordEvents: [
            { uiKey: "c1", chord: "C", charOffset: 0, beatOffset: -0.5, needsReview: false },
            { uiKey: "c2", chord: "G", charOffset: 5, beatOffset: 4.5, needsReview: false },
          ],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    expect(result[0]!.lines[0]!.startBeat).toBe(10);
  });
});

describe("deriveCells — 뒤섞인 레거시 데이터에 대한 방어", () => {
  it("코드들의 charOffset 순서가 칸 순서와 어긋나 있어도 칸 경계는 항상 앞으로만 진행하고 글자가 사라지지 않는다", () => {
    // 회귀 테스트: code review에서 실측 확인된 버그 — 예전엔 뒤 칸(cA, 칸3)의 charOffset(0)이
    // 앞 칸(cB, 칸0)의 charOffset(3)보다 작으면 cB의 칸이 빈 문자열로 잘리고 그 자리 텍스트가
    // 엉뚱한 칸으로 넘어가면서, 칸을 다시 이어붙인 결과가 원래 가사보다 짧아졌다(글자 유실).
    const line: EditableLine = {
      uiKey: "l1",
      lyrics: "012345",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [
        { uiKey: "cB", chord: "B", charOffset: 3, beatOffset: 0, needsReview: false },
        { uiKey: "cA", chord: "A", charOffset: 0, beatOffset: 3, needsReview: false },
      ],
    };
    const cells = deriveCells(line, 4);
    expect(cells.map((c) => c.text).join("")).toBe(line.lyrics);
  });

  it("0번 칸의 코드가 charOffset 0보다 커도(코드 앞에 간주 가사가 있는 경우) 글자가 사라지지 않는다", () => {
    // reorganizeIntoMeasures가 실제로 "코드보다 앞선 가사"를 포함한 줄을 만들어낼 수 있다.
    // 0번 칸은 항상 0에서 시작한다고 취급하므로(아래 안정성 테스트 참고) 그 앞쪽 글자가
    // 0번 칸에 전부 몰리진 않을 수 있지만, 최소한 어딘가의 칸에는 남아 있어야 한다(유실 금지).
    const line: EditableLine = {
      uiKey: "l1",
      lyrics: "인트로텍스트존귀",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [{ uiKey: "c0", chord: "G", charOffset: 5, beatOffset: 0, needsReview: false }],
    };
    const cells = deriveCells(line, 4);
    expect(cells.map((c) => c.text).join("")).toBe(line.lyrics);
  });

  it("deriveCells → updateCellText → deriveCells를 반복해도(편집 없이) 칸 경계가 계속 흔들리지 않는다(안정성/idempotency)", () => {
    // 회귀 테스트: code review 두 번째 라운드에서 실측 확인된 버그 — 0번 칸에 배정된 코드의
    // "원래" charOffset(0보다 큼)을 따로 기억해뒀다가 다음 칸 경계를 보간하는 데 쓰면, 그
    // 값이 updateCellText가 되돌려 쓰는 값(0번 칸 시작 위치 0)과 달라 재파생할 때마다 결과가
    // 계속 바뀌었다 — 사용자가 전혀 안 건드린 칸까지 편집할 때마다 재배치되는 문제였다.
    // charOffset 순서가 칸 순서와도 어긋난(픽업 코드 + 순서 역전) 조합으로 검증한다.
    const initialLine: EditableLine = {
      uiKey: "l1",
      lyrics: "abcdefgh",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [
        { uiKey: "c0", chord: "G", charOffset: 5, beatOffset: 0, needsReview: false },
        { uiKey: "c2", chord: "C", charOffset: 2, beatOffset: 2, needsReview: false },
      ],
    };
    const cellCount = 4;

    const cellsBefore = deriveCells(initialLine, cellCount);
    // 아무 칸이나 "똑같은 값으로" 다시 써서 write-back 경로를 거치게 한다(사용자가 실제로는
    // 아무것도 안 바꾼 것과 같은 상황).
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 8,
      repeatTarget: null,
      lines: [initialLine],
    };
    const afterOneEdit = updateCellText(section, "l1", 1, cellCount, cellsBefore[1]!.text);
    const cellsAfterOne = deriveCells(afterOneEdit.lines[0]!, cellCount);

    const afterTwoEdits = updateCellText(afterOneEdit, "l1", 3, cellCount, cellsAfterOne[3]!.text);
    const cellsAfterTwo = deriveCells(afterTwoEdits.lines[0]!, cellCount);

    // 편집 내용이 실제로는 원래 텍스트와 같으므로(no-op 편집), 두 번째 파생 이후로는 칸 구성이
    // 더 이상 바뀌지 않아야 한다.
    expect(cellsAfterTwo.map((c) => c.text)).toEqual(cellsAfterOne.map((c) => c.text));
    expect(cellsAfterTwo.map((c) => c.chordUiKey)).toEqual(cellsAfterOne.map((c) => c.chordUiKey));
  });
});

describe("updateCellText — 칸 충돌로 밀려난(orphan) 코드에 대한 방어", () => {
  it("같은 칸에 몰려 배정되지 못한 코드의 charOffset이 새 가사 길이를 넘지 않도록 자른다", () => {
    // 회귀 테스트: code review에서 실측 확인된 버그 — 예전엔 orphan 코드의 charOffset을 전혀
    // 건드리지 않아, 칸 텍스트를 줄일 때마다 그 코드의 charOffset만 점점 범위 밖으로 벌어졌다.
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCDEFGHIJKL",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            // 둘 다 반올림하면 0번 칸에 몰린다 — early가 이기고 late는 orphan이 된다.
            { uiKey: "early", chord: "C", charOffset: 10, beatOffset: 0.1, needsReview: false },
            { uiKey: "late", chord: "G", charOffset: 11, beatOffset: 0.2, needsReview: false },
          ],
        },
      ],
    };
    const result = updateCellText(section, "l1", 0, 4, "X");
    const line = result.lines[0]!;
    const late = line.chordEvents.find((c) => c.uiKey === "late")!;
    expect(late.charOffset).toBeLessThanOrEqual(line.lyrics.length);
  });
});

describe("collectReviewTargets — 칸에 배정되지 못한(orphan) 코드는 검토 대상에서 제외한다", () => {
  it("같은 칸에 몰려 화면에 보이지 않는 코드는 needsReview여도 검토 대상에 포함되지 않는다", () => {
    // 회귀 테스트: code review 지적 — orphan 코드는 어떤 칩으로도 그려지지 않아
    // registerChordNode가 호출되지 않으므로, "다음 검토 항목"이 이 코드를 가리키면 스크롤·
    // 강조가 조용히 아무 일도 하지 않는다. 애초에 화면에서 도달 가능한 코드만 세야 한다.
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCD",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "early", chord: "C", charOffset: 0, beatOffset: 0.1, needsReview: false },
            // 둘 다 0번 칸으로 반올림된다 — late는 orphan이 되어 화면에 보이지 않는다.
            { uiKey: "late", chord: "G", charOffset: 1, beatOffset: 0.2, needsReview: true },
          ],
        },
      ],
    };
    const targets = collectReviewTargets([section]);
    expect(targets.some((t) => t.chordUiKey === "late")).toBe(false);
  });

  it("칸에 실제로 배정된 코드는 needsReview면 그대로 검토 대상에 포함된다", () => {
    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [
        {
          uiKey: "l1",
          id: "l1",
          lyrics: "ABCD",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c0", chord: "C", charOffset: 0, beatOffset: 0, needsReview: true },
          ],
        },
      ],
    };
    const targets = collectReviewTargets([section]);
    expect(targets.some((t) => t.chordUiKey === "c0")).toBe(true);
  });
});

describe("deriveCells — 줄 가사 길이를 넘는 charOffset(레거시 데이터)에 대한 방어", () => {
  it("중간 칸 코드의 charOffset이 가사 길이보다 훨씬 커도 글자가 사라지지 않고, 되돌려 쓴 charOffset도 가사 길이를 넘지 않는다", () => {
    // 회귀 테스트: code review에서 실측 확인된 버그 — toEditableSections는 로드 시 charOffset을
    // 가사 길이 안으로 검증·클램프하지 않는다. 중간 칸 코드의 charOffset이 비정상적으로 크면
    // (예: 10글자 줄에 200) 그 칸이 뒤 칸들의 텍스트까지 통째로 삼켜버렸다.
    const line: EditableLine = {
      uiKey: "l1",
      lyrics: "0123456789",
      orderIndex: 0,
      startBeat: 0,
      chordEvents: [
        { uiKey: "c0", chord: "A", charOffset: 0, beatOffset: 0, needsReview: false },
        { uiKey: "c1", chord: "B", charOffset: 200, beatOffset: 1, needsReview: false },
        { uiKey: "c2", chord: "C", charOffset: 5, beatOffset: 2, needsReview: false },
      ],
    };
    const cells = deriveCells(line, 4);
    expect(cells.map((c) => c.text).join("")).toBe(line.lyrics);

    const section: EditableSection = {
      clientKey: "s1",
      id: "s1",
      type: "verse",
      lengthBeats: 4,
      repeatTarget: null,
      lines: [line],
    };
    // 아무 칸이나 같은 값으로 다시 써서(write-back) 코드들의 charOffset이 실제로 어떻게
    // 저장되는지 확인한다.
    const result = updateCellText(section, "l1", 0, 4, cells[0]!.text);
    for (const chord of result.lines[0]!.chordEvents) {
      expect(chord.charOffset).toBeLessThanOrEqual(result.lines[0]!.lyrics.length);
    }
  });
});
