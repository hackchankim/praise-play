-- Task 020: replace_setlist_items에 "항목의 arrangement_id가 실제로 같은 항목의 song_id
-- 소속인가" 검증을 추가한다. 지금까지는 song_id/arrangement_id 각각의 FK 존재 여부만
-- 검증했을 뿐(songs/arrangements 테이블에 있기만 하면 통과), 서로 다른 곡의 편곡을 잘못
-- 짝지어 보내도(클라이언트 버그 또는 조작된 요청) 그대로 저장됐다 — 재생 화면에서 엉뚱한
-- 편곡이 재생되는 형태로만 드러나는 조용한 데이터 정합성 문제라 여기서 서버 측에 막는다.
--
-- 이 함수는 SECURITY DEFINER라 songs/arrangements의 RLS(소유자 전용)를 완전히 우회한다 —
-- 그래서 "arrangement가 song 소속인가"만 확인하면, 그 song이 남의 것이어도(사용자 A가 어떻게든
-- 알아낸 사용자 B의 songId+arrangementId 쌍) 그대로 A의 setlist_items에 저장된다. song이
-- p_setlist_id의 소유자(이미 위에서 확인한 auth.jwt())와 같은 사람 것인지까지 함께 확인해야
-- 이 RLS 우회 경로가 막힌다(code review 지적).
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

  if exists (
    select 1
    from jsonb_array_elements(p_items) as i
    where not exists (
      select 1 from arrangements a
      join songs s on s.id = a.song_id
      where a.id = i->>'arrangementId'
        and a.song_id = i->>'songId'
        and s.created_by = (select auth.jwt() ->> 'sub')
    )
  ) then
    raise exception 'arrangement does not belong to the given song, or the song is not yours'
      using errcode = 'PT422';
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

-- CREATE OR REPLACE FUNCTION은 실행 권한을 Postgres/Supabase 기본값으로 되돌린다(이 세션에서
-- 여러 번 겪은 패턴 — Task 017/019 마이그레이션 참고). anon/public을 다시 명시적으로 걷어내고
-- authenticated만 남긴다.
revoke execute on function replace_setlist_items(text, jsonb) from anon, authenticated, public;
grant execute on function replace_setlist_items(text, jsonb) to authenticated;
