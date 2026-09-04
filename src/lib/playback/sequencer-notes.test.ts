import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@/lib/song-model/types";
import { toSequencerNotes } from "@/lib/playback/sequencer-notes";

const PPQ = 480;

function note(overrides: Partial<NoteEvent>): NoteEvent {
  return { beat: 0, pitch: "C4", duration: 1, velocity: 100, ...overrides };
}

describe("toSequencerNotes", () => {
  it("입력과 출력 개수가 항상 같다 (필터링·병합 없는 1:1 변환)", () => {
    const notes = [note({ beat: 0 }), note({ beat: 1 }), note({ beat: 2 })];
    expect(toSequencerNotes(notes, PPQ)).toHaveLength(notes.length);
  });

  it("같은 beat에 쌓인 화음(피아노 comping)이 하나로 뭉개지지 않고 전부 별도 노트로 남는다", () => {
    // 실제 comping 편곡은 같은 beat에 3~4개 노트를 동시에 낸다(voicing) — 변환 후에도
    // 이벤트가 하나도 소실되지 않아야 한다(누락 검증).
    const chord = ["C4", "E4", "G4", "C5"].map((pitch) => note({ beat: 4, pitch }));
    const result = toSequencerNotes(chord, PPQ);
    expect(result).toHaveLength(4);
    expect(new Set(result.map((n) => n.note))).toEqual(new Set(["C4", "E4", "G4", "C5"]));
    // 네 노트 모두 같은 tick(마디 2 시작)으로 변환돼야 동시에 울린다.
    for (const n of result) expect(n.at).toBe(4 * PPQ);
  });

  it("마디 경계에 정확히 걸친 노트가 인접 노트와 겹치거나 사라지지 않는다", () => {
    // 4/4 기준 1마디 끝(beat 4 직전, 3.75)과 2마디 시작(beat 4)에 각각 노트가 있을 때
    // 둘 다 살아남고 서로 다른 tick으로 구분돼야 한다(중복 검증).
    const notes = [note({ beat: 3.75, pitch: "G3" }), note({ beat: 4, pitch: "C4" })];
    const result = toSequencerNotes(notes, PPQ);
    expect(result).toHaveLength(2);
    expect(result[0]?.at).toBe(Math.round(3.75 * PPQ));
    expect(result[1]?.at).toBe(4 * PPQ);
    expect(result[0]?.at).not.toBe(result[1]?.at);
  });

  it("드럼 샘플 별칭(kick/snare 등)은 pitchAlias 없이는 문자열 그대로 통과한다", () => {
    const drumNotes = [
      note({ beat: 0, pitch: "kick" }),
      note({ beat: 1, pitch: "snare" }),
      note({ beat: 1.5, pitch: "hihat-closed" }),
    ];
    const result = toSequencerNotes(drumNotes, PPQ);
    expect(result.map((n) => n.note)).toEqual(["kick", "snare", "hihat-closed"]);
  });

  it("pitchAlias가 있으면 매핑된 이름으로 바뀌고, 매핑에 없는 이름은 그대로 통과한다", () => {
    const drumNotes = [
      note({ beat: 0, pitch: "kick" }),
      note({ beat: 0.5, pitch: "hihat-closed" }),
      note({ beat: 4, pitch: "crash" }),
    ];
    const result = toSequencerNotes(drumNotes, PPQ, {
      "hihat-closed": "hihat-close",
      crash: "cymbal",
    });
    expect(result.map((n) => n.note)).toEqual(["kick", "hihat-close", "cymbal"]);
  });

  it("duration과 velocity가 그대로 (beat→tick 변환만 거쳐) 반영된다", () => {
    const [result] = toSequencerNotes([note({ beat: 2, duration: 0.5, velocity: 77 })], PPQ);
    expect(result?.at).toBe(2 * PPQ);
    expect(result?.duration).toBe(0.5 * PPQ);
    expect(result?.velocity).toBe(77);
  });

  it("빈 배열은 빈 배열로 변환된다", () => {
    expect(toSequencerNotes([], PPQ)).toEqual([]);
  });

  it("idPrefix 없이는 배열 인덱스가 그대로 id가 된다(smplr 기본값과 동일)", () => {
    const result = toSequencerNotes([note({ beat: 0 }), note({ beat: 1 })], PPQ);
    expect(result.map((n) => n.id)).toEqual([0, 1]);
  });

  it("idPrefix가 있으면 서로 다른 트랙끼리 id가 절대 겹치지 않는다", () => {
    // smplr Sequencer는 여러 트랙의 _activeVoices를 하나의 Map으로 공유하므로, 트랙마다
    // 0부터 다시 매기는 인덱스만 id로 쓰면 서로 다른 트랙의 같은 인덱스 노트가 충돌한다
    // (예: 피아노와 드럼 둘 다 beat 0에서 시작하는 note[0]).
    const piano = toSequencerNotes([note({ beat: 0 }), note({ beat: 1 })], PPQ, undefined, "piano");
    const drums = toSequencerNotes([note({ beat: 0 }), note({ beat: 1 })], PPQ, undefined, "drums");
    expect(piano.map((n) => n.id)).toEqual(["piano-0", "piano-1"]);
    expect(drums.map((n) => n.id)).toEqual(["drums-0", "drums-1"]);
    const allIds = [...piano, ...drums].map((n) => n.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
