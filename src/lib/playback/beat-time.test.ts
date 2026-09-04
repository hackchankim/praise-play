import { describe, expect, it } from "vitest";
import {
  beatsToTicks,
  positionStringToBeats,
  secondsPerTick,
  tickToAudioTime,
  ticksToBeats,
} from "@/lib/playback/beat-time";

const PPQ = 480;

describe("beatsToTicks / ticksToBeats", () => {
  it("정수 beat는 정확한 tick으로 변환되고 왕복 변환이 원래 값으로 돌아온다", () => {
    for (const beat of [0, 1, 2, 4, 8, 16.5]) {
      const ticks = beatsToTicks(beat, PPQ);
      expect(ticksToBeats(ticks, PPQ)).toBeCloseTo(beat, 6);
    }
  });

  it("셋잇단음표처럼 정수가 아닌 tick을 낳는 beat도 반올림으로 정수 tick이 된다", () => {
    // 1/3 beat * 480 = 160 (정수) — ppq=480은 3으로 나누어떨어져 셋잇단음표도 깨끗하게 떨어진다.
    expect(beatsToTicks(1 / 3, PPQ)).toBe(160);
    // 부동소수 오차로 정수에서 살짝 벗어난 값도 반올림으로 흡수된다.
    expect(beatsToTicks(1.9999999999, PPQ)).toBe(PPQ * 2);
  });
});

describe("positionStringToBeats", () => {
  it("1마디 1박(곡 맨 앞)은 절대 beat 0이다", () => {
    expect(positionStringToBeats("1:1", PPQ, 4)).toBe(0);
    expect(positionStringToBeats("1:1:0", PPQ, 4)).toBe(0);
  });

  it("마디 경계를 정확히 넘어간 위치가 절대 beat로 정확히 계산된다 (4/4 기준 2마디 1박 = beat 4)", () => {
    expect(positionStringToBeats("2:1", PPQ, 4)).toBe(4);
  });

  it("박자표가 다른 곡(3/4)도 beatsPerBar만 맞으면 동일하게 계산된다", () => {
    // 3/4에서 2마디 1박 = 1마디(3beat) + 0 = beat 3
    expect(positionStringToBeats("2:1", PPQ, 3)).toBe(3);
  });

  it("tick 성분이 있으면 소수 beat로 정확히 반영된다", () => {
    // 1마디 1박 + 240tick(=0.5beat, ppq=480) = beat 0.5
    expect(positionStringToBeats("1:1:240", PPQ, 4)).toBeCloseTo(0.5, 6);
  });

  it("beatsToTicks → position 문자열 형태 조합 → positionStringToBeats 왕복이 원래 beat를 복원한다", () => {
    // 실제 엔진에서 쓰는 것과 동일한 왕복: beat 6.5(4/4, 마디2의 3박째 절반)를 직접 문자열로 구성해 검증.
    const beat = 6.5; // bar 2(0-indexed 1), beat 3(0-indexed 2), tick 240
    const position = "2:3:240";
    expect(positionStringToBeats(position, PPQ, 4)).toBeCloseTo(beat, 6);
  });
});

describe("secondsPerTick / tickToAudioTime", () => {
  it("bpm 120, ppq 480에서 1tick은 1/960초다", () => {
    expect(secondsPerTick(120, PPQ)).toBeCloseTo(1 / 960, 9);
  });

  it("기준점과 같은 tick을 물으면 기준 시각을 그대로 돌려준다", () => {
    const reference = { audioTime: 10, tick: 1920 };
    expect(tickToAudioTime(reference, 1920, 120, PPQ)).toBe(10);
  });

  it("기준점보다 정확히 1마디(4beat) 뒤의 tick은 bpm 기준 정확한 초 뒤다", () => {
    const bpm = 120;
    const reference = { audioTime: 10, tick: 0 };
    const oneBarLaterTick = beatsToTicks(4, PPQ);
    // 120bpm = 0.5초/beat → 4beat = 2초
    expect(tickToAudioTime(reference, oneBarLaterTick, bpm, PPQ)).toBeCloseTo(12, 6);
  });

  it("기준점보다 과거의 tick을 물으면 기준 시각보다 앞선 시각을 반환한다", () => {
    const reference = { audioTime: 10, tick: beatsToTicks(4, PPQ) };
    expect(tickToAudioTime(reference, 0, 120, PPQ)).toBeCloseTo(8, 6);
  });
});
