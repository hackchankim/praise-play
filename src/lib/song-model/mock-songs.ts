// Phase 2(더미 데이터) 시드 데이터 — 곡/섹션/줄/코드 (Task 006).
// 실제 존재하는 찬양을 그대로 베끼지 않고, "1절/2절/후렴/브릿지" 구조를 갖춘 예시 가사·코드 진행을
// 직접 작성했다. Phase 3(Task 013)에서 이 배열들과 동일한 형태로 Supabase 시드 스크립트를 작성한다.
//
// 편곡/트랙 생성 로직은 arrangement-blueprint.ts, 세트리스트는 mock-setlists.ts로 분리했다 —
// 이 파일은 순수 데이터 픽스처만 담고, 실제 요청마다 실행되는 런타임 로직(Tonal.js 기반 편곡 생성)은
// 섞지 않는다.

import type { ChordEvent, Line, Section, Song, User } from "@/lib/song-model/types";

export const MOCK_USER: User = {
  // Clerk user_id 형태를 흉내낸 목 값 (Task 014에서 실제 Clerk id로 대체)
  id: "user-mock-1",
  displayName: "김찬양",
  createdAt: "2026-07-01T00:00:00.000Z",
};

// ===== 곡 A: "내 영혼의 노래" — 절/후렴/브릿지 + needsReview 사례를 모두 포함하는 대표 곡 =====

export const SONG_A_ID = "song-soul-song";

const songA: Song = {
  id: SONG_A_ID,
  title: "내 영혼의 노래",
  key: "G",
  tempo: 82,
  timeSignature: "4/4",
  // 추출은 끝났지만 후렴의 needsReview 코드가 아직 검토되지 않아 "corrected"로 넘어가지 못한 상태
  status: "extracted",
  createdBy: MOCK_USER.id,
  createdAt: "2026-08-18T09:12:00.000Z",
  updatedAt: "2026-08-25T07:40:00.000Z",
};

const songASections: Section[] = [
  {
    id: `${SONG_A_ID}-intro`,
    songId: SONG_A_ID,
    type: "intro",
    orderIndex: 0,
    startBeat: 0,
    lengthBeats: 8,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_A_ID}-verse1`,
    songId: SONG_A_ID,
    type: "verse",
    orderIndex: 1,
    startBeat: 8,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_A_ID}-verse2`,
    songId: SONG_A_ID,
    type: "verse",
    orderIndex: 2,
    startBeat: 24,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_A_ID}-chorus`,
    songId: SONG_A_ID,
    type: "chorus",
    orderIndex: 3,
    startBeat: 40,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_A_ID}-bridge`,
    songId: SONG_A_ID,
    type: "bridge",
    orderIndex: 4,
    startBeat: 56,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_A_ID}-outro`,
    songId: SONG_A_ID,
    type: "outro",
    orderIndex: 5,
    startBeat: 72,
    lengthBeats: 8,
    // 도돌이표: 아웃트로 전에 후렴으로 되돌아가 한 번 더 부른다
    repeatTargetSectionId: `${SONG_A_ID}-chorus`,
  },
];

const songALines: Line[] = [
  // --- 1절 ---
  {
    id: `${SONG_A_ID}-verse1-l1`,
    sectionId: `${SONG_A_ID}-verse1`,
    lyrics: "주님 앞에 나아갑니다",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_A_ID}-verse1-l2`,
    sectionId: `${SONG_A_ID}-verse1`,
    lyrics: "지친 마음 어루만지사",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_A_ID}-verse1-l3`,
    sectionId: `${SONG_A_ID}-verse1`,
    lyrics: "새벽 이슬같이 나를 적시사",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_A_ID}-verse1-l4`,
    sectionId: `${SONG_A_ID}-verse1`,
    lyrics: "은혜의 강가로 이끄소서",
    orderIndex: 3,
    startBeat: 12,
  },
  // --- 2절 ---
  {
    id: `${SONG_A_ID}-verse2-l1`,
    sectionId: `${SONG_A_ID}-verse2`,
    lyrics: "험한 길 걸어갈 때에도",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_A_ID}-verse2-l2`,
    sectionId: `${SONG_A_ID}-verse2`,
    lyrics: "주님 손 잡아 주소서",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_A_ID}-verse2-l3`,
    sectionId: `${SONG_A_ID}-verse2`,
    lyrics: "넘어져도 다시 일으켜",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_A_ID}-verse2-l4`,
    sectionId: `${SONG_A_ID}-verse2`,
    lyrics: "걷게 하시는 나의 주",
    orderIndex: 3,
    startBeat: 12,
  },
  // --- 후렴 ---
  {
    id: `${SONG_A_ID}-chorus-l1`,
    sectionId: `${SONG_A_ID}-chorus`,
    lyrics: "할렐루야 찬양하리 내 영혼아",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_A_ID}-chorus-l2`,
    sectionId: `${SONG_A_ID}-chorus`,
    lyrics: "온 땅에 울려 퍼지는 그 이름",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_A_ID}-chorus-l3`,
    sectionId: `${SONG_A_ID}-chorus`,
    lyrics: "영원토록 변치 않을 사랑",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_A_ID}-chorus-l4`,
    sectionId: `${SONG_A_ID}-chorus`,
    lyrics: "내 삶에 가득 채우소서",
    orderIndex: 3,
    startBeat: 12,
  },
  // --- 브릿지 ---
  {
    id: `${SONG_A_ID}-bridge-l1`,
    sectionId: `${SONG_A_ID}-bridge`,
    lyrics: "주 앞에 잠잠히 서서",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_A_ID}-bridge-l2`,
    sectionId: `${SONG_A_ID}-bridge`,
    lyrics: "내 모든 염려 내려놓네",
    orderIndex: 1,
    startBeat: 8,
  },
];

const songAChordEvents: ChordEvent[] = [
  // 1절
  {
    id: `${SONG_A_ID}-verse1-l1-c1`,
    lineId: `${SONG_A_ID}-verse1-l1`,
    chord: "G",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l1-c2`,
    lineId: `${SONG_A_ID}-verse1-l1`,
    chord: "D",
    charOffset: 3,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l2-c1`,
    lineId: `${SONG_A_ID}-verse1-l2`,
    chord: "Em",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l2-c2`,
    lineId: `${SONG_A_ID}-verse1-l2`,
    chord: "C",
    charOffset: 6,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l3-c1`,
    lineId: `${SONG_A_ID}-verse1-l3`,
    chord: "G",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l3-c2`,
    lineId: `${SONG_A_ID}-verse1-l3`,
    chord: "D",
    charOffset: 3,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l4-c1`,
    lineId: `${SONG_A_ID}-verse1-l4`,
    chord: "C",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse1-l4-c2`,
    lineId: `${SONG_A_ID}-verse1-l4`,
    chord: "D",
    charOffset: 8,
    beatOffset: 2,
    needsReview: false,
  },
  // 2절
  {
    id: `${SONG_A_ID}-verse2-l1-c1`,
    lineId: `${SONG_A_ID}-verse2-l1`,
    chord: "G",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l1-c2`,
    lineId: `${SONG_A_ID}-verse2-l1`,
    chord: "D",
    charOffset: 5,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l2-c1`,
    lineId: `${SONG_A_ID}-verse2-l2`,
    chord: "Em",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l2-c2`,
    lineId: `${SONG_A_ID}-verse2-l2`,
    chord: "C",
    charOffset: 5,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l3-c1`,
    lineId: `${SONG_A_ID}-verse2-l3`,
    chord: "G",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l3-c2`,
    lineId: `${SONG_A_ID}-verse2-l3`,
    chord: "D",
    charOffset: 5,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l4-c1`,
    lineId: `${SONG_A_ID}-verse2-l4`,
    chord: "C",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-verse2-l4-c2`,
    lineId: `${SONG_A_ID}-verse2-l4`,
    chord: "D",
    charOffset: 7,
    beatOffset: 2,
    needsReview: false,
  },
  // 후렴 — 코드 문법 검증기(Task017)가 위첨자 표기(Dsus⁴)를 아직 정규화하지 못해 걸러진 사례
  {
    id: `${SONG_A_ID}-chorus-l1-c1`,
    lineId: `${SONG_A_ID}-chorus-l1`,
    chord: "G",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l1-c2`,
    lineId: `${SONG_A_ID}-chorus-l1`,
    chord: "Dsus⁴",
    charOffset: 5,
    beatOffset: 2,
    needsReview: true,
  },
  {
    id: `${SONG_A_ID}-chorus-l1-c3`,
    lineId: `${SONG_A_ID}-chorus-l1`,
    chord: "Em",
    charOffset: 10,
    beatOffset: 3,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l2-c1`,
    lineId: `${SONG_A_ID}-chorus-l2`,
    chord: "C",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l2-c2`,
    lineId: `${SONG_A_ID}-chorus-l2`,
    chord: "G",
    charOffset: 8,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l3-c1`,
    lineId: `${SONG_A_ID}-chorus-l3`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l3-c2`,
    lineId: `${SONG_A_ID}-chorus-l3`,
    chord: "Em",
    charOffset: 8,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l4-c1`,
    lineId: `${SONG_A_ID}-chorus-l4`,
    chord: "C",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-chorus-l4-c2`,
    lineId: `${SONG_A_ID}-chorus-l4`,
    chord: "G",
    charOffset: 5,
    beatOffset: 2,
    needsReview: false,
  },
  // 브릿지
  {
    id: `${SONG_A_ID}-bridge-l1-c1`,
    lineId: `${SONG_A_ID}-bridge-l1`,
    chord: "Em",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-bridge-l1-c2`,
    lineId: `${SONG_A_ID}-bridge-l1`,
    chord: "Bm",
    charOffset: 5,
    beatOffset: 4,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-bridge-l2-c1`,
    lineId: `${SONG_A_ID}-bridge-l2`,
    chord: "C",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_A_ID}-bridge-l2-c2`,
    lineId: `${SONG_A_ID}-bridge-l2`,
    chord: "D",
    charOffset: 8,
    beatOffset: 4,
    needsReview: false,
  },
];

// ===== 곡 B: "존귀하신 그 이름" — 절/후렴만으로 구성된 정갈한 찬송 스타일 (needsReview 없음) =====

export const SONG_B_ID = "song-precious-name";

const songB: Song = {
  id: SONG_B_ID,
  title: "존귀하신 그 이름",
  key: "D",
  tempo: 68,
  timeSignature: "4/4",
  status: "corrected",
  createdBy: MOCK_USER.id,
  createdAt: "2026-08-10T03:05:00.000Z",
  updatedAt: "2026-08-11T13:20:00.000Z",
};

const songBSections: Section[] = [
  {
    id: `${SONG_B_ID}-verse1`,
    songId: SONG_B_ID,
    type: "verse",
    orderIndex: 0,
    startBeat: 0,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_B_ID}-verse2`,
    songId: SONG_B_ID,
    type: "verse",
    orderIndex: 1,
    startBeat: 16,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_B_ID}-chorus`,
    songId: SONG_B_ID,
    type: "chorus",
    orderIndex: 2,
    startBeat: 32,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
];

const songBLines: Line[] = [
  {
    id: `${SONG_B_ID}-verse1-l1`,
    sectionId: `${SONG_B_ID}-verse1`,
    lyrics: "존귀하신 주 이름 앞에",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_B_ID}-verse1-l2`,
    sectionId: `${SONG_B_ID}-verse1`,
    lyrics: "무릎 꿇어 경배합니다",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_B_ID}-verse1-l3`,
    sectionId: `${SONG_B_ID}-verse1`,
    lyrics: "온 세상 지으신 창조주",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_B_ID}-verse1-l4`,
    sectionId: `${SONG_B_ID}-verse1`,
    lyrics: "영원히 다스리시네",
    orderIndex: 3,
    startBeat: 12,
  },
  {
    id: `${SONG_B_ID}-verse2-l1`,
    sectionId: `${SONG_B_ID}-verse2`,
    lyrics: "십자가 그 사랑 앞에",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_B_ID}-verse2-l2`,
    sectionId: `${SONG_B_ID}-verse2`,
    lyrics: "감사와 찬양 드리네",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_B_ID}-verse2-l3`,
    sectionId: `${SONG_B_ID}-verse2`,
    lyrics: "부활의 소망 안에서",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_B_ID}-verse2-l4`,
    sectionId: `${SONG_B_ID}-verse2`,
    lyrics: "새 생명 얻었네",
    orderIndex: 3,
    startBeat: 12,
  },
  {
    id: `${SONG_B_ID}-chorus-l1`,
    sectionId: `${SONG_B_ID}-chorus`,
    lyrics: "존귀 존귀하신 이름",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_B_ID}-chorus-l2`,
    sectionId: `${SONG_B_ID}-chorus`,
    lyrics: "영광 영광 받으소서",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_B_ID}-chorus-l3`,
    sectionId: `${SONG_B_ID}-chorus`,
    lyrics: "찬양 찬양 올려드리네",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_B_ID}-chorus-l4`,
    sectionId: `${SONG_B_ID}-chorus`,
    lyrics: "영원히 다스리소서",
    orderIndex: 3,
    startBeat: 12,
  },
];

const songBChordEvents: ChordEvent[] = [
  {
    id: `${SONG_B_ID}-verse1-l1-c1`,
    lineId: `${SONG_B_ID}-verse1-l1`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l1-c2`,
    lineId: `${SONG_B_ID}-verse1-l1`,
    chord: "A",
    charOffset: 7,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l2-c1`,
    lineId: `${SONG_B_ID}-verse1-l2`,
    chord: "Bm",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l2-c2`,
    lineId: `${SONG_B_ID}-verse1-l2`,
    chord: "G",
    charOffset: 6,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l3-c1`,
    lineId: `${SONG_B_ID}-verse1-l3`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l3-c2`,
    lineId: `${SONG_B_ID}-verse1-l3`,
    chord: "A",
    charOffset: 9,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l4-c1`,
    lineId: `${SONG_B_ID}-verse1-l4`,
    chord: "Bm",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse1-l4-c2`,
    lineId: `${SONG_B_ID}-verse1-l4`,
    chord: "G",
    charOffset: 4,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l1-c1`,
    lineId: `${SONG_B_ID}-verse2-l1`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l1-c2`,
    lineId: `${SONG_B_ID}-verse2-l1`,
    chord: "A",
    charOffset: 6,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l2-c1`,
    lineId: `${SONG_B_ID}-verse2-l2`,
    chord: "Bm",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l2-c2`,
    lineId: `${SONG_B_ID}-verse2-l2`,
    chord: "G",
    charOffset: 4,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l3-c1`,
    lineId: `${SONG_B_ID}-verse2-l3`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l3-c2`,
    lineId: `${SONG_B_ID}-verse2-l3`,
    chord: "A",
    charOffset: 4,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l4-c1`,
    lineId: `${SONG_B_ID}-verse2-l4`,
    chord: "Bm",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-verse2-l4-c2`,
    lineId: `${SONG_B_ID}-verse2-l4`,
    chord: "G",
    charOffset: 5,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l1-c1`,
    lineId: `${SONG_B_ID}-chorus-l1`,
    chord: "Bm",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l1-c2`,
    lineId: `${SONG_B_ID}-chorus-l1`,
    chord: "G",
    charOffset: 8,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l2-c1`,
    lineId: `${SONG_B_ID}-chorus-l2`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l2-c2`,
    lineId: `${SONG_B_ID}-chorus-l2`,
    chord: "A",
    charOffset: 6,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l3-c1`,
    lineId: `${SONG_B_ID}-chorus-l3`,
    chord: "Bm",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l3-c2`,
    lineId: `${SONG_B_ID}-chorus-l3`,
    chord: "G",
    charOffset: 6,
    beatOffset: 2,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l4-c1`,
    lineId: `${SONG_B_ID}-chorus-l4`,
    chord: "D",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_B_ID}-chorus-l4-c2`,
    lineId: `${SONG_B_ID}-chorus-l4`,
    chord: "A",
    charOffset: 4,
    beatOffset: 2,
    needsReview: false,
  },
];

// ===== 곡 C: "빛 되신 주" — 세트리스트를 채우기 위한 경쾌한 스타일의 짧은 더미 곡 =====

export const SONG_C_ID = "song-light-of-the-lord";

const songC: Song = {
  id: SONG_C_ID,
  title: "빛 되신 주",
  key: "E",
  tempo: 132,
  timeSignature: "4/4",
  status: "corrected",
  createdBy: MOCK_USER.id,
  createdAt: "2026-08-05T11:00:00.000Z",
  updatedAt: "2026-08-06T02:10:00.000Z",
};

const songCSections: Section[] = [
  {
    id: `${SONG_C_ID}-verse1`,
    songId: SONG_C_ID,
    type: "verse",
    orderIndex: 0,
    startBeat: 0,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
  {
    id: `${SONG_C_ID}-chorus`,
    songId: SONG_C_ID,
    type: "chorus",
    orderIndex: 1,
    startBeat: 16,
    lengthBeats: 16,
    repeatTargetSectionId: null,
  },
];

const songCLines: Line[] = [
  {
    id: `${SONG_C_ID}-verse1-l1`,
    sectionId: `${SONG_C_ID}-verse1`,
    lyrics: "빛 되신 주 앞으로 나가요",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_C_ID}-verse1-l2`,
    sectionId: `${SONG_C_ID}-verse1`,
    lyrics: "어둠은 이제 물러가라",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_C_ID}-verse1-l3`,
    sectionId: `${SONG_C_ID}-verse1`,
    lyrics: "주의 영광 이 땅 위에",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_C_ID}-verse1-l4`,
    sectionId: `${SONG_C_ID}-verse1`,
    lyrics: "가득히 임하소서",
    orderIndex: 3,
    startBeat: 12,
  },
  {
    id: `${SONG_C_ID}-chorus-l1`,
    sectionId: `${SONG_C_ID}-chorus`,
    lyrics: "빛으로 오셨네 우리 주님",
    orderIndex: 0,
    startBeat: 0,
  },
  {
    id: `${SONG_C_ID}-chorus-l2`,
    sectionId: `${SONG_C_ID}-chorus`,
    lyrics: "어둠을 밝히시네 영원토록",
    orderIndex: 1,
    startBeat: 4,
  },
  {
    id: `${SONG_C_ID}-chorus-l3`,
    sectionId: `${SONG_C_ID}-chorus`,
    lyrics: "찬양과 경배를 드리네",
    orderIndex: 2,
    startBeat: 8,
  },
  {
    id: `${SONG_C_ID}-chorus-l4`,
    sectionId: `${SONG_C_ID}-chorus`,
    lyrics: "영광 받으소서 주님",
    orderIndex: 3,
    startBeat: 12,
  },
];

const songCChordEvents: ChordEvent[] = [
  {
    id: `${SONG_C_ID}-verse1-l1-c1`,
    lineId: `${SONG_C_ID}-verse1-l1`,
    chord: "E",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-verse1-l2-c1`,
    lineId: `${SONG_C_ID}-verse1-l2`,
    chord: "B",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-verse1-l3-c1`,
    lineId: `${SONG_C_ID}-verse1-l3`,
    chord: "C#m",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-verse1-l4-c1`,
    lineId: `${SONG_C_ID}-verse1-l4`,
    chord: "A",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-chorus-l1-c1`,
    lineId: `${SONG_C_ID}-chorus-l1`,
    chord: "A",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-chorus-l2-c1`,
    lineId: `${SONG_C_ID}-chorus-l2`,
    chord: "B",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-chorus-l3-c1`,
    lineId: `${SONG_C_ID}-chorus-l3`,
    chord: "C#m",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
  {
    id: `${SONG_C_ID}-chorus-l4-c1`,
    lineId: `${SONG_C_ID}-chorus-l4`,
    chord: "E",
    charOffset: 0,
    beatOffset: 0,
    needsReview: false,
  },
];

// ===== 곡 D: "아침의 기도" — 업로드만 되고 아직 추출 전인 draft 상태 (홈 화면 빈 상태·상태뱃지 데모용) =====

const SONG_D_ID = "song-morning-prayer";

const songD: Song = {
  id: SONG_D_ID,
  title: "아침의 기도",
  // 추출 전이라 실제 값이 아니라 업로드 시점의 잠정 기본값 (교정 페이지에서 확정)
  key: "C",
  tempo: 100,
  timeSignature: "4/4",
  status: "draft",
  createdBy: MOCK_USER.id,
  createdAt: "2026-08-28T23:50:00.000Z",
  updatedAt: "2026-08-28T23:50:00.000Z",
};

// ===== 곡 목록 export =====

export const MOCK_SONGS: Song[] = [songA, songB, songC, songD];
export const MOCK_SECTIONS: Section[] = [...songASections, ...songBSections, ...songCSections];
export const MOCK_LINES: Line[] = [...songALines, ...songBLines, ...songCLines];
export const MOCK_CHORD_EVENTS: ChordEvent[] = [
  ...songAChordEvents,
  ...songBChordEvents,
  ...songCChordEvents,
];
