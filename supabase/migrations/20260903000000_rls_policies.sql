-- RLS 활성화 및 임시(permissive) 정책 (Task 013).
--
-- 진짜 소유권 기반 정책(created_by/owner_id = 요청자)을 걸려면 Supabase RLS가 "지금 요청한
-- 사용자가 누구인지" 알아야 하는데, 그건 Clerk 세션 JWT를 Supabase에 전달하는 Third-Party Auth
-- 연동(Task 014, src/lib/supabase/server.ts의 accessToken() 자리)이 있어야 가능하다. 아직 없으므로
-- 지금은 모든 테이블에 RLS를 켜두되(정책이 하나도 없으면 기본이 전체 거부이므로, 앱이 동작하려면
-- 반드시 아래처럼 명시적 허용 정책이 있어야 한다) anon/authenticated 모두에게 전체 허용하는 임시
-- 정책만 둔다. Task 014에서 auth.jwt() 기반 조건으로 교체할 것.

alter table users enable row level security;
alter table songs enable row level security;
alter table song_images enable row level security;
alter table sections enable row level security;
alter table lines enable row level security;
alter table chord_events enable row level security;
alter table arrangements enable row level security;
alter table instrument_tracks enable row level security;
alter table setlists enable row level security;
alter table setlist_items enable row level security;

-- 이 프로젝트는 Supabase 대시보드 Table Editor가 아니라 마이그레이션 SQL로 테이블을 만들었기
-- 때문에, anon/authenticated 역할에 대한 기본 GRANT가 자동으로 붙지 않는다. RLS 정책은 이미
-- 허용된 권한을 "더 좁히는" 필터일 뿐이라, GRANT 자체가 없으면 정책과 무관하게 PostgREST가
-- 항상 거부한다.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- TODO(Task014): 아래 10개 정책을 각 테이블의 소유권 컬럼(created_by/owner_id, 또는 부모를 통한
-- 간접 소유권) 기준 조건으로 교체한다. 지금은 전부 permissive.
create policy "temp_allow_all" on users for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on songs for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on song_images for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on sections for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on lines for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on chord_events for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on arrangements for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on instrument_tracks for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on setlists for all to anon, authenticated using (true) with check (true);
create policy "temp_allow_all" on setlist_items for all to anon, authenticated using (true) with check (true);
