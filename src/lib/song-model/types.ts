// PRD 데이터 모델의 단일 타입 소스.
// 모든 타이밍(*_beat, *_offset)은 beat 단위로 저장하고, 재생 시점에만 smplr 어댑터가 초로 환산한다.
// DB 컬럼은 snake_case, 여기 타입은 camelCase — 매핑은 Task 013의 리포지토리 구현체가 담당한다.

// ===== 열거형 =====
// 배열을 단일 소스로 두고 타입을 파생시킨다 — extraction-schemas.ts의 z.enum()이 이 배열을
// 그대로 재사용해 값 목록이 두 곳에서 따로 나열되며 어긋나는 것을 막는다.
// SQL의 check 제약(supabase/migrations)은 언어 경계상 별도 나열이 불가피하니, 값을 바꿀 때 함께 갱신할 것.

export const SONG_STATUSES = ["draft", "extracted", "corrected"] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

export const SECTION_TYPES = ["verse", "chorus", "bridge", "interlude", "intro", "outro"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const INSTRUMENTS = ["piano", "guitar", "bass", "drums"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const GENRE_PRESETS = [
  "praise_upbeat",
  "ccm_ballad",
  "hymn_traditional",
  "acoustic_intimate",
] as const;
export type GenrePreset = (typeof GENRE_PRESETS)[number];

// ===== 편곡 노트 이벤트 =====

export interface NoteEvent {
  /** 곡 시작 기준 절대 beat 위치 (Section.startBeat와 동일한 좌표계) */
  beat: number;
  /**
   * 음높이. Tonal.js/smplr와 호환되는 노트 이름 표기 (예: "C4").
   * drums 트랙은 음높이가 아니라 smplr DrumMachine의 샘플 별칭(예: "kick", "snare")을 사용한다.
   */
  pitch: string;
  /** 음 길이 (beat 단위). smplr Sequencer 투입 시 어댑터가 ppq 기준 tick으로 환산한다 (Task 021). */
  duration: number;
  /** 세기 (MIDI velocity 관례상 0~127) */
  velocity: number;
}

// ===== 도메인 엔티티 =====

export interface User {
  /** Clerk user_id */
  id: string;
  displayName: string;
  createdAt: string;
}

export interface Song {
  id: string;
  title: string;
  key: string;
  tempo: number;
  timeSignature: string;
  status: SongStatus;
  createdBy: string;
  /** PRD 원본엔 없던 필드. Task 020의 최신순 정렬을 위해 추가 */
  createdAt: string;
  /** PRD 원본엔 없던 필드. 교정 저장 시 낙관적 잠금 비교값 (Task 018) */
  updatedAt: string;
}

export interface Section {
  id: string;
  songId: string;
  type: SectionType;
  /** 곡 내 기본 순서 */
  orderIndex: number;
  /** 곡 시작 기준 절대 beat */
  startBeat: number;
  lengthBeats: number;
  /** 도돌이표 등 반복 시 이동할 섹션. 없으면 null */
  repeatTargetSectionId: string | null;
}

export interface Line {
  id: string;
  sectionId: string;
  lyrics: string;
  /** 섹션 내 줄 순서 */
  orderIndex: number;
  /** 소속 섹션 시작 기준 상대 beat */
  startBeat: number;
}

export interface ChordEvent {
  id: string;
  lineId: string;
  chord: string;
  /** 가사 문자열 내 삽입 위치 (0-indexed) */
  charOffset: number;
  /** 소속 줄(Line) 시작 기준 상대 beat */
  beatOffset: number;
  needsReview: boolean;
}

export interface SongImage {
  id: string;
  songId: string;
  /** R2 오브젝트 키. 서명 URL은 요청 시점에 API가 생성한다 (저장하지 않음) */
  objectKey: string;
  orderIndex: number;
}

export interface Arrangement {
  id: string;
  songId: string;
  genrePreset: GenrePreset;
  createdAt: string;
}

export interface InstrumentTrack {
  id: string;
  arrangementId: string;
  instrument: Instrument;
  notes: NoteEvent[];
}

export interface Setlist {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface SetlistItem {
  id: string;
  setlistId: string;
  songId: string;
  /** 재생할 편곡 지정 */
  arrangementId: string;
  orderIndex: number;
}

// ===== 조회용 트리 조합 타입 =====

export interface LineWithChords extends Line {
  chordEvents: ChordEvent[];
}

export interface SectionWithLines extends Section {
  lines: LineWithChords[];
}

export interface SongTree extends Song {
  sections: SectionWithLines[];
}

export interface ArrangementWithTracks extends Arrangement {
  instrumentTracks: InstrumentTrack[];
}

export interface SetlistWithItems extends Setlist {
  items: SetlistItem[];
}
