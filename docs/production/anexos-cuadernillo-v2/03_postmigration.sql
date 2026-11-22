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

SELECT count(*)::bigint AS total_anexos,
  count(*) FILTER (WHERE tipo_cuadernillo IS NULL)::bigint AS anexos_tipo_null,
  count(*) FILTER (WHERE tipo_cuadernillo IS NOT NULL)::bigint AS anexos_tipo_no_null
FROM public.anexos;
-- Comparar manualmente total_anexos y la metadata de columnas con la evidencia
-- guardada del preflight; archivos separados no comparten estado.
SELECT ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'anexos'
ORDER BY ordinal_position;
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'anexos'
  AND column_name = 'tipo_cuadernillo';
SELECT conname, pg_get_constraintdef(oid, true) AS definition FROM pg_constraint
WHERE conrelid = 'public.anexos'::regclass AND contype = 'c'
  AND pg_get_expr(conbin, conrelid, true) ILIKE '%tipo_cuadernillo%';
SELECT 'POSTMIGRATION PRODUCCION PASS' AS verdict;
