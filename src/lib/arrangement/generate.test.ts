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

  it.each(PRESETS)(
    "%s 프리셋도 4악기 모두 매 구간 연주한다(리듬 패턴은 프리셋과 무관)",
    (preset) => {
      // 편곡 단순화 이후 리듬 패턴은 모든 프리셋에서 동일하다 — 프리셋은 화성 보이싱만 다르게 한다.
      const tracks = generateArrangement(song(), preset);
      for (const track of tracks) {
        expect(track.notes.length).toBeGreaterThan(0);
      }
    },
  );

  it("트라이어드 프리셋(hymn_traditional)과 확장 화음 프리셋(praise_upbeat)은 보이싱 음역대가 다르다", () => {
    // 둘 다 같은 코드 진행이지만, VOICING_OPTIONS의 range가 달라(C3~C4 vs C3~E5) 실제 보이싱
    // 피치가 달라야 한다 — 노트 개수는 같아도(둘 다 3화음뿐인 코드 진행이라) 음역대로 프리셋이
    // 실제로 구분된다는 걸 확인한다.
    const triadPiano = generateArrangement(song(), "hymn_traditional").find(
      (t) => t.instrument === "piano",
    )!;
    const richPiano = generateArrangement(song(), "praise_upbeat").find(
      (t) => t.instrument === "piano",
    )!;
    const pitchesAt = (track: { notes: { beat: number; pitch: string }[] }, beat: number) =>
      track.notes
        .filter((n) => n.beat === beat)
        .map((n) => n.pitch)
        .sort();
    expect(pitchesAt(triadPiano, 0)).not.toEqual(pitchesAt(richPiano, 0));
  });

  it("드럼은 프리셋과 무관하게 항상 존재한다(마디 첫 박 킥 + 매 박 하이햇)", () => {
    const tracks = generateArrangement(song(), "acoustic_intimate");
    const drums = tracks.find((t) => t.instrument === "drums")!;
    expect(drums.notes.some((n) => n.pitch === "kick")).toBe(true);
    expect(drums.notes.some((n) => n.pitch === "hihat-closed")).toBe(true);
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

  it("4/4를 전제로 한 드럼 마디 패턴이 3/4에서 마디 경계마다 중복 발음되지 않는다", () => {
    // 회귀 테스트: drumsPulse가 beatsPerBarCount 대신 4/4를 전제로 고정된 오프셋을 쓰면 3/4
    // 곡의 두 번째 마디 시작(beat 3)에 "이전 마디의 beat 3 자리"와 "이번 마디의 beat 0 자리"가
    // 겹쳐 노트가 중복으로 찍힌다. 12박짜리 단일 코드 구간이면 마디는 beat 0/3/6/9에서 시작하고,
    // 매 마디가 같은 패턴을 반복해야 하므로 beat 0과 beat 3의 노트 개수가 같아야 한다. (guitar는
    // 이제 구간 시작에 한 번만 울리는 코드 패드라 마디 반복 자체가 없어 이 회귀의 대상이 아니다.)
    const waltzSong = song({ timeSignature: "3/4" });
    const tracks = generateArrangement(waltzSong, "praise_upbeat");
    const drums = tracks.find((t) => t.instrument === "drums")!;
    const atBeat0 = drums.notes.filter((n) => n.beat === 0).length;
    const atBeat3 = drums.notes.filter((n) => n.beat === 3).length;
    expect(atBeat3).toBe(atBeat0);
  });

  it("코드가 마디 중간에서 바뀌어(오프-그리드 구간) 진짜 마디 경계와 겹쳐도 드럼이 같은 박에 중복 발음되지 않는다", () => {
    // 회귀 테스트: code review에서 실측 확인된 버그 — drumsPulse를 (barStartsWithin이 내는)
    // "마디 시작 지점" 목록 기준으로 지점마다 고정 길이 패턴을 통째로 채우면, 코드가 마디
    // 중간(4/4에서 2박)에서 바뀌어 그 구간이 다음 실제 마디 경계(4박)를 넘어 지속될 때 두
    // 지점의 패턴이 겹쳐 같은 박(4, 5박)에 hihat-closed가 두 번씩 찍혔다. 4/4, 2박에서 코드가
    // 바뀌어 8박까지 지속되는(흔한) 진행으로 재현한다.
    const offGridSong = song({
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
                  chord: "C",
                  charOffset: 0,
                  beatOffset: 2,
                  needsReview: false,
                },
              ],
            },
          ],
        },
      ],
    });
    const tracks = generateArrangement(offGridSong, "praise_upbeat");
    const drums = tracks.find((t) => t.instrument === "drums")!;
    const counts = new Map<string, number>();
    for (const note of drums.notes) {
      const key = `${note.beat}:${note.pitch}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) {
      expect(count, `${key}가 ${count}번 중복 발음됨`).toBe(1);
    }
  });

  it("hymn_traditional과 acoustic_intimate는 서로 다른 음역대 보이싱을 쓴다(둘 다 3화음이라 완전히 같아지지 않게)", () => {
    // 회귀 테스트: 리듬이 프리셋과 무관하게 통일된 뒤로는 화성 보이싱(VOICING_OPTIONS)이 프리셋
    // 간 유일한 차이점이다 — 두 프리셋의 range가 우연히 같으면 생성 결과가 완전히 똑같아져
    // 프리셋 하나가 무의미해진다(code review에서 실측 확인).
    const hymnTracks = generateArrangement(song(), "hymn_traditional");
    const acousticTracks = generateArrangement(song(), "acoustic_intimate");
    expect(JSON.stringify(hymnTracks)).not.toBe(JSON.stringify(acousticTracks));
  });
});
