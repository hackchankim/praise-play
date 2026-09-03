-- 곡 업로드 완료 시 songs 레코드와 song_images를 한 번에 만드는 트랜잭션 함수 (Task 015).
-- 두 테이블에 걸친 쓰기라 create_arrangement_with_tracks/replace_setlist_items와 같은 이유로
-- RPC로 묶는다 — 따로 두 번 호출하면 songs insert는 성공하고 song_images insert가 실패했을 때
-- 이미지 없는 draft 곡이 고아로 남는다.

create or replace function create_song_with_images(
  p_song_id text,
  p_title text,
  p_images jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text := (select auth.jwt() ->> 'sub');
begin
  if v_owner is null then
    raise exception 'unauthenticated' using errcode = 'PT401';
  end if;

  insert into songs (id, title, key, tempo, time_signature, status, created_by)
  values (p_song_id, p_title, 'C', 100, '4/4', 'draft', v_owner);

  insert into song_images (id, song_id, object_key, order_index)
  select
    p_song_id || '-image-' || (i->>'orderIndex'),
    p_song_id,
    i->>'objectKey',
    (i->>'orderIndex')::integer
  from jsonb_array_elements(p_images) as i;
end;
$$;

grant execute on function create_song_with_images(text, text, jsonb) to authenticated;
