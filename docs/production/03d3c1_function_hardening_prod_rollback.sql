-- Educativo IA 03D3C1: rollback productivo transaccional y fail-closed.
-- Ejecutar solo ante fallo autorizado; restaura privilegios efectivos del baseline anterior.
BEGIN;

LOCK TABLE auth.users, public.anexos, public.examenes, public.examen_generation_items,
  public.examen_generation_jobs, public.grados, public.listas_cotejo, public.materias,
  public.planeacion_batches, public.planeaciones, public.planteles, public.profiles,
  public.temas, public.unidades, public.user_settings IN ACCESS SHARE MODE;

WITH
expected_functions(name,body_md5,security_definer,expected_config) AS (VALUES
 ('enforce_grado_ownership','f97d9b07b705d78bd7dbaf5c960c543c',false,NULL::text[]),
 ('enforce_materia_ownership','b50a030da78990d83a0d3549a12092b0',false,NULL::text[]),
 ('enforce_planeacion_tema_ownership','0905147358485175b60fa446011e1e88',false,NULL::text[]),
 ('enforce_tema_ownership','65fd6a9c4bc24803bf097347782c5cef',false,NULL::text[]),
 ('handle_new_user','db4596f1ea835acc5d79e921e94c803a',true,ARRAY['search_path=pg_catalog, public']::text[]),
 ('set_updated_at','204b9b9355e61b7541bc0633bbc9294c',false,NULL::text[])
),
function_gate AS (
 SELECT count(*)=6 AND (SELECT count(*) FROM pg_catalog.pg_proc px JOIN pg_catalog.pg_namespace nx ON nx.oid=px.pronamespace
   WHERE nx.nspname='public' AND px.proname IN (SELECT name FROM expected_functions))=6
   AND bool_and(pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND pg_catalog.pg_get_function_identity_arguments(p.oid)='' AND pg_catalog.pg_get_function_result(p.oid)='trigger'
   AND l.lanname='plpgsql' AND p.prokind='f' AND p.prosecdef=e.security_definer AND p.provolatile='v' AND p.proparallel='u'
   AND p.proconfig IS NOT DISTINCT FROM e.expected_config AND md5(p.prosrc)=e.body_md5
   AND pg_catalog.has_function_privilege('postgres',p.oid,'EXECUTE')
   AND COALESCE((SELECT array_agg(DISTINCT (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text
     ORDER BY (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text)
     FILTER (WHERE x.privilege_type='EXECUTE') FROM pg_catalog.aclexplode(p.proacl) x),ARRAY[]::text[])=ARRAY['postgres']::text[]
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) functions_exact
 FROM expected_functions e JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE pg_catalog.pg_get_function_identity_arguments(p.oid)=''
),
expected_triggers(table_schema,table_name,trigger_name,function_name,tgtype) AS (VALUES
 ('auth','users','on_auth_user_created','handle_new_user',5),('public','anexos','set_anexos_updated_at','set_updated_at',19),
 ('public','examenes','set_examenes_updated_at','set_updated_at',19),('public','grados','trg_grado_ownership','enforce_grado_ownership',23),
 ('public','grados','trg_grados_updated_at','set_updated_at',19),('public','listas_cotejo','set_listas_cotejo_updated_at','set_updated_at',19),
 ('public','materias','trg_materia_ownership','enforce_materia_ownership',23),('public','materias','trg_materias_updated_at','set_updated_at',19),
 ('public','planeaciones','trg_planeacion_tema_ownership','enforce_planeacion_tema_ownership',23),('public','planeaciones','trg_planeaciones_updated_at','set_updated_at',19),
 ('public','planteles','trg_planteles_updated_at','set_updated_at',19),('public','profiles','trg_profiles_updated_at','set_updated_at',19),
 ('public','temas','trg_tema_ownership','enforce_tema_ownership',23),('public','temas','trg_temas_updated_at','set_updated_at',19),
 ('public','unidades','trg_unidades_updated_at','set_updated_at',19),('public','user_settings','trg_user_settings_updated_at','set_updated_at',19)
),
actual_triggers AS (
 SELECT tn.nspname::text table_schema,c.relname::text table_name,t.tgname::text trigger_name,p.proname::text function_name,t.tgtype::integer tgtype,t.tgenabled
 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=c.relnamespace
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 WHERE NOT t.tgisinternal AND pn.nspname='public' AND p.proname IN (SELECT name FROM expected_functions)
),
trigger_gate AS (
 SELECT (SELECT count(*) FROM expected_triggers e JOIN actual_triggers a USING(table_schema,table_name,trigger_name,function_name,tgtype) WHERE a.tgenabled='O')=16
   AND (SELECT count(*) FROM actual_triggers)=16 triggers_exact
),
expected_03d3a(name,table_name,type,definition) AS (VALUES
 ('educativo_ia_planeacion_batches_id_user_key','planeacion_batches','u','UNIQUE (id, user_id)'),('educativo_ia_planeaciones_id_user_key','planeaciones','u','UNIQUE (id, user_id)'),
 ('educativo_ia_unidades_id_user_key','unidades','u','UNIQUE (id, user_id)'),('educativo_ia_examen_jobs_id_user_key','examen_generation_jobs','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_batch_owner_present','planeaciones','c','CHECK (batch_id IS NULL OR user_id IS NOT NULL)'),('educativo_ia_planeaciones_batch_owner_fkey','planeaciones','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_anexos_planeacion_owner_fkey','anexos','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),('educativo_ia_anexos_batch_owner_fkey','anexos','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_listas_planeacion_owner_fkey','listas_cotejo','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),('educativo_ia_listas_batch_owner_fkey','listas_cotejo','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examenes_unidad_owner_fkey','examenes','f','FOREIGN KEY (unidad_id, user_id) REFERENCES unidades(id, user_id) ON DELETE CASCADE'),('educativo_ia_examenes_batch_owner_fkey','examenes','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examen_items_job_owner_fkey','examen_generation_items','f','FOREIGN KEY (job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE CASCADE'),('educativo_ia_examenes_generation_job_owner_fkey','examenes','f','FOREIGN KEY (generation_job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE SET NULL (generation_job_id)')
),
actual_03d3a AS (
 SELECT c.conname::text name,t.relname::text table_name,c.contype::text type,c.convalidated,pg_catalog.pg_get_constraintdef(c.oid,true) definition
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
),
constraint_gate AS (
 SELECT (SELECT count(*) FROM expected_03d3a e JOIN actual_03d3a a USING(name,table_name,type,definition) WHERE a.convalidated)=14
   AND NOT EXISTS(SELECT 1 FROM actual_03d3a a WHERE a.name LIKE 'educativo_ia_%'
     AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades')
     AND a.name NOT IN (SELECT name FROM expected_03d3a)) constraints_exact
)
SELECT 1 / CASE WHEN functions_exact AND triggers_exact AND constraints_exact
  AND current_setting('server_version_num')::integer=150008 AND current_user='postgres' AND session_user='postgres'
  THEN 1 ELSE 0 END AS immediate_rollback_gate
FROM function_gate CROSS JOIN trigger_gate CROSS JOIN constraint_gate;

ALTER FUNCTION public.handle_new_user() RESET search_path;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_grado_ownership() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_materia_ownership() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_tema_ownership() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_planeacion_tema_ownership() TO PUBLIC, anon, authenticated, service_role;

COMMIT;
