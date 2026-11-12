-- Educativo IA 03D3C1: postverify productivo READ-ONLY, una fila JSON.
WITH
expected_functions(name,body_md5,security_definer,expected_config) AS (VALUES
 ('enforce_grado_ownership','f97d9b07b705d78bd7dbaf5c960c543c',false,NULL::text[]),
 ('enforce_materia_ownership','b50a030da78990d83a0d3549a12092b0',false,NULL::text[]),
 ('enforce_planeacion_tema_ownership','0905147358485175b60fa446011e1e88',false,NULL::text[]),
 ('enforce_tema_ownership','65fd6a9c4bc24803bf097347782c5cef',false,NULL::text[]),
 ('handle_new_user','db4596f1ea835acc5d79e921e94c803a',true,ARRAY['search_path=pg_catalog, public']::text[]),
 ('set_updated_at','204b9b9355e61b7541bc0633bbc9294c',false,NULL::text[])
),
function_status AS (
 SELECT e.name,pg_catalog.pg_get_userbyid(p.proowner)::text owner_name,
   pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
   pg_catalog.pg_get_function_result(p.oid) result_type,l.lanname::text language_name,
   p.provolatile::text volatility,p.proparallel::text parallel_safety,p.prosecdef security_definer,
   e.expected_config,p.proconfig,md5(p.prosrc) observed_body_md5,e.body_md5 expected_body_md5,
   COALESCE((SELECT array_agg(DISTINCT (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text
     ORDER BY (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text)
     FILTER (WHERE x.privilege_type='EXECUTE') FROM pg_catalog.aclexplode(p.proacl) x),ARRAY[]::text[]) execute_grantees,
   p.oid IS NOT NULL AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND pg_catalog.pg_get_function_identity_arguments(p.oid)='' AND pg_catalog.pg_get_function_result(p.oid)='trigger'
   AND l.lanname='plpgsql' AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
   AND p.prosecdef=e.security_definer AND p.proconfig IS NOT DISTINCT FROM e.expected_config
   AND md5(p.prosrc)=e.body_md5
   AND pg_catalog.has_function_privilege('postgres',p.oid,'EXECUTE')
   AND COALESCE((SELECT array_agg(DISTINCT (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text
     ORDER BY (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text)
     FILTER (WHERE x.privilege_type='EXECUTE') FROM pg_catalog.aclexplode(p.proacl) x),ARRAY[]::text[])=ARRAY['postgres']::text[]
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS matches_expected
 FROM expected_functions e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name
   AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
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
summary AS (
 SELECT (SELECT count(*) FROM function_status) function_count,(SELECT count(*) FROM function_status WHERE matches_expected) matched_function_count,
   (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (SELECT name FROM expected_functions)) function_object_count,
   (SELECT count(*) FROM expected_triggers e JOIN actual_triggers a USING(table_schema,table_name,trigger_name,function_name,tgtype) WHERE a.tgenabled='O') matched_trigger_count,
   (SELECT count(*) FROM actual_triggers) trigger_object_count,
   (SELECT count(*) FROM expected_03d3a e JOIN actual_03d3a a USING(name,table_name,type,definition) WHERE a.convalidated) matched_03d3a_constraint_count,
   (SELECT count(*) FROM actual_03d3a a WHERE a.name LIKE 'educativo_ia_%' AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades') AND a.name NOT IN (SELECT name FROM expected_03d3a)) unexpected_03d3a_constraint_count
)
SELECT jsonb_build_object('expected_project_name','educativo-backend','expected_project_ref','bfnkaqmhcsyxdxoqnahk',
 'project_ref_verified_by_sql',false,'visual_project_ref_confirmation_required',true,'current_user',current_user,'session_user',session_user,
 'server_version_num',current_setting('server_version_num')::integer,'function_count',function_count,'matched_function_count',matched_function_count,
 'missing_or_changed_function_count',6-matched_function_count,'unexpected_function_count',GREATEST(function_object_count-6,0),
 'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM function_status f),
 'expected_trigger_count',16,'matched_trigger_count',matched_trigger_count,
 'missing_or_changed_trigger_count',16-matched_trigger_count,'unexpected_trigger_count',GREATEST(trigger_object_count-16,0),
 'expected_03d3a_constraint_count',14,'matched_03d3a_constraint_count',matched_03d3a_constraint_count,
 'missing_or_changed_03d3a_constraint_count',14-matched_03d3a_constraint_count,
 'unexpected_03d3a_constraint_count',unexpected_03d3a_constraint_count,
 'postverify_ok',current_setting('server_version_num')::integer=150008 AND current_user='postgres' AND session_user='postgres'
   AND function_count=6 AND matched_function_count=6 AND function_object_count=6
   AND matched_trigger_count=16 AND trigger_object_count=16
   AND matched_03d3a_constraint_count=14 AND unexpected_03d3a_constraint_count=0) AS production_postverify_result
FROM summary;
