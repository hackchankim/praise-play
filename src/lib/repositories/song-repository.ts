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
import {
  NotFoundError,
  OptimisticLockError,
  ValidationError,
  WriteCommittedButUnconfirmedError,
} from "@/lib/repositories/errors";
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

interface SongListCursor {
  createdAt: string;
  id: string;
}

// decodeSongCursor가 통과시킨 값이 그대로 supabase-js .or()의 raw PostgREST 필터 문자열에
// 이어붙는다(.or()는 이스케이프를 하지 않는다) — 콤마/괄호가 섞인 값이 들어오면 필터 구문이
// 깨지거나 의도치 않은 조건이 주입된다. cursor는 완전히 클라이언트가 통제하는 쿼리 파라미터라
// 형식을 검증하지 않으면 그대로 삽입 지점이 된다(code review 지적). created_at은 항상 이
// 리포지토리가 만든 ISO 타임스탬프(row.created_at)였고 id는 createId()가 만든 "prefix-uuid"
// 형식(영숫자/하이픈만)이므로, 그 형식을 벗어나면 커서를 신뢰하지 않고 무시한다.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const CURSOR_ID_RE = /^[A-Za-z0-9-]+$/;

/**
 * created_at만으로는 동시에 생성된 곡들의 순서가 안정적이지 않아(같은 값이 여러 행에 있을 수
 * 있음) id를 타이브레이커로 더한 keyset 커서. btoa/atob를 쓰는 이유는 이 리포지토리가
 * 클라이언트 컴포넌트(arrangement-view.tsx 등)에서도 여전히 직접 임포트돼 브라우저 번들에
 * 포함되므로(Buffer는 Node 전용이라 브라우저에서 죽는다) — 커서 내용이 ISO 타임스탬프+UUID로
 * 항상 ASCII라 btoa로 충분하다.
 */
function encodeSongCursor(cursor: SongListCursor): string {
  return btoa(JSON.stringify(cursor));
}

function decodeSongCursor(raw: string): SongListCursor | null {
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<SongListCursor>;
    if (
      typeof parsed.createdAt === "string" &&
      ISO_TIMESTAMP_RE.test(parsed.createdAt) &&
      typeof parsed.id === "string" &&
      CURSOR_ID_RE.test(parsed.id)
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export interface CreateSongWithImagesInput {
  title: string;
  /** R2에 이미 업로드된 객체 키. 순서대로 song_images에 등록된다 */
  images: Array<Pick<SongImage, "objectKey" | "orderIndex">>;
}

export interface SongRepository {
  /** 최신순 곡 목록 조회 (GET /api/songs 계약과 대응) */
  list(params?: ListSongsParams): Promise<ListSongsResponse>;
  /**
   * 곡 전체 트리 조회. 존재하지 않으면 null — 라우트 핸들러가 이를 404로 변환한다.
   * draftCorrection(Task 018)은 포함하지 않는다 — 임시 저장은 이 리포지토리가 아니라
   * song_drafts 테이블/라우트 핸들러의 관심사라, 응답 조립은 GET /api/songs/[songId] 쪽에서 한다.
   */
  getTree(songId: string): Promise<Omit<GetSongTreeResponse, "draftCorrection"> | null>;
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
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (params.cursor) {
      const cursor = decodeSongCursor(params.cursor);
      if (cursor) {
        // created_at보다 오래됐거나, created_at이 같으면 id가 더 작은 행부터 — 정렬 기준과
        // 정확히 같은 튜플 비교라야 동시 생성된 행이 중복/누락 없이 다음 페이지에 이어진다.
        query = query.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
      }
    }

    // limit을 넘기지 않은 호출부(홈 화면의 "내 곡" 목록, 곡 추가 다이얼로그의 검색 대상 등)는
    // 지금까지처럼 전체 목록을 받는다 — 여기서 임의로 기본 페이지 크기를 강제하면 그 호출부들이
    // "더 보기"를 구현하지 않은 채로 조용히 일부만 보게 된다(code review 지적, 실제 회귀였음).
    // limit을 명시한 호출자에게만 진짜 keyset 페이지네이션(다음 페이지 존재 여부 포함)을 적용한다.
    if (params.limit !== undefined) query = query.limit(params.limit + 1);

    const { data, error } = await query;
    if (error) throw new Error(`곡 목록 조회 실패: ${error.message}`);

    const rows = data ?? [];
    // limit보다 하나 더 요청해 그 한 행이 실제로 왔는지로 "다음 페이지가 있는가"를 판단한다 —
    // count 쿼리를 별도로 날리지 않고 왕복 1회로 끝낸다.
    const hasMore = params.limit !== undefined && rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeSongCursor({ createdAt: last.created_at, id: last.id }) : null;

    return { songs: pageRows.map(mapSong), nextCursor };
  }

  async getTree(songId: string): Promise<Omit<GetSongTreeResponse, "draftCorrection"> | null> {
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

    // 위 RPC는 이미 커밋됐다 — 여기서부터는 "방금 만든 걸 확인 삼아 되읽는" 것뿐이다. 일시적
    // 오류(RLS 토큰 갱신 타이밍, 네트워크 순단 등)로 이 재조회만 실패해도 호출부가 "곡 생성
    // 자체가 실패했다"고 오판하면, 이미 그 song_images 행이 참조하는 R2 객체를 정리 로직으로
    // 지워버려 곡이 깨진 이미지를 영구히 가리키게 된다(code review 지적, 코드 추적으로 재현
    // 가능함을 확인). 재시도로 대부분의 일시적 실패를 흡수하고, 그래도 안 되면 "생성은
    // 됐다"는 사실을 구분할 수 있는 별도 에러로 던져 호출부가 정리 로직을 건너뛰게 한다.
    const RETRY_DELAYS_MS = [200, 500];
    let lastError: { message: string } | null = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const { data, error: fetchError } = await supabaseRepositoryClient
        .from("songs")
        .select()
        .eq("id", songId)
        .single<SongRow>();
      if (!fetchError) return mapSong(data);
      lastError = fetchError;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
    throw new WriteCommittedButUnconfirmedError(
      songId,
      `곡 생성 직후 재조회 실패(곡 자체는 생성됨): ${lastError?.message}`,
    );
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
    // .select()를 붙여 실제로 삭제된 행을 돌려받는다 — RLS가 남의 곡이거나 존재하지 않는
    // songId를 조용히 0행 삭제로 처리하므로(에러가 안 남), 그걸 구분하려면 이 방법뿐이다.
    const { data, error } = await supabaseRepositoryClient
      .from("songs")
      .delete()
      .eq("id", songId)
      .select("id");
    if (error) throw new Error(`곡 삭제 실패: ${error.message}`);
    if (!data || data.length === 0) throw new NotFoundError("곡", songId);
  }
}

export const songRepository: SongRepository = new SupabaseSongRepository();
