BEGIN;
REVOKE SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq FROM authenticated;
REVOKE SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq FROM service_role;
COMMIT;
