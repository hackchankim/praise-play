// 더미 데이터(Task 006, src/lib/song-model/mock-*.ts)를 실제 Supabase Postgres에 적재한다 (Task 013).
// service_role 키를 쓰므로 RLS를 무시하고 바로 쓸 수 있다 — 이 스크립트는 CLI 전용이라
// 브라우저 번들에 들어가지 않으므로 안전하다. 브라우저/서버 공용 코드에서는 절대 이 패턴을
// 흉내내지 말 것 (src/lib/supabase/repository-client.ts는 anon 키만 쓴다).
//
// 실행: npx tsx --env-file=.env.local scripts/seed.ts [Clerk user id] [표시 이름]
// 재실행해도 안전하도록(idempotent) 매번 대상 테이블을 비우고 다시 채운다 — 개발용 시드이므로
// 부분 upsert보다 "항상 알려진 상태로 리셋"이 더 예측 가능하다.
// 주의: 이 reset()은 특정 사용자 소유가 아니라 관련 테이블 전체를 통째로 비운다 — Task 014부터
// RLS가 소유권 기반이라, 시드 더미 곡/찬양콘티는 인자로 넘긴 사용자 소유로 만들어져야 그
// 계정으로 로그인했을 때 앱에서 실제로 보인다(안 넘기면 예전처럼 mock-songs.ts의 가짜
// user-mock-1 소유가 되어 실제 로그인 계정에서는 RLS로 안 보인다).
//
// 인자를 생략하면 MOCK_USER.id(user-mock-1)로 시드된다 — 실제 로그인 계정에서는 안 보이지만
// psql로 직접 들여다볼 땐 여전히 유효하다.

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

const targetUserId = process.argv[2] || MOCK_USER.id;
const targetDisplayName =
  process.argv[3] || (targetUserId === MOCK_USER.id ? MOCK_USER.displayName : targetUserId);

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
  console.log(
    `시드 대상 사용자: ${targetUserId}${targetUserId === MOCK_USER.id ? " (기본값)" : ""}`,
  );
  console.log("기존 데이터 초기화...");
  await reset();

  console.log("시드 데이터 삽입...");
  await insert("users", [{ id: targetUserId, display_name: targetDisplayName }]);

  await insert(
    "songs",
    MOCK_SONGS.map((s) => ({
      id: s.id,
      title: s.title,
      key: s.key,
      tempo: s.tempo,
      time_signature: s.timeSignature,
      status: s.status,
      created_by: targetUserId,
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
      owner_id: targetUserId,
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
