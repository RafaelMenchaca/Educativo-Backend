-- 03D3C2A: preflight read-only ampliado. PG15.8/PG17.6; siete sentencias separadas.

-- 1/7. Version y autoridad de sesion.
SELECT current_setting('server_version_num')::integer AS server_version_num,
       current_user::text AS current_user_name, session_user::text AS session_user_name,
       CASE WHEN current_setting('server_version_num')::integer BETWEEN 150000 AND 159999 THEN 'pg15_supported'
            WHEN current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 THEN 'pg17_supported'
            ELSE 'unsupported_version' END AS version_status;

-- 2/7. Matriz portable: 19 tablas x 5 roles x 7 privilegios.
WITH expected_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('ai_model_prices'),('anexos'),
 ('examen_generation_items'),('examen_generation_jobs'),('examenes'),('grados'),
 ('ia_metrics_legacy'),('listas_cotejo'),('materias'),('planeacion_batches'),
 ('planeaciones'),('planteles'),('profiles'),('temas'),('unidades'),('user_profiles'),('user_settings')),
expected_roles(role_name) AS (VALUES ('PUBLIC'),('anon'),('authenticated'),('service_role'),('postgres')),
expected_privileges(privilege_name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
objects AS (
 SELECT c.relname::text AS table_name,c.relowner,r.rolname::text AS owner_name,c.relacl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.oid=c.relowner JOIN expected_tables e ON e.table_name=c.relname::text
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
acl AS (
 SELECT o.table_name,x.grantee,x.grantor,x.privilege_type::text AS privilege_name,x.is_grantable
 FROM objects o CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(o.relacl,pg_catalog.acldefault('r',o.relowner))) x),
direct_acl AS (
 SELECT a.table_name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS role_name,
        a.privilege_name,array_agg(DISTINCT grantor.rolname::text ORDER BY grantor.rolname::text) AS grantors,
        bool_or(a.is_grantable) AS grantable
 FROM acl a LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=a.grantee
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=a.grantor
 GROUP BY a.table_name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END,a.privilege_name)
SELECT 'public'::text AS schema_name,t.table_name,r.role_name,p.privilege_name,o.owner_name,
       (d.role_name IS NOT NULL) AS direct_grant,COALESCE(d.grantors,ARRAY[]::text[]) AS grantors,
       COALESCE(d.grantable,false) AS grantable,
       CASE WHEN r.role_name='PUBLIC' THEN d.role_name IS NOT NULL
            ELSE pg_catalog.has_table_privilege(r.role_name,format('%I.%I','public',t.table_name),p.privilege_name) END AS effective_privilege,
       CASE WHEN r.role_name='PUBLIC' THEN false
            ELSE pg_catalog.has_table_privilege(r.role_name,format('%I.%I','public',t.table_name),p.privilege_name)
                 AND d.role_name IS NULL END AS inherited_or_public_effect
FROM expected_tables t CROSS JOIN expected_roles r CROSS JOIN expected_privileges p
JOIN objects o ON o.table_name=t.table_name
LEFT JOIN direct_acl d ON d.table_name=t.table_name AND d.role_name=r.role_name AND d.privilege_name=p.privilege_name
ORDER BY t.table_name,r.role_name,p.privilege_name;

-- 3/7. MAINTAIN sin pasar el token MAINTAIN a has_table_privilege en PG15.
-- Siempre devuelve 19 x 5 filas; PG15 informa not_supported y booleanos NULL.
WITH expected_tables(table_name) AS (VALUES
 ('ai_generation_calls'),('ai_generation_jobs'),('ai_model_prices'),('anexos'),
 ('examen_generation_items'),('examen_generation_jobs'),('examenes'),('grados'),
 ('ia_metrics_legacy'),('listas_cotejo'),('materias'),('planeacion_batches'),
 ('planeaciones'),('planteles'),('profiles'),('temas'),('unidades'),('user_profiles'),('user_settings')),
expected_roles(role_name) AS (VALUES ('PUBLIC'),('anon'),('authenticated'),('service_role'),('postgres')),
objects AS (
 SELECT c.relname::text AS table_name,c.relowner,r.rolname::text AS owner_name,c.relacl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.oid=c.relowner JOIN expected_tables e ON e.table_name=c.relname::text
 WHERE n.nspname='public' AND c.relkind IN ('r','p')),
maintain_acl AS (
 SELECT o.table_name,x.grantee,x.grantor,x.is_grantable
 FROM objects o CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(o.relacl,pg_catalog.acldefault('r',o.relowner))) x
 WHERE x.privilege_type::text='MAINTAIN'),
role_oids AS (
 SELECT e.role_name,r.oid FROM expected_roles e LEFT JOIN pg_catalog.pg_roles r ON r.rolname::text=e.role_name),
evaluated AS (
 SELECT o.table_name,o.owner_name,r.role_name,r.oid,
   EXISTS(SELECT 1 FROM maintain_acl a WHERE a.table_name=o.table_name AND a.grantee=r.oid) AS direct_grant,
   EXISTS(SELECT 1 FROM maintain_acl a WHERE a.table_name=o.table_name AND a.grantee=0) AS public_grant,
   EXISTS(SELECT 1 FROM maintain_acl a WHERE a.table_name=o.table_name AND a.grantee<>0 AND a.grantee<>r.oid
     AND r.oid IS NOT NULL AND pg_catalog.pg_has_role(r.oid,a.grantee,'USAGE')) AS inherited,
   ARRAY(SELECT DISTINCT grantor.rolname::text FROM maintain_acl a
     JOIN pg_catalog.pg_roles grantor ON grantor.oid=a.grantor
     WHERE a.table_name=o.table_name AND a.grantee=r.oid ORDER BY grantor.rolname::text) AS grantors
 FROM objects o CROSS JOIN role_oids r)
SELECT 'public'::text AS schema_name,e.table_name,e.role_name,'MAINTAIN'::text AS privilege_name,e.owner_name,
 CASE WHEN current_setting('server_version_num')::integer>=170000 THEN 'supported' ELSE 'not_supported' END AS maintain_status,
 CASE WHEN current_setting('server_version_num')::integer>=170000 THEN e.direct_grant ELSE NULL END AS direct_grant,
 CASE WHEN current_setting('server_version_num')::integer>=170000 THEN e.grantors ELSE ARRAY[]::text[] END AS grantors,
 CASE WHEN current_setting('server_version_num')::integer>=170000
      THEN (e.role_name=e.owner_name OR e.direct_grant OR e.public_grant OR e.inherited) ELSE NULL END AS effective_privilege,
 CASE WHEN current_setting('server_version_num')::integer>=170000 THEN e.inherited ELSE NULL END AS inherited_effect
FROM evaluated e ORDER BY e.table_name,e.role_name;

-- 4/7. Policies publicas.
SELECT schemaname::text AS schema_name,tablename::text AS table_name,policyname::text AS policy_name,
 permissive::text AS permissive,cmd::text AS command,
 ARRAY(SELECT role_name::text FROM unnest(roles) role_name ORDER BY role_name::text) AS roles,
 qual::text AS using_expression,with_check::text AS with_check_expression
FROM pg_catalog.pg_policies WHERE schemaname='public'
ORDER BY tablename::text,policyname::text;

-- 5/7. Todas las secuencias publicas y sus ACL.
WITH expected_roles(role_name) AS (VALUES ('PUBLIC'),('anon'),('authenticated'),('service_role'),('postgres')),
expected_privileges(privilege_name) AS (VALUES ('USAGE'),('SELECT'),('UPDATE')),
sequences AS (
 SELECT s.relname::text AS sequence_name,s.relowner,s.relacl,owner.rolname::text AS owner_name,
        t.relname::text AS owned_table,a.attname::text AS owned_column,a.attidentity::text AS identity_kind
 FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace n ON n.oid=s.relnamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=s.relowner
 LEFT JOIN pg_catalog.pg_depend d ON d.objid=s.oid AND d.classid='pg_catalog.pg_class'::regclass
  AND d.refclassid='pg_catalog.pg_class'::regclass AND d.deptype IN ('a','i')
 LEFT JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
 LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
 WHERE n.nspname='public' AND s.relkind='S'),
acl AS (
 SELECT s.sequence_name,x.grantee,x.grantor,x.privilege_type::text AS privilege_name,x.is_grantable
 FROM sequences s CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(s.relacl,pg_catalog.acldefault('S',s.relowner))) x),
direct_acl AS (
 SELECT a.sequence_name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS role_name,
  a.privilege_name,array_agg(DISTINCT grantor.rolname::text ORDER BY grantor.rolname::text) AS grantors,bool_or(a.is_grantable) AS grantable
 FROM acl a LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=a.grantee JOIN pg_catalog.pg_roles grantor ON grantor.oid=a.grantor
 GROUP BY a.sequence_name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END,a.privilege_name)
SELECT 'public'::text AS schema_name,s.sequence_name,s.owned_table,s.owned_column,s.identity_kind,s.owner_name,
 r.role_name,p.privilege_name,(d.role_name IS NOT NULL) AS direct_grant,COALESCE(d.grantors,ARRAY[]::text[]) AS grantors,
 COALESCE(d.grantable,false) AS grantable,
 CASE WHEN r.role_name='PUBLIC' THEN d.role_name IS NOT NULL
      ELSE pg_catalog.has_sequence_privilege(r.role_name,format('%I.%I','public',s.sequence_name),p.privilege_name) END AS effective_privilege
FROM sequences s CROSS JOIN expected_roles r CROSS JOIN expected_privileges p
LEFT JOIN direct_acl d ON d.sequence_name=s.sequence_name AND d.role_name=r.role_name AND d.privilege_name=p.privilege_name
ORDER BY s.sequence_name,r.role_name,p.privilege_name;

-- 6/7. Default privileges y autoridad demostrable sobre cada grantor.
WITH target_grantors(role_name) AS (VALUES ('postgres'),('supabase_admin')),
authority AS (
 SELECT t.role_name AS target_role,r.oid,r.rolsuper,r.rolcreaterole,
        (current_user::text=t.role_name OR pg_catalog.pg_has_role(current_user,t.role_name,'MEMBER')) AS can_alter_defaults
 FROM target_grantors t LEFT JOIN pg_catalog.pg_roles r ON r.rolname::text=t.role_name),
defaults AS (
 SELECT grantor.rolname::text AS grantor,COALESCE(n.nspname::text,'<all-schemas>') AS schema_name,
  d.defaclobjtype::text AS object_type,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END AS grantee,
  x.privilege_type::text AS privilege,x.is_grantable
 FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole
 LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
 WHERE d.defaclnamespace=0 OR n.nspname='public')
SELECT d.grantor,d.schema_name,d.object_type,d.grantee,d.privilege,d.is_grantable,
 (a.oid IS NOT NULL) AS expected_grantor_exists,COALESCE(a.can_alter_defaults,false) AS current_user_can_alter_defaults,
 a.rolsuper AS grantor_is_superuser,a.rolcreaterole AS grantor_has_createrole,
 count(*) OVER () AS total_default_privilege_rows,
 count(*) OVER (PARTITION BY d.grantor) AS grantor_default_privilege_rows,
 count(*) FILTER (WHERE a.oid IS NULL) OVER () AS unexpected_grantor_rows
FROM defaults d LEFT JOIN authority a ON a.target_role=d.grantor
ORDER BY d.grantor,d.schema_name,d.object_type,d.grantee,d.privilege;

-- 7/7. Membership directa/indirecta de anon/authenticated, incluido pg_maintain.
WITH RECURSIVE targets(target_name,target_oid) AS (
 SELECT r.rolname::text,r.oid FROM pg_catalog.pg_roles r WHERE r.rolname::text IN ('anon','authenticated')),
memberships(target_name,member_oid,granted_oid,depth,path) AS (
 SELECT t.target_name,t.target_oid,m.roleid,1,ARRAY[t.target_oid,m.roleid]::oid[]
 FROM targets t JOIN pg_catalog.pg_auth_members m ON m.member=t.target_oid
 UNION ALL
 SELECT p.target_name,p.granted_oid,m.roleid,p.depth+1,p.path||m.roleid
 FROM memberships p JOIN pg_catalog.pg_auth_members m ON m.member=p.granted_oid WHERE NOT m.roleid=ANY(p.path))
SELECT t.target_name,COALESCE(granted.rolname::text,'<no-membership>') AS granted_role,
 COALESCE(m.depth,0) AS membership_depth,(COALESCE(m.depth,0)=1) AS direct_membership,
 (granted.rolname::text='pg_maintain') AS grants_maintenance
FROM targets t LEFT JOIN memberships m ON m.target_name=t.target_name
LEFT JOIN pg_catalog.pg_roles granted ON granted.oid=m.granted_oid
ORDER BY t.target_name,membership_depth,granted_role;
