-- Educativo IA 03D3C2-B1. READ-ONLY authenticated DML audit; no migration.

-- B1_STATEMENT_01: exact public-table and authenticated DML matrix after B0-current.
WITH expected_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('ai_model_prices'),('anexos'),
 ('examen_generation_items'),('examen_generation_jobs'),('examenes'),('grados'),
 ('ia_metrics_legacy'),('listas_cotejo'),('materias'),('planeacion_batches'),
 ('planeaciones'),('planteles'),('profiles'),('temas'),('unidades'),
 ('user_profiles'),('user_settings')),
operations(privilege_name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')),
actual_tables AS (
 SELECT c.oid,c.relname::text AS table_name,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
direct_acl AS (
 SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
        grantor.rolname::text AS grantor,x.privilege_type::text AS privilege_name,x.is_grantable
 FROM actual_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor)
SELECT e.table_name,o.privilege_name,
       EXISTS(SELECT 1 FROM direct_acl a WHERE a.table_name=e.table_name AND a.grantee='authenticated' AND a.privilege_name=o.privilege_name) AS direct_grant,
       COALESCE((SELECT bool_and(a.grantor='postgres') FROM direct_acl a WHERE a.table_name=e.table_name AND a.grantee='authenticated' AND a.privilege_name=o.privilege_name),true) AS grantor_matches,
       COALESCE((SELECT bool_or(a.is_grantable) FROM direct_acl a WHERE a.table_name=e.table_name AND a.grantee='authenticated' AND a.privilege_name=o.privilege_name),false) AS is_grantable,
       pg_catalog.has_table_privilege('authenticated',pg_catalog.format('%I.%I','public',e.table_name),o.privilege_name) AS effective_grant,
       (pg_catalog.has_table_privilege('authenticated',pg_catalog.format('%I.%I','public',e.table_name),o.privilege_name)
        AND NOT EXISTS(SELECT 1 FROM direct_acl a WHERE a.table_name=e.table_name AND a.grantee='authenticated' AND a.privilege_name=o.privilege_name)) AS inherited_or_public_effect,
       t.relrowsecurity AS rls_enabled,t.relforcerowsecurity AS rls_forced
FROM expected_tables e CROSS JOIN operations o LEFT JOIN actual_tables t ON t.table_name=e.table_name
ORDER BY e.table_name,o.privilege_name;

-- B1_STATEMENT_02: exact policy metadata; catalog name arrays become text[] element by element.
SELECT p.tablename::text AS table_name,p.policyname::text AS policy_name,p.cmd::text AS command,
       ARRAY(SELECT role_name::text FROM pg_catalog.unnest(p.roles) role_name ORDER BY role_name::text) AS roles,
       p.permissive::text AS permissive,p.qual IS NOT NULL AS has_using,p.with_check IS NOT NULL AS has_with_check
FROM pg_catalog.pg_policies p WHERE p.schemaname='public'
ORDER BY p.tablename::text,p.policyname::text;

-- B1_STATEMENT_03: relevant direct/transitive memberships only; no application data.
WITH RECURSIVE membership(member_oid,role_oid,depth) AS (
 SELECT m.member,m.roleid,1 FROM pg_catalog.pg_auth_members m
 UNION ALL
 SELECT m.member,parent.roleid,child.depth+1 FROM membership child
 JOIN pg_catalog.pg_auth_members m ON m.member=child.role_oid
 JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
 WHERE child.depth<16)
SELECT member_role.rolname::text AS member_role,granted_role.rolname::text AS granted_role,
       min(m.depth)::integer AS minimum_depth
FROM membership m JOIN pg_catalog.pg_roles member_role ON member_role.oid=m.member_oid
JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=m.role_oid
WHERE member_role.rolname IN ('anon','authenticated')
GROUP BY member_role.rolname::text,granted_role.rolname::text
ORDER BY member_role.rolname::text,granted_role.rolname::text;

-- B1_STATEMENT_04: fail-closed structural summary. B1 is audit-only, so apt_to_apply is always false.
WITH expected_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('ai_model_prices'),('anexos'),
 ('examen_generation_items'),('examen_generation_jobs'),('examenes'),('grados'),
 ('ia_metrics_legacy'),('listas_cotejo'),('materias'),('planeacion_batches'),
 ('planeaciones'),('planteles'),('profiles'),('temas'),('unidades'),
 ('user_profiles'),('user_settings')),
actual_tables AS (
 SELECT c.oid,c.relname::text AS table_name,c.relowner,c.relacl FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
operations(privilege_name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')),
expected_grants AS (
 SELECT e.table_name,o.privilege_name,
  CASE WHEN e.table_name='ia_metrics_legacy' THEN false
       WHEN e.table_name='ai_model_prices' THEN o.privilege_name='SELECT'
       ELSE true END AS expected_grant
 FROM expected_tables e CROSS JOIN operations o),
direct_acl AS (
 SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
        grantor.rolname::text AS grantor,x.privilege_type::text AS privilege_name,x.is_grantable
 FROM actual_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor),
grant_checks AS (
 SELECT e.*,
  EXISTS(SELECT 1 FROM direct_acl a WHERE a.table_name=e.table_name AND a.grantee='authenticated' AND a.privilege_name=e.privilege_name) AS direct_grant,
  pg_catalog.has_table_privilege('authenticated',pg_catalog.format('%I.%I','public',e.table_name),e.privilege_name) AS effective_grant,
  EXISTS(SELECT 1 FROM direct_acl a WHERE a.table_name=e.table_name AND a.grantee='authenticated' AND a.privilege_name=e.privilege_name AND (a.grantor<>'postgres' OR a.is_grantable)) AS bad_acl
 FROM expected_grants e),
policy_manifest AS (
 SELECT count(*)::integer AS policy_count,
 md5(pg_catalog.string_agg(p.tablename::text||'|'||p.policyname::text||'|'||p.cmd::text||'|'||
  pg_catalog.array_to_string(ARRAY(SELECT role_name::text FROM pg_catalog.unnest(p.roles) role_name ORDER BY role_name::text),','),E'\n'
  ORDER BY p.tablename::text,p.policyname::text)) AS manifest_md5
 FROM pg_catalog.pg_policies p WHERE p.schemaname='public'),
membership AS (
 WITH RECURSIVE paths(member_oid,role_oid,depth) AS (
  SELECT m.member,m.roleid,1 FROM pg_catalog.pg_auth_members m
  UNION ALL SELECT m.member,parent.roleid,child.depth+1 FROM paths child
  JOIN pg_catalog.pg_auth_members m ON m.member=child.role_oid
  JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE child.depth<16)
 SELECT count(*)::integer AS total FROM paths p JOIN pg_catalog.pg_roles r ON r.oid=p.member_oid
 WHERE r.rolname IN ('anon','authenticated'))
SELECT current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS version_ok,
       (SELECT count(*)=19 FROM actual_tables)
        AND NOT EXISTS(SELECT 1 FROM expected_tables e FULL JOIN actual_tables a USING(table_name) WHERE e.table_name IS NULL OR a.table_name IS NULL) AS tables_exact,
       (SELECT policy_count=49 AND manifest_md5='221d334d3db5913257ac610efba163a9' FROM policy_manifest) AS policies_exact,
       (SELECT count(*)=76 AND bool_and(direct_grant=expected_grant AND effective_grant=expected_grant AND NOT bad_acl) FROM grant_checks) AS authenticated_grants_exact,
       (SELECT total=0 FROM membership) AS membership_paths_absent,
       19*4=76 AS matrix_cardinality_ok,
       0::integer AS b1_c1_ready_count,
       29::integer AS unresolved_operation_count,
       false AS apt_to_apply;
