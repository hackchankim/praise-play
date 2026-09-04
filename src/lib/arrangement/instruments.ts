// 악기별 패턴 생성기 (Task 019). 각 함수는 이미 "이 구간에서 이 악기가 연주해야 한다"고
// 걸러진 코드 구간 목록만 받는다 — 섹션별 참여 여부(생략) 판단은 presets.ts/generate.ts가
// 담당하고, 여기서는 순수하게 "주어진 구간에서 어떤 리듬으로 치는가"만 다룬다.
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

// ===== 피아노 =====

/** 리듬감 있는 옥타브 컴핑: 마디마다 정박과 당김음 자리에 보이싱 전체 + 근음 옥타브를 짧게 찍는다. */
export function pianoComping(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
  timeSignature: string,
): NoteEvent[] {
  const bpb = beatsPerBar(timeSignature);
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced) continue;
    const hits = [0, bpb * 0.75]; // 정박 + 당김음
    for (const barStart of barStartsWithin(segment, bpb)) {
      for (const offset of hits) {
        const beat = barStart + offset;
        if (beat < segment.startBeat || beat >= segment.endBeat) continue;
        const duration = clip(beat, 0.75, segment.endBeat);
        if (duration === null) continue;
        notes.push({ beat, pitch: withOctave(voiced.bassPitchClass, 3), duration, velocity: 72 });
        for (const pitch of voiced.voicing) {
          notes.push({ beat, pitch, duration, velocity: 68 });
        }
      }
    }
  }
  return notes;
}

/** 아르페지오: 보이싱 음을 순서대로 8분음표로 펼쳐 서정적인 흐름을 만든다. */
export function pianoArpeggio(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const step = 0.5;
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced || voiced.voicing.length === 0) continue;
    let beat = segment.startBeat;
    let i = 0;
    while (beat < segment.endBeat) {
      const duration = clip(beat, step, segment.endBeat);
      if (duration === null) break;
      const pitch = voiced.voicing[i % voiced.voicing.length]!;
      notes.push({ beat, pitch, duration, velocity: 58 });
      beat += step;
      i += 1;
    }
  }
  return notes;
}

/** 정박 블록 코드: 매 박마다 보이싱 전체를 동시에 친다(4성부 화성 느낌). */
export function pianoBlock(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced) continue;
    for (let beat = segment.startBeat; beat < segment.endBeat; beat += 1) {
      const duration = clip(beat, 1, segment.endBeat);
      if (duration === null) break;
      for (const pitch of voiced.voicing) {
        notes.push({ beat, pitch, duration, velocity: 62 });
      }
    }
  }
  return notes;
}

/** 여백이 많은 단순 보이싱: 구간이 시작할 때 한 번만, 길게 울린다. */
export function pianoSparse(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced) continue;
    const duration = clip(segment.startBeat, segment.endBeat - segment.startBeat, segment.endBeat);
    if (duration === null) continue;
    for (const pitch of voiced.voicing) {
      notes.push({ beat: segment.startBeat, pitch, duration, velocity: 50 });
    }
  }
  return notes;
}

// ===== 기타 =====

/**
 * 마디 길이(bpb)에 맞춰 스트럼 자리를 정한다 — 정박마다 한 번씩 + 마지막 박 반 박 전에 당김음
 * 업스트로크 하나. 4/4면 [0,1,2,3,2.5]로 기존과 사실상 같은 자리가 나온다. 이걸 하드코딩된
 * [0,1,2,2.5,3](4/4 전제)으로 두면 3/4 같은 곡에서 한 마디의 beat 3 자리가 다음 마디의 beat 0과
 * 겹쳐 코드가 두 번 울린다(코드 리뷰에서 실측 확인된 버그).
 */
function strumOffsetsFor(beatsPerBarCount: number): number[] {
  const hits: number[] = [];
  for (let beat = 0; beat < beatsPerBarCount; beat += 1) hits.push(beat);
  if (beatsPerBarCount >= 2) hits.push(beatsPerBarCount - 1.5);
  return hits;
}

/** 다운/업 스트로크: 보이싱을 스트럼처럼 짧게 여러 번 친다. */
export function guitarStrum(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
  timeSignature: string,
): NoteEvent[] {
  const bpb = beatsPerBar(timeSignature);
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced) continue;
    for (const barStart of barStartsWithin(segment, bpb)) {
      const hits = strumOffsetsFor(bpb);
      for (const offset of hits) {
        const beat = barStart + offset;
        if (beat < segment.startBeat || beat >= segment.endBeat) continue;
        const duration = clip(beat, 0.4, segment.endBeat);
        if (duration === null) continue;
        for (const pitch of voiced.voicing) {
          notes.push({ beat, pitch: withOctave(pitchClassOnly(pitch), 3), duration, velocity: 50 });
        }
      }
    }
  }
  return notes;
}

/** 핑거피킹: 근음-상성부를 번갈아 8분음표로 굴린다. */
export function guitarFingerpick(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const step = 0.5;
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced || voiced.voicing.length === 0) continue;
    const pattern = [voiced.bassPitchClass, ...voiced.voicing.map(pitchClassOnly)];
    let beat = segment.startBeat;
    let i = 0;
    while (beat < segment.endBeat) {
      const duration = clip(beat, step, segment.endBeat);
      if (duration === null) break;
      const pitchClass = pattern[i % pattern.length]!;
      notes.push({ beat, pitch: withOctave(pitchClass, 3), duration, velocity: 48 });
      beat += step;
      i += 1;
    }
  }
  return notes;
}

/** 약하게 코드만 서포트: 구간 시작에만 낮은 벨로시티로 한 번. */
export function guitarSparse(
  segments: ChordSegment[],
  voicedChords: Map<number, VoicedChord>,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const voiced = voicedChords.get(segment.startBeat);
    if (!voiced) continue;
    const duration = clip(segment.startBeat, 1, segment.endBeat);
    if (duration === null) continue;
    for (const pitch of voiced.voicing) {
      notes.push({
        beat: segment.startBeat,
        pitch: withOctave(pitchClassOnly(pitch), 3),
        duration,
        velocity: 38,
      });
    }
  }
  return notes;
}

// ===== 베이스 =====
// 넷 다 bassOf(segment)로 근음(슬래시 코드면 분모)을 받는다 — 화성 보이싱과 달리 베이스는
// Voicing 딕셔너리를 거치지 않고 코드 근음을 직접 쓴다.

/** 당김음 섞인 워킹 베이스: 정박 근음 + 당김음 자리에 근음을 한 번 더. */
export function bassWalking(
  segments: ChordSegment[],
  timeSignature: string,
  bassOf: (segment: ChordSegment) => string,
): NoteEvent[] {
  const bpb = beatsPerBar(timeSignature);
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    for (const barStart of barStartsWithin(segment, bpb)) {
      const hits = [0, bpb * 0.5 + 0.5];
      for (const offset of hits) {
        const beat = barStart + offset;
        if (beat < segment.startBeat || beat >= segment.endBeat) continue;
        const duration = clip(beat, 1, segment.endBeat);
        if (duration === null) continue;
        notes.push({ beat, pitch: withOctave(bassOf(segment), 2), duration, velocity: 95 });
      }
    }
  }
  return notes;
}

/** 롱톤 근음: 구간 전체를 하나의 긴 근음으로 지속한다. */
export function bassLongTone(
  segments: ChordSegment[],
  bassOf: (segment: ChordSegment) => string,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const duration = clip(segment.startBeat, segment.endBeat - segment.startBeat, segment.endBeat);
    if (duration === null) continue;
    notes.push({
      beat: segment.startBeat,
      pitch: withOctave(bassOf(segment), 2),
      duration,
      velocity: 78,
    });
  }
  return notes;
}

/** 마디 시작 근음: 각 마디 첫 박에만 근음. */
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

/** 간헐적으로만 등장: 구간 시작에만, 짧게. */
export function bassSparse(
  segments: ChordSegment[],
  bassOf: (segment: ChordSegment) => string,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const segment of segments) {
    const duration = clip(segment.startBeat, 1, segment.endBeat);
    if (duration === null) continue;
    notes.push({
      beat: segment.startBeat,
      pitch: withOctave(bassOf(segment), 2),
      duration,
      velocity: 70,
    });
  }
  return notes;
}

// ===== 드럼 =====
// pitch는 음높이가 아니라 smplr DrumMachine 샘플 별칭(kick/snare/hihat-closed/crash) — Task 006부터
// 이어진 관례를 그대로 따른다. 실제 로드되는 킷에 따라 별칭이 다를 수 있어 재생 어댑터(Task 021)가
// 최종 매핑을 책임진다.

/**
 * 8비트 하이햇 그루브: 킥/스네어를 정박마다 번갈아 찍고(마디 길이에 맞춰 확장·축소), 하이햇은
 * 마디 처음부터 끝까지 8분음표로 채운다. 이전엔 4/4를 전제로 킥/스네어를 beat 0~3에, 하이햇을
 * 8개 고정으로 찍었는데, 그러면 3/4 같은 곡에서 beat 3(원래 4/4의 4번째 박) 자리가 다음 마디의
 * beat 0과 겹쳐 노트가 중복 발음됐다(코드 리뷰에서 실측 확인된 버그) — beatsPerBarCount로
 * 받아 항상 그 마디 폭 안에서만 패턴을 채운다.
 */
export function drumsActive(
  barStarts: number[],
  segmentEnd: number,
  beatsPerBarCount: number,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const barStart of barStarts) {
    const push = (beat: number, pitch: string, velocity: number, duration: number) => {
      if (beat >= segmentEnd) return;
      const clipped = clip(beat, duration, segmentEnd);
      if (clipped === null) return;
      notes.push({ beat, pitch, duration: clipped, velocity });
    };
    for (let beat = 0; beat < beatsPerBarCount; beat += 1) {
      const isKick = beat % 2 === 0;
      push(barStart + beat, isKick ? "kick" : "snare", isKick ? 105 : 100, 1);
    }
    for (let eighth = 0; eighth < beatsPerBarCount * 2; eighth += 1) {
      push(barStart + eighth * 0.5, "hihat-closed", 55, 0.5);
    }
  }
  return notes;
}

/** 심벌 위주 절제된 박자: 마디 첫 박에 크래시만. */
export function drumsMinimal(barStarts: number[], segmentEnd: number): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const barStart of barStarts) {
    const duration = clip(barStart, 1, segmentEnd);
    if (duration === null) continue;
    notes.push({ beat: barStart, pitch: "crash", duration, velocity: 45 });
  }
  return notes;
}

export { barStartsWithin };
