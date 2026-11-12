-- Read-only verification; deliberately avoids sequence state reads and mutations.
WITH public_acl AS (
  SELECT count(*)::integer AS privilege_count FROM pg_catalog.pg_class c
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
  WHERE c.oid='public.planeaciones_id_seq'::regclass AND x.grantee=0
)
SELECT
  public_acl.privilege_count=0 AS public_empty,
  NOT pg_catalog.has_sequence_privilege('anon','public.planeaciones_id_seq','USAGE')
    AND NOT pg_catalog.has_sequence_privilege('anon','public.planeaciones_id_seq','SELECT')
    AND NOT pg_catalog.has_sequence_privilege('anon','public.planeaciones_id_seq','UPDATE') AS anon_empty,
  pg_catalog.has_sequence_privilege('authenticated','public.planeaciones_id_seq','USAGE')
    AND NOT pg_catalog.has_sequence_privilege('authenticated','public.planeaciones_id_seq','SELECT')
    AND NOT pg_catalog.has_sequence_privilege('authenticated','public.planeaciones_id_seq','UPDATE') AS authenticated_exact,
  pg_catalog.has_sequence_privilege('service_role','public.planeaciones_id_seq','USAGE')
    AND NOT pg_catalog.has_sequence_privilege('service_role','public.planeaciones_id_seq','SELECT')
    AND NOT pg_catalog.has_sequence_privilege('service_role','public.planeaciones_id_seq','UPDATE') AS service_role_exact,
  pg_catalog.has_sequence_privilege('postgres','public.planeaciones_id_seq','USAGE')
    AND pg_catalog.has_sequence_privilege('postgres','public.planeaciones_id_seq','SELECT')
    AND pg_catalog.has_sequence_privilege('postgres','public.planeaciones_id_seq','UPDATE') AS postgres_unchanged
FROM public_acl;
