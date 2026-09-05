// 다악기 편곡 생성 엔진 코어 (Task 019, 이후 편곡 단순화 리팩터). 확정된 코드 진행(sections/
// lines/chordEvents)과 장르 프리셋을 받아 피아노/기타/베이스/드럼 4트랙의 beat 정렬 노트 이벤트를
// 만든다. 순수 함수라 유닛 테스트가 직접 이 모듈을 불러오므로 여기 자체에는 "server-only"
// 가드를 두지 않는다(그 패키지는 Node 환경에서 그냥 무조건 throw한다 — Next.js가 번들링 시
// "react-server" 조건으로 치환해주는 걸 전제하는데 Vitest는 그 조건을 모른다). 대신 이 엔진을
// 실제로 호출하는 유일한 지점인 persist-arrangement.ts에 가드를 둔다 — 클라이언트 컴포넌트가
// 이 파일을 직접 참조할 일이 없다면(그런 일이 없어야 한다) 이 알고리즘은 서버 번들에만 존재한다.
//
// 리듬 패턴은 장르 프리셋·섹션 타입과 무관하게 항상 같다(코드 패드 + 심플한 비트) — 프리셋은
// VOICING_OPTIONS를 통해 화성 보이싱만 다르게 한다. 예전에는 여기서 (프리셋, 섹션 타입)별로
// 스타일을 분기했지만, 실제 연주를 흉내 내려는 분기가 오히려 부자연스럽게 들려 전부 제거했다.
import type { GenrePreset, Instrument, NoteEvent, SongTree } from "@/lib/song-model/types";
import { INSTRUMENTS } from "@/lib/song-model/types";
import { extractChordSegments } from "@/lib/arrangement/chord-segments";
import {
  buildVoicingSequence,
  bassPitchClassOf,
  type VoicedChord,
} from "@/lib/arrangement/voicing";
import { VOICING_OPTIONS } from "@/lib/arrangement/presets";
import * as gen from "@/lib/arrangement/instruments";

export interface GeneratedTrack {
  instrument: Instrument;
  notes: NoteEvent[];
}

/**
 * 곡 전체(확정된 코드 진행)와 장르 프리셋으로 4악기 트랙을 생성한다. 아직 코드 진행이 없는 곡
 * (추출/교정 전)이면 빈 트랙 4개를 돌려준다 — 호출부(arrangement-repository.ts)가 이미
 * status==='draft'를 막고 있지만, 코드가 하나도 없는 극단적인 경우(교정에서 전부 지운 경우
 * 등)에도 크래시 없이 빈 결과를 내는 편이 안전하다.
 */
export function generateArrangement(song: SongTree, genrePreset: GenrePreset): GeneratedTrack[] {
  const segments = extractChordSegments(song);
  if (segments.length === 0) {
    return INSTRUMENTS.map((instrument) => ({ instrument, notes: [] }));
  }

  const { range, dictionary } = VOICING_OPTIONS[genrePreset];
  const voicedList = buildVoicingSequence(
    segments.map((s) => s.chord),
    range,
    dictionary,
  );
  const voicedByBeat = new Map<number, VoicedChord>();
  segments.forEach((segment, index) => voicedByBeat.set(segment.startBeat, voicedList[index]!));

  const timeSignature = song.timeSignature;
  const bpb = gen.beatsPerBar(timeSignature);
  const bassOf = (segment: { chord: string }) => bassPitchClassOf(segment.chord);

  const drumNotes: NoteEvent[] = [];
  for (const segment of segments) {
    drumNotes.push(...gen.drumsPulse(segment.startBeat, segment.endBeat, bpb));
  }

  const tracks: GeneratedTrack[] = [
    { instrument: "piano", notes: gen.pianoPad(segments, voicedByBeat) },
    { instrument: "guitar", notes: gen.guitarPad(segments, voicedByBeat) },
    { instrument: "bass", notes: gen.bassDownbeat(segments, timeSignature, bassOf) },
    { instrument: "drums", notes: drumNotes },
  ];
  return tracks.map((track) => ({
    ...track,
    notes: track.notes.sort((a, b) => a.beat - b.beat),
  }));
}
