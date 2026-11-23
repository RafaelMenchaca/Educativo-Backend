-- SOLO SUPABASE PRODUCCION.
-- Proyecto esperado: Educativo IA produccion.
-- Project ref esperado: bfnkaqmhcsyxdxoqnahk.
-- NO EJECUTAR EN TEST (gwdtlbisykzzplgzczzq).
-- Verificar visualmente el project ref en Supabase Dashboard antes de ejecutar.
-- PostgreSQL no expone de forma catalogal confiable el project ref de Supabase.
-- Postmigration read-only y fail-closed.

DO $postmigration_produccion$
DECLARE
  target_table regclass := to_regclass('public.anexos');
  type_column_attnum smallint;
  check_count integer;
  column_check_count integer;
  check_expression text;
  normalized_check_expression text;
  total_anexos bigint;
  null_types bigint;
  non_null_types bigint;
  expected_count integer;
  unexpected_count integer;
BEGIN
  IF target_table IS NULL THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: public.anexos no existe'; END IF;
  IF (SELECT count(*) FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
      AND cols.column_name = 'tipo_cuadernillo' AND cols.data_type = 'text'
      AND cols.is_nullable = 'YES' AND cols.column_default IS NULL) <> 1
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: columna incompatible o ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
      AND cols.column_name = 'contenido' AND cols.data_type = 'jsonb'
      AND cols.is_nullable = 'NO' AND cols.column_default = '''{}''::jsonb')
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: contenido cambio su contrato'; END IF;

  SELECT attrs.attnum INTO type_column_attnum FROM pg_attribute AS attrs
  WHERE attrs.attrelid = target_table AND attrs.attname = 'tipo_cuadernillo' AND NOT attrs.attisdropped;
  SELECT count(*) INTO check_count FROM pg_constraint AS constraints
  WHERE constraints.conname = 'anexos_tipo_cuadernillo_check'
    AND constraints.conrelid = target_table AND constraints.contype = 'c';
  SELECT count(*) INTO column_check_count FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table AND constraints.contype = 'c'
    AND type_column_attnum = ANY (constraints.conkey);
  IF check_count <> 1 OR column_check_count <> 1 THEN
    RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: CHECK canonico ausente o duplicado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conname = 'anexos_tipo_cuadernillo_check' AND constraints.conrelid <> target_table)
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: constraint homonimo en otra tabla'; END IF;

  SELECT pg_get_expr(constraints.conbin, constraints.conrelid, true) INTO check_expression
  FROM pg_constraint AS constraints
  WHERE constraints.conname = 'anexos_tipo_cuadernillo_check'
    AND constraints.conrelid = target_table AND constraints.contype = 'c'
    AND constraints.conkey = ARRAY[type_column_attnum]::smallint[];
  normalized_check_expression := regexp_replace(
    regexp_replace(lower(check_expression), '::text\[\]|::text', '', 'g'),
    '[[:space:]()]', '', 'g'
  );
  IF normalized_check_expression IS DISTINCT FROM
    'tipo_cuadernilloisnullortipo_cuadernillo=anyarray[''ejercicios_aplicacion'',''actividades_integradoras'',''aprendizaje_guiado'']'
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: CHECK incompatible'; END IF;

  SELECT count(*), count(*) FILTER (WHERE a.tipo_cuadernillo IS NULL),
    count(*) FILTER (WHERE a.tipo_cuadernillo IS NOT NULL)
  INTO total_anexos, null_types, non_null_types FROM public.anexos AS a;
  IF non_null_types <> 0 OR null_types <> total_anexos THEN
    RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: historicos no permanecen completamente NULL';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conrelid = target_table AND constraints.conname = 'anexos_pkey'
      AND constraints.contype = 'p' AND pg_get_constraintdef(constraints.oid, true) = 'PRIMARY KEY (id)')
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: PK cambio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class AS index_class
    JOIN pg_index AS index_meta ON index_meta.indexrelid = index_class.oid
    WHERE index_class.relname = 'unique_anexo_por_planeacion'
      AND index_meta.indrelid = target_table AND index_meta.indisunique
      AND index_meta.indnkeyatts = 1 AND index_meta.indkey[0] = (
        SELECT attrs.attnum FROM pg_attribute AS attrs
        WHERE attrs.attrelid = target_table AND attrs.attname = 'planeacion_id' AND NOT attrs.attisdropped))
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: UNIQUE cambio'; END IF;

  SELECT count(*) INTO expected_count FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table AND constraints.contype = 'f'
    AND constraints.conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey', 'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey', 'educativo_ia_anexos_planeacion_owner_fkey']::text[]);
  SELECT count(*) INTO unexpected_count FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table AND constraints.contype = 'f'
    AND NOT (constraints.conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey', 'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey', 'educativo_ia_anexos_planeacion_owner_fkey']::text[]));
  IF expected_count <> 4 OR unexpected_count <> 0 THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: FKs cambiaron'; END IF;

  SELECT count(*) INTO expected_count FROM pg_indexes AS indexes
  WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos'
    AND indexes.indexname::text = ANY (ARRAY['anexos_pkey', 'idx_anexos_batch_id',
      'idx_anexos_planeacion_id', 'idx_anexos_tema_id', 'idx_anexos_user_id',
      'unique_anexo_por_planeacion']::text[]);
  SELECT count(*) INTO unexpected_count FROM pg_indexes AS indexes
  WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos'
    AND NOT (indexes.indexname::text = ANY (ARRAY['anexos_pkey', 'idx_anexos_batch_id',
      'idx_anexos_planeacion_id', 'idx_anexos_tema_id', 'idx_anexos_user_id',
      'unique_anexo_por_planeacion']::text[]));
  IF expected_count <> 6 OR unexpected_count <> 0 THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: indices cambiaron'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class AS classes WHERE classes.oid = target_table
    AND classes.relrowsecurity AND NOT classes.relforcerowsecurity)
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: RLS cambio'; END IF;
  SELECT count(*) INTO expected_count FROM pg_policies AS policies
  WHERE policies.schemaname = 'public' AND policies.tablename = 'anexos'
    AND policies.roles = ARRAY['authenticated']::name[]
    AND (policies.policyname, policies.cmd) IN (
      ('Users can delete their own anexos', 'DELETE'), ('Users can insert their own anexos', 'INSERT'),
      ('Users can select their own anexos', 'SELECT'), ('Users can update their own anexos', 'UPDATE'));
  SELECT count(*) INTO unexpected_count FROM pg_policies AS policies
  WHERE policies.schemaname = 'public' AND policies.tablename = 'anexos'
    AND NOT (policies.roles = ARRAY['authenticated']::name[] AND
      (policies.policyname, policies.cmd) IN (
        ('Users can delete their own anexos', 'DELETE'), ('Users can insert their own anexos', 'INSERT'),
        ('Users can select their own anexos', 'SELECT'), ('Users can update their own anexos', 'UPDATE')));
  IF expected_count <> 4 OR unexpected_count <> 0 THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: policies cambiaron'; END IF;
  IF (SELECT count(*) FROM pg_trigger AS triggers WHERE triggers.tgrelid = target_table AND NOT triggers.tgisinternal) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_trigger AS triggers WHERE triggers.tgrelid = target_table
      AND NOT triggers.tgisinternal AND triggers.tgname = 'set_anexos_updated_at')
  THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: triggers cambiaron'; END IF;

  SELECT count(*) INTO expected_count FROM information_schema.role_table_grants AS grants
  WHERE grants.table_schema = 'public' AND grants.table_name = 'anexos'
    AND grants.grantee = 'authenticated'
    AND grants.privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]);
  SELECT count(*) INTO unexpected_count FROM information_schema.role_table_grants AS grants
  WHERE grants.table_schema = 'public' AND grants.table_name = 'anexos'
    AND grants.grantee IN ('anon', 'authenticated')
    AND NOT (grants.grantee = 'authenticated' AND grants.privilege_type = ANY (
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]));
  IF expected_count <> 4 OR unexpected_count <> 0 THEN RAISE EXCEPTION 'POSTMIGRATION PRODUCCION FAIL: grants cambiaron'; END IF;
END
$postmigration_produccion$;

-- Comparar manualmente total_anexos y la metadata catalogal con la evidencia
-- guardada del preflight; archivos separados no comparten estado.
WITH
conteos AS (
  SELECT
    count(*)::bigint AS total_anexos,
    count(*) FILTER (WHERE a.tipo_cuadernillo IS NULL)::bigint AS anexos_tipo_null,
    count(*) FILTER (WHERE a.tipo_cuadernillo IS NOT NULL)::bigint AS anexos_tipo_no_null
  FROM public.anexos AS a
),
tipo_cuadernillo AS (
  SELECT
    (count(*) = 1) AS existe,
    max(cols.data_type) AS data_type,
    max(cols.udt_name) AS udt_name,
    max(cols.is_nullable) AS is_nullable,
    max(cols.column_default) AS column_default
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public'
    AND cols.table_name = 'anexos'
    AND cols.column_name = 'tipo_cuadernillo'
),
contenido AS (
  SELECT jsonb_build_object(
    'data_type', max(cols.data_type),
    'udt_name', max(cols.udt_name),
    'is_nullable', max(cols.is_nullable),
    'column_default', max(cols.column_default)
  ) AS contrato
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public'
    AND cols.table_name = 'anexos'
    AND cols.column_name = 'contenido'
),
columnas AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ordinal_position', cols.ordinal_position,
    'column_name', cols.column_name,
    'data_type', cols.data_type,
    'udt_name', cols.udt_name,
    'is_nullable', cols.is_nullable,
    'column_default', cols.column_default
  ) ORDER BY cols.ordinal_position), '[]'::jsonb) AS metadata
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
),
constraints_catalogo AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', constraints.conname,
    'type', constraints.contype,
    'definition', pg_get_constraintdef(constraints.oid, true)
  ) ORDER BY constraints.conname), '[]'::jsonb) AS metadata
  FROM pg_constraint AS constraints
  WHERE constraints.conrelid = 'public.anexos'::regclass
),
check_canonico AS (
  SELECT jsonb_build_object(
    'name', constraints.conname,
    'type', constraints.contype,
    'definition', pg_get_constraintdef(constraints.oid, true)
  ) AS metadata
  FROM pg_constraint AS constraints
  WHERE constraints.conrelid = 'public.anexos'::regclass
    AND constraints.conname = 'anexos_tipo_cuadernillo_check'
    AND constraints.contype = 'c'
),
indices AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', indexes.indexname,
    'definition', indexes.indexdef
  ) ORDER BY indexes.indexname), '[]'::jsonb) AS metadata
  FROM pg_indexes AS indexes
  WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos'
),
rls AS (
  SELECT jsonb_build_object(
    'enabled', classes.relrowsecurity,
    'forced', classes.relforcerowsecurity
  ) AS estado
  FROM pg_class AS classes
  WHERE classes.oid = 'public.anexos'::regclass
),
policies_catalogo AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', policies.policyname,
    'permissive', policies.permissive,
    'roles', to_jsonb(policies.roles),
    'command', policies.cmd,
    'using', policies.qual,
    'with_check', policies.with_check
  ) ORDER BY policies.policyname, policies.cmd), '[]'::jsonb) AS metadata
  FROM pg_policies AS policies
  WHERE policies.schemaname = 'public' AND policies.tablename = 'anexos'
),
triggers_catalogo AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', triggers.tgname,
    'definition', pg_get_triggerdef(triggers.oid, true)
  ) ORDER BY triggers.tgname), '[]'::jsonb) AS metadata
  FROM pg_trigger AS triggers
  WHERE triggers.tgrelid = 'public.anexos'::regclass AND NOT triggers.tgisinternal
),
grants_catalogo AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'grantee', grants.grantee,
    'privilege_type', grants.privilege_type,
    'is_grantable', grants.is_grantable
  ) ORDER BY grants.grantee, grants.privilege_type), '[]'::jsonb) AS metadata
  FROM information_schema.role_table_grants AS grants
  WHERE grants.table_schema = 'public'
    AND grants.table_name = 'anexos'
    AND grants.grantee IN ('anon', 'authenticated')
)
SELECT
  'POSTMIGRATION PRODUCCION PASS' AS verdict,
  conteos.total_anexos,
  conteos.anexos_tipo_null,
  conteos.anexos_tipo_no_null,
  tipo_cuadernillo.existe AS tipo_cuadernillo_existe,
  tipo_cuadernillo.data_type AS tipo_cuadernillo_tipo,
  tipo_cuadernillo.udt_name AS tipo_cuadernillo_udt_name,
  tipo_cuadernillo.is_nullable AS tipo_cuadernillo_nullable,
  tipo_cuadernillo.column_default AS tipo_cuadernillo_default,
  contenido.contrato AS contenido_contrato,
  columnas.metadata AS columnas,
  constraints_catalogo.metadata AS constraints,
  check_canonico.metadata AS tipo_cuadernillo_check,
  indices.metadata AS indices,
  rls.estado AS rls,
  policies_catalogo.metadata AS policies,
  triggers_catalogo.metadata AS triggers,
  grants_catalogo.metadata AS grants
FROM conteos
CROSS JOIN tipo_cuadernillo
CROSS JOIN contenido
CROSS JOIN columnas
CROSS JOIN constraints_catalogo
CROSS JOIN check_canonico
CROSS JOIN indices
CROSS JOIN rls
CROSS JOIN policies_catalogo
CROSS JOIN triggers_catalogo
CROSS JOIN grants_catalogo;
