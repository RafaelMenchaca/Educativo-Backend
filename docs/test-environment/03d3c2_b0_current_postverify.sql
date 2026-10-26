-- 03D3C2-B0-current postverify. Read-only; same catalog surfaces as preflight.
WITH target_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('anexos'),('examen_generation_items'),
 ('examen_generation_jobs'),('examenes'),('grados'),('listas_cotejo'),('materias'),
 ('planeacion_batches'),('planeaciones'),('planteles'),('profiles'),('temas'),
 ('unidades'),('user_profiles'),('user_settings')),
dml(privilege_name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')),
public_tables AS (
 SELECT c.relname::text AS table_name,c.relowner,c.relacl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
acl AS (
 SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,
        grantor.rolname::text AS grantor,x.privilege_type::text AS privilege,x.is_grantable
 FROM public_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) x
 LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor),
policies AS (SELECT count(*)::integer AS total,count(*) FILTER(WHERE roles=ARRAY['public'::name])::integer AS public_count,
 count(*) FILTER(WHERE tablename='ai_model_prices' AND cmd='SELECT' AND roles=ARRAY['authenticated'::name])::integer AS price_count,
 md5(string_agg(tablename::text||'|'||policyname::text||'|'||cmd::text||'|'||
  array_to_string(ARRAY(SELECT role_name::text FROM unnest(roles) role_name ORDER BY role_name::text),','),E'\n'
  ORDER BY tablename::text,policyname::text)) AS manifest_md5
 FROM pg_catalog.pg_policies WHERE schemaname='public'),
defaults AS (SELECT grantor.rolname::text AS grantor FROM pg_catalog.pg_default_acl d
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
 LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='public'),
seq_acl AS (
 SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,x.privilege_type::text AS privilege
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('S',c.relowner))) x
 LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee WHERE n.nspname='public' AND c.relname='planeaciones_id_seq'),
expected_functions(function_name,expected_body_md5,expected_definer,expected_config) AS (VALUES
 ('enforce_grado_ownership', 'f97d9b07b705d78bd7dbaf5c960c543c', false, NULL::text[]),
 ('enforce_materia_ownership', 'b50a030da78990d83a0d3549a12092b0', false, NULL::text[]),
 ('enforce_planeacion_tema_ownership', '0905147358485175b60fa446011e1e88', false, NULL::text[]),
 ('enforce_tema_ownership', '65fd6a9c4bc24803bf097347782c5cef', false, NULL::text[]),
 ('handle_new_user', 'db4596f1ea835acc5d79e921e94c803a', true, ARRAY['search_path=pg_catalog, public']::text[]),
 ('set_updated_at', '204b9b9355e61b7541bc0633bbc9294c', false, NULL::text[])),
function_checks AS (
 SELECT e.function_name,count(p.oid)=1 AND bool_and(pg_catalog.pg_get_userbyid(p.proowner)='postgres'
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
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 GROUP BY e.function_name,e.expected_body_md5,e.expected_definer,e.expected_config),
expected_triggers(schema_name,table_name,trigger_name,function_name,expected_tgtype) AS (VALUES
 ('auth','users','on_auth_user_created','handle_new_user',5),('public','anexos','set_anexos_updated_at','set_updated_at',19),
 ('public','examenes','set_examenes_updated_at','set_updated_at',19),('public','grados','trg_grado_ownership','enforce_grado_ownership',23),
 ('public','grados','trg_grados_updated_at','set_updated_at',19),('public','listas_cotejo','set_listas_cotejo_updated_at','set_updated_at',19),
 ('public','materias','trg_materia_ownership','enforce_materia_ownership',23),('public','materias','trg_materias_updated_at','set_updated_at',19),
 ('public','planeaciones','trg_planeacion_tema_ownership','enforce_planeacion_tema_ownership',23),('public','planeaciones','trg_planeaciones_updated_at','set_updated_at',19),
 ('public','planteles','trg_planteles_updated_at','set_updated_at',19),('public','profiles','trg_profiles_updated_at','set_updated_at',19),
 ('public','temas','trg_tema_ownership','enforce_tema_ownership',23),('public','temas','trg_temas_updated_at','set_updated_at',19),
 ('public','unidades','trg_unidades_updated_at','set_updated_at',19),('public','user_settings','trg_user_settings_updated_at','set_updated_at',19)),
trigger_checks AS (
 SELECT e.trigger_name,count(t.oid)=1 AND bool_and(t.tgenabled='O' AND t.tgtype::integer=e.expected_tgtype
  AND pn.nspname='public' AND p.proname=e.function_name AND pg_catalog.pg_get_function_identity_arguments(p.oid)='') AS ok
 FROM expected_triggers e LEFT JOIN pg_catalog.pg_namespace tn ON tn.nspname=e.schema_name
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=tn.oid AND c.relname=e.table_name
 LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND t.tgname=e.trigger_name AND NOT t.tgisinternal
 LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 GROUP BY e.trigger_name,e.expected_tgtype,e.function_name),
relevant_trigger_count AS (
 SELECT count(*)::integer AS total FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND pn.nspname='public'
 AND p.proname IN ('enforce_grado_ownership','enforce_materia_ownership','enforce_planeacion_tema_ownership','enforce_tema_ownership','handle_new_user','set_updated_at'))
SELECT
 current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS version_ok,
 (SELECT count(*) FROM public_tables)=19 AS tables_ok,
 NOT EXISTS(SELECT 1 FROM acl WHERE role_name='anon')
  AND NOT EXISTS(SELECT 1 FROM public_tables t CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
   WHERE pg_catalog.has_table_privilege('anon',format('%I.%I','public',t.table_name),p.privilege)) AS anon_zero_on_all_tables,
 (SELECT count(*) FROM acl a JOIN target_tables t ON t.table_name=a.table_name JOIN dml d ON d.privilege_name=a.privilege
   WHERE a.role_name='authenticated')=68
  AND NOT EXISTS(SELECT 1 FROM acl a JOIN target_tables t ON t.table_name=a.table_name
   WHERE a.role_name='authenticated' AND a.privilege IN ('TRUNCATE','REFERENCES','TRIGGER'))
  AND (SELECT count(*) FROM acl WHERE role_name='authenticated' AND table_name='ai_model_prices' AND privilege='SELECT')=1
  AND NOT EXISTS(SELECT 1 FROM acl WHERE role_name='authenticated' AND table_name='ia_metrics_legacy') AS authenticated_exact,
 (SELECT count(*) FROM acl WHERE role_name='service_role')=133 AS service_role_unchanged,
 (SELECT count(*) FROM acl WHERE role_name='postgres')=133 AS postgres_unchanged,
 NOT EXISTS(SELECT 1 FROM acl WHERE role_name='PUBLIC') AS public_unchanged,
 NOT EXISTS(SELECT 1 FROM seq_acl WHERE role_name='anon')
  AND NOT pg_catalog.has_sequence_privilege('anon','public.planeaciones_id_seq','USAGE')
  AND NOT pg_catalog.has_sequence_privilege('anon','public.planeaciones_id_seq','SELECT')
  AND NOT pg_catalog.has_sequence_privilege('anon','public.planeaciones_id_seq','UPDATE')
  AND (SELECT count(*) FROM seq_acl WHERE role_name IN ('authenticated','service_role','postgres'))=9 AS sequence_exact,
 NOT EXISTS(SELECT 1 FROM acl WHERE role_name IN ('PUBLIC','anon','authenticated','service_role') AND privilege='MAINTAIN') AS maintain_absent,
 (SELECT total=49 AND public_count=48 AND price_count=1
  AND manifest_md5='221d334d3db5913257ac610efba163a9' FROM policies) AS policies_unchanged,
 (SELECT count(*) FROM defaults)=96 AND (SELECT count(*) FROM defaults WHERE grantor='postgres')=48
  AND (SELECT count(*) FROM defaults WHERE grantor='supabase_admin')=48 AS defaults_unchanged,
 (SELECT count(*) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')=49 AS rls_objects_unchanged,
 (SELECT count(*)=6 AND bool_and(ok) FROM function_checks) AS six_functions_exact,
 (SELECT count(*)=16 AND bool_and(ok) FROM trigger_checks)
  AND (SELECT total=16 FROM relevant_trigger_count) AS sixteen_triggers_exact,
 (SELECT count(*)=6 AND bool_and(ok) FROM function_checks)
  AND (SELECT count(*)=16 AND bool_and(ok) FROM trigger_checks)
  AND (SELECT total=16 FROM relevant_trigger_count) AS trigger_context_matches_expected;
