import { describe, expect, it } from "vitest";
import {
  addChord,
  collectReviewTargets,
  reorganizeIntoMeasures,
  updateChord,
  updateLineLyrics,
  type EditableSection,
} from "./correction-types";

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
        lyrics: "내모든 삶의 행동 주안",
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

describe("updateLineLyrics — 줄(보통 마디 하나)의 가사를 자유 텍스트로 고친다 (Task 032 3단계)", () => {
  it("줄의 lyrics를 지정한 값으로 통째로 바꾼다", () => {
    const section = buildSection();
    const result = updateLineLyrics(section, "l1", "내 모든 삶의 행동 주 안에");
    expect(result.lines[0]!.lyrics).toBe("내 모든 삶의 행동 주 안에");
    // 코드는 건드리지 않는다.
    expect(result.lines[0]!.chordEvents).toEqual(section.lines[0]!.chordEvents);
  });

  it("존재하지 않는 줄 uiKey는 아무것도 바꾸지 않는다", () => {
    const section = buildSection();
    const result = updateLineLyrics(section, "nope", "x");
    expect(result).toEqual(section);
  });
});

describe("addChord — 줄에 새 코드를 추가한다 (Task 032 3단계)", () => {
  it("기본 코드 C를 beatOffset 0으로 추가한다 — 추가 직후 사용자가 직접 편집한다", () => {
    const section = buildSection();
    const result = addChord(section, "l1");
    const chords = result.lines[0]!.chordEvents;
    expect(chords).toHaveLength(2);
    const added = chords[1]!;
    expect(added.chord).toBe("C");
    expect(added.beatOffset).toBe(0);
    expect(added.needsReview).toBe(false);
  });

  it("존재하지 않는 줄 uiKey는 아무것도 바꾸지 않는다", () => {
    const section = buildSection();
    const result = addChord(section, "nope");
    expect(result).toEqual(section);
  });
});

describe("updateChord — 코드 기호·박자·검토 필요 여부를 직접 편집한다 (Task 032 3단계)", () => {
  // charOffset 기반 드래그 동기화(estimateBeatOffset)는 Task 032 3단계로 완전히 제거했다 —
  // 코드 위치(beatOffset)는 이제 사용자가 이 함수를 통해 숫자로 직접 지정한다.
  it("beatOffset을 직접 지정하면 그 값을 그대로 쓴다", () => {
    const section = buildSection();
    const result = updateChord(section, "l1", "c1", { beatOffset: 2.5 });
    expect(result.lines[0]!.chordEvents[0]!.beatOffset).toBe(2.5);
  });

  it("코드 기호와 검토 필요 여부를 함께 바꿀 수 있다", () => {
    const section = buildSection();
    const result = updateChord(section, "l1", "c1", { chord: "G", needsReview: true });
    const chord = result.lines[0]!.chordEvents[0]!;
    expect(chord.chord).toBe("G");
    expect(chord.needsReview).toBe(true);
  });

  it("존재하지 않는 코드 uiKey는 아무것도 바꾸지 않는다", () => {
    const section = buildSection();
    const result = updateChord(section, "l1", "nope", { chord: "G" });
    expect(result).toEqual(section);
  });
});

describe("collectReviewTargets — needsReview인 코드를 모두 검토 대상으로 모은다 (Task 032 3단계)", () => {
  // 코드 칩은 이제 항상 화면에 그려지므로(칸 충돌로 숨겨질 여지가 없다) 칸 배정 여부를 따로
  // 확인할 필요가 없다 — needsReview 플래그만 보면 된다.
  it("needsReview인 코드를 전부 대상으로 포함한다", () => {
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
          lyrics: "가사",
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            { uiKey: "c0", chord: "C", charOffset: 0, beatOffset: 0, needsReview: true },
            { uiKey: "c1", chord: "G", charOffset: 0, beatOffset: 2, needsReview: false },
          ],
        },
      ],
    };
    const targets = collectReviewTargets([section]);
    expect(targets.map((t) => t.chordUiKey)).toEqual(["c0"]);
  });

  it("needsReview인 코드가 없으면 빈 배열을 반환한다", () => {
    const section = buildSection();
    expect(collectReviewTargets([section])).toEqual([]);
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

  it("charOffset이 실제 가사와 무관하게 낡아 있어도(Task 032 3단계 이후 charOffset은 더 이상 유지되지 않는다) 버킷 개수만큼 균등하게 나눈다", () => {
    // 회귀 테스트(code review 지적, 실측 재현) — updateLineLyrics(자유 텍스트 편집)는 charOffset을
    // 갱신하지 않으므로, 사용자가 재구성 전에 가사를 완전히 새로 고치면 코드들의 charOffset은
    // 새 텍스트와 전혀 무관한 값으로 남는다. 그 낡은 값을 텍스트 자르는 기준으로 쓰면 안 된다.
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
          lyrics: "ABCDEFGHIJKLMNOP", // 16자, 4마디로 쪼개질 예정
          orderIndex: 0,
          startBeat: 0,
          chordEvents: [
            // charOffset이 전부 0(또는 서로 같은 값)으로 낡아 있다 — 실제 가사 내용과 무관.
            { uiKey: "c0", chord: "C", charOffset: 0, beatOffset: 0, needsReview: false },
            { uiKey: "c1", chord: "G", charOffset: 0, beatOffset: 4, needsReview: false },
            { uiKey: "c2", chord: "Am", charOffset: 0, beatOffset: 8, needsReview: false },
            { uiKey: "c3", chord: "F", charOffset: 0, beatOffset: 12, needsReview: false },
          ],
        },
      ],
    };
    const result = reorganizeIntoMeasures([section], "4/4", 1);
    // charOffset이 전부 0이었다면 예전 방식(charOffset 기준 자르기)으로는 모든 텍스트가 첫
    // 버킷에 쏠렸을 것이다 — 이제는 버킷 개수(4)로 균등 분할해야 한다.
    expect(result[0]!.lines.map((l) => l.lyrics)).toEqual(["ABCD", "EFGH", "IJKL", "MNOP"]);
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
