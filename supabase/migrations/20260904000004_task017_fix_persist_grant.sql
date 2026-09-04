-- 20260904000003이 잘못 짚었다 — 직접 확인해보니 "revoke ... from public"은 이 Supabase
-- 프로젝트에서 anon/authenticated의 실행 권한을 전혀 제거하지 못한다(재현 확인:
-- persist_extraction_result에 revoke ... from public을 실행해도 pg_proc.proacl에
-- anon=X/postgres, authenticated=X/postgres가 그대로 남아 있었다). Supabase가 새 함수
-- 생성 시 PUBLIC 경유가 아니라 anon/authenticated/service_role에 개별 EXECUTE를 직접
-- 부여하기 때문으로 보인다 — 그래서 PUBLIC에서만 revoke하면 각 롤의 개별 권한은 그대로 남는다.
-- (이전 마이그레이션들의 주석 — "PUBLIC 권한은 anon을 포함한 모든 롤에 적용된다" — 은 이 환경엔
-- 맞지 않는다. save_song_correction 등 4개 함수가 실제로는 안전했던 건 create_song_with_images용
-- 명시적 anon revoke, revoke_unused_grants.sql의 별도 anon revoke 덕분이었지 PUBLIC revoke
-- 때문이 아니었다.)
--
-- 앞으로 이 프로젝트의 모든 RPC 함수는 PUBLIC이 아니라 anon/authenticated를 명시적으로 지정해
-- revoke해야 한다.
revoke execute on function persist_extraction_result(text, text, integer, text, jsonb)
  from anon, authenticated;
grant execute on function persist_extraction_result(text, text, integer, text, jsonb)
  to service_role;
