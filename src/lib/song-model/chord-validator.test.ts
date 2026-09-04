import { describe, expect, it } from "vitest";
import { normalizeChordNotation, validateChord } from "./chord-validator";

// ROADMAP 테스트 체크리스트: "유효 코드 50종 / 무효 코드 20종에 대한 검증 결과가 기대와 일치하는가"
const VALID_CHORDS = [
  "C",
  "D",
  "E",
  "F",
  "G",
  "A",
  "B",
  "C#",
  "Db",
  "D#",
  "Eb",
  "F#",
  "Gb",
  "G#",
  "Ab",
  "A#",
  "Bb",
  "Cm",
  "Dm",
  "Em",
  "Fm",
  "Gm",
  "Am",
  "Bm",
  "Cmaj7",
  "Dmaj7",
  "Emaj7",
  "Fmaj7",
  "Gmaj7",
  "Cm7",
  "Dm7",
  "Em7",
  "Am7",
  "C7",
  "D7",
  "E7",
  "G7",
  "Csus2",
  "Dsus4",
  "Gsus4",
  "Cdim",
  "Ddim7",
  "F#dim",
  "Caug",
  "Gaug",
  "Cadd9",
  "Dadd9",
  "C6",
  "D9",
  "G/B",
];

const INVALID_CHORDS = [
  "H",
  "Cx",
  "C##",
  "1",
  "",
  "C/H",
  "Cmajor7",
  "c",
  "C-7",
  "Csuss4",
  "Cdimb5",
  "C7sus4",
  "CmM7",
  "C/db",
  "Xm7",
  "C++",
  "Csus",
  "C7add9",
  "Chord",
  "C/1",
];

describe("validateChord", () => {
  it("가지고 있는 유효 코드 목록이 정확히 50종인가(테스트 자체의 전제 확인)", () => {
    expect(VALID_CHORDS).toHaveLength(50);
  });

  it("가지고 있는 무효 코드 목록이 정확히 20종인가(테스트 자체의 전제 확인)", () => {
    expect(INVALID_CHORDS).toHaveLength(20);
  });

  it.each(VALID_CHORDS)("%s는 문법·Tonal 파싱을 모두 통과한다", (chord) => {
    const result = validateChord(chord, "C");
    expect(result.syntaxValid).toBe(true);
    expect(result.parsedByTonal).toBe(true);
  });

  it.each(INVALID_CHORDS)("%s는 needsReview로 표시된다", (chord) => {
    const result = validateChord(chord, "C");
    expect(result.needsReview).toBe(true);
  });

  it("위첨자 숫자 표기(Dsus⁴, C⁶)를 정규화한 뒤 통과시킨다", () => {
    expect(normalizeChordNotation("Dsus⁴")).toBe("Dsus4");
    expect(normalizeChordNotation("C⁶")).toBe("C6");

    const dsus4 = validateChord("Dsus⁴", "C");
    expect(dsus4.normalized).toBe("Dsus4");
    expect(dsus4.needsReview).toBe(false);

    const c6 = validateChord("C⁶", "C");
    expect(c6.normalized).toBe("C6");
    expect(c6.needsReview).toBe(false);
  });

  it("슬래시 베이스 코드(G/B)를 처리한다", () => {
    const result = validateChord("G/B", "G");
    expect(result.syntaxValid).toBe(true);
    expect(result.parsedByTonal).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it("복합 코드(Cmaj7/E)를 처리한다", () => {
    const result = validateChord("Cmaj7/E", "C");
    expect(result.syntaxValid).toBe(true);
    expect(result.parsedByTonal).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it("조표에 없는 근음이면 unusualForKey로 표시한다", () => {
    // C major 스케일(C D E F G A B)에 Db는 속하지 않는다.
    const result = validateChord("Db", "C");
    expect(result.syntaxValid).toBe(true);
    expect(result.parsedByTonal).toBe(true);
    expect(result.unusualForKey).toBe(true);
    expect(result.needsReview).toBe(true);
  });

  it("조표에 속한 근음이면 unusualForKey가 아니다", () => {
    const result = validateChord("F", "C");
    expect(result.unusualForKey).toBe(false);
    expect(result.needsReview).toBe(false);
  });

  it("단조 조표에서 화성 단음계의 이끔음 근음(딸림7화음 등)은 이례적이지 않다", () => {
    // Em 자연 단음계(E F# G A B C D)만 보면 D#는 없지만, 화성 단음계(...C D#)에서 나오는
    // 이끔음 코드(D#dim)는 단조 곡의 흔한 딸림화음 진행이라 unusualForKey로 잘못 걸리면 안 된다.
    const result = validateChord("D#dim", "Em");
    expect(result.unusualForKey).toBe(false);
    expect(result.needsReview).toBe(false);
  });

  it("단조 조표(Em)에서도 다이어토닉 스케일 기준으로 판단한다", () => {
    // E natural minor 스케일: E F# G A B C D
    const diatonic = validateChord("Am", "Em");
    expect(diatonic.unusualForKey).toBe(false);

    const borrowed = validateChord("Ab", "Em");
    expect(borrowed.unusualForKey).toBe(true);
  });
});
