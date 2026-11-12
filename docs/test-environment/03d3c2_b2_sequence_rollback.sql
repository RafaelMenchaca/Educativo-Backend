BEGIN;
GRANT SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq TO authenticated;
GRANT SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq TO service_role;
COMMIT;
