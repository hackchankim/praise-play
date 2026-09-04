// Tonal.js Voicing/VoiceLeading을 감싸는 안전한 래퍼 (Task 019).
// Voicing.sequence()는 사전에 없는 코드 타입(딕셔너리에 매칭되는 별칭이 하나도 없는 경우)을
// 만나면 그 자리에 빈 배열을 낸다 — 그대로 쓰면 이후 노트 생성 단계에서 undefined 참조로
// 크래시한다. 테스트 체크리스트("파싱 불가 코드가 포함된 곡에서 엔진이 크래시 없이 스킵·대체
// 처리하는가")가 명시적으로 요구하는 지점이라 여기서 한 번에 막는다.
//
// 슬래시 코드(D/F#)는 Chord.tokenize가 이미 베이스를 분리해 처리하므로(tonic="D", symbol="",
// bass="F#") Voicing 쪽에 그대로 넘겨도 안전하다 — 베이스 악기 트랙은 이 모듈이 아니라
// instruments.ts가 Chord.get(chord).bass로 별도로 뽑아 쓴다.
import { Chord, Note, Voicing, VoiceLeading } from "tonal";

const HARD_FALLBACK_VOICING = ["C3", "E3", "G3"];
const FALLBACK_PITCH_CLASS = "C";

export interface VoicedChord {
  chord: string;
  /** 성부 연결이 적용된 다성 보이싱(옥타브 포함). 파싱 실패 시 안전한 기본 트라이어드로 대체 */
  voicing: string[];
  /** 베이스 악기용 근음(슬래시 코드면 분모). 옥타브 없음 */
  bassPitchClass: string;
  /** 코드가 정상적으로 해석됐는가 — false면 폴백을 썼다는 뜻(엔진이 스킵하지 않고 대체했다) */
  parsed: boolean;
}

export function bassPitchClassOf(chord: string): string {
  const parsed = Chord.get(chord);
  return parsed.bass || parsed.tonic || FALLBACK_PITCH_CLASS;
}

/**
 * 딕셔너리에 이 코드 타입(예: m7)이 없어 Voicing이 빈 보이싱을 낼 때 쓰는 대체값. 하드코딩된
 * C 트라이어드로 떨어지기 전에, Tonal이 어차피 알고 있는 코드 구성음(Chord.get(chord).notes —
 * 우리 커스텀 보이싱 딕셔너리와 무관하게 Tonal 내부 코드 타입 데이터베이스 전체를 씀)으로 근사
 * 보이싱을 만든다 — 그래야 예를 들어 찬송가 프리셋(triads 딕셔너리만 씀)이 마침 7화음을 만나도
 * "Dm7인데 C장조로 들린다" 같은 완전히 틀린 소리 대신 최소한 음이 맞는 소리가 난다.
 */
function chordAwareFallback(chord: string): string[] {
  const parsed = Chord.get(chord);
  if (parsed.empty || parsed.notes.length === 0) return HARD_FALLBACK_VOICING;
  return parsed.notes.map((pitchClass, index) => withOctave(pitchClass, index === 0 ? 3 : 4));
}

/**
 * 코드 심볼 배열 전체에 대해 성부 연결이 적용된 보이싱 시퀀스를 만든다. range/dictionary로
 * 프리셋별 음역·보이싱 어휘를 다르게 줄 수 있다(예: 찬송가는 단순 트라이어드, 경쾌한 찬양은
 * 확장 화음).
 */
export function buildVoicingSequence(
  chords: string[],
  range: [string, string],
  dictionary: Record<string, string[]>,
): VoicedChord[] {
  const rawSequence = Voicing.sequence(chords, range, dictionary, VoiceLeading.topNoteDiff);

  return chords.map((chord, index) => {
    const bassPitchClass = bassPitchClassOf(chord);
    const rawVoicing = rawSequence[index];

    if (!rawVoicing || rawVoicing.length === 0) {
      return { chord, voicing: chordAwareFallback(chord), bassPitchClass, parsed: false };
    }
    return { chord, voicing: rawVoicing, bassPitchClass, parsed: true };
  });
}

/** 근음의 옥타브를 지정해 pitch 문자열을 만든다 ("C" + 2 → "C2"). */
export function withOctave(pitchClass: string, octave: number): string {
  return `${pitchClass}${octave}`;
}

/** 두 pitch 사이의 반음 거리 — 성부가 인접한 옥타브로 잘 배치됐는지 확인할 때 쓴다. */
export function semitoneDistance(a: string, b: string): number {
  const midiA = Note.midi(a);
  const midiB = Note.midi(b);
  if (midiA === null || midiB === null) return 0;
  return Math.abs(midiA - midiB);
}
