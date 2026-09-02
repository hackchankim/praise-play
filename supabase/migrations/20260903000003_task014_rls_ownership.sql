-- Task 013에서 임시로 열어둔 permissive RLS를 실제 소유권 기준으로 조인다 (Task 014).
-- Clerk↔Supabase Third-Party Auth 네이티브 연동(대시보드에서 활성화 필요, JWT 템플릿 방식은
-- deprecated)이 켜져 있으면 Clerk 세션 토큰의 sub 클레임(Clerk user_id)이
-- auth.jwt()->>'sub'로 노출된다. 이제부터 anon에는 아무 권한도 주지 않는다 — 익명 접근은
-- 애초에 이 앱에 없다(모든 보호 라우트가 proxy.ts에서 로그인을 강제한다).

revoke select, insert, update, delete on all tables in schema public from anon;

drop policy "temp_allow_all" on users;
drop policy "temp_allow_all" on songs;
drop policy "temp_allow_all" on song_images;
drop policy "temp_allow_all" on sections;
drop policy "temp_allow_all" on lines;
drop policy "temp_allow_all" on chord_events;
drop policy "temp_allow_all" on arrangements;
drop policy "temp_allow_all" on instrument_tracks;
drop policy "temp_allow_all" on setlists;
drop policy "temp_allow_all" on setlist_items;

-- users: 본인 레코드만 읽고 쓸 수 있다.
create policy "users_own_row" on users
  for all to authenticated
  using (id = (select auth.jwt() ->> 'sub'))
  with check (id = (select auth.jwt() ->> 'sub'));

-- songs: 소유자 본인만.
create policy "songs_owner" on songs
  for all to authenticated
  using (created_by = (select auth.jwt() ->> 'sub'))
  with check (created_by = (select auth.jwt() ->> 'sub'));

-- song_images/sections/arrangements: 부모 song의 소유자를 통해 간접 확인.
create policy "song_images_via_song_owner" on song_images
  for all to authenticated
  using (exists (
    select 1 from songs
    where songs.id = song_images.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from songs
    where songs.id = song_images.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ));

create policy "sections_via_song_owner" on sections
  for all to authenticated
  using (exists (
    select 1 from songs
    where songs.id = sections.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from songs
    where songs.id = sections.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ));

create policy "arrangements_via_song_owner" on arrangements
  for all to authenticated
  using (exists (
    select 1 from songs
    where songs.id = arrangements.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from songs
    where songs.id = arrangements.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ));

-- lines: section -> song 경로로.
create policy "lines_via_song_owner" on lines
  for all to authenticated
  using (exists (
    select 1 from sections
    join songs on songs.id = sections.song_id
    where sections.id = lines.section_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from sections
    join songs on songs.id = sections.song_id
    where sections.id = lines.section_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ));

-- chord_events: line -> section -> song 경로로.
create policy "chord_events_via_song_owner" on chord_events
  for all to authenticated
  using (exists (
    select 1 from lines
    join sections on sections.id = lines.section_id
    join songs on songs.id = sections.song_id
    where lines.id = chord_events.line_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from lines
    join sections on sections.id = lines.section_id
    join songs on songs.id = sections.song_id
    where lines.id = chord_events.line_id and songs.created_by = (select auth.jwt() ->> 'sub')
  ));

-- instrument_tracks: arrangement -> song 경로로.
create policy "instrument_tracks_via_song_owner" on instrument_tracks
  for all to authenticated
  using (exists (
    select 1 from arrangements
    join songs on songs.id = arrangements.song_id
    where arrangements.id = instrument_tracks.arrangement_id
      and songs.created_by = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from arrangements
    join songs on songs.id = arrangements.song_id
    where arrangements.id = instrument_tracks.arrangement_id
      and songs.created_by = (select auth.jwt() ->> 'sub')
  ));

-- setlists: 소유자 본인만.
create policy "setlists_owner" on setlists
  for all to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

-- setlist_items: 부모 setlist의 소유자를 통해.
create policy "setlist_items_via_setlist_owner" on setlist_items
  for all to authenticated
  using (exists (
    select 1 from setlists
    where setlists.id = setlist_items.setlist_id and setlists.owner_id = (select auth.jwt() ->> 'sub')
  ))
  with check (exists (
    select 1 from setlists
    where setlists.id = setlist_items.setlist_id and setlists.owner_id = (select auth.jwt() ->> 'sub')
  ));

-- security definer 함수(save_song_correction/create_arrangement_with_tracks/
-- replace_setlist_items)는 RLS를 그대로 우회한다 — 함수 소유자 권한으로 실행되기 때문이다.
-- 그래서 이제 RLS를 실제로 걸었으니, 그 우회로가 뚫리지 않도록 함수 내부에서 소유권을 직접
-- 검사해야 한다. "존재하지 않음"과 "존재하지만 내 것이 아님"을 구분해 응답하지 않는다 —
-- 다른 사용자의 리소스 id 존재 여부가 에러 코드로 새어나가지 않게 하기 위함이다.

create or replace function save_song_correction(
  p_song_id text,
  p_key text,
  p_tempo integer,
  p_time_signature text,
  p_expected_updated_at timestamptz,
  p_sections jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_updated_at timestamptz;
begin
  select updated_at into v_current_updated_at from songs
  where id = p_song_id and created_by = (select auth.jwt() ->> 'sub')
  for update;
  if not found then
    raise exception 'song not found: %', p_song_id using errcode = 'PT404';
  end if;
  if v_current_updated_at <> p_expected_updated_at then
    raise exception 'stale updatedAt for song %', p_song_id using errcode = 'PT409';
  end if;

  update songs
  set key = p_key, tempo = p_tempo, time_signature = p_time_signature, status = 'corrected'
  where id = p_song_id;

  delete from sections where song_id = p_song_id;

  insert into sections (id, song_id, type, order_index, start_beat, length_beats, repeat_target_section_id)
  select
    s->>'id',
    p_song_id,
    s->>'type',
    (s->>'orderIndex')::integer,
    (s->>'startBeat')::double precision,
    (s->>'lengthBeats')::double precision,
    nullif(s->>'repeatTargetSectionId', 'null')
  from jsonb_array_elements(p_sections) as s;

  insert into lines (id, section_id, lyrics, order_index, start_beat)
  select
    l->>'id',
    s->>'id',
    l->>'lyrics',
    (l->>'orderIndex')::integer,
    (l->>'startBeat')::double precision
  from jsonb_array_elements(p_sections) as s,
       jsonb_array_elements(s->'lines') as l;

  insert into chord_events (id, line_id, chord, char_offset, beat_offset, needs_review)
  select
    c->>'id',
    l->>'id',
    c->>'chord',
    (c->>'charOffset')::integer,
    (c->>'beatOffset')::double precision,
    (c->>'needsReview')::boolean
  from jsonb_array_elements(p_sections) as s,
       jsonb_array_elements(s->'lines') as l,
       jsonb_array_elements(l->'chordEvents') as c;
end;
$$;

revoke execute on function save_song_correction(text, text, integer, text, timestamptz, jsonb) from anon;
grant execute on function save_song_correction(text, text, integer, text, timestamptz, jsonb)
  to authenticated;

create or replace function create_arrangement_with_tracks(
  p_arrangement_id text,
  p_song_id text,
  p_genre_preset text,
  p_tracks jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from songs
    where id = p_song_id and created_by = (select auth.jwt() ->> 'sub')
  ) then
    raise exception 'song not found: %', p_song_id using errcode = 'PT404';
  end if;

  insert into arrangements (id, song_id, genre_preset)
  values (p_arrangement_id, p_song_id, p_genre_preset);

  insert into instrument_tracks (id, arrangement_id, instrument, notes)
  select
    t->>'id',
    p_arrangement_id,
    t->>'instrument',
    t->'notes'
  from jsonb_array_elements(p_tracks) as t;
end;
$$;

revoke execute on function create_arrangement_with_tracks(text, text, text, jsonb) from anon;
grant execute on function create_arrangement_with_tracks(text, text, text, jsonb) to authenticated;

create or replace function replace_setlist_items(
  p_setlist_id text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from setlists
    where id = p_setlist_id and owner_id = (select auth.jwt() ->> 'sub')
  ) then
    raise exception 'setlist not found: %', p_setlist_id using errcode = 'PT404';
  end if;

  delete from setlist_items where setlist_id = p_setlist_id;

  insert into setlist_items (id, setlist_id, song_id, arrangement_id, order_index)
  select
    i->>'id',
    p_setlist_id,
    i->>'songId',
    i->>'arrangementId',
    (i->>'orderIndex')::integer
  from jsonb_array_elements(p_items) as i;
end;
$$;

revoke execute on function replace_setlist_items(text, jsonb) from anon;
grant execute on function replace_setlist_items(text, jsonb) to authenticated;
