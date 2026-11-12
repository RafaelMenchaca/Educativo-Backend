-- Educativo IA 03D3C1 postverify. READ-ONLY. Execute only in Supabase test.

-- POSTVERIFY_STATEMENT 01: exact functions, unchanged bodies/attributes and authorized configuration/ACL.
WITH expected(name, expected_body_md5, security_definer, expected_config) AS (
  VALUES
    ('enforce_grado_ownership', 'f97d9b07b705d78bd7dbaf5c960c543c', false, NULL::text[]),
    ('enforce_materia_ownership', 'b50a030da78990d83a0d3549a12092b0', false, NULL::text[]),
    ('enforce_planeacion_tema_ownership', '0905147358485175b60fa446011e1e88', false, NULL::text[]),
    ('enforce_tema_ownership', '65fd6a9c4bc24803bf097347782c5cef', false, NULL::text[]),
    ('handle_new_user', 'db4596f1ea835acc5d79e921e94c803a', true, ARRAY['search_path=pg_catalog, public']::text[]),
    ('set_updated_at', '204b9b9355e61b7541bc0633bbc9294c', false, NULL::text[])
), actual AS (
  SELECT e.*, p.oid, pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
         l.lanname AS language_name, pg_catalog.pg_get_function_result(p.oid) AS result_type,
         p.prosecdef, p.provolatile, p.proparallel, p.prokind, p.proconfig,
         md5(p.prosrc) AS actual_body_md5,
         count(*) OVER (PARTITION BY p.pronamespace,p.proname) AS overload_count
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name
  LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
)
SELECT name AS function_name, owner_name, language_name, result_type, prosecdef AS security_definer,
       provolatile AS volatility, proparallel AS parallel_safety, proconfig,
       pg_catalog.has_function_privilege('postgres', oid, 'EXECUTE') AS owner_can_execute,
       pg_catalog.has_function_privilege('anon', oid, 'EXECUTE') AS anon_can_execute,
       pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_can_execute,
       pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE') AS service_role_can_execute,
       (oid IS NOT NULL AND overload_count=1 AND owner_name='postgres' AND language_name='plpgsql'
        AND result_type='trigger' AND prosecdef=security_definer AND provolatile='v' AND proparallel='u'
        AND prokind='f' AND actual_body_md5=expected_body_md5 AND proconfig IS NOT DISTINCT FROM expected_config
        AND pg_catalog.has_function_privilege('postgres', oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')) AS matches_expected
FROM actual expected ORDER BY name;

-- POSTVERIFY_STATEMENT 02: all 16 trigger bindings remain exact and enabled.
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
)
SELECT e.table_schema,e.table_name,e.trigger_name,e.function_name,
       count(t.oid)::integer AS object_count,
       (count(t.oid)=1 AND bool_and(t.tgenabled='O') AND bool_and(t.tgtype::integer=e.expected_tgtype)
        AND bool_and(p.proname=e.function_name AND pn.nspname='public'
                     AND pg_catalog.pg_get_function_identity_arguments(p.oid)='')) AS matches_expected
FROM expected e
LEFT JOIN pg_catalog.pg_namespace tn ON tn.nspname=e.table_schema
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=tn.oid AND c.relname=e.table_name
LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND t.tgname=e.trigger_name AND NOT t.tgisinternal
LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
GROUP BY e.table_schema,e.table_name,e.trigger_name,e.function_name,e.expected_tgtype
ORDER BY e.table_schema,e.table_name,e.trigger_name;

-- POSTVERIFY_STATEMENT 03: no extra/missing overloads among the six names.
SELECT count(*)::integer AS exact_function_count,
       count(*) FILTER (WHERE pg_catalog.pg_get_function_identity_arguments(p.oid)='')::integer AS no_arg_count,
       (count(*)=6 AND count(*) FILTER (WHERE pg_catalog.pg_get_function_identity_arguments(p.oid)='')=6) AS matches_expected
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('enforce_grado_ownership','enforce_materia_ownership','enforce_planeacion_tema_ownership',
  'enforce_tema_ownership','handle_new_user','set_updated_at');

