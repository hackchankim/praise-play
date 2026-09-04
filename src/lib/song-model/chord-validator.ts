// 결정론적(비-LLM) 코드 문법 검증기 (Task 017).
// Task 016의 비전 LLM 추출은 self-consistency(구조 추출 2회 비교)만으로 needsReview를 정하는데,
// 그건 "박자 수를 얼마나 확신하는가"만 다룰 뿐 "코드 표기 자체가 문법적으로 말이 되는가"는
// 전혀 검증하지 않는다. 이 모듈이 그 빈 틈을 채운다 — LLM 호출 없이 순수 함수라 Task 016의
// 추출 잡 후단과 Task 018의 교정 저장 API(서버 측 재검증) 양쪽에서 그대로 재사용한다.
import { Chord, Key, Note } from "tonal";

// ROADMAP 명시 문법. 대표적인 리드시트 코드 표기(3화음/7화음/서스/딤/어그/애드/텐션 + 슬래시 베이스)를
// 다루되, 흔치 않은 확장 표기(예: b9, #11 같은 개별 알터레이션)는 의도적으로 범위 밖에 둔다 —
// 그런 표기는 needsReview로 넘겨 사람이 교정 UI에서 확인하게 하는 편이 정규식을 한없이
// 정교하게 만드는 것보다 낫다(정확도 100% 전제가 아니라는 이 Task의 전제와 일치).
const CHORD_SYNTAX_REGEX =
  /^[A-G](#|b)?(maj7|m7|m|7|sus2|sus4|dim7?|aug|add9|6|9|11|13)?(\/[A-G](#|b)?)?$/;

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

/** 위첨자 숫자(Dsus⁴, C⁶)를 일반 숫자로 바꾼다 — OCR·수기 표기가 흔히 이 형태로 나온다. */
export function normalizeChordNotation(raw: string): string {
  return raw.trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => SUPERSCRIPT_DIGITS[ch] ?? ch);
}

/** "Em" → { tonic: "E", isMinor: true }. 파싱 실패하면 null. */
function parseKeyString(key: string): { tonic: string; isMinor: boolean } | null {
  const match = /^([A-G](?:#|b)?)(m)?$/.exec(key.trim());
  if (!match) return null;
  return { tonic: match[1], isMinor: match[2] === "m" };
}

/** 조표의 다이어토닉 스케일 음을 크로마(0~11) 집합으로 반환한다 — 이명동음 표기 차이를 흡수한다. */
function keyScaleChromas(key: string): Set<number> | null {
  const parsed = parseKeyString(key);
  if (!parsed) return null;
  if (!parsed.isMinor) {
    return new Set(Key.majorKey(parsed.tonic).scale.map((note) => Note.chroma(note)));
  }

  // 단조는 자연 단음계만으로 보면 너무 좁다 — 딸림화음의 반음 올림 7음(화성 단음계)이나 상행
  // 선율 단음계의 올림 6·7음은 실제 곡에서 흔히 쓰이는 정상적인 진행(딸림7화음, 이끔음 화음
  // 등)이라 세 단음계(자연/화성/선율)를 합쳐 이례적 여부를 판단한다. 자연 단음계만 썼다면
  // "Em 곡의 B7"처럼 가장 흔한 딸림화음 근음(B)이 어차피 자연 단음계에도 있어 걸리진 않지만,
  // 화성 단음계에서만 나오는 이끔음 근음(예: Em의 D#)은 자연 단음계 기준으로만 보면 오탐이 난다.
  const minorKey = Key.minorKey(parsed.tonic);
  const scale = [...minorKey.natural.scale, ...minorKey.harmonic.scale, ...minorKey.melodic.scale];
  return new Set(scale.map((note) => Note.chroma(note)));
}

export interface ChordValidationResult {
  /** 위첨자 정규화까지 마친 최종 표기. DB에는 이 값을 저장한다. */
  normalized: string;
  /** ROADMAP 정규식 문법을 통과하는가 */
  syntaxValid: boolean;
  /** Tonal.js가 실제 화음으로 파싱 가능한가(정규식은 통과했지만 음악적으로 말이 안 되는 조합 방지) */
  parsedByTonal: boolean;
  /** 조표의 다이어토닉 스케일에 속하지 않는 근음(차용/이탈 화음일 수 있음) */
  unusualForKey: boolean;
  /** 위 세 신호 중 하나라도 걸리면 true — chord_events.needs_review에 그대로 반영한다 */
  needsReview: boolean;
}

/**
 * 코드 표기 하나를 검증한다. key는 "G", "Bb", "Em", "F#m"처럼 Song.key와 같은 표기를 받는다.
 * key가 이 앱이 다루지 않는 형태(파싱 실패)면 조표 대비 검사만 건너뛴다 — 문법 검증 자체는
 * 조표와 무관하게 항상 수행된다.
 */
export function validateChord(rawChord: string, key: string): ChordValidationResult {
  const normalized = normalizeChordNotation(rawChord);
  const syntaxValid = CHORD_SYNTAX_REGEX.test(normalized);

  const parsed = Chord.get(normalized);
  const parsedByTonal = !parsed.empty;

  let unusualForKey = false;
  if (parsedByTonal && parsed.tonic) {
    const scaleChromas = keyScaleChromas(key);
    if (scaleChromas && !scaleChromas.has(Note.chroma(parsed.tonic))) {
      unusualForKey = true;
    }
  }

  return {
    normalized,
    syntaxValid,
    parsedByTonal,
    unusualForKey,
    needsReview: !syntaxValid || !parsedByTonal || unusualForKey,
  };
}
