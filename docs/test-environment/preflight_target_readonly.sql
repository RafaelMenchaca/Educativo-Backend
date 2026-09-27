-- SESSION 02C.1: TARGET PREFLIGHT — READ ONLY.
-- Run only after visually confirming the dashboard shows:
-- educativo-backend-test / gwdtlbisykzzplgzczzq / us-east-2.
-- PostgreSQL cannot verify the Supabase Project ID from a trusted catalog value.
-- Never initialize educativo-backend / bfnkaqmhcsyxdxoqnahk.
-- Catalogs only: no application/auth/storage rows, secrets, or state changes.

SELECT current_user AS current_user,
       pg_catalog.current_setting('server_version') AS postgres_version,
       pg_catalog.current_setting('server_version_num') AS postgres_version_num,
       (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       ) AS public_relations_or_sequences,
       (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_depend d
             WHERE d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
               AND d.objid = p.oid
               AND d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
               AND d.deptype = 'e'
           )
       ) AS non_extension_public_functions,
       (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_trigger tr
         WHERE tr.tgrelid = pg_catalog.to_regclass('auth.users')
           AND NOT tr.tgisinternal
       ) AS custom_auth_user_triggers,
       (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_policy pol
         WHERE pol.polrelid = pg_catalog.to_regclass('storage.objects')
       ) AS storage_object_policies,
       pg_catalog.to_regclass('auth.users') IS NOT NULL AS has_auth_users,
       pg_catalog.to_regclass('storage.objects') IS NOT NULL AS has_storage_objects,
       pg_catalog.to_regprocedure('auth.uid()') IS NOT NULL AS has_auth_uid,
       pg_catalog.to_regprocedure('storage.foldername(text)') IS NOT NULL
         AS has_storage_foldername,
       pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL
         AS has_gen_random_uuid,
       COALESCE((
         SELECT c.relrowsecurity
         FROM pg_catalog.pg_class c
         WHERE c.oid = pg_catalog.to_regclass('storage.objects')
       ), false) AS storage_objects_rls;
