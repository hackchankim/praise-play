import { describe, expect, it } from "vitest";
import { generateArrangement } from "./generate";
import type { GenrePreset, SongTree } from "@/lib/song-model/types";

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
            lyrics: "verse line",
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
      {
        id: "sec-chorus",
        songId: "song-1",
        type: "chorus",
        orderIndex: 1,
        startBeat: 8,
        lengthBeats: 8,
        repeatTargetSectionId: null,
        lines: [
          {
            id: "line-2",
            sectionId: "sec-chorus",
            lyrics: "chorus line",
            orderIndex: 0,
            startBeat: 0,
            chordEvents: [
              {
                id: "c3",
                lineId: "line-2",
                chord: "Em",
                charOffset: 0,
                beatOffset: 0,
                needsReview: false,
              },
              {
                id: "c4",
                lineId: "line-2",
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
    ...overrides,
  };
}

const PRESETS: GenrePreset[] = [
  "praise_upbeat",
  "ccm_ballad",
  "hymn_traditional",
  "acoustic_intimate",
];

describe("generateArrangement", () => {
  it("4개 악기 트랙을 모두 생성한다", () => {
    const tracks = generateArrangement(song(), "praise_upbeat");
    expect(tracks.map((t) => t.instrument).sort()).toEqual(["bass", "drums", "guitar", "piano"]);
  });

  it.each(PRESETS)(
    "%s 프리셋의 모든 노트는 beat이 0 이상이고 곡 길이(16박) 안에 있다",
    (preset) => {
      const tracks = generateArrangement(song(), preset);
      for (const track of tracks) {
        for (const note of track.notes) {
          expect(note.beat).toBeGreaterThanOrEqual(0);
          expect(note.beat).toBeLessThan(16);
          expect(note.beat + note.duration).toBeLessThanOrEqual(16 + 1e-9);
        }
      }
    },
  );

  it.each(PRESETS)("%s 프리셋에서 코드 전환 지점을 넘어 노트가 겹치지 않는다", (preset) => {
    // 각 구간(G:0-4, D:4-8, Em:8-12, C:12-16) 경계를 넘는 노트가 없는지 확인한다.
    const boundaries = [4, 8, 12, 16];
    const tracks = generateArrangement(song(), preset);
    for (const track of tracks) {
      for (const note of track.notes) {
        const noteEnd = note.beat + note.duration;
        // 이 노트가 속한 구간의 다음 경계를 찾아, 그 경계를 넘지 않는지 확인한다.
        const nextBoundary = boundaries.find((b) => b > note.beat + 1e-9);
        if (nextBoundary !== undefined) {
          expect(noteEnd).toBeLessThanOrEqual(nextBoundary + 1e-9);
        }
      }
    }
  });

  it("4개 프리셋이 서로 구분 가능한 패턴을 생성한다(노트 수·리듬이 전부 같지 않음)", () => {
    const results = PRESETS.map((preset) => generateArrangement(song(), preset));
    const noteCounts = results.map((tracks) => tracks.map((t) => t.notes.length).join(","));
    // 모든 프리셋의 (피아노,기타,베이스,드럼) 노트 개수 조합이 서로 달라야 한다 — 완전히 같은
    // 패턴이면 프리셋이 사실상 구분되지 않는다는 뜻이다.
    expect(new Set(noteCounts).size).toBe(PRESETS.length);
  });

  it("ccm_ballad는 절(verse)에서 드럼이 없고 후렴(chorus)부터 합류한다(섹션별 악기 구성 맵)", () => {
    const tracks = generateArrangement(song(), "ccm_ballad");
    const drums = tracks.find((t) => t.instrument === "drums")!;
    expect(drums.notes.every((n) => n.beat >= 8)).toBe(true); // chorus는 8박부터 시작
    expect(drums.notes.length).toBeGreaterThan(0); // chorus에서는 실제로 연주한다
  });

  it("acoustic_intimate는 드럼이 아예 없다", () => {
    const tracks = generateArrangement(song(), "acoustic_intimate");
    const drums = tracks.find((t) => t.instrument === "drums")!;
    expect(drums.notes).toHaveLength(0);
  });

  it("파싱 불가 코드가 섞여도 크래시 없이 스킵·대체 처리한다", () => {
    const brokenSong = song();
    brokenSong.sections[0]!.lines[0]!.chordEvents[0]!.chord = "Xyz123broken";
    expect(() => generateArrangement(brokenSong, "praise_upbeat")).not.toThrow();
    const tracks = generateArrangement(brokenSong, "praise_upbeat");
    const piano = tracks.find((t) => t.instrument === "piano")!;
    expect(piano.notes.length).toBeGreaterThan(0); // 대체 보이싱으로라도 노트가 나온다
  });

  it("코드 진행이 없는 곡은 크래시 없이 빈 트랙 4개를 낸다", () => {
    const emptySong = song({ sections: [] });
    const tracks = generateArrangement(emptySong, "praise_upbeat");
    expect(tracks).toHaveLength(4);
    expect(tracks.every((t) => t.notes.length === 0)).toBe(true);
  });

  it("4/4를 전제로 한 마디 패턴이 3/4에서 마디 경계마다 중복 발음되지 않는다", () => {
    // 회귀 테스트: guitarStrum/drumsActive가 [0,1,2,2.5,3] 같은 4/4 전제 오프셋을 그대로 쓰면
    // 3/4 곡의 두 번째 마디 시작(beat 3)에 "이전 마디의 beat 3 자리"와 "이번 마디의 beat 0
    // 자리"가 겹쳐 노트가 중복으로 찍힌다. 12박짜리 단일 코드 구간이면 마디는 beat 0/3/6/9에서
    // 시작하고, 매 마디가 같은 패턴을 반복해야 하므로 beat 0과 beat 3의 노트 개수가 같아야 한다.
    const waltzSong = song({ timeSignature: "3/4" });
    const tracks = generateArrangement(waltzSong, "praise_upbeat");
    for (const instrument of ["guitar", "drums"] as const) {
      const track = tracks.find((t) => t.instrument === instrument)!;
      const atBeat0 = track.notes.filter((n) => n.beat === 0).length;
      const atBeat3 = track.notes.filter((n) => n.beat === 3).length;
      expect(atBeat3).toBe(atBeat0);
    }
  });
});
