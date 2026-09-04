// ArrangementRepository — 편곡 조회 인터페이스와 Supabase 구현체 (Task 006 인터페이스, Task 013 구현체).
// 편곡 "생성"은 여기 없다 — Task 019부터 생성 로직이 실제 편곡 엔진(Tonal Voicing 기반, 이
// 제품의 핵심 IP)을 쓰게 되면서, 그 알고리즘이 클라이언트 번들에 실리지 않도록
// src/lib/arrangement/persist-arrangement.ts(server-only)로 옮겼다. 이 파일은 브라우저
// 컴포넌트(arrangement-view.tsx)가 그대로 계속 쓰는 순수 조회 전용 리포지토리다.
import type {
  ArrangementWithTracks,
  GenrePreset,
  Instrument,
  InstrumentTrack,
  NoteEvent,
} from "@/lib/song-model/types";
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

function mapArrangement(
  row: ArrangementRow & { instrument_tracks: InstrumentTrackRow[] },
): ArrangementWithTracks {
  return {
    id: row.id,
    songId: row.song_id,
    genrePreset: row.genre_preset as GenrePreset,
    createdAt: row.created_at,
    instrumentTracks: row.instrument_tracks.map(mapTrack),
  };
}

export interface ArrangementRepository {
  getById(arrangementId: string): Promise<ArrangementWithTracks | null>;
  listBySong(songId: string): Promise<ArrangementWithTracks[]>;
}

export class SupabaseArrangementRepository implements ArrangementRepository {
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
