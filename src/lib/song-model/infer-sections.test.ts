import { describe, expect, it } from "vitest";
import { inferSections, type InferSectionsInputSection } from "./infer-sections";

function section(
  id: string,
  type: InferSectionsInputSection["type"],
  lines: Array<{ lyrics: string; chords?: string[] }>,
): InferSectionsInputSection {
  return {
    id,
    type,
    lines: lines.map((line) => ({
      lyrics: line.lyrics,
      chords: (line.chords ?? []).map((chord) => ({ chord })),
    })),
  };
}

describe("inferSections", () => {
  it("반복 구조를 가진 곡에서 동일한 후렴이 같은 섹션(repeatTargetSectionId)으로 묶인다", () => {
    const sections: InferSectionsInputSection[] = [
      section("s-verse", "verse", [{ lyrics: "주의 은혜가 강물처럼", chords: ["D", "A"] }]),
      section("s-chorus-1", "chorus", [{ lyrics: "할렐루야 찬양해", chords: ["G", "D"] }]),
      section("s-verse-2", "verse", [{ lyrics: "그 사랑 놀라워라", chords: ["D", "Bm"] }]),
      section("s-chorus-2", "chorus", [{ lyrics: "할렐루야 찬양해", chords: ["G", "D"] }]),
    ];

    const result = inferSections(sections);

    expect(result.find((s) => s.id === "s-chorus-1")?.repeatTargetSectionId).toBeNull();
    expect(result.find((s) => s.id === "s-chorus-2")?.repeatTargetSectionId).toBe("s-chorus-1");
    expect(result.find((s) => s.id === "s-chorus-2")?.type).toBe("chorus");
  });

  it("가사·코드가 조금이라도 다르면 반복으로 묶지 않는다", () => {
    const sections: InferSectionsInputSection[] = [
      section("s1", "verse", [{ lyrics: "가사 A", chords: ["C"] }]),
      section("s2", "verse", [{ lyrics: "가사 B", chords: ["C"] }]),
    ];

    const result = inferSections(sections);
    expect(result.every((s) => s.repeatTargetSectionId === null)).toBe(true);
  });

  it("가사가 없는 빈 섹션끼리는 반복으로 오판하지 않는다", () => {
    const sections: InferSectionsInputSection[] = [
      section("s1", "interlude", []),
      section("s2", "interlude", []),
    ];

    const result = inferSections(sections);
    expect(result.every((s) => s.repeatTargetSectionId === null)).toBe(true);
  });

  it("'라라라' 등 보칼리제이션 구간은 간주(interlude)로 재라벨링한다", () => {
    const sections: InferSectionsInputSection[] = [
      section("s1", "verse", [{ lyrics: "라라라 라라라", chords: ["C"] }]),
      section("s2", "chorus", [{ lyrics: "라라라라", chords: [] }]),
      section("s3", "verse", [{ lyrics: "na na na", chords: [] }]),
    ];

    const result = inferSections(sections);
    expect(result.find((s) => s.id === "s1")?.type).toBe("interlude");
    expect(result.find((s) => s.id === "s2")?.type).toBe("interlude");
    expect(result.find((s) => s.id === "s3")?.type).toBe("interlude");
  });

  it("실제 가사가 섞인 줄은 보칼리제이션으로 오판하지 않는다", () => {
    const sections: InferSectionsInputSection[] = [
      section("s1", "verse", [{ lyrics: "라라라 사랑해요", chords: ["C"] }]),
    ];

    const result = inferSections(sections);
    expect(result[0]!.type).toBe("verse");
  });
});
