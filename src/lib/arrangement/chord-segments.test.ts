import { describe, expect, it } from "vitest";
import { extractChordSegments } from "./chord-segments";
import type { SongTree } from "@/lib/song-model/types";

function song(overrides: Partial<SongTree> = {}): SongTree {
  return {
    id: "song-1",
    title: "테스트 곡",
    key: "G",
    tempo: 120,
    timeSignature: "4/4",
    status: "corrected",
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sections: [],
    ...overrides,
  };
}

describe("extractChordSegments", () => {
  it("연속된 코드는 다음 코드가 시작하는 지점까지를 길이로 갖는다", () => {
    const segments = extractChordSegments(
      song({
        sections: [
          {
            id: "sec-verse",
            songId: "song-1",
            type: "verse",
            orderIndex: 0,
            startBeat: 0,
            lengthBeats: 8,
            repeatTargetSectionId: null,
            lines: [
              {
                id: "line-1",
                sectionId: "sec-verse",
                lyrics: "line",
                orderIndex: 0,
                startBeat: 0,
                chordEvents: [
                  {
                    id: "c1",
                    lineId: "line-1",
                    chord: "G",
                    charOffset: 0,
                    beatOffset: 0,
                    needsReview: false,
                  },
                  {
                    id: "c2",
                    lineId: "line-1",
                    chord: "D",
                    charOffset: 5,
                    beatOffset: 4,
                    needsReview: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(segments).toEqual([
      { chord: "G", startBeat: 0, endBeat: 4, sectionId: "sec-verse", sectionType: "verse" },
      { chord: "D", startBeat: 4, endBeat: 8, sectionId: "sec-verse", sectionType: "verse" },
    ]);
  });

  // code review 지적, Task 023 이후 발견: 한 줄의 마지막 코드가 그 줄/섹션의 끝 beat에 정확히
  // 걸리면(beatOffset === lengthBeats) endBeat이 songTotalBeats와 같아져 0박자 구간이 되고,
  // filter(endBeat > startBeat)에서 그 코드 자체가 통째로 사라졌다.
  it("마지막 코드가 곡 전체 길이와 정확히 같은 beat에 걸려도 사라지지 않고 최소 길이를 갖는다", () => {
    const segments = extractChordSegments(
      song({
        sections: [
          {
            id: "sec-outro",
            songId: "song-1",
            type: "outro",
            orderIndex: 0,
            startBeat: 0,
            lengthBeats: 4,
            repeatTargetSectionId: null,
            lines: [
              {
                id: "line-1",
                sectionId: "sec-outro",
                lyrics: "line",
                orderIndex: 0,
                startBeat: 0,
                chordEvents: [
                  {
                    id: "c1",
                    lineId: "line-1",
                    chord: "G",
                    charOffset: 0,
                    beatOffset: 0,
                    needsReview: false,
                  },
                  // 줄 길이(4beat)와 정확히 같은 beatOffset — 곡 전체 끝과 같은 절대 beat(4)에 걸린다.
                  {
                    id: "c2",
                    lineId: "line-1",
                    chord: "C",
                    charOffset: 5,
                    beatOffset: 4,
                    needsReview: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(segments).toHaveLength(2);
    const last = segments[segments.length - 1]!;
    expect(last.chord).toBe("C");
    expect(last.startBeat).toBe(4);
    expect(last.endBeat).toBeGreaterThan(last.startBeat);
  });

  it("같은 절대 beat에 코드가 중복되면(교정 데이터 이상) 뒤엣것으로만 남는다", () => {
    const segments = extractChordSegments(
      song({
        sections: [
          {
            id: "sec-verse",
            songId: "song-1",
            type: "verse",
            orderIndex: 0,
            startBeat: 0,
            lengthBeats: 8,
            repeatTargetSectionId: null,
            lines: [
              {
                id: "line-1",
                sectionId: "sec-verse",
                lyrics: "line",
                orderIndex: 0,
                startBeat: 0,
                chordEvents: [
                  {
                    id: "c1",
                    lineId: "line-1",
                    chord: "G",
                    charOffset: 0,
                    beatOffset: 0,
                    needsReview: false,
                  },
                  {
                    id: "c2",
                    lineId: "line-1",
                    chord: "Em",
                    charOffset: 0,
                    beatOffset: 0,
                    needsReview: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(segments).toEqual([
      { chord: "Em", startBeat: 0, endBeat: 8, sectionId: "sec-verse", sectionType: "verse" },
    ]);
  });
});
