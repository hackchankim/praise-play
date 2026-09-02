// ArrangementRepository — 편곡 데이터 액세스 인터페이스와 Supabase 구현체 (Task 006 인터페이스, Task 013 구현체).
// generate()의 요청/응답 형태는 src/lib/api/contracts.ts의 GenerateArrangementRequest/Response
// (Task019 POST /api/songs/[songId]/arrangements 계약)와 그대로 대응한다.

import type { GenerateArrangementRequest, GenerateArrangementResponse } from "@/lib/api/contracts";
import { buildArrangementBlueprint } from "@/lib/song-model/arrangement-blueprint";
import type {
  Arrangement,
  ArrangementWithTracks,
  GenrePreset,
  Instrument,
  InstrumentTrack,
  NoteEvent,
} from "@/lib/song-model/types";
import { createId } from "@/lib/repositories/mock-utils";
import { songRepository } from "@/lib/repositories/song-repository";
import { NotFoundError, ValidationError } from "@/lib/repositories/errors";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

interface ArrangementRow {
  id: string;
  song_id: string;
  genre_preset: string;
  created_at: string;
}

interface InstrumentTrackRow {
  id: string;
  arrangement_id: string;
  instrument: string;
  notes: NoteEvent[];
}

function mapTrack(row: InstrumentTrackRow): InstrumentTrack {
  return {
    id: row.id,
    arrangementId: row.arrangement_id,
    instrument: row.instrument as Instrument,
    notes: row.notes,
  };
}

function mapArrangement(row: ArrangementRow & { instrument_tracks: InstrumentTrackRow[] }) {
  const arrangement: Arrangement = {
    id: row.id,
    songId: row.song_id,
    genrePreset: row.genre_preset as GenrePreset,
    createdAt: row.created_at,
  };
  const withTracks: ArrangementWithTracks = {
    ...arrangement,
    instrumentTracks: row.instrument_tracks.map(mapTrack),
  };
  return withTracks;
}

export interface ArrangementRepository {
  /** 장르 프리셋 기반 편곡 생성 (POST /api/songs/[songId]/arrangements 계약과 대응) */
  generate(
    songId: string,
    request: GenerateArrangementRequest,
  ): Promise<GenerateArrangementResponse>;
  getById(arrangementId: string): Promise<ArrangementWithTracks | null>;
  listBySong(songId: string): Promise<ArrangementWithTracks[]>;
}

export class SupabaseArrangementRepository implements ArrangementRepository {
  async generate(
    songId: string,
    request: GenerateArrangementRequest,
  ): Promise<GenerateArrangementResponse> {
    const tree = await songRepository.getTree(songId);
    if (!tree) {
      throw new NotFoundError("곡", songId);
    }
    if (tree.song.status === "draft") {
      // 추출이 끝나지 않은 곡은 코드 진행이 없어 편곡을 만들 수 없다. FK 제약만으로는
      // 걸러지지 않는 비즈니스 규칙이라 여기서 명시적으로 막는다.
      throw new ValidationError(
        `아직 추출되지 않은 곡은 편곡을 생성할 수 없습니다: ${songId} (status=${tree.song.status})`,
      );
    }

    const blueprint = buildArrangementBlueprint(songId, request.genrePreset);
    const arrangementId = createId("arrangement");
    const trackRows = blueprint.tracks.map((track) => ({
      id: createId(`${arrangementId}-${track.instrument}`),
      instrument: track.instrument,
      notes: track.notes,
    }));

    // arrangements/instrument_tracks 두 테이블 insert를 하나의 함수 호출(=하나의 트랜잭션)로
    // 묶는다 — 따로 두 번 호출하면 첫 insert 성공 후 두 번째가 실패했을 때 트랙 없는 편곡이
    // 고아로 남는다 (code-review 지적, save_song_correction과 동일한 이유).
    const { error } = await supabaseRepositoryClient.rpc("create_arrangement_with_tracks", {
      p_arrangement_id: arrangementId,
      p_song_id: songId,
      p_genre_preset: request.genrePreset,
      p_tracks: trackRows,
    });
    if (error) throw new Error(`편곡 생성 실패: ${error.message}`);

    const created = await this.getById(arrangementId);
    if (!created) throw new Error(`편곡 생성 직후 재조회에 실패했습니다: ${arrangementId}`);
    return { arrangement: created };
  }

  async getById(arrangementId: string): Promise<ArrangementWithTracks | null> {
    const { data, error } = await supabaseRepositoryClient
      .from("arrangements")
      .select("*, instrument_tracks(*)")
      .eq("id", arrangementId)
      .maybeSingle<ArrangementRow & { instrument_tracks: InstrumentTrackRow[] }>();
    if (error) throw new Error(`편곡 조회 실패: ${error.message}`);
    return data ? mapArrangement(data) : null;
  }

  async listBySong(songId: string): Promise<ArrangementWithTracks[]> {
    const { data, error } = await supabaseRepositoryClient
      .from("arrangements")
      .select("*, instrument_tracks(*)")
      .eq("song_id", songId)
      .returns<(ArrangementRow & { instrument_tracks: InstrumentTrackRow[] })[]>();
    if (error) throw new Error(`곡별 편곡 목록 조회 실패: ${error.message}`);
    return (data ?? []).map(mapArrangement);
  }
}

export const arrangementRepository: ArrangementRepository = new SupabaseArrangementRepository();
