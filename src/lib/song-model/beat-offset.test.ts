import { describe, expect, it } from "vitest";
import { estimateBeatOffset, quantizeToHalfBeat } from "./beat-offset";

describe("estimateBeatOffset", () => {
  it("가사 길이에 비례해 박자를 추정한다", () => {
    expect(estimateBeatOffset(5, 10, 8, 0, 1)).toBe(4);
  });

  it("charOffset이 lyricsLength를 넘으면 1(=beatsInLine)로 클램프한다", () => {
    expect(estimateBeatOffset(20, 10, 8, 0, 1)).toBe(8);
  });

  it("가사가 없으면 코드 순번을 균등 분배한다", () => {
    expect(estimateBeatOffset(0, 0, 8, 1, 4)).toBe(2);
  });

  it("가사도 없고 코드도 하나뿐이면 0을 반환한다", () => {
    expect(estimateBeatOffset(0, 0, 8, 0, 1)).toBe(0);
  });

  it("비례 계산 결과가 그리드에 안 맞으면 가장 가까운 반박(0.5) 단위로 반올림한다", () => {
    // 4/28 * 4 = 0.5714... → 실제 음악에 없는 위치라 가장 가까운 반박(0.5)으로 스냅해야 한다.
    expect(estimateBeatOffset(4, 28, 4, 0, 1)).toBe(0.5);
    // 16/28 * 4 = 2.2857... → 2.5로 스냅(2.0보다 2.5에 더 가깝다).
    expect(estimateBeatOffset(16, 28, 4, 0, 1)).toBe(2.5);
  });
});

describe("quantizeToHalfBeat", () => {
  it("가장 가까운 0.5 단위로 반올림한다", () => {
    expect(quantizeToHalfBeat(0.57)).toBe(0.5);
    expect(quantizeToHalfBeat(1.43)).toBe(1.5);
    expect(quantizeToHalfBeat(1.86)).toBe(2);
    expect(quantizeToHalfBeat(2)).toBe(2);
  });
});
