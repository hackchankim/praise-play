import { describe, expect, it } from "vitest";
import { updateChord, type EditableSection } from "./correction-types";

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
