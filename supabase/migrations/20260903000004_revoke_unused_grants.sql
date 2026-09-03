-- 보안 점검 중 발견: anon 롤에 TRUNCATE/TRIGGER/REFERENCES 권한이 남아 있었다 (Supabase가
-- 프로젝트 생성 시 스키마 기본 권한으로 부여한 것 — 우리가 명시적으로 준 적 없음). 이 앱은
-- PostgREST REST API(SELECT/INSERT/UPDATE/DELETE + 우리가 정의한 RPC 함수)로만 접근하므로
-- TRUNCATE는 애초에 노출될 경로가 없어 실제 악용 가능성은 없지만, 최소 권한 원칙상 필요 없는
-- 권한은 정리한다. anon은 이 앱에서 아무 것도 못 해야 한다(모든 보호 라우트가 로그인을
-- 강제하므로 익명 접근 자체가 없다) — authenticated도 TRUNCATE/TRIGGER/REFERENCES는 앱
-- 동작에 쓰이지 않는다.

revoke truncate, trigger, references on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
