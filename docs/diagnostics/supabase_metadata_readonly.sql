-- SESION 02B: INVENTARIO DE METADATOS, SOLO LECTURA. NO ES UNA MIGRACION.
-- No ejecutado por el agente. Ejecutar UN bloque completo por vez en SQL Editor.
-- PostgreSQL 12+ como base de compatibilidad estatica; comprobar version en 00.
-- Solo catalogos pg_catalog y funciones integradas de introspeccion.
-- Nunca invoca funciones de aplicacion ni lee filas de public/auth/storage.
-- Revisar resultados antes de compartir: defaults, policies, triggers, ACL,
-- tipos y cuerpos de funciones pueden contener literales sensibles.
-- Las definiciones devueltas son TEXTO: no ejecutarlas como reconstruccion.

-- BLOQUE 00: version, sin informacion de conexion ni secretos.
SELECT pg_catalog.current_setting('server_version') AS server_version,
       pg_catalog.current_setting('server_version_num') AS server_version_num;

-- BLOQUE 01: relaciones y columnas de public (incluye vistas, sin leerlas).
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       c.relkind AS relation_kind, pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       a.attnum AS ordinal_position, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       tn.nspname AS type_schema, t.typname AS type_name,
       a.attnotnull AS not_null, t.typnotnull AS domain_not_null,
       a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
       pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS default_or_generated_expression,
       cn.nspname AS collation_schema, co.collname AS collation_name
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_type AS t ON t.oid = a.atttypid
LEFT JOIN pg_catalog.pg_namespace AS tn ON tn.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
LEFT JOIN pg_catalog.pg_collation AS co ON co.oid = a.attcollation
LEFT JOIN pg_catalog.pg_namespace AS cn ON cn.oid = co.collnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname, a.attnum;

-- BLOQUE 02: constraints de relaciones public, incluidas FK salientes.
-- confdeltype/confupdtype: a=no action, r=restrict, c=cascade, n=set null, d=set default.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       con.conname AS constraint_name, con.contype AS constraint_type,
       con.convalidated AS validated, con.condeferrable AS deferrable,
       con.condeferred AS initially_deferred,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definition,
       rn.nspname AS referenced_schema, rc.relname AS referenced_relation,
       con.confupdtype AS fk_update_action, con.confdeltype AS fk_delete_action
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class AS rc ON rc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, con.conname;

-- BLOQUE 03: indices de public; expresiones/predicados solo se decompilan.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       ic.relname AS index_name, am.amname AS access_method,
       i.indisunique AS is_unique, i.indisprimary AS is_primary,
       i.indisvalid AS is_valid, i.indisready AS is_ready,
       pg_catalog.pg_get_indexdef(i.indexrelid) AS definition,
       pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicate
FROM pg_catalog.pg_index AS i
JOIN pg_catalog.pg_class AS c ON c.oid = i.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class AS ic ON ic.oid = i.indexrelid
JOIN pg_catalog.pg_am AS am ON am.oid = ic.relam
WHERE n.nspname = 'public'
ORDER BY c.relname, ic.relname;

-- BLOQUE 04: RLS y policies de public/storage, incluso tablas sin policies.
-- relrowsecurity=false no equivale a tabla privada; comprobar ACL y contexto.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       p.polname AS policy_name, p.polcmd AS command,
       p.polpermissive AS permissive,
       ARRAY(SELECT CASE WHEN r.role_oid = 0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(r.role_oid) END
             FROM pg_catalog.unnest(p.polroles) AS r(role_oid)) AS roles,
       pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS using_expression,
       pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_policy AS p ON p.polrelid = c.oid
WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p')
ORDER BY n.nspname, c.relname, p.polname;

-- BLOQUE 05: triggers no internos de public y de auth.users (no filas Auth).
-- Auth puede incluir triggers administrados: inventariar no significa copiarlos.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       tr.tgname AS trigger_name, tr.tgenabled AS enabled_mode,
       pg_catalog.pg_get_triggerdef(tr.oid, true) AS definition,
       fn.nspname AS function_schema, p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       ex.extname AS function_extension
FROM pg_catalog.pg_trigger AS tr
JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc AS p ON p.oid = tr.tgfoid
JOIN pg_catalog.pg_namespace AS fn ON fn.oid = p.pronamespace
LEFT JOIN pg_catalog.pg_depend AS em
  ON em.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
 AND em.objid = p.oid AND em.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
 AND em.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS ex ON ex.oid = em.refobjid
WHERE NOT tr.tgisinternal
  AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY n.nspname, c.relname, tr.tgname;

-- BLOQUE 06: ACL de relaciones/secuencias, columnas y schemas public/storage.
-- acldefault refleja ACL implicita cuando el catalogo guarda NULL.
-- No usa pg_sequences.last_value ni lee secuencias. No modifica grants.
WITH objects AS (
  SELECT n.nspname AS schema_name, c.relname AS object_name,
         NULL::pg_catalog.text AS column_name, c.relkind::pg_catalog.text AS object_kind,
         c.relowner AS owner_oid, c.relacl IS NULL AS acl_was_null,
         COALESCE(c.relacl, pg_catalog.acldefault(
           CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END::pg_catalog."char", c.relowner)) AS acl
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  UNION ALL
  SELECT n.nspname, c.relname, a.attname, 'column', c.relowner, false, a.attacl
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'storage') AND a.attnum > 0
    AND NOT a.attisdropped AND a.attacl IS NOT NULL
  UNION ALL
  SELECT n.nspname, n.nspname, NULL::pg_catalog.text, 'schema', n.nspowner,
         n.nspacl IS NULL, COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
  FROM pg_catalog.pg_namespace AS n WHERE n.nspname IN ('public', 'storage')
)
SELECT o.schema_name, o.object_name, o.column_name, o.object_kind,
       pg_catalog.pg_get_userbyid(o.owner_oid) AS owner, o.acl_was_null,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       pg_catalog.pg_get_userbyid(a.grantor) AS grantor,
       a.privilege_type, a.is_grantable,
       r.rolsuper AS grantee_superuser, r.rolbypassrls AS grantee_bypassrls,
       r.rolinherit AS grantee_inherit
FROM objects AS o
LEFT JOIN LATERAL pg_catalog.aclexplode(o.acl) AS a ON true
LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = a.grantee
ORDER BY o.schema_name, o.object_name, o.column_name, grantee, a.privilege_type;

-- BLOQUE 07: default privileges globales y de public/storage (no permisos nuevos).
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creating_role,
       COALESCE(n.nspname, '(global)') AS schema_scope,
       d.defaclobjtype AS object_kind,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       pg_catalog.pg_get_userbyid(a.grantor) AS grantor,
       a.privilege_type, a.is_grantable
FROM pg_catalog.pg_default_acl AS d
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS a ON true
WHERE d.defaclnamespace = 0 OR n.nspname IN ('public', 'storage')
ORDER BY creating_role, schema_scope, d.defaclobjtype, grantee, a.privilege_type;

-- BLOQUE 08: funciones referenciadas, atributos, ACL y cuerpos acotados.
-- Raices: triggers de 05 + dependencias de policies public/storage + RPC conocidas.
-- No hay consumidores RPC encontrados en el repo: rpc_roots queda vacio.
-- Solo cuerpos public, no miembros de extensiones. Otras dependencias muestran
-- firma/atributos, NO cuerpo. Ampliar app_schemas solo tras revisar ownership.
-- UNION (no UNION ALL) termina ciclos; solo recorre dependencias catalogadas de
-- funciones propias. PL/pgSQL/SQL en texto y SQL dinamico pueden no registrarlas.
WITH RECURSIVE
app_schemas(schema_name) AS (VALUES ('public'::pg_catalog.text)),
rpc_roots(function_oid) AS (SELECT p.oid FROM pg_catalog.pg_proc AS p WHERE false),
own_functions AS (
  SELECT p.oid
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN app_schemas AS s ON s.schema_name = n.nspname
  WHERE p.prokind IN ('f', 'p')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS d
      WHERE d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid = p.oid
        AND d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass AND d.deptype = 'e'
    )
),
roots(function_oid) AS (
  SELECT tr.tgfoid
  FROM pg_catalog.pg_trigger AS tr
  JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT tr.tgisinternal AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
  UNION
  SELECT d.refobjid
  FROM pg_catalog.pg_policy AS pol
  JOIN pg_catalog.pg_class AS c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_depend AS d
    ON d.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass AND d.objid = pol.oid
   AND d.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
  WHERE n.nspname IN ('public', 'storage')
  UNION SELECT function_oid FROM rpc_roots
),
reachable(function_oid) AS (
  SELECT function_oid FROM roots
  UNION
  SELECT d.refobjid
  FROM reachable AS r
  JOIN own_functions AS own ON own.oid = r.function_oid
  JOIN pg_catalog.pg_depend AS d
    ON d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid = r.function_oid
   AND d.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
)
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_catalog.pg_get_function_result(p.oid) AS result_type,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       l.lanname AS language, p.prokind AS routine_kind,
       p.prosecdef AS security_definer, p.provolatile AS volatility,
       p.proparallel AS parallel_safety, p.proleakproof AS leakproof,
       p.proisstrict AS strict, p.proretset AS returns_set,
       p.proconfig AS function_settings, ex.extname AS extension_name,
       EXISTS (SELECT 1 FROM roots AS rt WHERE rt.function_oid = p.oid) AS direct_root,
       own.oid IS NOT NULL AS body_in_scope,
       CASE WHEN own.oid IS NOT NULL THEN pg_catalog.pg_get_functiondef(p.oid) END AS definition,
       p.proacl IS NULL AS acl_was_null,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
           'grantor', pg_catalog.pg_get_userbyid(a.grantor),
           'privilege', a.privilege_type, 'grantable', a.is_grantable))
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a) AS grants
FROM reachable AS r
JOIN pg_catalog.pg_proc AS p ON p.oid = r.function_oid
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
LEFT JOIN own_functions AS own ON own.oid = p.oid
LEFT JOIN pg_catalog.pg_depend AS em
  ON em.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass AND em.objid = p.oid
 AND em.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass AND em.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS ex ON ex.oid = em.refobjid
ORDER BY n.nspname, p.proname, identity_arguments;

-- BLOQUE 09: tipos usados por columnas public y sus dependencias estructurales.
-- Arrays, dominios, compuestos y rangos; enums/constraints son metadatos.
WITH RECURSIVE type_edges(parent_oid, child_oid) AS (
  SELECT t.oid, t.typelem FROM pg_catalog.pg_type AS t WHERE t.typelem <> 0
  UNION SELECT t.oid, t.typbasetype FROM pg_catalog.pg_type AS t WHERE t.typbasetype <> 0
  UNION
  SELECT t.oid, a.atttypid FROM pg_catalog.pg_type AS t
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = t.typrelid
  WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION SELECT r.rngtypid, r.rngsubtype FROM pg_catalog.pg_range AS r
), used_types(type_oid) AS (
  SELECT a.atttypid
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.attnum > 0 AND NOT a.attisdropped
  UNION
  SELECT e.child_oid FROM used_types AS u JOIN type_edges AS e ON e.parent_oid = u.type_oid
)
SELECT n.nspname AS schema_name, t.typname AS type_name, t.typtype AS type_kind,
       pg_catalog.pg_get_userbyid(t.typowner) AS owner,
       CASE WHEN t.typbasetype <> 0
            THEN pg_catalog.format_type(t.typbasetype, t.typtypmod) END AS base_type,
       t.typnotnull AS domain_not_null, t.typdefault AS type_default,
       ex.extname AS extension_name,
       (SELECT pg_catalog.jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_catalog.pg_enum AS e WHERE e.enumtypid = t.oid) AS enum_labels,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name', c.conname, 'definition', pg_catalog.pg_get_constraintdef(c.oid, true)))
        FROM pg_catalog.pg_constraint AS c WHERE c.contypid = t.oid) AS domain_constraints,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name', a.attname, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
        FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = t.typrelid AND a.attnum > 0 AND NOT a.attisdropped) AS composite_fields
FROM used_types AS u
JOIN pg_catalog.pg_type AS t ON t.oid = u.type_oid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_depend AS em
  ON em.classid = 'pg_catalog.pg_type'::pg_catalog.regclass AND em.objid = t.oid
 AND em.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass AND em.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS ex ON ex.oid = em.refobjid
ORDER BY n.nspname, t.typname;

-- BLOQUE 10: dependencias directas de objetos public, policies storage y triggers Auth.
-- Devuelve identidades/extension, nunca cuerpos de dependencias internas.
-- Incluye funciones usadas en defaults/checks/indices; revisar huecos frente a 08.
WITH source_objects(classid, objid) AS (
  SELECT 'pg_catalog.pg_class'::pg_catalog.regclass::pg_catalog.oid, c.oid
  FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION
  SELECT 'pg_catalog.pg_attrdef'::pg_catalog.regclass::pg_catalog.oid, a.oid
  FROM pg_catalog.pg_attrdef AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.adrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
  UNION
  SELECT 'pg_catalog.pg_constraint'::pg_catalog.regclass::pg_catalog.oid, c.oid
  FROM pg_catalog.pg_constraint AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.connamespace
  WHERE n.nspname = 'public'
  UNION
  SELECT 'pg_catalog.pg_policy'::pg_catalog.regclass::pg_catalog.oid, p.oid
  FROM pg_catalog.pg_policy AS p
  JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'storage')
  UNION
  SELECT 'pg_catalog.pg_trigger'::pg_catalog.regclass::pg_catalog.oid, tr.oid
  FROM pg_catalog.pg_trigger AS tr
  JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT tr.tgisinternal AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
)
SELECT pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
       d.deptype AS dependency_kind,
       pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced_object,
       ex.extname AS referenced_extension, ex.extversion AS extension_version
FROM source_objects AS s
JOIN pg_catalog.pg_depend AS d ON d.classid = s.classid AND d.objid = s.objid
LEFT JOIN pg_catalog.pg_depend AS em
  ON em.classid = d.refclassid AND em.objid = d.refobjid
 AND em.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass AND em.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS ex
  ON ex.oid = CASE WHEN d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
                  THEN d.refobjid ELSE em.refobjid END
ORDER BY dependent_object, referenced_object, d.deptype;

-- BLOQUE 11: extensiones instaladas (nombres/versiones, no definiciones/config secreta).
-- Instalacion NO demuestra uso: contrastar con 08, 09 y 10.
SELECT e.extname AS extension_name, e.extversion AS version,
       n.nspname AS schema_name, e.extrelocatable AS relocatable
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;
