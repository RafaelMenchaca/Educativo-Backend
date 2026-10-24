-- Educativo IA 03D3C1 migration. TEST FIRST. Do not execute in production.
-- Run only after every preflight apt_to_apply value is true.
-- Uses ALTER FUNCTION/REVOKE syntax common to PostgreSQL 15.8 and 17.6.
BEGIN;

ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_grado_ownership() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_materia_ownership() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_tema_ownership() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_planeacion_tema_ownership() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

