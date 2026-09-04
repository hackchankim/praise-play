-- Task 017: 섹션 자동 추론기가 repeat_target_section_id를 채워 넘기게 되면서
-- persist_extraction_result(Task 016)도 이를 반영해야 한다. Task 016 당시엔 도돌이표 기반
-- 반복 추론이 아직 없어 항상 null로 고정했었다 — 이제 p_sections 배열의 각 섹션 객체가
-- repeatTargetSectionId(문자열 id 또는 null)를 들고 온다고 가정하고 그대로 반영한다.
--
-- save_song_correction과 동일한 이유로 안전하다: NOT DEFERRABLE FK 제약은 INSERT 문 전체가
-- 끝난 뒤 검사되므로, 같은 배치 안에서 뒤 섹션이 앞 섹션을 반복 대상으로 가리켜도 문제없다.
--
-- 주의: CREATE OR REPLACE FUNCTION은 이 환경에서 기존 EXECUTE 권한을 보존하지 않는다(실행 권한이
-- PostgreSQL 기본값으로 되돌아가 anon/authenticated까지 다시 열린다 — 20260904000003에서 확인 후
-- 재수정). 이 함수를 또 CREATE OR REPLACE할 일이 있으면 REVOKE/GRANT를 반드시 같이 재실행할 것.
create or replace function persist_extraction_result(
  p_song_id text,
  p_key text,
  p_tempo integer,
  p_time_signature text,
  p_sections jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from songs where id = p_song_id for update;
  if not found then
    raise exception 'song not found: %', p_song_id using errcode = 'PT404';
  end if;
  if v_status <> 'draft' then
    raise exception 'song % is not in draft status (current: %)', p_song_id, v_status
      using errcode = 'PT409';
  end if;

  update songs
  set key = p_key, tempo = p_tempo, time_signature = p_time_signature, status = 'extracted'
  where id = p_song_id;

  insert into sections (id, song_id, type, order_index, start_beat, length_beats, repeat_target_section_id)
  select
    (s->>'id'),
    p_song_id,
    s->>'type',
    (s->>'orderIndex')::integer,
    (s->>'startBeat')::double precision,
    (s->>'lengthBeats')::double precision,
    nullif(s->>'repeatTargetSectionId', 'null')
  from jsonb_array_elements(p_sections) as s;

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
end;
$$;
