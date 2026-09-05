// 악기별 패턴 생성기 (Task 019, 이후 편곡 단순화 리팩터로 재작성).
//
// 예전에는 장르 프리셋·섹션 타입마다 컴핑/워킹베이스/스트럼 등 "실제 연주를 흉내"내는 여러
// 스타일을 분기해서 썼지만, 규칙 기반 생성이 진짜 연주를 흉내 내려 할수록 오히려 부자연스럽게
// 들린다는 게 실사용 피드백으로 확인됐다. 그래서 지금은 "세팅한 빠르기의 기본 박자에 코드만
// 얹는" 단일하고 정직한 방식으로 통일한다 — 장르 프리셋은 이제 화성 보이싱(3화음/7화음, 음역대,
// presets.ts의 VOICING_OPTIONS)만 다르게 하고, 리듬 패턴 자체는 모든 프리셋에서 동일하다.
//
// 모든 함수가 지키는 공통 규칙: 노트의 duration은 절대 그 구간의 endBeat을 넘지 않는다 —
// 그래야 다음 코드로 넘어간 뒤까지 이전 코드 노트가 겹쳐 울리는 일이 없다(테스트 체크리스트).
import type { NoteEvent } from "@/lib/song-model/types";
import type { ChordSegment } from "@/lib/arrangement/chord-segments";
import type { VoicedChord } from "@/lib/arrangement/voicing";
import { withOctave } from "@/lib/arrangement/voicing";
import { beatsPerBar } from "@/lib/song-model/time-signature";

export { beatsPerBar };

/** duration이 구간 끝을 넘지 않도록 자른다. 남은 공간이 없으면(0 이하) null을 반환해 스킵한다. */
function clip(startBeat: number, wantedDuration: number, segmentEndBeat: number): number | null {
  const available = segmentEndBeat - startBeat;
  if (available <= 0) return null;
  return Math.min(wantedDuration, available);
}

function barStartsWithin(segment: ChordSegment, beatsPerBarCount: number): number[] {
  const firstBar = Math.floor(segment.startBeat / beatsPerBarCount) * beatsPerBarCount;
  const starts: number[] = [];
  for (let bar = firstBar; bar < segment.endBeat; bar += beatsPerBarCount) {
    starts.push(Math.max(bar, segment.startBeat));
  }
  return starts;
}

/** "E4" 같은 옥타브 포함 음이름에서 옥타브 앞 pitch class만 뗀다(옥타브는 한 자리로 가정). */
function pitchClassOnly(noteWithOctave: string): string {
  return noteWithOctave.slice(0, -1);
}

// ===== 피아노/기타: 코드 패드 =====
// 코드가 바뀔 때마다 화음을 한 번 잡아 구간 끝까지 지속한다. 피아노는 원래 보이싱 그대로(중~고
// 음역), 기타는 한 옥타브 낮춰 서로 겹치지 않게 한다 — 실제 편성에서 기타가 피아노보다 낮은
// 음역을 맡는 경우가 흔한 것과 같은 이유다.

/** pianoPad/guitarPad가 공유하는 본체 — 음높이 변환과 velocity만 다르다. */
function chordPad(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
  transformPitch: (pitch: string) => string,
  velocity: number,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced) continue;
    const duration = clip(segment.startBeat, segment.endBeat - segment.startBeat, segment.endBeat);
    if (duration === null) continue;
    for (const pitch of voiced.voicing) {
      notes.push({ beat: segment.startBeat, pitch: transformPitch(pitch), duration, velocity });
    }
  }
  return notes;
}

export function pianoPad(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  return chordPad(segments, voicedChords, (pitch) => pitch, 62);
}

export function guitarPad(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  return chordPad(segments, voicedChords, (pitch) => withOctave(pitchClassOnly(pitch), 3), 45);
}

// ===== 베이스: 마디 시작 근음 =====
// bassOf(segment)로 근음(슬래시 코드면 분모)을 받는다 — 화성 보이싱과 달리 베이스는 Voicing
// 딕셔너리를 거치지 않고 코드 근음을 직접 쓴다.

/** 각 마디 첫 박에만 근음을 짚는다. */
export function bassDownbeat(
  segments: ChordSegment[],
  timeSignature: string,
  bassOf: (segment: ChordSegment) => string,
): NoteEvent[] {
  const bpb = beatsPerBar(timeSignature);
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    for (const barStart of barStartsWithin(segment, bpb)) {
      const beat = Math.max(barStart, segment.startBeat);
      const duration = clip(beat, 1, segment.endBeat);
      if (duration === null) continue;
      notes.push({ beat, pitch: withOctave(bassOf(segment), 2), duration, velocity: 85 });
    }
  }
  return notes;
}

// ===== 드럼: 심플한 쿼터노트 펄스 =====
// pitch는 음높이가 아니라 smplr DrumMachine 샘플 별칭(kick/hihat-closed) — Task 006부터 이어진
// 관례를 그대로 따른다. 실제 로드되는 킷에 따라 별칭이 다를 수 있어 재생 어댑터(Task 021)가
// 최종 매핑을 책임진다. 그루브를 흉내 내지 않고 마디 첫 박 킥 + 매 박 하이햇만으로 빠르기를
// 느낄 수 있게 하는 것이 목적이다(클릭 트랙에 가깝다).
//
// segment 절대 beat 범위를 정수 박 단위로 직접 순회한다 — barStartsWithin으로 구한 "마디 시작
// 지점" 목록을 받아 지점마다 고정 길이(beatsPerBarCount)의 패턴을 통째로 채우는 방식은, 코드가
// 마디 중간에서 바뀌어 그 지점이 실제 마디 경계와 어긋나면(예: 4/4에서 2박에 코드가 바뀌어
// 8박까지 지속) 그 지점에서 시작한 패턴이 다음 실제 마디 경계와 겹쳐 같은 박에 하이햇이 중복
// 발음된다(code review에서 실측 확인된 버그, 3/4뿐 아니라 흔한 4/4 코드 진행에서도 재현됨).
// 절대 beat을 1박 단위로 한 번씩만 순회하면 이 중복 자체가 구조적으로 불가능해진다.
export function drumsPulse(
  segmentStart: number,
  segmentEnd: number,
  beatsPerBarCount: number,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (let beat = Math.ceil(segmentStart); beat < segmentEnd; beat += 1) {
    const duration = clip(beat, 1, segmentEnd);
    if (duration === null) break;
    if (beat % beatsPerBarCount === 0) {
      notes.push({ beat, pitch: "kick", duration, velocity: 100 });
    }
    notes.push({ beat, pitch: "hihat-closed", duration, velocity: 50 });
  }
  return notes;
}

export { barStartsWithin };
