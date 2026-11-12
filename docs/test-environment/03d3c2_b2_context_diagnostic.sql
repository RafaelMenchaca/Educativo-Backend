-- READ-ONLY diagnostic for the B2 context gate. Metadata only; no application rows or raw ACLs.
WITH expected_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('ai_model_prices'),('anexos'),
 ('examen_generation_items'),('examen_generation_jobs'),('examenes'),('grados'),
 ('ia_metrics_legacy'),('listas_cotejo'),('materias'),('planeacion_batches'),
 ('planeaciones'),('planteles'),('profiles'),('temas'),('unidades'),
 ('user_profiles'),('user_settings')),
public_tables AS (
 SELECT c.relname::text AS table_name,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
table_acl AS (
 SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
        grantor.rolname::text AS grantor,x.privilege_type::text AS privilege,x.is_grantable
 FROM public_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(t.relacl) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor),
policies AS (
 SELECT count(*)::integer AS observed_count,
  md5(string_agg(tablename::text||'|'||policyname::text||'|'||cmd::text||'|'||
   array_to_string(ARRAY(SELECT role_name::text FROM pg_catalog.unnest(roles) role_name ORDER BY role_name::text),','),E'\n'
   ORDER BY tablename::text,policyname::text)) AS observed_md5
 FROM pg_catalog.pg_policies WHERE schemaname='public'),
defaults AS (
 SELECT grantor.rolname::text AS grantor,d.defaclobjtype::text AS object_type,x.privilege_type::text AS privilege,x.is_grantable
 FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
 LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclnamespace=0 OR n.nspname='public'),
checks(check_name,expected_value,observed_value,matches_expected) AS (
 SELECT 'public_table_count','19',count(*)::text,count(*)=19 FROM public_tables UNION ALL
 SELECT 'public_table_manifest_md5','513cd988dbd233d84ba71cacf33faa39',
  md5(string_agg(table_name,E'\n' ORDER BY table_name)),
  md5(string_agg(table_name,E'\n' ORDER BY table_name))='513cd988dbd233d84ba71cacf33faa39' FROM public_tables UNION ALL
 SELECT 'public_table_missing','0',count(*)::text,count(*)=0 FROM expected_tables e LEFT JOIN public_tables t USING(table_name) WHERE t.table_name IS NULL UNION ALL
 SELECT 'public_table_additional','0',count(*)::text,count(*)=0 FROM public_tables t LEFT JOIN expected_tables e USING(table_name) WHERE e.table_name IS NULL UNION ALL
 SELECT 'policy_count','49',observed_count::text,observed_count=49 FROM policies UNION ALL
 SELECT 'policy_manifest_md5','221d334d3db5913257ac610efba163a9',observed_md5,observed_md5='221d334d3db5913257ac610efba163a9' FROM policies UNION ALL
 SELECT 'rls_enabled_table_count','19',count(*) FILTER(WHERE relrowsecurity)::text,count(*) FILTER(WHERE relrowsecurity)=19 FROM public_tables UNION ALL
 SELECT 'rls_forced_table_count','0',count(*) FILTER(WHERE relforcerowsecurity)::text,count(*) FILTER(WHERE relforcerowsecurity)=0 FROM public_tables UNION ALL
 SELECT 'default_acl_scoped_count',CASE WHEN current_setting('server_version_num')::integer>=170000 THEN '96' ELSE '88' END,
  count(*)::text,count(*)=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 96 ELSE 88 END FROM defaults UNION ALL
 SELECT 'default_acl_postgres_count',CASE WHEN current_setting('server_version_num')::integer>=170000 THEN '48' ELSE '44' END,
  count(*) FILTER(WHERE grantor='postgres')::text,count(*) FILTER(WHERE grantor='postgres')=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 48 ELSE 44 END FROM defaults UNION ALL
 SELECT 'default_acl_supabase_admin_count',CASE WHEN current_setting('server_version_num')::integer>=170000 THEN '48' ELSE '44' END,
  count(*) FILTER(WHERE grantor='supabase_admin')::text,count(*) FILTER(WHERE grantor='supabase_admin')=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 48 ELSE 44 END FROM defaults UNION ALL
 SELECT 'default_acl_function_count','8',count(*) FILTER(WHERE object_type='f')::text,count(*) FILTER(WHERE object_type='f')=8 FROM defaults UNION ALL
 SELECT 'default_acl_table_count',CASE WHEN current_setting('server_version_num')::integer>=170000 THEN '64' ELSE '56' END,
  count(*) FILTER(WHERE object_type='r')::text,count(*) FILTER(WHERE object_type='r')=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 64 ELSE 56 END FROM defaults UNION ALL
 SELECT 'default_acl_sequence_count','24',count(*) FILTER(WHERE object_type='S')::text,count(*) FILTER(WHERE object_type='S')=24 FROM defaults UNION ALL
 SELECT 'default_acl_unexpected_grantor_count','0',count(*) FILTER(WHERE grantor NOT IN ('postgres','supabase_admin'))::text,count(*) FILTER(WHERE grantor NOT IN ('postgres','supabase_admin'))=0 FROM defaults UNION ALL
 SELECT 'default_acl_grantable_count','0',count(*) FILTER(WHERE is_grantable)::text,count(*) FILTER(WHERE is_grantable)=0 FROM defaults UNION ALL
 SELECT 'table_acl_public_count','0',count(*) FILTER(WHERE grantee='PUBLIC')::text,count(*) FILTER(WHERE grantee='PUBLIC')=0 FROM table_acl UNION ALL
 SELECT 'table_acl_anon_count','0',count(*) FILTER(WHERE grantee='anon')::text,count(*) FILTER(WHERE grantee='anon')=0 FROM table_acl UNION ALL
 SELECT 'table_acl_authenticated_count','69',count(*) FILTER(WHERE grantee='authenticated')::text,count(*) FILTER(WHERE grantee='authenticated')=69 FROM table_acl UNION ALL
 SELECT 'table_acl_service_role_count','133',count(*) FILTER(WHERE grantee='service_role')::text,count(*) FILTER(WHERE grantee='service_role')=133 FROM table_acl UNION ALL
 SELECT 'table_acl_postgres_count','133',count(*) FILTER(WHERE grantee='postgres')::text,count(*) FILTER(WHERE grantee='postgres')=133 FROM table_acl UNION ALL
 SELECT 'table_acl_unexpected_grantor_count','0',count(*) FILTER(WHERE grantor<>'postgres')::text,count(*) FILTER(WHERE grantor<>'postgres')=0 FROM table_acl UNION ALL
 SELECT 'table_acl_grantable_count','0',count(*) FILTER(WHERE is_grantable)::text,count(*) FILTER(WHERE is_grantable)=0 FROM table_acl UNION ALL
 SELECT 'runtime_membership_count','0',count(*)::text,count(*)=0 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname::text IN ('anon','authenticated','service_role')
)
SELECT check_name,expected_value,observed_value,matches_expected
FROM checks ORDER BY check_name;
