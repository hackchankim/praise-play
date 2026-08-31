// 더미 편곡 트랙 생성 로직 (Task 006).
// 가사 위 코드 칩(mock-songs.ts의 ChordEvent)과는 별개로, 편곡 엔진(Task 019)이 참고할
// "코드 진행 블루프린트"를 마디(4beat) 단위로 단순화해 정의한다. buildArrangementBlueprint()는
// MockArrangementRepository.generate()가 요청마다 실제로 호출하는 런타임 로직이라, 순수 데이터
// 픽스처인 mock-songs.ts/mock-setlists.ts와 파일을 분리했다.

import { Chord } from "tonal";
import type {
  Arrangement,
  GenrePreset,
  Instrument,
  InstrumentTrack,
  NoteEvent,
} from "@/lib/song-model/types";
import { SONG_A_ID, SONG_B_ID, SONG_C_ID } from "@/lib/song-model/mock-songs";

interface ChordSlot {
  chord: string;
  beat: number;
  duration: number;
}

const SONG_A_TOTAL_BEATS = 80;
const songAChordSlots: ChordSlot[] = [
  { chord: "G", beat: 0, duration: 4 },
  { chord: "D", beat: 4, duration: 4 },
  { chord: "G", beat: 8, duration: 4 },
  { chord: "D", beat: 12, duration: 4 },
  { chord: "Em", beat: 16, duration: 4 },
  { chord: "C", beat: 20, duration: 4 },
  { chord: "G", beat: 24, duration: 4 },
  { chord: "D", beat: 28, duration: 4 },
  { chord: "Em", beat: 32, duration: 4 },
  { chord: "C", beat: 36, duration: 4 },
  { chord: "C", beat: 40, duration: 4 },
  { chord: "G", beat: 44, duration: 4 },
  { chord: "D", beat: 48, duration: 4 },
  { chord: "Em", beat: 52, duration: 4 },
  { chord: "Em", beat: 56, duration: 4 },
  { chord: "Bm", beat: 60, duration: 4 },
  { chord: "C", beat: 64, duration: 4 },
  { chord: "D", beat: 68, duration: 4 },
  { chord: "G", beat: 72, duration: 4 },
  { chord: "G", beat: 76, duration: 4 },
];

const SONG_B_TOTAL_BEATS = 48;
const songBChordSlots: ChordSlot[] = [
  { chord: "D", beat: 0, duration: 4 },
  { chord: "A", beat: 4, duration: 4 },
  { chord: "Bm", beat: 8, duration: 4 },
  { chord: "G", beat: 12, duration: 4 },
  { chord: "D", beat: 16, duration: 4 },
  { chord: "A", beat: 20, duration: 4 },
  { chord: "Bm", beat: 24, duration: 4 },
  { chord: "G", beat: 28, duration: 4 },
  { chord: "Bm", beat: 32, duration: 4 },
  { chord: "G", beat: 36, duration: 4 },
  { chord: "D", beat: 40, duration: 4 },
  { chord: "A", beat: 44, duration: 4 },
];

const SONG_C_TOTAL_BEATS = 32;
const songCChordSlots: ChordSlot[] = [
  { chord: "E", beat: 0, duration: 4 },
  { chord: "B", beat: 4, duration: 4 },
  { chord: "C#m", beat: 8, duration: 4 },
  { chord: "A", beat: 12, duration: 4 },
  // 후렴(beat 16~32) — 가사 위 코드 칩(mock-songs.ts songCChordEvents)과 동일한 진행으로 맞춤
  { chord: "A", beat: 16, duration: 4 },
  { chord: "B", beat: 20, duration: 4 },
  { chord: "C#m", beat: 24, duration: 4 },
  { chord: "E", beat: 28, duration: 4 },
];

// songId → (코드 진행, 전체 길이) 조회용 블루프린트. 아직 추출 전인 곡(D)은 항목이 없다.
const SONG_ARRANGEMENT_BLUEPRINTS: Record<string, { chordSlots: ChordSlot[]; totalBeats: number }> =
  {
    [SONG_A_ID]: { chordSlots: songAChordSlots, totalBeats: SONG_A_TOTAL_BEATS },
    [SONG_B_ID]: { chordSlots: songBChordSlots, totalBeats: SONG_B_TOTAL_BEATS },
    [SONG_C_ID]: { chordSlots: songCChordSlots, totalBeats: SONG_C_TOTAL_BEATS },
  };

/** Tonal.js로 코드 심볼을 음이름 배열(옥타브 없음)로 변환. 파싱 실패 시 안전한 기본값으로 폴백 */
function pitchClassesOf(chordSymbol: string): string[] {
  const parsed = Chord.get(chordSymbol);
  return parsed.notes.length > 0 ? parsed.notes : ["C"];
}

function withOctave(pitchClass: string, octave: number): string {
  return `${pitchClass}${octave}`;
}

function buildPianoNotes(slots: ChordSlot[]): NoteEvent[] {
  // 근음은 3옥타브, 나머지 화음은 4옥타브에 펼쳐 블록 코드 보이싱을 흉내낸다
  return slots.flatMap((slot) =>
    pitchClassesOf(slot.chord).map((pc, index) => ({
      beat: slot.beat,
      pitch: withOctave(pc, index === 0 ? 3 : 4),
      duration: slot.duration,
      velocity: 68,
    })),
  );
}

function buildGuitarNotes(slots: ChordSlot[]): NoteEvent[] {
  return slots.flatMap((slot) =>
    pitchClassesOf(slot.chord).map((pc) => ({
      beat: slot.beat,
      pitch: withOctave(pc, 3),
      duration: slot.duration,
      velocity: 55,
    })),
  );
}

function buildBassNotes(slots: ChordSlot[]): NoteEvent[] {
  // 마디 앞뒤에 근음을 두 번 눌러 걷는 듯한 단순 베이스 패턴을 만든다
  return slots.flatMap((slot) => {
    const [root] = pitchClassesOf(slot.chord);
    const half = slot.duration / 2;
    return [
      { beat: slot.beat, pitch: withOctave(root, 2), duration: half, velocity: 95 },
      { beat: slot.beat + half, pitch: withOctave(root, 2), duration: half, velocity: 80 },
    ];
  });
}

function buildDrumNotes(totalBeats: number): NoteEvent[] {
  // pitch는 음높이가 아니라 smplr DrumMachine 샘플 별칭 (kick/snare/hihat-closed)
  const notes: NoteEvent[] = [];
  for (let barStart = 0; barStart < totalBeats; barStart += 4) {
    notes.push({ beat: barStart, pitch: "kick", duration: 1, velocity: 105 });
    notes.push({ beat: barStart + 1, pitch: "snare", duration: 1, velocity: 100 });
    notes.push({ beat: barStart + 2, pitch: "kick", duration: 1, velocity: 90 });
    notes.push({ beat: barStart + 3, pitch: "snare", duration: 1, velocity: 100 });
    for (let eighth = 0; eighth < 8; eighth += 1) {
      notes.push({
        beat: barStart + eighth * 0.5,
        pitch: "hihat-closed",
        duration: 0.5,
        velocity: 55,
      });
    }
  }
  return notes;
}

export interface ArrangementBlueprint {
  genrePreset: GenrePreset;
  tracks: Array<{ instrument: Instrument; notes: NoteEvent[] }>;
}

/**
 * songId에 대한 편곡 트랙 데이터를 생성한다. ArrangementRepository.generate()가 이 함수로
 * 새 편곡을 즉석에서 만들고, 아래 MOCK_ARRANGEMENTS/MOCK_INSTRUMENT_TRACKS도 동일한 함수로 시드한다.
 * 블루프린트가 없는 곡(추출 전 draft)은 빈 트랙을 반환한다.
 */
export function buildArrangementBlueprint(
  songId: string,
  genrePreset: GenrePreset,
): ArrangementBlueprint {
  const blueprint = SONG_ARRANGEMENT_BLUEPRINTS[songId] ?? { chordSlots: [], totalBeats: 0 };
  return {
    genrePreset,
    tracks: [
      { instrument: "piano", notes: buildPianoNotes(blueprint.chordSlots) },
      { instrument: "guitar", notes: buildGuitarNotes(blueprint.chordSlots) },
      { instrument: "bass", notes: buildBassNotes(blueprint.chordSlots) },
      { instrument: "drums", notes: buildDrumNotes(blueprint.totalBeats) },
    ],
  };
}

function seedArrangement(
  id: string,
  songId: string,
  genrePreset: GenrePreset,
  createdAt: string,
): { arrangement: Arrangement; tracks: InstrumentTrack[] } {
  const blueprint = buildArrangementBlueprint(songId, genrePreset);
  return {
    arrangement: { id, songId, genrePreset, createdAt },
    tracks: blueprint.tracks.map((track) => ({
      id: `${id}-${track.instrument}`,
      arrangementId: id,
      instrument: track.instrument,
      notes: track.notes,
    })),
  };
}

export const ARRANGEMENT_A_ID = `arr-${SONG_A_ID}-ccm-ballad`;
export const ARRANGEMENT_B_ID = `arr-${SONG_B_ID}-hymn-traditional`;
export const ARRANGEMENT_C_ID = `arr-${SONG_C_ID}-praise-upbeat`;

const seededA = seedArrangement(
  ARRANGEMENT_A_ID,
  SONG_A_ID,
  "ccm_ballad",
  "2026-08-25T07:41:00.000Z",
);
const seededB = seedArrangement(
  ARRANGEMENT_B_ID,
  SONG_B_ID,
  "hymn_traditional",
  "2026-08-11T13:21:00.000Z",
);
const seededC = seedArrangement(
  ARRANGEMENT_C_ID,
  SONG_C_ID,
  "praise_upbeat",
  "2026-08-06T02:11:00.000Z",
);

export const MOCK_ARRANGEMENTS: Arrangement[] = [
  seededA.arrangement,
  seededB.arrangement,
  seededC.arrangement,
];

export const MOCK_INSTRUMENT_TRACKS: InstrumentTrack[] = [
  ...seededA.tracks,
  ...seededB.tracks,
  ...seededC.tracks,
];
