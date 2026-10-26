-- 03D3C2-B0-current preflight. Read-only, PostgreSQL test 17.x only.
WITH RECURSIVE target_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('anexos'),('examen_generation_items'),
 ('examen_generation_jobs'),('examenes'),('grados'),('listas_cotejo'),('materias'),
 ('planeacion_batches'),('planeaciones'),('planteles'),('profiles'),('temas'),
 ('unidades'),('user_profiles'),('user_settings')),
portable(privilege_name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
public_tables AS (
 SELECT c.oid,c.relname::text AS table_name,c.relowner,c.relacl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
table_acl AS (
 SELECT t.table_name,x.grantee,x.grantor,x.privilege_type::text AS privilege_name,x.is_grantable
 FROM public_tables t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) x),
role_ids AS (
 SELECT r.rolname::text AS role_name,r.oid FROM pg_catalog.pg_roles r
 WHERE r.rolname::text IN ('anon','authenticated','service_role','postgres')),
membership_paths(member_oid,granted_oid,path) AS (
 SELECT r.oid,m.roleid,ARRAY[r.oid,m.roleid]::oid[] FROM role_ids r
 JOIN pg_catalog.pg_auth_members m ON m.member=r.oid WHERE r.role_name IN ('anon','authenticated')
 UNION ALL
 SELECT p.member_oid,m.roleid,p.path||m.roleid FROM membership_paths p
 JOIN pg_catalog.pg_auth_members m ON m.member=p.granted_oid WHERE NOT m.roleid=ANY(p.path)),
memberships AS (SELECT count(*)::integer AS row_count FROM membership_paths),
policy_state AS (
 SELECT count(*)::integer AS total,
  count(*) FILTER (WHERE roles=ARRAY['public'::name])::integer AS public_count,
  count(*) FILTER (WHERE tablename='ai_model_prices' AND cmd='SELECT' AND roles=ARRAY['authenticated'::name])::integer AS price_count,
  md5(string_agg(tablename::text||'|'||policyname::text||'|'||cmd::text||'|'||
    array_to_string(ARRAY(SELECT role_name::text FROM unnest(roles) role_name ORDER BY role_name::text),','),E'\n'
    ORDER BY tablename::text,policyname::text)) AS manifest_md5
 FROM pg_catalog.pg_policies WHERE schemaname='public'),
sequence_state AS (
 SELECT count(*)::integer AS total,
  count(*) FILTER (WHERE c.relname='planeaciones_id_seq')::integer AS expected
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='S'),
sequence_acl AS (
 SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,x.privilege_type::text AS privilege,
  grantor.rolname::text AS grantor,x.is_grantable
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('S',c.relowner))) x
 LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=x.grantor
 WHERE n.nspname='public' AND c.relname='planeaciones_id_seq'),
defaults AS (
 SELECT grantor.rolname::text AS grantor,d.defaclobjtype::text AS object_type,
  CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
  x.privilege_type::text AS privilege,x.is_grantable
 FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
 LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclnamespace=0 OR n.nspname='public'),
checks AS (
 SELECT
  current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS version_ok,
  current_user::text='postgres' AND session_user::text='postgres' AS authority_ok,
  (SELECT count(*) FROM public_tables)=19
   AND EXISTS(SELECT 1 FROM public_tables WHERE table_name='ai_model_prices')
   AND EXISTS(SELECT 1 FROM public_tables WHERE table_name='ia_metrics_legacy') AS tables_ok,
  (SELECT count(*) FROM target_tables)=17
   AND NOT EXISTS(SELECT 1 FROM target_tables t WHERE NOT EXISTS(SELECT 1 FROM public_tables p WHERE p.table_name=t.table_name))
   AND NOT EXISTS(SELECT 1 FROM target_tables WHERE table_name IN ('ai_model_prices','ia_metrics_legacy')) AS targets_ok,
  (SELECT count(*) FROM table_acl a JOIN role_ids r ON r.oid=a.grantee JOIN target_tables t ON t.table_name=a.table_name
    JOIN portable p ON p.privilege_name=a.privilege_name WHERE r.role_name='anon' AND a.is_grantable=false
    AND a.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres'))=119
   AND NOT EXISTS(SELECT 1 FROM table_acl a JOIN role_ids r ON r.oid=a.grantee
     WHERE r.role_name='anon' AND a.table_name IN ('ai_model_prices','ia_metrics_legacy')) AS anon_grants_ok,
  (SELECT count(*) FROM table_acl a JOIN role_ids r ON r.oid=a.grantee JOIN target_tables t ON t.table_name=a.table_name
    JOIN portable p ON p.privilege_name=a.privilege_name WHERE r.role_name='authenticated' AND a.is_grantable=false
    AND a.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres'))=119
   AND (SELECT count(*) FROM table_acl a JOIN role_ids r ON r.oid=a.grantee
     WHERE r.role_name='authenticated' AND a.table_name='ai_model_prices' AND a.privilege_name='SELECT')=1
   AND NOT EXISTS(SELECT 1 FROM table_acl a JOIN role_ids r ON r.oid=a.grantee
     WHERE r.role_name='authenticated' AND a.table_name='ia_metrics_legacy') AS authenticated_grants_ok,
  (SELECT count(*) FROM table_acl a JOIN role_ids r ON r.oid=a.grantee JOIN portable p ON p.privilege_name=a.privilege_name
    WHERE r.role_name='service_role' AND a.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres') AND a.is_grantable=false)=133
   AND (SELECT count(*) FROM table_acl a JOIN role_ids r ON r.oid=a.grantee JOIN portable p ON p.privilege_name=a.privilege_name
    WHERE r.role_name='postgres' AND a.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres') AND a.is_grantable=false)=133 AS technical_roles_ok,
  NOT EXISTS(SELECT 1 FROM table_acl WHERE grantee=0) AND (SELECT row_count FROM memberships)=0 AS no_public_or_inherited_ok,
  NOT EXISTS(SELECT 1 FROM table_acl a LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
    WHERE a.privilege_name='MAINTAIN' AND (a.grantee=0 OR r.rolname::text IN ('anon','authenticated','service_role')))
   AND NOT EXISTS(SELECT 1 FROM role_ids r WHERE r.role_name IN ('anon','authenticated','service_role')
    AND pg_catalog.pg_has_role(r.oid,'pg_maintain','USAGE')) AS maintain_absent_ok,
  (SELECT total=49 AND public_count=48 AND price_count=1
    AND manifest_md5='221d334d3db5913257ac610efba163a9' FROM policy_state) AS policies_ok,
  (SELECT total=1 AND expected=1 FROM sequence_state)
   AND (SELECT count(*) FROM sequence_acl WHERE role_name='anon' AND privilege IN ('USAGE','SELECT','UPDATE') AND grantor='postgres' AND is_grantable=false)=3
   AND (SELECT count(*) FROM sequence_acl WHERE role_name IN ('authenticated','service_role','postgres') AND privilege IN ('USAGE','SELECT','UPDATE') AND grantor='postgres' AND is_grantable=false)=9
   AND NOT EXISTS(SELECT 1 FROM sequence_acl WHERE role_name='PUBLIC') AS sequence_ok,
  (SELECT count(*) FROM defaults)=96
   AND (SELECT count(*) FROM defaults WHERE grantor='postgres')=48
   AND (SELECT count(*) FROM defaults WHERE grantor='supabase_admin')=48
   AND (SELECT count(*) FROM defaults WHERE object_type='f' AND privilege='EXECUTE' AND grantee IN ('anon','authenticated','service_role','postgres'))=8
   AND (SELECT count(*) FROM defaults WHERE object_type='r' AND privilege IN ('DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE') AND grantee IN ('anon','authenticated','service_role','postgres'))=64
   AND (SELECT count(*) FROM defaults WHERE object_type='S' AND privilege IN ('SELECT','UPDATE','USAGE') AND grantee IN ('anon','authenticated','service_role','postgres'))=24
   AND NOT EXISTS(SELECT 1 FROM defaults WHERE is_grantable)
   AND NOT EXISTS(SELECT 1 FROM defaults WHERE grantor NOT IN ('postgres','supabase_admin')) AS defaults_context_ok
)
SELECT *, (version_ok AND authority_ok AND tables_ok AND targets_ok AND anon_grants_ok
 AND authenticated_grants_ok AND technical_roles_ok AND no_public_or_inherited_ok AND maintain_absent_ok
 AND policies_ok AND sequence_ok AND defaults_context_ok) AS apt_to_apply
FROM checks;
