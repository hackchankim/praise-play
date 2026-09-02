-- 교정 저장(SaveCorrectionRequest)을 위한 트랜잭션 기반 일괄 저장 함수 (Task 013).
--
-- SupabaseSongRepository.saveCorrection()이 clientKey→id 해석(같은 요청 안에서 새로 만들어지는
-- 섹션끼리도 repeatTarget으로 서로 참조할 수 있어야 하므로)을 TypeScript에서 먼저 끝내고, 이미
-- 확정된 id로 채워진 섹션 배열을 그대로 이 함수에 넘긴다. 이 함수는 "낙관적 잠금 확인 → 기존
-- 섹션 삭제(→ lines/chord_events는 ON DELETE CASCADE로 함께 삭제) → 새 섹션/줄/코드 일괄 삽입"을
-- 하나의 Postgres 함수 호출(=하나의 트랜잭션)로 묶어, 그 사이에 절반만 반영된 상태가 외부에
-- 노출되지 않게 한다.
--
-- 같은 INSERT 문 안에서 여러 섹션이 서로를 repeat_target_section_id로 참조해도 문제 없다 —
-- NOT DEFERRABLE FK 제약은 "각 행마다 즉시"가 아니라 "명령문 전체가 끝난 뒤" 검사되므로,
-- 한 배치 INSERT 안에서는 뒤 행이 앞 행을 참조하든 그 반대든 최종 상태만 맞으면 통과한다.
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
end;
$$;

grant execute on function save_song_correction(text, text, integer, text, timestamptz, jsonb)
  to anon, authenticated;
