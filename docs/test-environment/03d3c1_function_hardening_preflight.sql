-- Educativo IA 03D3C1 preflight. READ-ONLY.
-- Execute only in Supabase test after visually confirming Project ID gwdtlbisykzzplgzczzq.
-- Do not execute in production. Stop if any apt_to_apply value is false.
-- Statements are independent SELECT/CTE blocks. They return metadata only, never function bodies or row data.

-- PREFLIGHT_STATEMENT 01: exact six-function inventory, CRLF prosrc fingerprints and current ACL shape.
-- Fingerprints are MD5 of the exact dollar-quoted body content, excluding delimiters, preserving both outer newlines,
-- with line endings represented as CRLF to match the six pg_proc.prosrc values observed in Supabase test.
WITH expected(name, body_md5, security_definer) AS (
  VALUES
    ('enforce_grado_ownership', 'f97d9b07b705d78bd7dbaf5c960c543c', false),
    ('enforce_materia_ownership', 'b50a030da78990d83a0d3549a12092b0', false),
    ('enforce_planeacion_tema_ownership', '0905147358485175b60fa446011e1e88', false),
    ('enforce_tema_ownership', '65fd6a9c4bc24803bf097347782c5cef', false),
    ('handle_new_user', 'db4596f1ea835acc5d79e921e94c803a', true),
    ('set_updated_at', '204b9b9355e61b7541bc0633bbc9294c', false)
), actual AS (
  SELECT e.name, e.body_md5 AS expected_body_md5, e.security_definer AS expected_definer,
         count(p.oid)::integer AS overload_count,
         min(pg_catalog.pg_get_userbyid(p.proowner)) AS owner_name,
         min(l.lanname) AS language_name,
         min(pg_catalog.pg_get_function_result(p.oid)) AS result_type,
         bool_and(p.prosecdef = e.security_definer) AS security_matches,
         bool_and(p.provolatile = 'v') AS volatility_matches,
         bool_and(p.proparallel = 'u') AS parallel_matches,
         bool_and(p.prokind = 'f') AS kind_matches,
         bool_and(pg_catalog.pg_get_function_identity_arguments(p.oid) = '') AS signature_matches,
         min(md5(p.prosrc)) AS observed_body_md5,
         bool_and(md5(p.prosrc) = e.body_md5) AS body_hash_matches,
         bool_and(p.proconfig IS NULL) AS current_config_is_null,
         bool_and(p.proacl IS NOT NULL) AS acl_is_explicit
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid AND p.proname = e.name
  LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  GROUP BY e.name, e.body_md5, e.security_definer
), acl AS (
  SELECT p.proname AS name,
         array_agg(DISTINCT (CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text
                   ORDER BY (CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text)
           FILTER (WHERE x.privilege_type = 'EXECUTE') AS execute_grantees
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) x
  WHERE p.proname IN ('enforce_grado_ownership','enforce_materia_ownership','enforce_planeacion_tema_ownership',
                      'enforce_tema_ownership','handle_new_user','set_updated_at')
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
  GROUP BY p.proname
)
SELECT a.name AS function_name, a.overload_count, a.owner_name, a.language_name, a.result_type,
       a.expected_definer AS security_definer, a.security_matches, a.volatility_matches, a.parallel_matches,
       a.kind_matches, a.signature_matches, a.expected_body_md5, a.observed_body_md5, a.body_hash_matches,
       a.current_config_is_null, a.acl_is_explicit, acl.execute_grantees,
       (a.overload_count = 1 AND a.owner_name = 'postgres' AND a.language_name = 'plpgsql'
        AND a.result_type = 'trigger' AND a.security_matches AND a.volatility_matches
        AND a.parallel_matches AND a.kind_matches AND a.signature_matches AND a.body_hash_matches
        AND a.current_config_is_null AND a.acl_is_explicit
        AND acl.execute_grantees = ARRAY['PUBLIC','anon','authenticated','postgres','service_role']::text[])
         AS apt_to_apply
FROM actual a LEFT JOIN acl USING (name)
ORDER BY a.name;

-- PREFLIGHT_STATEMENT 02: exact trigger graph. tgfoid is joined conceptually but no OID is returned as stable evidence.
WITH expected(table_schema, table_name, trigger_name, function_name, expected_tgtype) AS (
  VALUES
    ('auth','users','on_auth_user_created','handle_new_user',5),
    ('public','anexos','set_anexos_updated_at','set_updated_at',19),
    ('public','examenes','set_examenes_updated_at','set_updated_at',19),
    ('public','grados','trg_grado_ownership','enforce_grado_ownership',23),
    ('public','grados','trg_grados_updated_at','set_updated_at',19),
    ('public','listas_cotejo','set_listas_cotejo_updated_at','set_updated_at',19),
    ('public','materias','trg_materia_ownership','enforce_materia_ownership',23),
    ('public','materias','trg_materias_updated_at','set_updated_at',19),
    ('public','planeaciones','trg_planeacion_tema_ownership','enforce_planeacion_tema_ownership',23),
    ('public','planeaciones','trg_planeaciones_updated_at','set_updated_at',19),
    ('public','planteles','trg_planteles_updated_at','set_updated_at',19),
    ('public','profiles','trg_profiles_updated_at','set_updated_at',19),
    ('public','temas','trg_tema_ownership','enforce_tema_ownership',23),
    ('public','temas','trg_temas_updated_at','set_updated_at',19),
    ('public','unidades','trg_unidades_updated_at','set_updated_at',19),
    ('public','user_settings','trg_user_settings_updated_at','set_updated_at',19)
), matched AS (
  SELECT e.*, count(t.oid)::integer AS object_count,
         bool_and(t.tgenabled = 'O') AS enabled_expected,
         bool_and(t.tgtype::integer = e.expected_tgtype) AS event_matches,
         bool_and(p.proname = e.function_name AND pn.nspname = 'public'
                  AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '') AS function_matches
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace tn ON tn.nspname = e.table_schema
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = tn.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid = c.oid AND t.tgname = e.trigger_name AND NOT t.tgisinternal
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
  GROUP BY e.table_schema,e.table_name,e.trigger_name,e.function_name,e.expected_tgtype
)
SELECT table_schema, table_name, trigger_name, function_name, expected_tgtype,
       object_count, enabled_expected, event_matches, function_matches,
       (object_count = 1 AND enabled_expected AND event_matches AND function_matches) AS apt_to_apply
FROM matched ORDER BY table_schema, table_name, trigger_name;

-- PREFLIGHT_STATEMENT 03: secure-schema condition for search_path = pg_catalog, public.
WITH public_schema AS (
  SELECT n.oid, n.nspowner, n.nspacl,
         EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) x
           WHERE x.grantee = 0 AND x.privilege_type = 'CREATE'
         ) AS public_has_create,
         pg_catalog.has_schema_privilege('anon', n.oid, 'CREATE') AS anon_has_create,
         pg_catalog.has_schema_privilege('authenticated', n.oid, 'CREATE') AS authenticated_has_create
  FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'
)
SELECT count(*)::integer AS public_schema_count,
       bool_or(public_has_create) AS public_has_create,
       bool_or(anon_has_create) AS anon_has_create,
       bool_or(authenticated_has_create) AS authenticated_has_create,
       (count(*) = 1 AND NOT bool_or(public_has_create)
        AND NOT bool_or(anon_has_create) AND NOT bool_or(authenticated_has_create)) AS apt_to_apply
FROM public_schema;

-- PREFLIGHT_STATEMENT 04: resolution inventory for handle_new_user.
-- Application relations are schema-qualified. COALESCE is SQL syntax; operators and jsonb are pg_catalog objects.
WITH checks(check_name, object_count, expected_count) AS (
  VALUES
    ('public.profiles relation', (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='profiles' AND c.relkind='r'), 1::bigint),
    ('public.user_settings relation', (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='user_settings' AND c.relkind='r'), 1::bigint),
    ('pg_catalog.jsonb type', (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='pg_catalog' AND t.typname='jsonb'), 1::bigint),
    ('unexpected public jsonb type', (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='jsonb'), 0::bigint)
)
SELECT check_name, object_count, expected_count, object_count = expected_count AS apt_to_apply
FROM checks ORDER BY check_name;

