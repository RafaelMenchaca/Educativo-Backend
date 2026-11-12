-- 03D3C2-B0-current trigger/function diagnostic. READ-ONLY. Supabase test only.

-- DIAGNOSTIC 01: the six hardened functions, with each predicate visible.
WITH expected(function_name, expected_body_md5, expected_definer, expected_config) AS (
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
         md5(p.prosrc) AS observed_body_md5,
         count(p.oid) OVER (PARTITION BY p.pronamespace,p.proname) AS overload_count
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name
  LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
)
SELECT function_name, count(oid) OVER (PARTITION BY function_name)::integer AS object_count,
       overload_count::integer,
       (oid IS NOT NULL AND owner_name='postgres') AS owner_matches,
       (oid IS NOT NULL AND observed_body_md5=expected_body_md5) AS body_hash_matches,
       (oid IS NOT NULL AND prosecdef=expected_definer) AS security_matches,
       (oid IS NOT NULL AND proconfig IS NOT DISTINCT FROM expected_config) AS config_matches,
       (oid IS NOT NULL
        AND pg_catalog.has_function_privilege('postgres',oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon',oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')) AS execute_acl_matches,
       (oid IS NOT NULL AND overload_count=1 AND owner_name='postgres' AND language_name='plpgsql'
        AND result_type='trigger' AND prosecdef=expected_definer AND provolatile='v' AND proparallel='u'
        AND prokind='f' AND observed_body_md5=expected_body_md5
        AND proconfig IS NOT DISTINCT FROM expected_config
        AND pg_catalog.has_function_privilege('postgres',oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon',oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')) AS matches_expected
FROM actual ORDER BY function_name;

-- DIAGNOSTIC 02: the exact 16 bindings (15 public tables plus auth.users).
WITH expected(schema_name,table_name,trigger_name,function_name,expected_tgtype) AS (
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
SELECT e.schema_name,e.table_name,e.trigger_name,e.function_name,
       count(t.oid)::integer AS object_count,
       (count(t.oid)=1 AND bool_and(t.tgenabled='O')) AS enabled_matches,
       (count(t.oid)=1 AND bool_and(t.tgtype::integer=e.expected_tgtype)) AS event_matches,
       (count(t.oid)=1 AND bool_and(p.proname=e.function_name AND pn.nspname='public'
        AND pg_catalog.pg_get_function_identity_arguments(p.oid)='')) AS binding_matches,
       (count(t.oid)=1 AND bool_and(t.tgenabled='O')
        AND bool_and(t.tgtype::integer=e.expected_tgtype)
        AND bool_and(p.proname=e.function_name AND pn.nspname='public'
         AND pg_catalog.pg_get_function_identity_arguments(p.oid)='')) AS matches_expected
FROM expected e
LEFT JOIN pg_catalog.pg_namespace tn ON tn.nspname=e.schema_name
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=tn.oid AND c.relname=e.table_name
LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND t.tgname=e.trigger_name AND NOT t.tgisinternal
LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
GROUP BY e.schema_name,e.table_name,e.trigger_name,e.function_name,e.expected_tgtype
ORDER BY e.schema_name,e.table_name,e.trigger_name;

-- DIAGNOSTIC 03: fail-closed summary over the same approved manifests.
WITH expected_functions(function_name,expected_body_md5,expected_definer,expected_config) AS (
 VALUES
  ('enforce_grado_ownership', 'f97d9b07b705d78bd7dbaf5c960c543c', false, NULL::text[]),
  ('enforce_materia_ownership', 'b50a030da78990d83a0d3549a12092b0', false, NULL::text[]),
  ('enforce_planeacion_tema_ownership', '0905147358485175b60fa446011e1e88', false, NULL::text[]),
  ('enforce_tema_ownership', '65fd6a9c4bc24803bf097347782c5cef', false, NULL::text[]),
  ('handle_new_user', 'db4596f1ea835acc5d79e921e94c803a', true, ARRAY['search_path=pg_catalog, public']::text[]),
  ('set_updated_at', '204b9b9355e61b7541bc0633bbc9294c', false, NULL::text[])
), function_checks AS (
 SELECT e.function_name,
  count(p.oid)=1 AND bool_and(pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND l.lanname='plpgsql' AND pg_catalog.pg_get_function_result(p.oid)='trigger'
   AND p.prosecdef=e.expected_definer AND p.provolatile='v' AND p.proparallel='u' AND p.prokind='f'
   AND md5(p.prosrc)=e.expected_body_md5 AND p.proconfig IS NOT DISTINCT FROM e.expected_config
   AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
   AND pg_catalog.has_function_privilege('postgres',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) AS ok
 FROM expected_functions e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang GROUP BY e.function_name,e.expected_body_md5,e.expected_definer,e.expected_config
), expected_triggers(schema_name,table_name,trigger_name,function_name,expected_tgtype) AS (
 VALUES
  ('auth','users','on_auth_user_created','handle_new_user',5),('public','anexos','set_anexos_updated_at','set_updated_at',19),
  ('public','examenes','set_examenes_updated_at','set_updated_at',19),('public','grados','trg_grado_ownership','enforce_grado_ownership',23),
  ('public','grados','trg_grados_updated_at','set_updated_at',19),('public','listas_cotejo','set_listas_cotejo_updated_at','set_updated_at',19),
  ('public','materias','trg_materia_ownership','enforce_materia_ownership',23),('public','materias','trg_materias_updated_at','set_updated_at',19),
  ('public','planeaciones','trg_planeacion_tema_ownership','enforce_planeacion_tema_ownership',23),('public','planeaciones','trg_planeaciones_updated_at','set_updated_at',19),
  ('public','planteles','trg_planteles_updated_at','set_updated_at',19),('public','profiles','trg_profiles_updated_at','set_updated_at',19),
  ('public','temas','trg_tema_ownership','enforce_tema_ownership',23),('public','temas','trg_temas_updated_at','set_updated_at',19),
  ('public','unidades','trg_unidades_updated_at','set_updated_at',19),('public','user_settings','trg_user_settings_updated_at','set_updated_at',19)
), trigger_checks AS (
 SELECT e.trigger_name,count(t.oid)=1 AND bool_and(t.tgenabled='O' AND t.tgtype::integer=e.expected_tgtype
  AND pn.nspname='public' AND p.proname=e.function_name AND pg_catalog.pg_get_function_identity_arguments(p.oid)='') AS ok
 FROM expected_triggers e LEFT JOIN pg_catalog.pg_namespace tn ON tn.nspname=e.schema_name
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=tn.oid AND c.relname=e.table_name
 LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND t.tgname=e.trigger_name AND NOT t.tgisinternal
 LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 GROUP BY e.trigger_name,e.expected_tgtype,e.function_name
), relevant_trigger_count AS (
 SELECT count(*)::integer AS total FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND pn.nspname='public'
 AND p.proname IN ('enforce_grado_ownership','enforce_materia_ownership','enforce_planeacion_tema_ownership','enforce_tema_ownership','handle_new_user','set_updated_at')
)
SELECT (SELECT count(*)=6 AND bool_and(ok) FROM function_checks) AS six_functions_exact,
       (SELECT count(*)=16 AND bool_and(ok) FROM trigger_checks)
        AND (SELECT total=16 FROM relevant_trigger_count) AS sixteen_triggers_exact,
       (SELECT count(*)=6 AND bool_and(ok) FROM function_checks)
        AND (SELECT count(*)=16 AND bool_and(ok) FROM trigger_checks)
        AND (SELECT total=16 FROM relevant_trigger_count) AS trigger_context_matches_expected;
