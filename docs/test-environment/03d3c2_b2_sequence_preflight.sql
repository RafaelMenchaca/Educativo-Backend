-- Read-only, one-shot preflight for 03D3C2-B2. Does not read sequence values.
WITH expected(role_name, privilege_type, expected) AS (
  VALUES
    ('PUBLIC','USAGE',false),('PUBLIC','SELECT',false),('PUBLIC','UPDATE',false),
    ('anon','USAGE',false),('anon','SELECT',false),('anon','UPDATE',false),
    ('authenticated','USAGE',true),('authenticated','SELECT',true),('authenticated','UPDATE',true),
    ('service_role','USAGE',true),('service_role','SELECT',true),('service_role','UPDATE',true),
    ('postgres','USAGE',true),('postgres','SELECT',true),('postgres','UPDATE',true)
), actual AS (
  SELECT e.*, CASE WHEN e.role_name='PUBLIC' THEN EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE c.oid='public.planeaciones_id_seq'::regclass AND x.grantee=0 AND x.privilege_type=e.privilege_type
  ) ELSE pg_catalog.has_sequence_privilege(e.role_name,'public.planeaciones_id_seq',e.privilege_type) END AS effective
  FROM expected e
), seq AS (
  SELECT count(*)::integer AS object_count,
         bool_and(s.seqtypid='pg_catalog.int8'::regtype AND s.seqincrement=1 AND s.seqmin=1
           AND s.seqmax=9223372036854775807 AND s.seqcache=1 AND NOT s.seqcycle) AS parameters_match
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_sequence s ON s.seqrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='S' AND c.relname='planeaciones_id_seq'
), dep AS (
  SELECT count(*)::integer AS dependency_count,
         bool_and(t.relname='planeaciones' AND a.attname='id' AND d.deptype='i') AS dependency_match
  FROM pg_catalog.pg_class q JOIN pg_catalog.pg_namespace n ON n.oid=q.relnamespace
  JOIN pg_catalog.pg_depend d ON d.objid=q.oid
  JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
  JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
  WHERE n.nspname='public' AND q.relname='planeaciones_id_seq'
), col AS (
  SELECT count(*)::integer AS column_count,
         bool_and(a.attidentity='d' AND a.atttypid='pg_catalog.int8'::regtype) AS identity_match
  FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='planeaciones' AND a.attname='id' AND NOT a.attisdropped
), direct_acl AS (
  SELECT count(*) FILTER (WHERE x.grantee=0 OR r.rolname::text IN ('anon','authenticated','service_role','postgres'))::integer AS expected_acl_rows,
         count(*) FILTER (WHERE x.grantee<>0 AND r.rolname::text NOT IN ('anon','authenticated','service_role','postgres'))::integer AS unexpected_grantees,
         count(*) FILTER (WHERE x.is_grantable)::integer AS grantable_rows,
         count(*) FILTER (WHERE grantor.rolname::text<>'postgres')::integer AS unexpected_grantors,
         bool_and(owner.rolname::text='postgres') AS owner_match
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
  LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee
  LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor
  LEFT JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner
  WHERE n.nspname='public' AND c.relname='planeaciones_id_seq'
), memberships AS (
  SELECT count(*)::integer AS unexpected_memberships FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles member ON member.oid=m.member
  WHERE member.rolname::text IN ('anon','authenticated','service_role')
), expected_tables(table_name) AS (VALUES
  ('ai_generation_calls'),('ai_generation_jobs'),('ai_model_prices'),('anexos'),
  ('examen_generation_items'),('examen_generation_jobs'),('examenes'),('grados'),
  ('ia_metrics_legacy'),('listas_cotejo'),('materias'),('planeacion_batches'),
  ('planeaciones'),('planteles'),('profiles'),('temas'),('unidades'),
  ('user_profiles'),('user_settings')
), public_tables AS (
  SELECT c.relname::text AS table_name,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), table_acl AS (
  SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
         grantor.rolname::text AS grantor,x.privilege_type::text AS privilege,x.is_grantable
  FROM public_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(t.relacl) x
  LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
  JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor
), policy_state AS (
  SELECT count(*)::integer AS policy_count,
         md5(string_agg(tablename::text||'|'||policyname::text||'|'||cmd::text||'|'||
           array_to_string(ARRAY(SELECT role_name::text FROM pg_catalog.unnest(roles) role_name ORDER BY role_name::text),','),E'\n'
           ORDER BY tablename::text,policyname::text)) AS manifest_md5
  FROM pg_catalog.pg_policies WHERE schemaname='public'
), defaults AS (
  SELECT grantor.rolname::text AS grantor,d.defaclobjtype::text AS object_type,
         CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
         x.privilege_type::text AS privilege,x.is_grantable
  FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole
  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
  LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
  LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
  WHERE d.defaclnamespace=0 OR n.nspname='public'
), context AS (
  SELECT
    (SELECT count(*)=19 AND count(*) FILTER(WHERE e.table_name IS NULL)=0
       FROM public_tables t LEFT JOIN expected_tables e USING(table_name))
      AND NOT EXISTS(SELECT 1 FROM expected_tables e LEFT JOIN public_tables t USING(table_name) WHERE t.table_name IS NULL) AS tables_exact,
    (SELECT count(*)=19 AND bool_and(relrowsecurity) AND NOT bool_or(relforcerowsecurity) FROM public_tables) AS rls_exact,
    (SELECT policy_count=49 AND manifest_md5='221d334d3db5913257ac610efba163a9' FROM policy_state) AS policies_exact,
    (SELECT count(*)=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 96 ELSE 88 END
       AND count(*) FILTER(WHERE grantor='postgres')=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 48 ELSE 44 END
       AND count(*) FILTER(WHERE grantor='supabase_admin')=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 48 ELSE 44 END
       AND count(*) FILTER(WHERE object_type='f' AND privilege='EXECUTE')=8
       AND count(*) FILTER(WHERE object_type='r')=CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 64 ELSE 56 END
       AND count(*) FILTER(WHERE object_type='S')=24
       AND NOT bool_or(is_grantable) FROM defaults) AS defaults_exact,
    NOT EXISTS(SELECT 1 FROM table_acl WHERE grantee IN ('PUBLIC','anon'))
      AND (SELECT count(*) FROM table_acl WHERE grantee='authenticated')=69
      AND (SELECT count(*) FROM table_acl WHERE grantee='service_role')=133
      AND (SELECT count(*) FROM table_acl WHERE grantee='postgres')=133
      AND NOT EXISTS(SELECT 1 FROM table_acl WHERE grantor<>'postgres' OR is_grantable) AS post_b0_grants_exact
)
SELECT current_setting('server_version_num')::integer BETWEEN 150000 AND 179999 AS version_ok,
       (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S')=1 AS one_public_sequence,
       seq.object_count=1 AND seq.parameters_match AS sequence_parameters_ok,
       dep.dependency_count=1 AND dep.dependency_match AS dependency_ok,
       col.column_count=1 AND col.identity_match AS identity_ok,
       NOT EXISTS(SELECT 1 FROM actual WHERE effective IS DISTINCT FROM expected) AS acl_ok,
       direct_acl.expected_acl_rows=9 AND direct_acl.unexpected_grantees=0 AND direct_acl.grantable_rows=0
         AND direct_acl.unexpected_grantors=0 AND direct_acl.owner_match AS direct_acl_ok,
       memberships.unexpected_memberships=0 AS memberships_ok,
       context.tables_exact,context.policies_exact,context.rls_exact,context.defaults_exact,
       context.post_b0_grants_exact,
       context.tables_exact AND context.policies_exact AND context.rls_exact
         AND context.defaults_exact AND context.post_b0_grants_exact AS context_ok,
       current_user='postgres' AND session_user='postgres' AS authority_ok,
       (current_setting('server_version_num')::integer BETWEEN 150000 AND 179999)
       AND seq.object_count=1 AND seq.parameters_match AND dep.dependency_count=1 AND dep.dependency_match
       AND col.column_count=1 AND col.identity_match
       AND NOT EXISTS(SELECT 1 FROM actual WHERE effective IS DISTINCT FROM expected)
       AND direct_acl.expected_acl_rows=9 AND direct_acl.unexpected_grantees=0 AND direct_acl.grantable_rows=0
       AND direct_acl.unexpected_grantors=0 AND direct_acl.owner_match
       AND memberships.unexpected_memberships=0
       AND context.tables_exact AND context.policies_exact AND context.rls_exact
       AND context.defaults_exact AND context.post_b0_grants_exact
       AND current_user='postgres' AND session_user='postgres' AS apt_to_apply
FROM seq,dep,col,direct_acl,memberships,context;
