-- SESSION 02C.1: POST-INITIALIZATION VERIFICATION — READ ONLY.
-- Run only after initialize_application.sql in the authorized test project:
-- educativo-backend-test / gwdtlbisykzzplgzczzq / us-east-2.
-- Never run initialization in production: educativo-backend / bfnkaqmhcsyxdxoqnahk.
-- This file reads catalogs only. It does not read application/auth/storage rows,
-- invoke application functions, inspect secrets, or change database state.

-- 01. Execution context. Project identity must still be checked visually;
-- PostgreSQL has no trusted catalog value for the Supabase Project ID.
SELECT current_user AS current_user,
       pg_catalog.current_setting('server_version') AS postgres_version,
       pg_catalog.current_setting('server_version_num') AS postgres_version_num;

-- 02. Expected-versus-observed summary. difference = observed - expected.
WITH expected(metric, expected) AS (
  VALUES
    ('public_tables', 19::bigint),
    ('public_relations_or_sequences', 20::bigint),
    ('public_columns', 257::bigint),
    ('public_constraints', 76::bigint),
    ('public_foreign_keys', 41::bigint),
    ('public_indexes', 69::bigint),
    ('public_non_extension_functions', 6::bigint),
    ('custom_triggers_public_and_auth_users', 16::bigint),
    ('public_tables_with_rls', 19::bigint),
    ('public_tables_without_rls', 0::bigint),
    ('public_policies', 49::bigint),
    ('storage_object_policies', 8::bigint),
    ('all_application_policies', 57::bigint),
    ('auth_user_creation_trigger', 1::bigint),
    ('planeaciones_identity_sequence', 1::bigint)
), observed(metric, observed) AS (
  SELECT 'public_tables', pg_catalog.count(*)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'public_relations_or_sequences', pg_catalog.count(*)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  UNION ALL
  SELECT 'public_columns', pg_catalog.count(*)
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'public_constraints', pg_catalog.count(*)
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_namespace n ON n.oid = con.connamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'public_foreign_keys', pg_catalog.count(*)
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_namespace n ON n.oid = con.connamespace
  WHERE n.nspname = 'public' AND con.contype = 'f'
  UNION ALL
  SELECT 'public_indexes', pg_catalog.count(*)
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'public_non_extension_functions', pg_catalog.count(*)
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND d.objid = p.oid
        AND d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
        AND d.deptype = 'e'
    )
  UNION ALL
  SELECT 'custom_triggers_public_and_auth_users', pg_catalog.count(*)
  FROM pg_catalog.pg_trigger tr
  JOIN pg_catalog.pg_class c ON c.oid = tr.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT tr.tgisinternal
    AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
  UNION ALL
  SELECT 'public_tables_with_rls', pg_catalog.count(*)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  UNION ALL
  SELECT 'public_tables_without_rls', pg_catalog.count(*)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  UNION ALL
  SELECT 'public_policies', pg_catalog.count(*)
  FROM pg_catalog.pg_policy pol
  JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'storage_object_policies', pg_catalog.count(*)
  FROM pg_catalog.pg_policy pol
  WHERE pol.polrelid = pg_catalog.to_regclass('storage.objects')
  UNION ALL
  SELECT 'all_application_policies', pg_catalog.count(*)
  FROM pg_catalog.pg_policy pol
  JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
     OR (n.nspname = 'storage' AND c.relname = 'objects')
  UNION ALL
  SELECT 'auth_user_creation_trigger', pg_catalog.count(*)
  FROM pg_catalog.pg_trigger tr
  WHERE tr.tgrelid = pg_catalog.to_regclass('auth.users')
    AND NOT tr.tgisinternal AND tr.tgname = 'on_auth_user_created'
  UNION ALL
  SELECT 'planeaciones_identity_sequence', pg_catalog.count(*)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'planeaciones_id_seq'
    AND c.relkind = 'S'
)
SELECT e.metric, e.expected, o.observed,
       o.observed - e.expected AS difference,
       CASE WHEN o.observed = e.expected THEN 'OK' ELSE 'DIFF' END AS status
FROM expected e
LEFT JOIN observed o USING (metric)
ORDER BY e.metric;

-- 03. RLS state for every public application table.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 04. Custom triggers and their functions; expected 15 public + 1 auth.users.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       tr.tgname AS trigger_name, tr.tgenabled AS enabled_mode,
       fn.nspname AS function_schema, p.proname AS function_name
FROM pg_catalog.pg_trigger tr
JOIN pg_catalog.pg_class c ON c.oid = tr.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid = tr.tgfoid
JOIN pg_catalog.pg_namespace fn ON fn.oid = p.pronamespace
WHERE NOT tr.tgisinternal
  AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY n.nspname, c.relname, tr.tgname;

-- 05. Identity sequence structure. Does not read last_value.
SELECT tn.nspname AS table_schema, t.relname AS table_name,
       a.attname AS column_name, a.attidentity AS identity_kind,
       sn.nspname AS sequence_schema, s.relname AS sequence_name,
       pg_catalog.pg_get_userbyid(s.relowner) AS sequence_owner,
       pg_catalog.format_type(q.seqtypid, NULL) AS sequence_type,
       q.seqstart, q.seqincrement, q.seqmin, q.seqmax, q.seqcache, q.seqcycle,
       d.deptype AS ownership_dependency
FROM pg_catalog.pg_class t
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid
JOIN pg_catalog.pg_depend d
  ON d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
 AND d.refobjid = t.oid AND d.refobjsubid = a.attnum
 AND d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
 AND d.deptype = 'i'
JOIN pg_catalog.pg_class s ON s.oid = d.objid AND s.relkind = 'S'
JOIN pg_catalog.pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_catalog.pg_sequence q ON q.seqrelid = s.oid
WHERE tn.nspname = 'public' AND t.relname = 'planeaciones'
  AND a.attname = 'id' AND a.attidentity = 'd' AND NOT a.attisdropped;

-- 06. Foreign keys and referential actions.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       con.conname AS constraint_name,
       rn.nspname AS referenced_schema, rc.relname AS referenced_relation,
       CASE con.confupdtype
         WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT'
       END AS on_update,
       CASE con.confdeltype
         WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT'
       END AS on_delete,
       con.convalidated AS validated,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY c.relname, con.conname;

-- 07. Managed functions required by defaults and policies.
SELECT requirement, resolved_regprocedure,
       resolved_regprocedure IS NOT NULL AS available
FROM (VALUES
  ('auth.uid()', pg_catalog.to_regprocedure('auth.uid()')),
  ('storage.foldername(text)', pg_catalog.to_regprocedure('storage.foldername(text)')),
  ('pg_catalog.gen_random_uuid()', pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()'))
) AS required(requirement, resolved_regprocedure)
ORDER BY requirement;
