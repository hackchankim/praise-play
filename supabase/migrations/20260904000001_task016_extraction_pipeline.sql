-- Task 016: 비전 LLM 악보 추출 파이프라인.
--
-- extraction_jobs: Inngest 잡(extract-chart)의 단계별 진행 상태를 곡 1개당 1행으로 기록한다.
-- 클라이언트(추출 진행 화면)는 이 테이블을 Supabase Realtime(postgres_changes)으로 구독해
-- 실시간 진행률을 보여준다 — extraction-progress.ts의 목 시뮬레이터가 애초에 이 용도를 염두에
-- 두고 이벤트 모양을 설계해뒀던 지점이다. 잡은 service_role 키로 쓰기 때문에(아래 설명 참고)
-- RLS는 조회만 열어두면 된다.
create table extraction_jobs (
  song_id text primary key references songs(id) on delete cascade,
  stage text not null check (
    stage in ('upload', 'text_extraction', 'structure_extraction', 'merge', 'validation')
  ),
  status text not null check (status in ('in_progress', 'completed', 'failed')),
  error text,
  updated_at timestamptz not null default now()
);

alter table extraction_jobs enable row level security;

create policy extraction_jobs_select_own on extraction_jobs for select
  to authenticated
  using (
    exists (
      select 1 from songs
      where songs.id = extraction_jobs.song_id and songs.created_by = auth.jwt() ->> 'sub'
    )
  );
-- insert/update/delete 정책은 두지 않는다 — 쓰기는 Inngest 잡이 service_role 키로만 수행하고
-- (RLS를 우회하는 role이라 정책이 필요 없다), anon/authenticated는 애초에 이 테이블에 쓸 이유가
-- 없다.

alter publication supabase_realtime add table extraction_jobs;

-- persist_extraction_result: 추출 결과(섹션/줄/코드)를 트랜잭션으로 일괄 삽입하고
-- songs.status를 draft → extracted로 전환한다. save_song_correction과 삽입 로직은 같지만
-- 두 가지가 다르다:
--   1) 호출자가 로그인 사용자가 아니라 Inngest 잡(service_role)이므로 auth.jwt() 기반
--      소유권 검사를 하지 않는다 — 대신 곡이 아직 'draft' 상태인지만 확인해, 이미 추출·교정된
--      곡을 잡 재실행(예: 이벤트 중복 전달)으로 덮어쓰는 사고를 막는다.
--   2) 상태 전이 목적지가 'corrected'가 아니라 'extracted'다.
-- SECURITY DEFINER이지만 PUBLIC/anon/authenticated에는 실행 권한을 주지 않는다 — 이 함수는
-- 소유권 검사가 없으므로 일반 사용자가 직접 호출할 수 있으면 임의의 곡을 덮어쓸 수 있다.
-- service_role에게만 실행을 허용한다.
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
    null
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

revoke execute on function persist_extraction_result(text, text, integer, text, jsonb) from public;
grant execute on function persist_extraction_result(text, text, integer, text, jsonb) to service_role;
