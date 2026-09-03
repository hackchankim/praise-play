-- 전체 소스 재점검 중 발견: PostgreSQL은 함수를 만들면 기본적으로 PUBLIC 롤에 EXECUTE를
-- 부여한다(테이블과 달리 함수는 이게 기본값). 지금까지의 마이그레이션은 "anon"에서만 execute를
-- revoke했는데, PUBLIC 권한은 anon을 포함한 모든 롤에 그대로 적용되므로 그 revoke가 사실상
-- 무력화돼 있었다 — 실제로 anon 키로 RPC를 호출하면 함수 본문까지 도달하는 걸 확인했다(함수
-- 내부의 auth.jwt() 널 체크가 두 번째 방어선으로 막아 데이터 유출은 없었지만, "anon은 이 앱에서
-- 아무 것도 못 해야 한다"는 원칙과 어긋난다). PUBLIC에서 직접 revoke해야 실제로 막힌다.

revoke execute on function save_song_correction(text, text, integer, text, timestamptz, jsonb)
  from public;
revoke execute on function create_arrangement_with_tracks(text, text, text, jsonb) from public;
revoke execute on function replace_setlist_items(text, jsonb) from public;
revoke execute on function create_song_with_images(text, text, jsonb) from public;

-- set_updated_at은 트리거 전용 함수라(BEFORE UPDATE 트리거가 내부적으로 호출) 애초에
-- PostgREST RPC로 직접 호출 가능한 경로가 없어 anon/PUBLIC 권한 자체가 문제되지 않는다 —
-- 트리거 함수 실행 권한은 SQL 클라이언트의 execute 권한이 아니라 트리거를 소유한 테이블의
-- UPDATE 권한으로 통제된다. 의도적으로 그대로 둔다.
