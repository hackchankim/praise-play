// Route Handler 요청/응답 계약. 실제 구현은 Phase 3에서 진행 (Task 015~020).

import type {
  ArrangementWithTracks,
  ChordEvent,
  GenrePreset,
  Line,
  Section,
  Setlist,
  SetlistItem,
  SetlistWithItems,
  Song,
  SongImage,
  SongTree,
} from "@/lib/song-model/types";

// ===== 공통 =====
// 성공/실패는 HTTP status로 구분한다 (2xx → 성공 응답 타입 그대로, 그 외 → ApiErrorBody).
// 응답 바디 자체에 성공/실패를 나타내는 별도 필드는 두지 않는다.

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

// ===== 업로드 (Task 015) =====

export interface PresignUploadRequest {
  fileName: string;
  contentType: string;
  /** 클라이언트가 리사이즈까지 마친 뒤의 최종 업로드 예정 크기(바이트). 서버가 상한을 검증한다 */
  fileSize: number;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

/** 업로드했지만 최종적으로 songs 레코드와 연결되지 않은 R2 객체를 정리할 때 사용 */
export interface DeleteUploadRequest {
  objectKey: string;
}

export interface CreateSongWithImagesRequest {
  title: string;
  images: Array<Pick<SongImage, "objectKey" | "orderIndex">>;
}

export interface CreateSongWithImagesResponse {
  song: Song;
}

// ===== 추출 (Task 016) =====
// POST /api/songs/[songId]/extract는 요청/응답 바디가 없다(202 No Content) — 트리거 신호일
// 뿐이라 별도 타입을 두지 않는다. 진행 상태는 REST가 아니라 extraction_jobs 테이블을 Supabase
// Realtime으로 구독해 받는다 (src/lib/song-model/extraction-job.ts의 ExtractionJobRow).

// ===== 곡 목록/상세 (Task 018, 020) =====

export interface ListSongsResponse {
  songs: Song[];
  nextCursor: string | null;
}

export interface GetSongTreeResponse {
  song: SongTree;
  imageUrls: string[];
  /**
   * 서버에 저장된 임시 저장 내용(Task 018) — song.updatedAt이 바뀐 뒤에 남은 낡은 임시 저장은
   * 서버가 걸러내고 null로 내려준다(더 이상 유효한 기준값이 아니므로).
   */
  draftCorrection: SaveCorrectionRequest | null;
}

/** id가 있으면 갱신, 없으면 신규 생성 (upsert). */
export type UpsertChordEvent = Omit<ChordEvent, "id" | "lineId"> & { id?: string };

export type UpsertLine = Omit<Line, "id" | "sectionId"> & {
  id?: string;
  chordEvents: UpsertChordEvent[];
};

export type UpsertSection = Omit<Section, "id" | "songId" | "repeatTargetSectionId"> & {
  id?: string;
  /**
   * 이 요청 내에서 이 섹션을 가리키기 위한 임시 식별자.
   * 섹션 병합·분할로 같은 요청 안에서 새 섹션끼리 반복 관계를 맺어야 할 수 있어
   * (아직 id가 없는 상태이므로) id 대신 요청 스코프의 키로 서로를 참조한다.
   */
  clientKey: string;
  /** 반복 대상 섹션의 기존 id 또는 같은 요청 내 다른 섹션의 clientKey. 없으면 null */
  repeatTarget: string | null;
  lines: UpsertLine[];
};

export interface SaveCorrectionRequest {
  song: Pick<Song, "key" | "tempo" | "timeSignature">;
  sections: UpsertSection[];
  /** 낙관적 잠금 비교값 (Song.updatedAt) */
  updatedAt: string;
}

export interface SaveCorrectionResponse {
  song: SongTree;
}

// ===== 편곡 생성 (Task 019) =====

export interface GenerateArrangementRequest {
  genrePreset: GenrePreset;
}

export interface GenerateArrangementResponse {
  /** 미리듣기(F006)와 Task 021 재생 어댑터가 바로 사용할 수 있도록 실제 노트 데이터를 포함 */
  arrangement: ArrangementWithTracks;
}

// ===== 세트리스트 (Task 020) =====

export interface ListSetlistsResponse {
  setlists: Array<Setlist & { itemCount: number }>;
  nextCursor: string | null;
}

export interface CreateSetlistRequest {
  name: string;
}

export interface CreateSetlistResponse {
  setlist: Setlist;
}

/** 세트리스트 이름 변경 (PATCH /api/setlists/[id] 계약과 대응) */
export interface UpdateSetlistRequest {
  name: string;
}

export interface UpdateSetlistResponse {
  setlist: Setlist;
}

export interface UpdateSetlistItemsRequest {
  items: Array<Pick<SetlistItem, "songId" | "arrangementId" | "orderIndex">>;
}

export interface GetSetlistResponse {
  setlist: SetlistWithItems;
}
