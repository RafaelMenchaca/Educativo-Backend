-- Educativo IA 03D3C2-B2: diagnostico productivo READ-ONLY de la puerta 22012.
-- Descompone exactamente la puerta previa; no autoriza ni ejecuta un reintento.
WITH RECURSIVE
expected_tables(table_name,is_b0_target) AS (VALUES
 ('ai_generation_calls',true),('ai_generation_jobs',true),('ai_model_prices',false),('anexos',true),
 ('examen_generation_items',true),('examen_generation_jobs',true),('examenes',true),('grados',true),
 ('ia_metrics_legacy',false),('listas_cotejo',true),('materias',true),('planeacion_batches',true),
 ('planeaciones',true),('planteles',true),('profiles',true),('temas',true),('unidades',true),
 ('user_profiles',true),('user_settings',true)
),
expected_roles(role_name) AS (VALUES ('anon'),('authenticated'),('service_role'),('postgres')),
portable_privileges(privilege_name) AS (VALUES
 ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
),
expected_table_acl(table_name,role_name,privilege_name) AS (
 SELECT t.table_name,r.role_name,p.privilege_name
 FROM expected_tables t CROSS JOIN expected_roles r CROSS JOIN portable_privileges p
 WHERE (t.is_b0_target AND (r.role_name IN ('service_role','postgres')
      OR (r.role_name='authenticated' AND p.privilege_name IN ('SELECT','INSERT','UPDATE','DELETE'))))
    OR (t.table_name='ai_model_prices' AND (r.role_name IN ('service_role','postgres') OR (r.role_name='authenticated' AND p.privilege_name='SELECT')))
    OR (t.table_name='ia_metrics_legacy' AND r.role_name IN ('service_role','postgres'))
),
public_tables AS (
 SELECT c.oid,c.relowner,c.relname::text table_name,owner.rolname::text owner_name,c.relacl,
   c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
),
actual_table_acl AS (
 SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END role_name,
   x.privilege_type::text privilege_name,grantor.rolname::text grantor,x.is_grantable
 FROM public_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor
),
table_acl_matrix AS (
 SELECT t.table_name,r.role_name,
   ARRAY(SELECT p.privilege_name FROM portable_privileges p
     WHERE EXISTS(SELECT 1 FROM actual_table_acl a WHERE a.table_name=t.table_name AND a.role_name=r.role_name AND a.privilege_name=p.privilege_name)
     ORDER BY p.privilege_name)::text[] direct_privileges,
   ARRAY(SELECT p.privilege_name FROM portable_privileges p
     WHERE pg_catalog.has_table_privilege(r.role_name,format('%I.%I','public',t.table_name),p.privilege_name)
     ORDER BY p.privilege_name)::text[] effective_privileges
 FROM expected_tables t CROSS JOIN expected_roles r
),
role_ids AS (
 SELECT e.role_name,r.oid FROM expected_roles e LEFT JOIN pg_catalog.pg_roles r ON r.rolname=e.role_name
),
membership_paths(member_name,member_oid,granted_oid,path) AS (
 SELECT r.role_name,r.oid,m.roleid,ARRAY[r.oid,m.roleid]::oid[] FROM role_ids r
 JOIN pg_catalog.pg_auth_members m ON m.member=r.oid WHERE r.role_name IN ('anon','authenticated','service_role')
 UNION ALL
 SELECT p.member_name,p.member_oid,m.roleid,p.path||m.roleid FROM membership_paths p
 JOIN pg_catalog.pg_auth_members m ON m.member=p.granted_oid WHERE NOT m.roleid=ANY(p.path)
),
policy_state AS (
 SELECT count(*)::integer policy_count,
   count(*) FILTER(WHERE roles=ARRAY['public'::name])::integer public_policy_count,
   count(*) FILTER(WHERE tablename='ai_model_prices' AND cmd='SELECT' AND roles=ARRAY['authenticated'::name])::integer authenticated_price_policy_count,
   md5(string_agg(tablename::text||'|'||policyname::text||'|'||cmd::text||'|'||
     array_to_string(ARRAY(SELECT role_name::text FROM pg_catalog.unnest(roles) role_name ORDER BY role_name::text),','),E'\n'
     ORDER BY tablename::text,policyname::text)) policy_manifest_md5,
   md5(string_agg(tablename::text||'|'||policyname::text||'|'||cmd::text||'|'||
     array_to_string(ARRAY(SELECT role_name::text FROM pg_catalog.unnest(roles) role_name ORDER BY role_name::text),',')||'|'||
     COALESCE(qual::text,'<null>')||'|'||COALESCE(with_check::text,'<null>'),E'\n'
     ORDER BY tablename::text,policyname::text)) policy_definition_md5,
   jsonb_agg(jsonb_build_object('table_name',tablename::text,'policy_name',policyname::text,
     'command',cmd::text,'roles',ARRAY(SELECT role_name::text FROM pg_catalog.unnest(roles) role_name ORDER BY role_name::text),
     'using_expression',qual::text,'with_check_expression',with_check::text)
     ORDER BY tablename::text,policyname::text) policies
 FROM pg_catalog.pg_policies WHERE schemaname='public'
),
sequence_objects AS (
 SELECT s.oid,s.relowner,s.relname::text sequence_name,owner.rolname::text owner_name,s.relacl,
   t.relname::text owned_table,a.attname::text owned_column,a.attidentity::text identity_kind,
   a.atttypid, d.deptype::text dependency_type,
   q.seqtypid,q.seqstart,q.seqincrement,q.seqmax,q.seqmin,q.seqcache,q.seqcycle
 FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace n ON n.oid=s.relnamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=s.relowner
 JOIN pg_catalog.pg_sequence q ON q.seqrelid=s.oid
 LEFT JOIN pg_catalog.pg_depend d ON d.objid=s.oid AND d.classid='pg_catalog.pg_class'::regclass
   AND d.refclassid='pg_catalog.pg_class'::regclass AND d.deptype IN ('a','i')
 LEFT JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
 LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
 WHERE n.nspname='public' AND s.relkind='S'
),
sequence_acl AS (
 SELECT s.sequence_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END role_name,
   x.privilege_type::text privilege_name,grantor.rolname::text grantor,x.is_grantable
 FROM sequence_objects s CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(s.relacl,pg_catalog.acldefault('S',s.relowner))) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor
),
sequence_matrix AS (
 SELECT r.role_name,
   ARRAY(SELECT a.privilege_name FROM sequence_acl a WHERE a.role_name=r.role_name ORDER BY a.privilege_name)::text[] direct_privileges,
   ARRAY(SELECT p FROM pg_catalog.unnest(ARRAY['USAGE','SELECT','UPDATE']::text[]) p
     WHERE pg_catalog.has_sequence_privilege(r.role_name,'public.planeaciones_id_seq',p) ORDER BY p)::text[] effective_privileges
 FROM expected_roles r
),
defaults AS (
 SELECT grantor.rolname::text grantor,COALESCE(n.nspname::text,'<all-schemas>') schema_name,
   d.defaclobjtype::text object_type,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END grantee,
   x.privilege_type::text privilege_name,x.is_grantable
 FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclnamespace=0 OR n.nspname='public'
),
expected_default_privileges(grantor,grantee,object_type,privilege_name) AS (
 SELECT g.grantor,r.role_name,p.object_type,p.privilege_name
 FROM (VALUES ('postgres'),('supabase_admin')) g(grantor)
 CROSS JOIN expected_roles r
 CROSS JOIN (VALUES ('f','EXECUTE'),('r','DELETE'),('r','INSERT'),('r','REFERENCES'),('r','SELECT'),
   ('r','TRIGGER'),('r','TRUNCATE'),('r','UPDATE'),('S','SELECT'),('S','UPDATE'),('S','USAGE')) p(object_type,privilege_name)
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
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
),
expected_functions(name,body_md5,security_definer,expected_config) AS (VALUES
 ('enforce_grado_ownership','f97d9b07b705d78bd7dbaf5c960c543c',false,NULL::text[]),
 ('enforce_materia_ownership','b50a030da78990d83a0d3549a12092b0',false,NULL::text[]),
 ('enforce_planeacion_tema_ownership','0905147358485175b60fa446011e1e88',false,NULL::text[]),
 ('enforce_tema_ownership','65fd6a9c4bc24803bf097347782c5cef',false,NULL::text[]),
 ('handle_new_user','db4596f1ea835acc5d79e921e94c803a',true,ARRAY['search_path=pg_catalog, public']::text[]),
 ('set_updated_at','204b9b9355e61b7541bc0633bbc9294c',false,NULL::text[])
),
function_status AS (
 SELECT e.name,p.oid IS NOT NULL AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND pg_catalog.pg_get_function_identity_arguments(p.oid)='' AND pg_catalog.pg_get_function_result(p.oid)='trigger'
   AND l.lanname='plpgsql' AND p.prokind='f' AND p.prosecdef=e.security_definer
   AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig IS NOT DISTINCT FROM e.expected_config
   AND md5(p.prosrc)=e.body_md5
   AND COALESCE((SELECT array_agg(DISTINCT (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text
     ORDER BY (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END)::text)
     FILTER(WHERE x.privilege_type='EXECUTE') FROM pg_catalog.aclexplode(p.proacl) x),ARRAY[]::text[])=ARRAY['postgres']::text[] matches_expected
 FROM expected_functions e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
),
expected_triggers(schema_name,table_name,trigger_name,function_name,tgtype) AS (VALUES
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
 SELECT tn.nspname::text schema_name,c.relname::text table_name,t.tgname::text trigger_name,p.proname::text function_name,t.tgtype::integer tgtype,t.tgenabled
 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=c.relnamespace
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 WHERE NOT t.tgisinternal AND pn.nspname='public' AND p.proname IN (SELECT name FROM expected_functions)
),
summary AS (
 SELECT
  (SELECT count(*) FROM public_tables) public_table_count,
  (SELECT count(*) FROM expected_tables WHERE is_b0_target) b0_target_table_count,
  (SELECT count(*) FROM expected_tables e JOIN public_tables t USING(table_name) WHERE t.owner_name='postgres' AND t.relrowsecurity AND NOT t.relforcerowsecurity) matched_table_context_count,
  (SELECT count(*) FROM expected_table_acl) expected_table_grant_count,
  (SELECT count(*) FROM expected_table_acl e JOIN actual_table_acl a USING(table_name,role_name,privilege_name) WHERE a.grantor='postgres' AND NOT a.is_grantable) matched_table_grant_count,
  (SELECT count(*) FROM actual_table_acl a WHERE a.privilege_name IN (SELECT privilege_name FROM portable_privileges)
    AND NOT EXISTS(SELECT 1 FROM expected_table_acl e WHERE e.table_name=a.table_name AND e.role_name=a.role_name AND e.privilege_name=a.privilege_name)) unexpected_table_grant_count,
  (SELECT count(*) FROM actual_table_acl WHERE role_name='PUBLIC') public_table_grant_count,
  (SELECT count(*) FROM table_acl_matrix WHERE role_name<>'postgres' AND direct_privileges<>effective_privileges) inherited_or_public_effect_count,
  (SELECT count(*) FROM membership_paths) runtime_membership_count,
  (SELECT count(*) FROM sequence_objects) sequence_count,
  (SELECT count(*) FROM sequence_objects WHERE sequence_name='planeaciones_id_seq' AND owner_name='postgres'
    AND owned_table='planeaciones' AND owned_column='id' AND identity_kind='d' AND dependency_type='i'
    AND atttypid='pg_catalog.int8'::regtype AND seqtypid='pg_catalog.int8'::regtype
    AND seqstart=1 AND seqincrement=1 AND seqmin=1 AND seqmax=9223372036854775807
    AND seqcache=1 AND NOT seqcycle) matched_sequence_object_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name IN ('authenticated','service_role','postgres') AND privilege_name IN ('USAGE','SELECT','UPDATE') AND grantor='postgres' AND NOT is_grantable) matched_sequence_grant_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name IN ('PUBLIC','anon') OR role_name NOT IN ('PUBLIC','anon','authenticated','service_role','postgres') OR privilege_name NOT IN ('USAGE','SELECT','UPDATE') OR grantor<>'postgres' OR is_grantable) unexpected_sequence_grant_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name='PUBLIC') public_sequence_grant_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name='anon') anon_sequence_grant_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name='authenticated') authenticated_sequence_grant_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name='service_role') service_role_sequence_grant_count,
  (SELECT count(*) FROM sequence_acl WHERE role_name='postgres') postgres_sequence_grant_count,
  (SELECT count(*) FROM defaults) default_privilege_count,
  (SELECT count(*) FROM expected_default_privileges e JOIN defaults d USING(grantor,grantee,object_type,privilege_name) WHERE NOT d.is_grantable) matched_default_privilege_count,
  (SELECT count(*) FROM defaults WHERE grantor='postgres') postgres_default_privilege_count,
  (SELECT count(*) FROM defaults WHERE grantor='supabase_admin') supabase_admin_default_privilege_count,
  (SELECT count(*) FROM defaults WHERE object_type='f') function_default_privilege_count,
  (SELECT count(*) FROM defaults WHERE object_type='r') table_default_privilege_count,
  (SELECT count(*) FROM defaults WHERE object_type='S') sequence_default_privilege_count,
  (SELECT count(*) FROM defaults WHERE grantor NOT IN ('postgres','supabase_admin') OR grantee NOT IN ('anon','authenticated','service_role','postgres') OR is_grantable
    OR (object_type='f' AND privilege_name<>'EXECUTE')
    OR (object_type='r' AND privilege_name NOT IN ('DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'))
    OR (object_type='S' AND privilege_name NOT IN ('SELECT','UPDATE','USAGE'))
    OR object_type NOT IN ('f','r','S')) unexpected_default_privilege_count,
  (SELECT policy_count FROM policy_state) policy_count,(SELECT public_policy_count FROM policy_state) public_policy_count,
  (SELECT authenticated_price_policy_count FROM policy_state) authenticated_price_policy_count,
  (SELECT policy_manifest_md5 FROM policy_state) policy_manifest_md5,
  (SELECT policy_definition_md5 FROM policy_state) policy_definition_md5,
  (SELECT count(*) FROM expected_03d3a e JOIN actual_03d3a a USING(name,table_name,type,definition) WHERE a.convalidated) matched_03d3a_constraint_count,
  (SELECT count(*) FROM expected_03d3a e LEFT JOIN actual_03d3a a USING(name) WHERE a.name IS NULL OR a.table_name<>e.table_name OR a.type<>e.type OR a.definition<>e.definition OR NOT a.convalidated) changed_03d3a_constraint_count,
  (SELECT count(*) FROM actual_03d3a a WHERE a.name LIKE 'educativo_ia_%' AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades') AND a.name NOT IN (SELECT name FROM expected_03d3a)) unexpected_03d3a_constraint_count,
  (SELECT count(*) FROM function_status WHERE matches_expected) matched_function_count,
  (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (SELECT name FROM expected_functions)) relevant_function_count,
  (SELECT count(*) FROM expected_triggers e JOIN actual_triggers a USING(schema_name,table_name,trigger_name,function_name,tgtype) WHERE a.tgenabled='O') matched_trigger_count,
  (SELECT count(*) FROM actual_triggers) relevant_trigger_count
),
decision AS (
 SELECT *,current_setting('server_version_num')::integer=150008 server_context_matches,
  current_user='postgres' AND session_user='postgres' authority_context_matches,
  public_table_count=19 AND b0_target_table_count=17 AND matched_table_context_count=19
   AND expected_table_grant_count=335 AND matched_table_grant_count=335 AND unexpected_table_grant_count=0 AND public_table_grant_count=0
   AND inherited_or_public_effect_count=0 AND runtime_membership_count=0
   AND sequence_count=1 AND matched_sequence_object_count=1 AND matched_sequence_grant_count=9 AND unexpected_sequence_grant_count=0 AND public_sequence_grant_count=0
   AND anon_sequence_grant_count=0 AND authenticated_sequence_grant_count=3
   AND service_role_sequence_grant_count=3 AND postgres_sequence_grant_count=3
   AND NOT EXISTS(SELECT 1 FROM sequence_matrix WHERE
     (role_name='anon' AND (direct_privileges<>ARRAY[]::text[] OR effective_privileges<>ARRAY[]::text[]))
     OR (role_name IN ('authenticated','service_role','postgres') AND
       (direct_privileges<>ARRAY['SELECT','UPDATE','USAGE']::text[] OR effective_privileges<>ARRAY['SELECT','UPDATE','USAGE']::text[])))
   AND default_privilege_count=88 AND matched_default_privilege_count=88 AND postgres_default_privilege_count=44 AND supabase_admin_default_privilege_count=44
   AND function_default_privilege_count=8 AND table_default_privilege_count=56 AND sequence_default_privilege_count=24
   AND unexpected_default_privilege_count=0
   AND policy_count=49 AND public_policy_count=48 AND authenticated_price_policy_count=1
   AND policy_manifest_md5='221d334d3db5913257ac610efba163a9'
   AND policy_definition_md5='73f1ad73fde2c16f4b7f5846db1103df'
   AND matched_03d3a_constraint_count=14 AND changed_03d3a_constraint_count=0 AND unexpected_03d3a_constraint_count=0
   AND matched_function_count=6 AND relevant_function_count=6 AND matched_trigger_count=16 AND relevant_trigger_count=16 AS catalog_context_matches
 FROM summary
)
SELECT jsonb_build_object(
 'expected_project_name','educativo-backend','expected_project_ref','bfnkaqmhcsyxdxoqnahk','expected_region','us-east-2',
 'project_ref_verified_by_sql',false,'visual_project_ref_confirmation_required',true,
 'current_user',current_user,'session_user',session_user,'server_version_num',current_setting('server_version_num')::integer,
 'expected_table_grant_count',expected_table_grant_count,'matched_table_grant_count',matched_table_grant_count,
 'unexpected_table_grant_count',unexpected_table_grant_count,'public_table_grant_count',public_table_grant_count,
 'anon_table_grant_count',(SELECT count(*) FROM actual_table_acl WHERE role_name='anon'),
 'authenticated_table_grant_count',(SELECT count(*) FROM actual_table_acl WHERE role_name='authenticated'),
 'service_role_table_grant_count',(SELECT count(*) FROM actual_table_acl WHERE role_name='service_role'),
 'postgres_table_grant_count',(SELECT count(*) FROM actual_table_acl WHERE role_name='postgres'),
 'inherited_or_public_effect_count',inherited_or_public_effect_count,'runtime_membership_count',runtime_membership_count,
 'table_grants',(SELECT jsonb_agg(to_jsonb(m) ORDER BY table_name,role_name) FROM table_acl_matrix m)
) || jsonb_build_object(
 'policy_count',policy_count,'public_policy_count',public_policy_count,'authenticated_price_policy_count',authenticated_price_policy_count,
 'policy_manifest_md5',policy_manifest_md5,'policy_definition_md5',policy_definition_md5,
 'sequence_count',sequence_count,'matched_sequence_object_count',matched_sequence_object_count,
 'expected_sequence',jsonb_build_object('schema','public','name','planeaciones_id_seq','owner','postgres',
   'owned_table','planeaciones','owned_column','id','dependency_type','i','identity_kind','d',
   'data_type','bigint','start',1,'increment',1,'min',1,'max',9223372036854775807,'cache',1,'cycle',false),
 'matched_sequence_grant_count',matched_sequence_grant_count,'unexpected_sequence_grant_count',unexpected_sequence_grant_count,
 'public_sequence_grant_count',public_sequence_grant_count,'anon_sequence_grant_count',anon_sequence_grant_count,
 'authenticated_sequence_grant_count',authenticated_sequence_grant_count,
 'service_role_sequence_grant_count',service_role_sequence_grant_count,
 'postgres_sequence_grant_count',postgres_sequence_grant_count,
 'sequence_grants',(SELECT jsonb_agg(to_jsonb(m) ORDER BY role_name) FROM sequence_matrix m),
 'target_sequence_grants',jsonb_build_object('anon',ARRAY[]::text[],
   'authenticated',ARRAY['USAGE']::text[],'service_role',ARRAY['USAGE']::text[],
   'postgres',ARRAY['SELECT','UPDATE','USAGE']::text[],'total_direct_grant_count',5),
 'default_privilege_count',default_privilege_count,'matched_default_privilege_count',matched_default_privilege_count,
 'unexpected_default_privilege_count',unexpected_default_privilege_count
) || jsonb_build_object(
 'expected_03d3a_constraint_count',14,'matched_03d3a_constraint_count',matched_03d3a_constraint_count,
 'changed_03d3a_constraint_count',changed_03d3a_constraint_count,'unexpected_03d3a_constraint_count',unexpected_03d3a_constraint_count,
 'expected_c1_function_count',6,'matched_c1_function_count',matched_function_count,'relevant_c1_function_count',relevant_function_count,
 'expected_c1_trigger_count',16,'matched_c1_trigger_count',matched_trigger_count,'relevant_c1_trigger_count',relevant_trigger_count,
 'catalog_context_matches',catalog_context_matches,
 'apt_to_apply',catalog_context_matches AND server_context_matches AND authority_context_matches
) || jsonb_build_object(
 'checks',jsonb_build_array(
   jsonb_build_object('name','server_version','expected',150008,'observed',current_setting('server_version_num')::integer,'matches',server_context_matches),
   jsonb_build_object('name','authority','expected','postgres/postgres','observed',current_user||'/'||session_user,'matches',authority_context_matches),
   jsonb_build_object('name','public_table_count','expected',19,'observed',public_table_count,'matches',public_table_count=19),
   jsonb_build_object('name','b0_target_table_count','expected',17,'observed',b0_target_table_count,'matches',b0_target_table_count=17),
   jsonb_build_object('name','matched_table_context_count','expected',19,'observed',matched_table_context_count,'matches',matched_table_context_count=19),
   jsonb_build_object('name','table_grants','expected','335/335/0/0','observed',expected_table_grant_count||'/'||matched_table_grant_count||'/'||unexpected_table_grant_count||'/'||public_table_grant_count,'matches',expected_table_grant_count=335 AND matched_table_grant_count=335 AND unexpected_table_grant_count=0 AND public_table_grant_count=0),
   jsonb_build_object('name','table_inheritance','expected','0/0','observed',inherited_or_public_effect_count||'/'||runtime_membership_count,'matches',inherited_or_public_effect_count=0 AND runtime_membership_count=0),
   jsonb_build_object('name','sequence_object','expected','1/1','observed',sequence_count||'/'||matched_sequence_object_count,'matches',sequence_count=1 AND matched_sequence_object_count=1),
   jsonb_build_object('name','sequence_grant_total','expected',9,'observed',matched_sequence_grant_count,'matches',matched_sequence_grant_count=9 AND unexpected_sequence_grant_count=0),
   jsonb_build_object('name','sequence_grants_by_role','expected','0/3/3/3','observed',anon_sequence_grant_count||'/'||authenticated_sequence_grant_count||'/'||service_role_sequence_grant_count||'/'||postgres_sequence_grant_count,'matches',anon_sequence_grant_count=0 AND authenticated_sequence_grant_count=3 AND service_role_sequence_grant_count=3 AND postgres_sequence_grant_count=3),
   jsonb_build_object('name','sequence_public','expected',0,'observed',public_sequence_grant_count,'matches',public_sequence_grant_count=0),
   jsonb_build_object('name','sequence_direct_effective_matrix','expected','anon=[]; authenticated/service_role/postgres=[SELECT,UPDATE,USAGE]','observed',(SELECT jsonb_agg(to_jsonb(m) ORDER BY role_name) FROM sequence_matrix m),'matches',NOT EXISTS(SELECT 1 FROM sequence_matrix WHERE (role_name='anon' AND (direct_privileges<>ARRAY[]::text[] OR effective_privileges<>ARRAY[]::text[])) OR (role_name IN ('authenticated','service_role','postgres') AND (direct_privileges<>ARRAY['SELECT','UPDATE','USAGE']::text[] OR effective_privileges<>ARRAY['SELECT','UPDATE','USAGE']::text[])))),
   jsonb_build_object('name','defaults','expected','88/88/0','observed',default_privilege_count||'/'||matched_default_privilege_count||'/'||unexpected_default_privilege_count,'matches',default_privilege_count=88 AND matched_default_privilege_count=88 AND postgres_default_privilege_count=44 AND supabase_admin_default_privilege_count=44 AND function_default_privilege_count=8 AND table_default_privilege_count=56 AND sequence_default_privilege_count=24 AND unexpected_default_privilege_count=0),
   jsonb_build_object('name','policies','expected','49/48/1','observed',policy_count||'/'||public_policy_count||'/'||authenticated_price_policy_count,'matches',policy_count=49 AND public_policy_count=48 AND authenticated_price_policy_count=1),
   jsonb_build_object('name','policy_manifest_md5','expected','221d334d3db5913257ac610efba163a9','observed',policy_manifest_md5,'matches',policy_manifest_md5='221d334d3db5913257ac610efba163a9'),
   jsonb_build_object('name','policy_definition_md5','expected','73f1ad73fde2c16f4b7f5846db1103df','observed',policy_definition_md5,'matches',policy_definition_md5='73f1ad73fde2c16f4b7f5846db1103df'),
   jsonb_build_object('name','03d3a_constraints','expected','14/0/0','observed',matched_03d3a_constraint_count||'/'||changed_03d3a_constraint_count||'/'||unexpected_03d3a_constraint_count,'matches',matched_03d3a_constraint_count=14 AND changed_03d3a_constraint_count=0 AND unexpected_03d3a_constraint_count=0),
   jsonb_build_object('name','c1_functions','expected','6/6','observed',matched_function_count||'/'||relevant_function_count,'matches',matched_function_count=6 AND relevant_function_count=6),
   jsonb_build_object('name','c1_triggers','expected','16/16','observed',matched_trigger_count||'/'||relevant_trigger_count,'matches',matched_trigger_count=16 AND relevant_trigger_count=16)
 ),
 'overall_matches',catalog_context_matches AND server_context_matches AND authority_context_matches
) AS production_gate_diagnostic_result
FROM decision;

