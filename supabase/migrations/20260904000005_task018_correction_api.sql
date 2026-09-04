-- Task 018: 교정 페이지 데이터 연동 및 저장 API.
--
-- 임시 저장(자동 저장)을 songs 테이블의 컬럼으로 두지 않고 별도 테이블로 분리한 이유: songs에는
-- BEFORE UPDATE 트리거(songs_set_updated_at)가 걸려 있어 어떤 컬럼이든 UPDATE하면 updated_at이
-- 갱신된다. updated_at은 save_song_correction의 낙관적 잠금 기준값이라, 임시 저장이 songs 행을
-- 건드리면 그때마다 기준값이 밀려서 그 뒤의 "진짜 저장"이 매번 PT409(낙관적 잠금 충돌)로
-- 실패하게 된다. 별도 테이블이면 이 트리거와 무관해 이 문제가 원천적으로 생기지 않는다.
create table song_drafts (
  song_id text primary key references songs(id) on delete cascade,
  -- SaveCorrectionRequest와 동일한 모양의 JSON(song/sections/updatedAt)을 그대로 저장한다.
  -- 별도 draft 전용 타입을 만들 필요가 없다 — 저장 요청과 임시 저장은 어차피 같은 모양이다.
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table song_drafts enable row level security;

create policy "song_drafts_via_song_owner" on song_drafts
  for all
  to authenticated
  using (
    exists (
      select 1 from songs
      where songs.id = song_drafts.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
    )
  )
  with check (
    exists (
      select 1 from songs
      where songs.id = song_drafts.song_id and songs.created_by = (select auth.jwt() ->> 'sub')
    )
  );

alter publication supabase_realtime add table song_drafts;

-- save_song_correction(Task 013)이 "진짜" 저장에 성공하면 이제는 낡은 임시 저장을 같은
-- 트랜잭션 안에서 함께 지운다 — 절반만 반영된 상태(저장은 됐는데 임시 저장이 남아 다음 접속 시
-- 되살아나는 상태)가 노출되지 않는다.
--
-- CREATE OR REPLACE FUNCTION은 이 환경에서 EXECUTE 권한을 기본값(anon/authenticated 포함)으로
-- 리셋시킨다는 걸 Task 017에서 실측으로 확인했다 — 그래서 이 마이그레이션 끝에 REVOKE/GRANT를
-- 반드시 다시 실행한다.
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
  select updated_at into v_current_updated_at from songs where id = p_song_id for update;
  if not found then
    raise exception 'song not found: %', p_song_id using errcode = 'PT404';
  end if;
  if v_current_updated_at <> p_expected_updated_at then
    raise exception 'stale updatedAt for song %', p_song_id using errcode = 'PT409';
  end if;

  update songs
  set key = p_key, tempo = p_tempo, time_signature = p_time_signature, status = 'corrected'
  where id = p_song_id;
  -- updated_at은 songs_set_updated_at 트리거가 자동 갱신한다.

  delete from sections where song_id = p_song_id;

  insert into sections (id, song_id, type, order_index, start_beat, length_beats, repeat_target_section_id)
  select
    (s->>'id'),
    p_song_id,
    s->>'type',
    (s->>'orderIndex')::integer,
    (s->>'startBeat')::double precision,
    (s->>'lengthBeats')::double precision,
    nullif(s->>'repeatTargetSectionId', 'null')  from jsonb_array_elements(p_sections) as s;

  insert into lines (id, section_id, lyrics, order_index, start_beat)
  select
    (l->>'id'),
    (s->>'id'),
    l->>'lyrics',
    (l->>'orderIndex')::integer,
    (l->>'startBeat')::double precision
  from jsonb_array_elements(p_sections) as s,
       jsonb_array_elements(s->'lines') as l;

  insert into chord_events (id, line_id, chord, char_offset, beat_offset, needs_review)
  select
    (c->>'id'),
    (l->>'id'),
    c->>'chord',
    (c->>'charOffset')::integer,
    (c->>'beatOffset')::double precision,
    (c->>'needsReview')::boolean
  from jsonb_array_elements(p_sections) as s,
       jsonb_array_elements(s->'lines') as l,
       jsonb_array_elements(l->'chordEvents') as c;

  delete from song_drafts where song_id = p_song_id;
end;
$$;

revoke execute on function save_song_correction(text, text, integer, text, timestamptz, jsonb)
  from anon, authenticated;
grant execute on function save_song_correction(text, text, integer, text, timestamptz, jsonb)
  to authenticated;
