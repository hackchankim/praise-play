-- 초기 스키마 초안 (Task 003).
-- 테이블·FK·인덱스 정의만 다룬다. 실제 프로젝트 적용, RLS 정책, 시드는 Task 013/014에서 진행.
-- 모든 타이밍 컬럼(*_beat, *_offset)은 beat 단위로 저장하고, 재생 시점에만 클라이언트가 초로 환산한다.

create table if not exists users (
  id text primary key, -- Clerk user_id
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  key text not null,
  tempo integer not null,
  time_signature text not null,
  -- SONG_STATUSES(src/lib/song-model/types.ts)와 값 목록을 동기화할 것.
  status text not null default 'draft' check (status in ('draft', 'extracted', 'corrected')),
  created_by text not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now() -- 낙관적 잠금 비교값 (Task 018)
);

create index if not exists songs_created_by_created_at_idx on songs (created_by, created_at);

-- updated_at을 애플리케이션 코드가 매번 갱신해야 하는 규율에 의존시키지 않고
-- DB가 강제한다 — Task 018 낙관적 잠금이 조용히 무력화되는 것을 막기 위함.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger songs_set_updated_at
  before update on songs
  for each row execute function set_updated_at();

create table if not exists song_images (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs (id) on delete cascade,
  object_key text not null,
  order_index integer not null
);

create index if not exists song_images_song_id_order_index_idx on song_images (song_id, order_index);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs (id) on delete cascade,
  -- SECTION_TYPES(src/lib/song-model/types.ts)와 값 목록을 동기화할 것.
  type text not null check (type in ('verse', 'chorus', 'bridge', 'interlude', 'intro', 'outro')),
  order_index integer not null,
  start_beat double precision not null,
  length_beats double precision not null,
  -- 반복 대상 섹션이 병합·분할로 삭제돼도 저장이 깨지지 않도록 set null.
  repeat_target_section_id uuid references sections (id) on delete set null,
  constraint sections_no_self_loop check (repeat_target_section_id is null or repeat_target_section_id <> id)
);

create index if not exists sections_song_id_order_index_idx on sections (song_id, order_index);

create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections (id) on delete cascade,
  lyrics text not null,
  order_index integer not null,
  start_beat double precision not null
);

create index if not exists lines_section_id_order_index_idx on lines (section_id, order_index);

create table if not exists chord_events (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines (id) on delete cascade,
  chord text not null,
  char_offset integer not null,
  beat_offset double precision not null,
  needs_review boolean not null default false
);

create index if not exists chord_events_line_id_idx on chord_events (line_id);

create table if not exists arrangements (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs (id) on delete cascade,
  -- GENRE_PRESETS(src/lib/song-model/types.ts)와 값 목록을 동기화할 것.
  genre_preset text not null check (
    genre_preset in ('praise_upbeat', 'ccm_ballad', 'hymn_traditional', 'acoustic_intimate')
  ),
  created_at timestamptz not null default now()
);

create table if not exists instrument_tracks (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangements (id) on delete cascade,
  -- INSTRUMENTS(src/lib/song-model/types.ts)와 값 목록을 동기화할 것.
  instrument text not null check (instrument in ('piano', 'guitar', 'bass', 'drums')),
  notes jsonb not null default '[]'::jsonb
);

create table if not exists setlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id text not null references users (id),
  created_at timestamptz not null default now()
);

create table if not exists setlist_items (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references setlists (id) on delete cascade,
  -- ROADMAP Task 020: 곡/편곡 삭제 시 세트리스트 항목도 함께 정리하는 정책을 명시적으로 반영.
  song_id uuid not null references songs (id) on delete cascade,
  arrangement_id uuid not null references arrangements (id) on delete cascade,
  order_index integer not null
);

create index if not exists setlist_items_setlist_id_order_index_idx on setlist_items (setlist_id, order_index);
