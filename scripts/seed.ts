// 더미 데이터(Task 006, src/lib/song-model/mock-*.ts)를 실제 Supabase Postgres에 적재한다 (Task 013).
// service_role 키를 쓰므로 RLS를 무시하고 바로 쓸 수 있다 — 이 스크립트는 CLI 전용이라
// 브라우저 번들에 들어가지 않으므로 안전하다. 브라우저/서버 공용 코드에서는 절대 이 패턴을
// 흉내내지 말 것 (src/lib/supabase/repository-client.ts는 anon 키만 쓴다).
//
// 실행: npx tsx --env-file=.env.local scripts/seed.ts
// 재실행해도 안전하도록(idempotent) 매번 대상 테이블을 비우고 다시 채운다 — 개발용 시드이므로
// 부분 upsert보다 "항상 알려진 상태로 리셋"이 더 예측 가능하다.

import { createClient } from "@supabase/supabase-js";
import {
  MOCK_USER,
  MOCK_SONGS,
  MOCK_SECTIONS,
  MOCK_LINES,
  MOCK_CHORD_EVENTS,
} from "../src/lib/song-model/mock-songs";
import {
  MOCK_ARRANGEMENTS,
  MOCK_INSTRUMENT_TRACKS,
} from "../src/lib/song-model/arrangement-blueprint";
import { MOCK_SETLISTS, MOCK_SETLIST_ITEMS } from "../src/lib/song-model/mock-setlists";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
}

const supabase = createClient(url, serviceKey);

async function reset() {
  // 자식 → 부모 순서로 비운다 (ON DELETE CASCADE가 있긴 하지만 순서를 명시해 의도를 분명히 한다).
  const tables = [
    "chord_events",
    "lines",
    "sections",
    "instrument_tracks",
    "arrangements",
    "setlist_items",
    "setlists",
    "song_images",
    "songs",
    "users",
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().not("id", "is", null);
    if (error) throw new Error(`${table} 초기화 실패: ${error.message}`);
  }
}

async function insert(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`${table} 삽입 실패: ${error.message}`);
  console.log(`  ${table}: ${rows.length}행`);
}

async function main() {
  console.log("기존 데이터 초기화...");
  await reset();

  console.log("시드 데이터 삽입...");
  await insert("users", [
    { id: MOCK_USER.id, display_name: MOCK_USER.displayName, created_at: MOCK_USER.createdAt },
  ]);

  await insert(
    "songs",
    MOCK_SONGS.map((s) => ({
      id: s.id,
      title: s.title,
      key: s.key,
      tempo: s.tempo,
      time_signature: s.timeSignature,
      status: s.status,
      created_by: s.createdBy,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    })),
  );

  await insert(
    "sections",
    MOCK_SECTIONS.map((s) => ({
      id: s.id,
      song_id: s.songId,
      type: s.type,
      order_index: s.orderIndex,
      start_beat: s.startBeat,
      length_beats: s.lengthBeats,
      repeat_target_section_id: s.repeatTargetSectionId,
    })),
  );

  await insert(
    "lines",
    MOCK_LINES.map((l) => ({
      id: l.id,
      section_id: l.sectionId,
      lyrics: l.lyrics,
      order_index: l.orderIndex,
      start_beat: l.startBeat,
    })),
  );

  await insert(
    "chord_events",
    MOCK_CHORD_EVENTS.map((c) => ({
      id: c.id,
      line_id: c.lineId,
      chord: c.chord,
      char_offset: c.charOffset,
      beat_offset: c.beatOffset,
      needs_review: c.needsReview,
    })),
  );

  await insert(
    "arrangements",
    MOCK_ARRANGEMENTS.map((a) => ({
      id: a.id,
      song_id: a.songId,
      genre_preset: a.genrePreset,
      created_at: a.createdAt,
    })),
  );

  await insert(
    "instrument_tracks",
    MOCK_INSTRUMENT_TRACKS.map((t) => ({
      id: t.id,
      arrangement_id: t.arrangementId,
      instrument: t.instrument,
      notes: t.notes,
    })),
  );

  await insert(
    "setlists",
    MOCK_SETLISTS.map((s) => ({
      id: s.id,
      name: s.name,
      owner_id: s.ownerId,
      created_at: s.createdAt,
    })),
  );

  await insert(
    "setlist_items",
    MOCK_SETLIST_ITEMS.map((i) => ({
      id: i.id,
      setlist_id: i.setlistId,
      song_id: i.songId,
      arrangement_id: i.arrangementId,
      order_index: i.orderIndex,
    })),
  );

  console.log("완료.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
