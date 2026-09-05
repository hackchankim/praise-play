import { describe, expect, it } from "vitest";
import { estimateBeatOffset } from "./beat-offset";

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
});
