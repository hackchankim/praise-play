// SongRepository — 곡 데이터 액세스 인터페이스와 Supabase 구현체 (Task 006 인터페이스, Task 013 구현체).
// 메서드 시그니처는 src/lib/api/contracts.ts의 Phase 3 Route Handler 계약(ListSongsResponse,
// GetSongTreeResponse, SaveCorrectionRequest/Response)과 그대로 대응한다.

import type {
  GetSongTreeResponse,
  ListSongsResponse,
  SaveCorrectionResponse,
  SaveCorrectionRequest,
} from "@/lib/api/contracts";
import type {
  ChordEvent,
  LineWithChords,
  SectionType,
  SectionWithLines,
  Song,
  SongImage,
  SongStatus,
  SongTree,
} from "@/lib/song-model/types";
import { createId } from "@/lib/repositories/mock-utils";
import { NotFoundError, OptimisticLockError, ValidationError } from "@/lib/repositories/errors";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";
import { env } from "@/lib/env";

// ===== DB row ↔ 도메인 타입 매핑 =====
// DB 컬럼은 snake_case, 도메인 타입은 camelCase (src/lib/song-model/types.ts 상단 주석 참고).

interface SongRow {
  id: string;
  title: string;
  key: string;
  tempo: number;
  time_signature: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ChordEventRow {
  id: string;
  line_id: string;
  chord: string;
  char_offset: number;
  beat_offset: number;
  needs_review: boolean;
}

interface LineRow {
  id: string;
  section_id: string;
  lyrics: string;
  order_index: number;
  start_beat: number;
}

interface SectionRow {
  id: string;
  song_id: string;
  type: string;
  order_index: number;
  start_beat: number;
  length_beats: number;
  repeat_target_section_id: string | null;
}

interface SongImageRow {
  id: string;
  song_id: string;
  object_key: string;
  order_index: number;
}

function mapSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    key: row.key,
    tempo: row.tempo,
    timeSignature: row.time_signature,
    status: row.status as SongStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChordEvent(row: ChordEventRow): ChordEvent {
  return {
    id: row.id,
    lineId: row.line_id,
    chord: row.chord,
    charOffset: row.char_offset,
    beatOffset: row.beat_offset,
    needsReview: row.needs_review,
  };
}

function mapLine(row: LineRow & { chord_events: ChordEventRow[] }): LineWithChords {
  return {
    id: row.id,
    sectionId: row.section_id,
    lyrics: row.lyrics,
    orderIndex: row.order_index,
    startBeat: row.start_beat,
    chordEvents: [...row.chord_events]
      .sort((a, b) => a.beat_offset - b.beat_offset)
      .map(mapChordEvent),
  };
}

function mapSection(
  row: SectionRow & { lines: (LineRow & { chord_events: ChordEventRow[] })[] },
): SectionWithLines {
  return {
    id: row.id,
    songId: row.song_id,
    type: row.type as SectionType,
    orderIndex: row.order_index,
    startBeat: row.start_beat,
    lengthBeats: row.length_beats,
    repeatTargetSectionId: row.repeat_target_section_id,
    lines: [...row.lines].sort((a, b) => a.order_index - b.order_index).map(mapLine),
  };
}

type SongTreeRow = SongRow & {
  sections: (SectionRow & { lines: (LineRow & { chord_events: ChordEventRow[] })[] })[];
  song_images: SongImageRow[];
};

function mapSongTree(row: SongTreeRow): SongTree {
  return {
    ...mapSong(row),
    sections: [...row.sections].sort((a, b) => a.order_index - b.order_index).map(mapSection),
  };
}

/** R2 버킷은 공개 읽기라(Task 013) 서명 없이 base URL + object_key로 바로 접근 가능하다. */
function buildImageUrls(images: SongImageRow[]): string[] {
  return [...images]
    .sort((a, b) => a.order_index - b.order_index)
    .map((image) => `${env.NEXT_PUBLIC_R2_PUBLIC_URL}/${image.object_key}`);
}

export interface ListSongsParams {
  cursor?: string | null;
  limit?: number;
}

export interface CreateSongWithImagesInput {
  title: string;
  /** R2에 이미 업로드된 객체 키. 순서대로 song_images에 등록된다 */
  images: Array<Pick<SongImage, "objectKey" | "orderIndex">>;
}

export interface SongRepository {
  /** 최신순 곡 목록 조회 (GET /api/songs 계약과 대응) */
  list(params?: ListSongsParams): Promise<ListSongsResponse>;
  /** 곡 전체 트리 조회. 존재하지 않으면 null — 라우트 핸들러가 이를 404로 변환한다 */
  getTree(songId: string): Promise<GetSongTreeResponse | null>;
  /**
   * 업로드 완료 시 draft 상태의 곡 레코드와 이미지 등록을 함께 만든다(트랜잭션, Task 015).
   * 소유자는 서버가 현재 로그인 사용자로 강제한다 — 클라이언트가 createdBy를 지정할 수 없다.
   */
  createWithImages(input: CreateSongWithImagesInput): Promise<Song>;
  /**
   * 교정 저장(PATCH /api/songs/[songId]/correction 계약과 대응). 섹션/줄/코드를 통째로 upsert하며
   * 요청에 포함되지 않은 기존 항목은 삭제로 반영된다. updatedAt이 일치하지 않으면 낙관적 잠금 충돌.
   */
  saveCorrection(songId: string, request: SaveCorrectionRequest): Promise<SaveCorrectionResponse>;
  delete(songId: string): Promise<void>;
}

export class SupabaseSongRepository implements SongRepository {
  async list(params: ListSongsParams = {}): Promise<ListSongsResponse> {
    let query = supabaseRepositoryClient
      .from("songs")
      .select("*")
      .order("created_at", { ascending: false });
    if (params.limit !== undefined) query = query.limit(params.limit);

    const { data, error } = await query;
    if (error) throw new Error(`곡 목록 조회 실패: ${error.message}`);
    // 목 구현체와 마찬가지로 커서를 실제로 해석하지 않고 항상 첫 페이지 전체를 반환한다.
    // created_at/id 기반 keyset 페이지네이션은 Task 020에서 붙인다.
    return { songs: (data ?? []).map(mapSong), nextCursor: null };
  }

  async getTree(songId: string): Promise<GetSongTreeResponse | null> {
    // sections/lines/chord_events/song_images를 한 번의 PostgREST 요청(resource embedding)으로
    // 함께 읽는다 — 곡 전체 트리를 1회 왕복으로 읽어야 한다는 완료 기준을 만족시키는 지점.
    const { data, error } = await supabaseRepositoryClient
      .from("songs")
      .select("*, sections(*, lines(*, chord_events(*))), song_images(*)")
      .eq("id", songId)
      .maybeSingle<SongTreeRow>();
    if (error) throw new Error(`곡 트리 조회 실패: ${error.message}`);
    if (!data) return null;
    return { song: mapSongTree(data), imageUrls: buildImageUrls(data.song_images) };
  }

  async createWithImages(input: CreateSongWithImagesInput): Promise<Song> {
    const songId = createId("song");
    // songs insert와 song_images insert를 하나의 함수 호출(=하나의 트랜잭션)로 묶는다 —
    // create_arrangement_with_tracks와 동일한 이유(부분 반영 노출 방지). 소유자(created_by)는
    // 클라이언트 입력이 아니라 RPC 안에서 auth.jwt()의 현재 로그인 사용자로 고정된다.
    const { error } = await supabaseRepositoryClient.rpc("create_song_with_images", {
      p_song_id: songId,
      p_title: input.title,
      p_images: input.images,
    });
    if (error) throw new Error(`곡 생성 실패: ${error.message}`);

    const { data, error: fetchError } = await supabaseRepositoryClient
      .from("songs")
      .select()
      .eq("id", songId)
      .single<SongRow>();
    if (fetchError) throw new Error(`곡 생성 직후 재조회 실패: ${fetchError.message}`);
    return mapSong(data);
  }

  async saveCorrection(
    songId: string,
    request: SaveCorrectionRequest,
  ): Promise<SaveCorrectionResponse> {
    // 1단계: 섹션 id 확정(기존 id 유지 / 신규는 발급) 후 clientKey → 확정 id 매핑을 만든다.
    // 병합·분할로 같은 요청 안에서 새 섹션끼리 반복 관계를 맺을 수 있어(id가 아직 없으므로)
    // clientKey로 서로를 참조하는 SaveCorrectionRequest의 계약을 그대로 반영한 처리다.
    const idByClientKey = new Map<string, string>();
    const resolvedSections = request.sections.map((section) => {
      const id = section.id ?? createId(`${songId}-section`);
      idByClientKey.set(section.clientKey, id);
      return { ...section, id };
    });

    // repeatTarget이 가리킬 수 있는 유효한 대상: 이번 요청으로 살아남는 섹션 id 전체.
    const finalSectionIds = new Set(resolvedSections.map((section) => section.id));

    const payloadSections = resolvedSections.map((section) => {
      let repeatTargetSectionId: string | null = null;
      if (section.repeatTarget) {
        repeatTargetSectionId = idByClientKey.get(section.repeatTarget) ?? section.repeatTarget;
        if (!finalSectionIds.has(repeatTargetSectionId)) {
          throw new ValidationError(
            `섹션 "${section.clientKey}"의 repeatTarget이 유효하지 않습니다: ${section.repeatTarget}`,
          );
        }
      }
      return {
        id: section.id,
        type: section.type,
        orderIndex: section.orderIndex,
        startBeat: section.startBeat,
        lengthBeats: section.lengthBeats,
        repeatTargetSectionId,
        lines: section.lines.map((line) => {
          const lineId = line.id ?? createId(`${section.id}-line`);
          return {
            id: lineId,
            lyrics: line.lyrics,
            orderIndex: line.orderIndex,
            startBeat: line.startBeat,
            chordEvents: line.chordEvents.map((chordEvent) => ({
              id: chordEvent.id ?? createId(`${lineId}-chord`),
              chord: chordEvent.chord,
              charOffset: chordEvent.charOffset,
              beatOffset: chordEvent.beatOffset,
              needsReview: chordEvent.needsReview,
            })),
          };
        }),
      };
    });

    // 낙관적 잠금 확인 → 기존 섹션 삭제(cascade로 lines/chord_events도 함께) → 신규 일괄 삽입을
    // 하나의 Postgres 함수 호출(=하나의 트랜잭션)로 묶는다 (supabase/migrations/
    // 20260903000001_save_song_correction_fn.sql). 절반만 반영된 상태가 노출되지 않는다.
    const { error } = await supabaseRepositoryClient.rpc("save_song_correction", {
      p_song_id: songId,
      p_key: request.song.key,
      p_tempo: request.song.tempo,
      p_time_signature: request.song.timeSignature,
      p_expected_updated_at: request.updatedAt,
      p_sections: payloadSections,
    });
    if (error) {
      if (error.code === "PT404") throw new NotFoundError("곡", songId);
      if (error.code === "PT409") throw new OptimisticLockError();
      throw new Error(`교정 저장 실패: ${error.message}`);
    }

    const tree = await this.getTree(songId);
    if (!tree) throw new NotFoundError("곡", songId);
    return { song: tree.song };
  }

  async delete(songId: string): Promise<void> {
    // sections/lines/chord_events/arrangements/instrument_tracks/setlist_items는 모두
    // ON DELETE CASCADE로 연결돼 있어 별도 삭제가 필요 없다.
    const { error } = await supabaseRepositoryClient.from("songs").delete().eq("id", songId);
    if (error) throw new Error(`곡 삭제 실패: ${error.message}`);
  }
}

export const songRepository: SongRepository = new SupabaseSongRepository();
