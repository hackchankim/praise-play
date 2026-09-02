-- 편곡 생성/세트리스트 항목 교체도 여러 테이블에 걸친 쓰기라, save_song_correction과 같은 이유로
-- 트랜잭션 함수로 묶는다 (Task 013 code-review 지적 반영).
--
-- 이전엔 리포지토리에서 두 번의 독립된 insert/delete 호출로 구현했는데, 그 사이(첫 호출은
-- 성공하고 두 번째 호출이 네트워크 문제 등으로 실패하는 경우) 절반만 반영된 상태가 그대로
-- 남았다 — 편곡은 트랙 없이 고아로, 세트리스트는 항목이 통째로 비워진 채로.

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

grant execute on function create_arrangement_with_tracks(text, text, text, jsonb)
  to anon, authenticated;

create or replace function replace_setlist_items(
  p_setlist_id text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from setlists where id = p_setlist_id) then
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

grant execute on function replace_setlist_items(text, jsonb) to anon, authenticated;
