-- Educativo IA 03D3C1: preflight productivo estrictamente READ-ONLY.
-- Antes de ejecutar, confirmar visualmente educativo-backend / bfnkaqmhcsyxdxoqnahk / us-east-2.
-- El catalogo PostgreSQL no acredita el Project ref de Supabase.
WITH
expected_functions(name,body_md5,security_definer) AS (VALUES
 ('enforce_grado_ownership','f97d9b07b705d78bd7dbaf5c960c543c',false),
 ('enforce_materia_ownership','b50a030da78990d83a0d3549a12092b0',false),
 ('enforce_planeacion_tema_ownership','0905147358485175b60fa446011e1e88',false),
 ('enforce_tema_ownership','65fd6a9c4bc24803bf097347782c5cef',false),
 ('handle_new_user','db4596f1ea835acc5d79e921e94c803a',true),
 ('set_updated_at','204b9b9355e61b7541bc0633bbc9294c',false)
),
function_overloads AS (
 SELECT p.proname::text name,count(*)::integer overload_count
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (SELECT name FROM expected_functions)
 GROUP BY p.proname
),
actual_functions AS (
 SELECT e.name,e.body_md5 expected_body_md5,e.security_definer expected_security_definer,
   COALESCE(o.overload_count,0) overload_count,p.oid,
   pg_catalog.pg_get_userbyid(p.proowner)::text owner_name,l.lanname::text language_name,
   pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
   pg_catalog.pg_get_function_result(p.oid) result_type,p.prokind::text function_kind,
   p.prosecdef security_definer,p.provolatile::text volatility,p.proparallel::text parallel_safety,
   p.proconfig,md5(p.prosrc) observed_body_md5,
   COALESCE((SELECT array_agg(DISTINCT (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text
     ORDER BY (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text)
     FILTER (WHERE x.privilege_type='EXECUTE') FROM pg_catalog.aclexplode(p.proacl) x),ARRAY[]::text[]) execute_grantees
 FROM expected_functions e
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name
   AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 LEFT JOIN function_overloads o USING(name)
),
function_status AS (
 SELECT *,
   oid IS NOT NULL AND overload_count=1 AND owner_name='postgres' AND language_name='plpgsql'
   AND identity_arguments='' AND result_type='trigger' AND function_kind='f'
   AND security_definer=expected_security_definer AND volatility='v' AND parallel_safety='u'
   AND proconfig IS NULL AND observed_body_md5=expected_body_md5
   AND execute_grantees=ARRAY['PUBLIC','anon','authenticated','postgres','service_role']::text[] AS matches_baseline
 FROM actual_functions
),
expected_triggers(table_schema,table_name,trigger_name,function_name,expected_tgtype) AS (VALUES
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
),
trigger_status AS (
 SELECT e.*,count(t.oid)::integer object_count,
   count(t.oid)=1 AND bool_and(t.tgenabled='O') AND bool_and(t.tgtype::integer=e.expected_tgtype)
   AND bool_and(p.proname=e.function_name AND pn.nspname='public'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid)='') AS matches_baseline
 FROM expected_triggers e
 LEFT JOIN pg_catalog.pg_namespace tn ON tn.nspname=e.table_schema
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=tn.oid AND c.relname=e.table_name
 LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND t.tgname=e.trigger_name AND NOT t.tgisinternal
 LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 GROUP BY e.table_schema,e.table_name,e.trigger_name,e.function_name,e.expected_tgtype
),
unexpected_triggers AS (
 SELECT count(*)::integer unexpected_trigger_count
 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_namespace tn ON tn.oid=c.relnamespace
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 WHERE NOT t.tgisinternal AND pn.nspname='public' AND p.proname IN (SELECT name FROM expected_functions)
   AND NOT EXISTS(SELECT 1 FROM expected_triggers e WHERE e.table_schema=tn.nspname AND e.table_name=c.relname
     AND e.trigger_name=t.tgname AND e.function_name=p.proname AND e.expected_tgtype=t.tgtype::integer)
),
schema_status AS (
 SELECT count(*)::integer public_schema_count,
   bool_or(EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
     WHERE x.grantee=0 AND x.privilege_type='CREATE')) public_has_create,
   bool_or(pg_catalog.has_schema_privilege('anon',n.oid,'CREATE')) anon_has_create,
   bool_or(pg_catalog.has_schema_privilege('authenticated',n.oid,'CREATE')) authenticated_has_create
 FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
),
resolution_status AS (
 SELECT
  (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='profiles' AND c.relkind='r')=1
  AND (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='user_settings' AND c.relkind='r')=1
  AND (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='pg_catalog' AND t.typname='jsonb')=1
  AND (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='jsonb')=0 AS resolution_context_matches
),
expected_03d3a(name,table_name,type,definition) AS (VALUES
 ('educativo_ia_planeacion_batches_id_user_key','planeacion_batches','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_id_user_key','planeaciones','u','UNIQUE (id, user_id)'),
 ('educativo_ia_unidades_id_user_key','unidades','u','UNIQUE (id, user_id)'),
 ('educativo_ia_examen_jobs_id_user_key','examen_generation_jobs','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_batch_owner_present','planeaciones','c','CHECK (batch_id IS NULL OR user_id IS NOT NULL)'),
 ('educativo_ia_planeaciones_batch_owner_fkey','planeaciones','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_anexos_planeacion_owner_fkey','anexos','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_anexos_batch_owner_fkey','anexos','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_listas_planeacion_owner_fkey','listas_cotejo','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_listas_batch_owner_fkey','listas_cotejo','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examenes_unidad_owner_fkey','examenes','f','FOREIGN KEY (unidad_id, user_id) REFERENCES unidades(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_examenes_batch_owner_fkey','examenes','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examen_items_job_owner_fkey','examen_generation_items','f','FOREIGN KEY (job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_examenes_generation_job_owner_fkey','examenes','f','FOREIGN KEY (generation_job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE SET NULL (generation_job_id)')
),
actual_03d3a AS (
 SELECT c.conname::text name,t.relname::text table_name,c.contype::text type,c.convalidated,
   pg_catalog.pg_get_constraintdef(c.oid,true) definition
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
),
context_summary AS (
 SELECT
  (SELECT count(*) FROM function_status) function_count,
  (SELECT count(*) FROM function_status WHERE matches_baseline) matched_function_count,
  (SELECT count(*) FROM trigger_status) trigger_count,
  (SELECT count(*) FROM trigger_status WHERE matches_baseline) matched_trigger_count,
  (SELECT unexpected_trigger_count FROM unexpected_triggers) unexpected_trigger_count,
  (SELECT public_schema_count=1 AND NOT public_has_create AND NOT anon_has_create AND NOT authenticated_has_create FROM schema_status) schema_context_matches,
  (SELECT resolution_context_matches FROM resolution_status) resolution_context_matches,
  (SELECT count(*) FROM expected_03d3a e JOIN actual_03d3a a USING(name,table_name,type,definition) WHERE a.convalidated) matched_03d3a_constraint_count,
  (SELECT count(*) FROM expected_03d3a e LEFT JOIN actual_03d3a a USING(name) WHERE a.name IS NULL OR a.table_name<>e.table_name OR a.type<>e.type OR a.definition<>e.definition OR NOT a.convalidated) changed_03d3a_constraint_count,
  (SELECT count(*) FROM actual_03d3a a WHERE a.name LIKE 'educativo_ia_%' AND a.name NOT IN (SELECT name FROM expected_03d3a)
    AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades')) unexpected_03d3a_constraint_count
),
decision AS (
 SELECT *,current_setting('server_version_num')::integer=150008 server_context_matches,
   current_user='postgres' AND session_user='postgres' authority_context_matches,
   function_count=6 AND matched_function_count=6 AND trigger_count=16 AND matched_trigger_count=16
   AND unexpected_trigger_count=0 AND schema_context_matches AND resolution_context_matches
   AND matched_03d3a_constraint_count=14 AND changed_03d3a_constraint_count=0
   AND unexpected_03d3a_constraint_count=0 AS catalog_context_matches
 FROM context_summary
)
SELECT jsonb_build_object(
 'expected_project_name','educativo-backend','expected_project_ref','bfnkaqmhcsyxdxoqnahk','expected_region','us-east-2',
 'project_ref_verified_by_sql',false,'visual_project_ref_confirmation_required',true,
 'catalog_check_does_not_verify_project_ref',true,'current_user',current_user,'session_user',session_user,
 'server_version_num',current_setting('server_version_num')::integer,
 'server_context_matches',server_context_matches,'authority_context_matches',authority_context_matches,
 'function_count',function_count,'matched_function_count',matched_function_count,
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',name,'owner',owner_name,'identity_arguments',identity_arguments,
   'result_type',result_type,'language',language_name,'volatility',volatility,'parallel_safety',parallel_safety,
   'security_definer',security_definer,'proconfig',proconfig,'expected_body_md5',expected_body_md5,
   'observed_body_md5',observed_body_md5,'execute_grantees',execute_grantees,'matches_baseline',matches_baseline) ORDER BY name) FROM function_status),
 'trigger_count',trigger_count,'matched_trigger_count',matched_trigger_count,'unexpected_trigger_count',unexpected_trigger_count,
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table_schema',table_schema,'table_name',table_name,
   'trigger_name',trigger_name,'function_name',function_name,'expected_tgtype',expected_tgtype,
   'object_count',object_count,'matches_baseline',matches_baseline) ORDER BY table_schema,table_name,trigger_name) FROM trigger_status),
 'schema_context_matches',schema_context_matches,'resolution_context_matches',resolution_context_matches,
 'expected_03d3a_constraint_count',14,'matched_03d3a_constraint_count',matched_03d3a_constraint_count,
 'changed_03d3a_constraint_count',changed_03d3a_constraint_count,
 'unexpected_03d3a_constraint_count',unexpected_03d3a_constraint_count,
 'catalog_context_matches',catalog_context_matches,
 'apt_to_apply',catalog_context_matches AND server_context_matches AND authority_context_matches
) AS production_preflight_result
FROM decision;
