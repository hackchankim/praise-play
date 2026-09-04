-- Task 017 작업 중 발견: CREATE OR REPLACE FUNCTION으로 persist_extraction_result(Task 016)를
-- 다시 정의한 직전 마이그레이션(20260904000002)이 REVOKE/GRANT 문을 다시 실행하지 않았더니
-- 함수의 실행 권한이 PostgreSQL 기본값(사실상 PUBLIC — anon/authenticated 포함)으로 되돌아가
-- 있었다. 실제로 확인함: information_schema.role_routine_grants에 anon/authenticated가
-- EXECUTE로 다시 나타났다 — CREATE OR REPLACE가 기존 권한을 보존한다는 문서상의 설명과 달리
-- 이 환경에서는 그렇지 않았다. 앞으로 이 함수를 CREATE OR REPLACE하는 모든 마이그레이션은
-- 반드시 이 REVOKE/GRANT 쌍을 함께 재실행해야 한다.
revoke execute on function persist_extraction_result(text, text, integer, text, jsonb) from public;
grant execute on function persist_extraction_result(text, text, integer, text, jsonb) to service_role;
