-- EDUCATIVO IA 03D1 - PAQUETE DE METADATOS Y AGREGADOS, SOLO LECTURA.
-- Ejecutar unicamente en Supabase test: gwdtlbisykzzplgzczzq.
-- Verificar visualmente el Project ID antes de ejecutar cada bloque.
-- No ejecutar en produccion.
-- Este archivo es read-only: solo contiene SELECT y CTE.
-- No copiar resultados que contengan informacion distinta a los metadatos y agregados previstos.
-- Detenerse si alguna sentencia no es SELECT/CTE.
-- Ejecutar por seccion, conservando cada sentencia completa. No usa comandos de psql.

-- AUDIT_STATEMENT 01 | block=00 | result=metadata | max_rows=1
-- 00. Identidad del servidor. El Project ID no existe como identidad catalogal confiable.
SELECT current_database() AS database_name,
       current_user AS current_user,
       version() AS postgres_version,
       current_setting('server_version') AS server_version;

-- AUDIT_STATEMENT 02 | block=01 | result=metadata | max_rows=19
-- 01. Tablas relevantes, owner y RLS. La ausencia queda como exists=false.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
)
SELECT 'public' AS expected_schema, r.table_name AS expected_object,
       (c.oid IS NOT NULL) AS exists, c.relkind AS relation_kind,
       CASE WHEN c.oid IS NULL THEN NULL ELSE pg_get_userbyid(c.relowner) END AS table_owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM relevant_tables AS r
LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = r.table_name
                             AND c.relkind IN ('r', 'p')
ORDER BY r.table_name;

-- AUDIT_STATEMENT 03 | block=01 | result=metadata | max_rows=257
-- 01B. Columnas, tipos, nullability, identity y hash de defaults.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
)
SELECT c.relname AS table_name, a.attnum AS ordinal_position,
       a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, a.attidentity AS identity_kind,
       a.attgenerated AS generated_kind, (d.oid IS NOT NULL) AS has_default,
       CASE WHEN d.oid IS NULL THEN NULL ELSE md5(pg_get_expr(d.adbin, d.adrelid)) END AS default_expression_hash
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN relevant_tables AS r ON r.table_name = c.relname
JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef AS d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname, a.attnum;

-- AUDIT_STATEMENT 04 | block=02 | result=metadata | max_rows=49
-- 02. Policies public completas y ordenadas. Las expresiones son metadatos, no se ejecutan.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
)
SELECT p.schemaname AS schema_name, p.tablename AS table_name,
       p.policyname AS policy_name, p.permissive, p.roles, p.cmd,
       p.qual AS using_expression, p.with_check AS with_check_expression
FROM pg_policies AS p
JOIN relevant_tables AS r ON r.table_name = p.tablename
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.policyname;

-- AUDIT_STATEMENT 05 | block=03 | result=metadata | max_rows=532
-- 03A. ACL efectivas de tablas para los roles de aplicacion y PUBLIC.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
), table_acl AS (
  SELECT c.oid, c.relname, c.relowner,
         COALESCE(c.relacl, acldefault('r', c.relowner)) AS acl
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  JOIN relevant_tables AS r ON r.table_name = c.relname
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
)
SELECT t.relname AS table_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type, a.is_grantable
FROM table_acl AS t
CROSS JOIN LATERAL aclexplode(t.acl) AS a
WHERE CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
      IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY t.relname, grantee, a.privilege_type;

-- AUDIT_STATEMENT 06 | block=03 | result=metadata | max_rows=12
-- 03B. ACL de secuencias relevantes.
SELECT c.relname AS sequence_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) AS a
WHERE n.nspname = 'public' AND c.relkind = 'S'
  AND c.relname IN ('planeaciones_id_seq')
  AND CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
      IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY c.relname, grantee, a.privilege_type;

-- AUDIT_STATEMENT 07 | block=03 | result=metadata | max_rows=24
-- 03C. EXECUTE explícito de las seis firmas exactas.
WITH expected_functions(function_name, identity_arguments) AS (
  VALUES ('enforce_grado_ownership', ''), ('enforce_materia_ownership', ''),
         ('enforce_planeacion_tema_ownership', ''), ('enforce_tema_ownership', ''),
         ('handle_new_user', ''), ('set_updated_at', '')
)
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN expected_functions AS e ON e.function_name = p.proname
  AND e.identity_arguments = pg_get_function_identity_arguments(p.oid)
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
WHERE n.nspname = 'public'
  AND CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
      IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY p.proname, identity_arguments, grantee;

-- AUDIT_STATEMENT 08 | block=03 | result=metadata | max_rows=399
-- 03D. Privilegios efectivos por rol, incluidas membresías.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
), roles(role_name) AS (VALUES ('anon'), ('authenticated'), ('service_role')),
privileges(privilege_name) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
SELECT c.relname AS table_name, ro.role_name, pr.privilege_name,
       has_table_privilege(ro.role_name, c.oid, pr.privilege_name) AS effective
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN relevant_tables AS r ON r.table_name = c.relname
CROSS JOIN roles AS ro CROSS JOIN privileges AS pr
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname, ro.role_name, pr.privilege_name;

-- AUDIT_STATEMENT 09 | block=03 | result=metadata | max_rows=27
-- 03E. Privilegios efectivos de secuencia y seis firmas exactas.
WITH roles(role_name) AS (VALUES ('anon'), ('authenticated'), ('service_role')),
sequence_privileges(privilege_name) AS (VALUES ('USAGE'), ('SELECT'), ('UPDATE')),
expected_functions(function_name, identity_arguments) AS (
  VALUES ('enforce_grado_ownership', ''), ('enforce_materia_ownership', ''),
         ('enforce_planeacion_tema_ownership', ''), ('enforce_tema_ownership', ''),
         ('handle_new_user', ''), ('set_updated_at', '')
)
SELECT 'sequence' AS object_kind, c.relname AS object_name, '' AS identity_arguments,
       ro.role_name, pr.privilege_name,
       has_sequence_privilege(ro.role_name, c.oid, pr.privilege_name) AS effective
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN roles AS ro CROSS JOIN sequence_privileges AS pr
WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname = 'planeaciones_id_seq'
UNION ALL
SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid),
       ro.role_name, 'EXECUTE', has_function_privilege(ro.role_name, p.oid, 'EXECUTE')
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN expected_functions AS e ON e.function_name = p.proname
  AND e.identity_arguments = pg_get_function_identity_arguments(p.oid)
CROSS JOIN roles AS ro
WHERE n.nspname = 'public'
ORDER BY object_kind, object_name, identity_arguments, role_name, privilege_name;

-- AUDIT_STATEMENT 10 | block=04 | result=metadata | max_rows=76
-- 04. PK, UNIQUE, CHECK y FK; columnas, acciones y hash de definición.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
)
SELECT c.relname AS table_name, con.conname AS constraint_name,
       con.contype AS constraint_type,
       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, position)
             JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum = k.attnum
             ORDER BY k.position) AS columns,
       rn.nspname AS referenced_schema, rc.relname AS referenced_table,
       ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, position)
             JOIN pg_attribute AS a ON a.attrelid = rc.oid AND a.attnum = k.attnum
             ORDER BY k.position) AS referenced_columns,
       con.condeferrable AS deferrable, con.condeferred AS initially_deferred,
       CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
       con.convalidated AS validated,
       md5(pg_get_constraintdef(con.oid, true)) AS definition_hash
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN relevant_tables AS r ON r.table_name = c.relname
LEFT JOIN pg_class AS rc ON rc.oid = con.confrelid
LEFT JOIN pg_namespace AS rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public' AND con.contype IN ('p', 'u', 'c', 'f')
ORDER BY c.relname, con.conname;

-- AUDIT_STATEMENT 11 | block=05 | result=metadata | max_rows=16
-- 05A. Triggers no internos de las 19 tablas y auth.users; no invoca funciones.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('ai_model_prices'),
         ('anexos'), ('examen_generation_items'), ('examen_generation_jobs'),
         ('examenes'), ('grados'), ('ia_metrics_legacy'), ('listas_cotejo'),
         ('materias'), ('planeacion_batches'), ('planeaciones'), ('planteles'),
         ('profiles'), ('temas'), ('unidades'), ('user_profiles'), ('user_settings')
)
SELECT n.nspname AS schema_name, c.relname AS table_name,
       t.tgname AS trigger_name, t.tgenabled AS enabled_mode,
       ((t.tgtype::integer & 1) = 1) AS for_each_row,
       CASE WHEN (t.tgtype::integer & 64) = 64 THEN 'INSTEAD OF'
            WHEN (t.tgtype::integer & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       ((t.tgtype::integer & 4) = 4) AS on_insert,
       ((t.tgtype::integer & 8) = 8) AS on_delete,
       ((t.tgtype::integer & 16) = 16) AS on_update,
       ((t.tgtype::integer & 32) = 32) AS on_truncate,
       fn.nspname AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
JOIN pg_namespace AS fn ON fn.oid = p.pronamespace
LEFT JOIN relevant_tables AS r ON n.nspname = 'public' AND r.table_name = c.relname
WHERE NOT t.tgisinternal
  AND (r.table_name IS NOT NULL OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY n.nspname, c.relname, t.tgname;

-- AUDIT_STATEMENT 12 | block=05 | result=metadata | max_rows=6
-- 05B. Metadata segura de las seis firmas exactas; nunca devuelve el cuerpo.
WITH expected_functions(function_name, identity_arguments) AS (
  VALUES ('enforce_grado_ownership', ''), ('enforce_materia_ownership', ''),
         ('enforce_planeacion_tema_ownership', ''), ('enforce_tema_ownership', ''),
         ('handle_new_user', ''), ('set_updated_at', '')
)
SELECT 'public' AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_userbyid(p.proowner) AS function_owner,
       p.prokind AS routine_kind, l.lanname AS language, p.prosecdef AS security_definer,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END AS security_mode,
       p.provolatile AS volatility, p.proparallel AS parallel_mode,
       ARRAY(SELECT config.setting FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS config(setting)
             WHERE config.setting LIKE 'search_path=%' ORDER BY config.setting) AS search_path_settings,
       cardinality(COALESCE(p.proconfig, ARRAY[]::text[])) AS config_entry_count
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
JOIN expected_functions AS e ON e.function_name = p.proname
  AND e.identity_arguments = pg_get_function_identity_arguments(p.oid)
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments;

-- AUDIT_STATEMENT 13 | block=06 | result=metadata | max_rows=69
-- 06. Índices que soportan propiedad, jobs, batches y relaciones.
WITH relevant_tables(table_name) AS (
  VALUES ('ai_generation_calls'), ('ai_generation_jobs'), ('anexos'),
         ('examen_generation_items'), ('examen_generation_jobs'), ('examenes'),
         ('grados'), ('listas_cotejo'), ('materias'), ('planeacion_batches'),
         ('planeaciones'), ('planteles'), ('temas'), ('unidades')
)
SELECT c.relname AS table_name, ic.relname AS index_name,
       i.indisunique AS is_unique, i.indisprimary AS is_primary,
       i.indisvalid AS is_valid, i.indisready AS is_ready,
       md5(pg_get_indexdef(i.indexrelid)) AS definition_hash,
       (i.indpred IS NOT NULL) AS has_predicate,
       CASE WHEN i.indpred IS NULL THEN NULL ELSE md5(pg_get_expr(i.indpred, i.indrelid)) END AS predicate_hash
FROM pg_index AS i
JOIN pg_class AS c ON c.oid = i.indrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_class AS ic ON ic.oid = i.indexrelid
JOIN relevant_tables AS r ON r.table_name = c.relname
WHERE n.nspname = 'public'
ORDER BY c.relname, ic.relname;

-- AUDIT_STATEMENT 14 | block=07 | result=aggregate | max_rows=18
-- 07A. Conteos requeridos. ia_metrics_legacy se audita solo por metadata en 01.
/* APPLICATION_AGGREGATE */
SELECT 'ai_generation_calls' AS table_name, count(*)::bigint AS row_count FROM public.ai_generation_calls
UNION ALL SELECT 'ai_generation_jobs', count(*)::bigint FROM public.ai_generation_jobs
UNION ALL SELECT 'ai_model_prices', count(*)::bigint FROM public.ai_model_prices
UNION ALL SELECT 'anexos', count(*)::bigint FROM public.anexos
UNION ALL SELECT 'examen_generation_items', count(*)::bigint FROM public.examen_generation_items
UNION ALL SELECT 'examen_generation_jobs', count(*)::bigint FROM public.examen_generation_jobs
UNION ALL SELECT 'examenes', count(*)::bigint FROM public.examenes
UNION ALL SELECT 'grados', count(*)::bigint FROM public.grados
UNION ALL SELECT 'listas_cotejo', count(*)::bigint FROM public.listas_cotejo
UNION ALL SELECT 'materias', count(*)::bigint FROM public.materias
UNION ALL SELECT 'planeacion_batches', count(*)::bigint FROM public.planeacion_batches
UNION ALL SELECT 'planeaciones', count(*)::bigint FROM public.planeaciones
UNION ALL SELECT 'planteles', count(*)::bigint FROM public.planteles
UNION ALL SELECT 'profiles', count(*)::bigint FROM public.profiles
UNION ALL SELECT 'temas', count(*)::bigint FROM public.temas
UNION ALL SELECT 'unidades', count(*)::bigint FROM public.unidades
UNION ALL SELECT 'user_profiles', count(*)::bigint FROM public.user_profiles
UNION ALL SELECT 'user_settings', count(*)::bigint FROM public.user_settings
ORDER BY table_name;

-- AUDIT_STATEMENT 15 | block=07 | result=aggregate | max_rows=16
-- 07B. Jobs/items por status normalizado; valores inesperados se agrupan como OTHER.
/* APPLICATION_AGGREGATE */
SELECT 'ai_generation_jobs' AS source,
       CASE WHEN status IN ('started', 'success', 'error', 'partial', 'cancelled') THEN status ELSE 'OTHER' END AS status_group,
       count(*)::bigint AS row_count
FROM public.ai_generation_jobs GROUP BY status_group
UNION ALL
SELECT 'examen_generation_jobs',
       CASE WHEN status IN ('pending', 'processing', 'completed', 'failed') THEN status ELSE 'OTHER' END,
       count(*)::bigint
FROM public.examen_generation_jobs GROUP BY 2
UNION ALL
SELECT 'examen_generation_items',
       CASE WHEN status IN ('pending', 'processing', 'completed', 'failed') THEN status ELSE 'OTHER' END,
       count(*)::bigint
FROM public.examen_generation_items GROUP BY 2
ORDER BY source, status_group;

-- AUDIT_STATEMENT 16 | block=07 | result=aggregate | max_rows=5
-- 07C. Residuales y huérfanos de jobs/exámenes. Solo conteos.
/* APPLICATION_AGGREGATE */
SELECT 'exam_jobs_pending_or_processing' AS check_name,
       count(*) FILTER (WHERE status IN ('pending', 'processing'))::bigint AS total_count
FROM public.examen_generation_jobs
UNION ALL
SELECT 'exam_jobs_without_items', count(*)::bigint
FROM public.examen_generation_jobs AS j
WHERE NOT EXISTS (SELECT 1 FROM public.examen_generation_items AS i WHERE i.job_id = j.id)
UNION ALL
SELECT 'exam_items_without_job', count(*)::bigint
FROM public.examen_generation_items AS i
LEFT JOIN public.examen_generation_jobs AS j ON j.id = i.job_id
WHERE j.id IS NULL
UNION ALL
SELECT 'exams_without_generation_job', count(*)::bigint
FROM public.examenes WHERE generation_job_id IS NULL
UNION ALL
SELECT 'exams_with_missing_generation_job', count(*)::bigint
FROM public.examenes AS e
LEFT JOIN public.examen_generation_jobs AS j ON j.id = e.generation_job_id
WHERE e.generation_job_id IS NOT NULL AND j.id IS NULL;

-- AUDIT_STATEMENT 17 | block=08 | result=aggregate | max_rows=37
-- 08. Integridad de propietario y huérfanos por cada relación real o columna relacional.
-- total_evaluated cuenta referencias no nulas; mismatch_count compara owners; orphan_count no encuentra padre.
/* APPLICATION_AGGREGATE */
SELECT 'grados__planteles' AS check_name, count(*)::bigint AS total_evaluated,
       count(*) FILTER (WHERE p.id IS NOT NULL AND g.user_id IS DISTINCT FROM p.user_id)::bigint AS mismatch_count,
       count(*) FILTER (WHERE p.id IS NULL)::bigint AS orphan_count
FROM public.grados AS g LEFT JOIN public.planteles AS p ON p.id = g.plantel_id
UNION ALL SELECT 'materias__grados', count(*)::bigint,
       count(*) FILTER (WHERE g.id IS NOT NULL AND m.user_id IS DISTINCT FROM g.user_id)::bigint,
       count(*) FILTER (WHERE g.id IS NULL)::bigint
FROM public.materias AS m LEFT JOIN public.grados AS g ON g.id = m.grado_id
UNION ALL SELECT 'unidades__materias', count(*)::bigint,
       count(*) FILTER (WHERE m.id IS NOT NULL AND u.user_id IS DISTINCT FROM m.user_id)::bigint,
       count(*) FILTER (WHERE m.id IS NULL)::bigint
FROM public.unidades AS u LEFT JOIN public.materias AS m ON m.id = u.materia_id
UNION ALL SELECT 'temas__unidades', count(*)::bigint,
       count(*) FILTER (WHERE u.id IS NOT NULL AND t.user_id IS DISTINCT FROM u.user_id)::bigint,
       count(*) FILTER (WHERE u.id IS NULL)::bigint
FROM public.temas AS t LEFT JOIN public.unidades AS u ON u.id = t.unidad_id
UNION ALL SELECT 'batches__planteles', count(*)::bigint,
       count(*) FILTER (WHERE p.id IS NOT NULL AND b.user_id IS DISTINCT FROM p.user_id)::bigint,
       count(*) FILTER (WHERE p.id IS NULL)::bigint
FROM public.planeacion_batches AS b LEFT JOIN public.planteles AS p ON p.id = b.plantel_id WHERE b.plantel_id IS NOT NULL
UNION ALL SELECT 'batches__grados', count(*)::bigint,
       count(*) FILTER (WHERE g.id IS NOT NULL AND b.user_id IS DISTINCT FROM g.user_id)::bigint,
       count(*) FILTER (WHERE g.id IS NULL)::bigint
FROM public.planeacion_batches AS b LEFT JOIN public.grados AS g ON g.id = b.grado_id WHERE b.grado_id IS NOT NULL
UNION ALL SELECT 'batches__materias', count(*)::bigint,
       count(*) FILTER (WHERE m.id IS NOT NULL AND b.user_id IS DISTINCT FROM m.user_id)::bigint,
       count(*) FILTER (WHERE m.id IS NULL)::bigint
FROM public.planeacion_batches AS b LEFT JOIN public.materias AS m ON m.id = b.materia_id WHERE b.materia_id IS NOT NULL
UNION ALL SELECT 'batches__unidades', count(*)::bigint,
       count(*) FILTER (WHERE u.id IS NOT NULL AND b.user_id IS DISTINCT FROM u.user_id)::bigint,
       count(*) FILTER (WHERE u.id IS NULL)::bigint
FROM public.planeacion_batches AS b LEFT JOIN public.unidades AS u ON u.id = b.unidad_id WHERE b.unidad_id IS NOT NULL
UNION ALL SELECT 'planeaciones__temas', count(*)::bigint,
       count(*) FILTER (WHERE t.id IS NOT NULL AND p.user_id IS DISTINCT FROM t.user_id)::bigint,
       count(*) FILTER (WHERE t.id IS NULL)::bigint
FROM public.planeaciones AS p LEFT JOIN public.temas AS t ON t.id = p.tema_id WHERE p.tema_id IS NOT NULL
UNION ALL SELECT 'planeaciones__batches', count(*)::bigint,
       count(*) FILTER (WHERE b.id IS NOT NULL AND p.user_id IS DISTINCT FROM b.user_id)::bigint,
       count(*) FILTER (WHERE b.id IS NULL)::bigint
FROM public.planeaciones AS p LEFT JOIN public.planeacion_batches AS b ON b.id = p.batch_id WHERE p.batch_id IS NOT NULL
UNION ALL SELECT 'anexos__planeaciones', count(*)::bigint,
       count(*) FILTER (WHERE p.id IS NOT NULL AND a.user_id IS DISTINCT FROM p.user_id)::bigint,
       count(*) FILTER (WHERE p.id IS NULL)::bigint
FROM public.anexos AS a LEFT JOIN public.planeaciones AS p ON p.id = a.planeacion_id
UNION ALL SELECT 'anexos__temas', count(*)::bigint,
       count(*) FILTER (WHERE t.id IS NOT NULL AND a.user_id IS DISTINCT FROM t.user_id)::bigint,
       count(*) FILTER (WHERE t.id IS NULL)::bigint
FROM public.anexos AS a LEFT JOIN public.temas AS t ON t.id = a.tema_id WHERE a.tema_id IS NOT NULL
UNION ALL SELECT 'anexos__unidades', count(*)::bigint,
       count(*) FILTER (WHERE u.id IS NOT NULL AND a.user_id IS DISTINCT FROM u.user_id)::bigint,
       count(*) FILTER (WHERE u.id IS NULL)::bigint
FROM public.anexos AS a LEFT JOIN public.unidades AS u ON u.id = a.unidad_id WHERE a.unidad_id IS NOT NULL
UNION ALL SELECT 'anexos__batches', count(*)::bigint,
       count(*) FILTER (WHERE b.id IS NOT NULL AND a.user_id IS DISTINCT FROM b.user_id)::bigint,
       count(*) FILTER (WHERE b.id IS NULL)::bigint
FROM public.anexos AS a LEFT JOIN public.planeacion_batches AS b ON b.id = a.batch_id WHERE a.batch_id IS NOT NULL
UNION ALL SELECT 'listas__planeaciones', count(*)::bigint,
       count(*) FILTER (WHERE p.id IS NOT NULL AND l.user_id IS DISTINCT FROM p.user_id)::bigint,
       count(*) FILTER (WHERE p.id IS NULL)::bigint
FROM public.listas_cotejo AS l LEFT JOIN public.planeaciones AS p ON p.id = l.planeacion_id
UNION ALL SELECT 'listas__temas', count(*)::bigint,
       count(*) FILTER (WHERE t.id IS NOT NULL AND l.user_id IS DISTINCT FROM t.user_id)::bigint,
       count(*) FILTER (WHERE t.id IS NULL)::bigint
FROM public.listas_cotejo AS l LEFT JOIN public.temas AS t ON t.id = l.tema_id WHERE l.tema_id IS NOT NULL
UNION ALL SELECT 'listas__unidades', count(*)::bigint,
       count(*) FILTER (WHERE u.id IS NOT NULL AND l.user_id IS DISTINCT FROM u.user_id)::bigint,
       count(*) FILTER (WHERE u.id IS NULL)::bigint
FROM public.listas_cotejo AS l LEFT JOIN public.unidades AS u ON u.id = l.unidad_id WHERE l.unidad_id IS NOT NULL
UNION ALL SELECT 'listas__batches', count(*)::bigint,
       count(*) FILTER (WHERE b.id IS NOT NULL AND l.user_id IS DISTINCT FROM b.user_id)::bigint,
       count(*) FILTER (WHERE b.id IS NULL)::bigint
FROM public.listas_cotejo AS l LEFT JOIN public.planeacion_batches AS b ON b.id = l.batch_id WHERE l.batch_id IS NOT NULL
UNION ALL SELECT 'examenes__unidades', count(*)::bigint,
       count(*) FILTER (WHERE u.id IS NOT NULL AND e.user_id IS DISTINCT FROM u.user_id)::bigint,
       count(*) FILTER (WHERE u.id IS NULL)::bigint
FROM public.examenes AS e LEFT JOIN public.unidades AS u ON u.id = e.unidad_id
UNION ALL SELECT 'examenes__planteles', count(*)::bigint,
       count(*) FILTER (WHERE p.id IS NOT NULL AND e.user_id IS DISTINCT FROM p.user_id)::bigint,
       count(*) FILTER (WHERE p.id IS NULL)::bigint
FROM public.examenes AS e LEFT JOIN public.planteles AS p ON p.id = e.plantel_id WHERE e.plantel_id IS NOT NULL
UNION ALL SELECT 'examenes__grados', count(*)::bigint,
       count(*) FILTER (WHERE g.id IS NOT NULL AND e.user_id IS DISTINCT FROM g.user_id)::bigint,
       count(*) FILTER (WHERE g.id IS NULL)::bigint
FROM public.examenes AS e LEFT JOIN public.grados AS g ON g.id = e.grado_id WHERE e.grado_id IS NOT NULL
UNION ALL SELECT 'examenes__materias', count(*)::bigint,
       count(*) FILTER (WHERE m.id IS NOT NULL AND e.user_id IS DISTINCT FROM m.user_id)::bigint,
       count(*) FILTER (WHERE m.id IS NULL)::bigint
FROM public.examenes AS e LEFT JOIN public.materias AS m ON m.id = e.materia_id WHERE e.materia_id IS NOT NULL
UNION ALL SELECT 'examenes__batches', count(*)::bigint,
       count(*) FILTER (WHERE b.id IS NOT NULL AND e.user_id IS DISTINCT FROM b.user_id)::bigint,
       count(*) FILTER (WHERE b.id IS NULL)::bigint
FROM public.examenes AS e LEFT JOIN public.planeacion_batches AS b ON b.id = e.batch_id WHERE e.batch_id IS NOT NULL
UNION ALL SELECT 'examenes__generation_jobs', count(*)::bigint,
       count(*) FILTER (WHERE j.id IS NOT NULL AND e.user_id IS DISTINCT FROM j.user_id)::bigint,
       count(*) FILTER (WHERE j.id IS NULL)::bigint
FROM public.examenes AS e LEFT JOIN public.examen_generation_jobs AS j ON j.id = e.generation_job_id WHERE e.generation_job_id IS NOT NULL
UNION ALL SELECT 'exam_jobs__examenes', count(*)::bigint,
       count(*) FILTER (WHERE e.id IS NOT NULL AND j.user_id IS DISTINCT FROM e.user_id)::bigint,
       count(*) FILTER (WHERE e.id IS NULL)::bigint
FROM public.examen_generation_jobs AS j LEFT JOIN public.examenes AS e ON e.id = j.examen_id WHERE j.examen_id IS NOT NULL
UNION ALL SELECT 'exam_jobs__unidades', count(*)::bigint,
       count(*) FILTER (WHERE u.id IS NOT NULL AND j.user_id IS DISTINCT FROM u.user_id)::bigint,
       count(*) FILTER (WHERE u.id IS NULL)::bigint
FROM public.examen_generation_jobs AS j LEFT JOIN public.unidades AS u ON u.id = j.unidad_id WHERE j.unidad_id IS NOT NULL
UNION ALL SELECT 'exam_jobs__planteles', count(*)::bigint,
       count(*) FILTER (WHERE p.id IS NOT NULL AND j.user_id IS DISTINCT FROM p.user_id)::bigint,
       count(*) FILTER (WHERE p.id IS NULL)::bigint
FROM public.examen_generation_jobs AS j LEFT JOIN public.planteles AS p ON p.id = j.plantel_id WHERE j.plantel_id IS NOT NULL
UNION ALL SELECT 'exam_jobs__grados', count(*)::bigint,
       count(*) FILTER (WHERE g.id IS NOT NULL AND j.user_id IS DISTINCT FROM g.user_id)::bigint,
       count(*) FILTER (WHERE g.id IS NULL)::bigint
FROM public.examen_generation_jobs AS j LEFT JOIN public.grados AS g ON g.id = j.grado_id WHERE j.grado_id IS NOT NULL
UNION ALL SELECT 'exam_jobs__materias', count(*)::bigint,
       count(*) FILTER (WHERE m.id IS NOT NULL AND j.user_id IS DISTINCT FROM m.user_id)::bigint,
       count(*) FILTER (WHERE m.id IS NULL)::bigint
FROM public.examen_generation_jobs AS j LEFT JOIN public.materias AS m ON m.id = j.materia_id WHERE j.materia_id IS NOT NULL
UNION ALL SELECT 'exam_items__jobs', count(*)::bigint,
       count(*) FILTER (WHERE j.id IS NOT NULL AND i.user_id IS DISTINCT FROM j.user_id)::bigint,
       count(*) FILTER (WHERE j.id IS NULL)::bigint
FROM public.examen_generation_items AS i LEFT JOIN public.examen_generation_jobs AS j ON j.id = i.job_id
UNION ALL SELECT 'exam_items__temas', count(*)::bigint,
       count(*) FILTER (WHERE t.id IS NOT NULL AND i.user_id IS DISTINCT FROM t.user_id)::bigint,
       count(*) FILTER (WHERE t.id IS NULL)::bigint
FROM public.examen_generation_items AS i LEFT JOIN public.temas AS t ON t.id = i.tema_id WHERE i.tema_id IS NOT NULL
UNION ALL SELECT 'ai_calls__jobs', count(*)::bigint,
       count(*) FILTER (WHERE j.id IS NOT NULL AND c.user_id IS DISTINCT FROM j.user_id)::bigint,
       count(*) FILTER (WHERE j.id IS NULL)::bigint
FROM public.ai_generation_calls AS c LEFT JOIN public.ai_generation_jobs AS j ON j.id = c.job_id
UNION ALL SELECT 'ai_jobs__batches', count(*)::bigint,
       count(*) FILTER (WHERE b.id IS NOT NULL AND j.user_id IS DISTINCT FROM b.user_id)::bigint,
       count(*) FILTER (WHERE b.id IS NULL)::bigint
FROM public.ai_generation_jobs AS j LEFT JOIN public.planeacion_batches AS b ON b.id = j.batch_id WHERE j.batch_id IS NOT NULL
UNION ALL SELECT 'ai_jobs__planeaciones', count(*)::bigint,
       count(*) FILTER (WHERE p.id IS NOT NULL AND j.user_id IS DISTINCT FROM p.user_id)::bigint,
       count(*) FILTER (WHERE p.id IS NULL)::bigint
FROM public.ai_generation_jobs AS j LEFT JOIN public.planeaciones AS p ON p.id = j.planeacion_id WHERE j.planeacion_id IS NOT NULL
UNION ALL SELECT 'ai_jobs__examenes', count(*)::bigint,
       count(*) FILTER (WHERE e.id IS NOT NULL AND j.user_id IS DISTINCT FROM e.user_id)::bigint,
       count(*) FILTER (WHERE e.id IS NULL)::bigint
FROM public.ai_generation_jobs AS j LEFT JOIN public.examenes AS e ON e.id = j.examen_id WHERE j.examen_id IS NOT NULL
UNION ALL SELECT 'ai_jobs__listas', count(*)::bigint,
       count(*) FILTER (WHERE l.id IS NOT NULL AND j.user_id IS DISTINCT FROM l.user_id)::bigint,
       count(*) FILTER (WHERE l.id IS NULL)::bigint
FROM public.ai_generation_jobs AS j LEFT JOIN public.listas_cotejo AS l ON l.id = j.lista_cotejo_id WHERE j.lista_cotejo_id IS NOT NULL
UNION ALL SELECT 'ai_jobs__anexos', count(*)::bigint,
       count(*) FILTER (WHERE a.id IS NOT NULL AND j.user_id IS DISTINCT FROM a.user_id)::bigint,
       count(*) FILTER (WHERE a.id IS NULL)::bigint
FROM public.ai_generation_jobs AS j LEFT JOIN public.anexos AS a ON a.id = j.anexo_id WHERE j.anexo_id IS NOT NULL
ORDER BY check_name;
