// Route Handler 요청/응답 계약. 실제 구현은 Phase 3에서 진행 (Task 015~020).

import type {
  ArrangementWithTracks,
  ChordEvent,
  GenrePreset,
  Line,
  Section,
  SetlistItem,
  SetlistWithItems,
  Song,
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
}

export interface PresignUploadResponse {
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

// ===== 곡 목록/상세 (Task 018, 020) =====

export interface ListSongsResponse {
  songs: Song[];
  nextCursor: string | null;
}

export interface GetSongTreeResponse {
  song: SongTree;
  imageUrls: string[];
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

export interface CreateSetlistRequest {
  name: string;
}

export interface UpdateSetlistItemsRequest {
  items: Array<Pick<SetlistItem, "songId" | "arrangementId" | "orderIndex">>;
}

export interface GetSetlistResponse {
  setlist: SetlistWithItems;
}
