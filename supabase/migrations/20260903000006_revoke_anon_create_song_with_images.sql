-- create_song_with_images(20260903000005)가 다른 SECURITY DEFINER 함수들과 달리
-- anon 실행 권한을 명시적으로 revoke하지 않았다 (code-review 지적, Task 015).
-- Postgres는 새 함수 생성 시 기본적으로 PUBLIC(=anon 포함)에 EXECUTE를 부여한다. 함수
-- 내부의 "auth.jwt()가 없으면 거부" 검사가 지금은 이를 막고 있지만, 이 프로젝트의 다른
-- SECURITY DEFINER 함수들(save_song_correction 등)과 동일하게 anon 자체의 권한도
-- 명시적으로 없애 방어선을 이중으로 둔다.

revoke execute on function create_song_with_images(text, text, jsonb) from anon;
grant execute on function create_song_with_images(text, text, jsonb) to authenticated;
