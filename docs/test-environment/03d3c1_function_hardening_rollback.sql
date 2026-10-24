-- Educativo IA 03D3C1 rollback. Do not run automatically.
-- Restores the previously observed effective privileges and clears the added proconfig.
-- GRANT cannot promise byte-for-byte proacl ordering/grantor identity; it restores effective access.
BEGIN;

ALTER FUNCTION public.handle_new_user() RESET search_path;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_grado_ownership() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_materia_ownership() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_tema_ownership() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_planeacion_tema_ownership() TO PUBLIC, anon, authenticated, service_role;

COMMIT;
