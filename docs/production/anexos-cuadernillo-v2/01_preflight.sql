-- SOLO SUPABASE PRODUCCION.
-- Proyecto esperado: Educativo IA produccion.
-- Project ref esperado: bfnkaqmhcsyxdxoqnahk.
-- NO EJECUTAR EN TEST (gwdtlbisykzzplgzczzq).
-- Verificar visualmente el project ref en Supabase Dashboard antes de ejecutar.
-- PostgreSQL no expone de forma catalogal confiable el project ref de Supabase.
-- Preflight read-only y fail-closed: no crea, modifica ni elimina objetos o filas.

DO $preflight_produccion$
DECLARE
  target_table regclass := to_regclass('public.anexos');
  column_count integer;
  column_type text;
  column_nullable text;
  column_default text;
  type_column_attnum smallint;
  named_constraint_count integer;
  column_check_count integer := 0;
  check_expression text;
  normalized_check_expression text;
  invalid_type_count bigint := 0;
  expected_count integer;
  unexpected_count integer;
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: public.anexos no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
      AND cols.column_name = 'contenido' AND cols.data_type = 'jsonb'
      AND cols.is_nullable = 'NO' AND cols.column_default = '''{}''::jsonb'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: contenido no conserva jsonb NOT NULL DEFAULT';
  END IF;

  SELECT count(*), max(cols.data_type), max(cols.is_nullable), max(cols.column_default)
  INTO column_count, column_type, column_nullable, column_default
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
    AND cols.column_name = 'tipo_cuadernillo';

  IF column_count > 1 OR (column_count = 1 AND (
    column_type IS DISTINCT FROM 'text' OR column_nullable IS DISTINCT FROM 'YES'
    OR column_default IS NOT NULL
  )) THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: tipo_cuadernillo tiene contrato incompatible';
  END IF;

  IF column_count = 1 THEN
    SELECT attrs.attnum INTO type_column_attnum
    FROM pg_attribute AS attrs
    WHERE attrs.attrelid = target_table AND attrs.attname = 'tipo_cuadernillo'
      AND NOT attrs.attisdropped;

    SELECT count(*) INTO column_check_count
    FROM pg_constraint AS constraints
    WHERE constraints.conrelid = target_table AND constraints.contype = 'c'
      AND type_column_attnum = ANY (constraints.conkey);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conname = 'anexos_tipo_cuadernillo_check'
      AND constraints.conrelid <> target_table
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: constraint homonimo pertenece a otra tabla';
  END IF;

  SELECT count(*) INTO named_constraint_count
  FROM pg_constraint AS constraints
  WHERE constraints.conname = 'anexos_tipo_cuadernillo_check'
    AND constraints.conrelid = target_table;

  IF column_count = 0 AND (named_constraint_count <> 0 OR column_check_count <> 0) THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: existe CHECK sin columna compatible';
  END IF;
  IF column_count = 1 AND (named_constraint_count <> 1 OR column_check_count <> 1) THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: CHECK canonico ausente o duplicado';
  END IF;

  IF named_constraint_count = 1 THEN
    SELECT pg_get_expr(constraints.conbin, constraints.conrelid, true)
    INTO check_expression
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
    THEN
      RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: definicion del CHECK incompatible';
    END IF;

    SELECT count(*) INTO invalid_type_count
    FROM public.anexos AS a
    WHERE a.tipo_cuadernillo IS NOT NULL AND NOT (
      a.tipo_cuadernillo = ANY (ARRAY[
        'ejercicios_aplicacion', 'actividades_integradoras', 'aprendizaje_guiado'
      ]::text[])
    );
    IF invalid_type_count <> 0 THEN
      RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: existen tipos fuera de allowlist';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conrelid = target_table AND constraints.conname = 'anexos_pkey'
      AND constraints.contype = 'p'
      AND pg_get_constraintdef(constraints.oid, true) = 'PRIMARY KEY (id)'
  ) THEN RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: PK anexos_pkey incompatible'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class AS index_class
    JOIN pg_index AS index_meta ON index_meta.indexrelid = index_class.oid
    WHERE index_class.relname = 'unique_anexo_por_planeacion'
      AND index_meta.indrelid = target_table AND index_meta.indisunique
      AND index_meta.indnkeyatts = 1 AND index_meta.indkey[0] = (
        SELECT attrs.attnum FROM pg_attribute AS attrs
        WHERE attrs.attrelid = target_table AND attrs.attname = 'planeacion_id'
          AND NOT attrs.attisdropped
      )
  ) THEN RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: UNIQUE por planeacion_id incompatible'; END IF;

  SELECT count(*) INTO expected_count FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table AND constraints.contype = 'f'
    AND constraints.conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey', 'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey', 'educativo_ia_anexos_planeacion_owner_fkey'
    ]::text[]);
  SELECT count(*) INTO unexpected_count FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table AND constraints.contype = 'f'
    AND NOT (constraints.conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey', 'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey', 'educativo_ia_anexos_planeacion_owner_fkey'
    ]::text[]));
  IF expected_count <> 4 OR unexpected_count <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: conjunto de FKs incompatible';
  END IF;

  SELECT count(*) INTO expected_count FROM pg_indexes AS indexes
  WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos'
    AND indexes.indexname::text = ANY (ARRAY[
      'anexos_pkey', 'idx_anexos_batch_id', 'idx_anexos_planeacion_id',
      'idx_anexos_tema_id', 'idx_anexos_user_id', 'unique_anexo_por_planeacion'
    ]::text[]);
  SELECT count(*) INTO unexpected_count FROM pg_indexes AS indexes
  WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos'
    AND NOT (indexes.indexname::text = ANY (ARRAY[
      'anexos_pkey', 'idx_anexos_batch_id', 'idx_anexos_planeacion_id',
      'idx_anexos_tema_id', 'idx_anexos_user_id', 'unique_anexo_por_planeacion'
    ]::text[]));
  IF expected_count <> 6 OR unexpected_count <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: conjunto de indices incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class AS classes
    WHERE classes.oid = target_table AND classes.relrowsecurity AND NOT classes.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: estado RLS incompatible'; END IF;

  SELECT count(*) INTO expected_count FROM pg_policies AS policies
  WHERE policies.schemaname = 'public' AND policies.tablename = 'anexos'
    AND policies.roles = ARRAY['authenticated']::name[]
    AND (policies.policyname, policies.cmd) IN (
      ('Users can delete their own anexos', 'DELETE'),
      ('Users can insert their own anexos', 'INSERT'),
      ('Users can select their own anexos', 'SELECT'),
      ('Users can update their own anexos', 'UPDATE')
    );
  SELECT count(*) INTO unexpected_count FROM pg_policies AS policies
  WHERE policies.schemaname = 'public' AND policies.tablename = 'anexos'
    AND NOT (policies.roles = ARRAY['authenticated']::name[] AND
      (policies.policyname, policies.cmd) IN (
        ('Users can delete their own anexos', 'DELETE'),
        ('Users can insert their own anexos', 'INSERT'),
        ('Users can select their own anexos', 'SELECT'),
        ('Users can update their own anexos', 'UPDATE')
      ));
  IF expected_count <> 4 OR unexpected_count <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: policies incompatibles';
  END IF;

  IF (SELECT count(*) FROM pg_trigger AS triggers WHERE triggers.tgrelid = target_table AND NOT triggers.tgisinternal) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_trigger AS triggers WHERE triggers.tgrelid = target_table
      AND NOT triggers.tgisinternal AND triggers.tgname = 'set_anexos_updated_at')
  THEN RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: triggers incompatibles'; END IF;

  SELECT count(*) INTO expected_count FROM information_schema.role_table_grants AS grants
  WHERE grants.table_schema = 'public' AND grants.table_name = 'anexos'
    AND grants.grantee = 'authenticated'
    AND grants.privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]);
  SELECT count(*) INTO unexpected_count FROM information_schema.role_table_grants AS grants
  WHERE grants.table_schema = 'public' AND grants.table_name = 'anexos'
    AND grants.grantee IN ('anon', 'authenticated')
    AND NOT (grants.grantee = 'authenticated' AND
      grants.privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]));
  IF expected_count <> 4 OR unexpected_count <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT PRODUCCION FAIL: grants incompatibles';
  END IF;
END
$preflight_produccion$;

SELECT count(*)::bigint AS total_anexos,
  count(*) FILTER (WHERE to_jsonb(a)->>'tipo_cuadernillo' IS NULL)::bigint AS anexos_tipo_null,
  count(*) FILTER (WHERE to_jsonb(a)->>'tipo_cuadernillo' IS NOT NULL)::bigint AS anexos_tipo_no_null
FROM public.anexos AS a;
SELECT ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'anexos' ORDER BY ordinal_position;
SELECT conname, contype, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint WHERE conrelid = 'public.anexos'::regclass ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'anexos' ORDER BY indexname;
SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced FROM pg_class WHERE oid = 'public.anexos'::regclass;
SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'anexos' ORDER BY policyname;
SELECT tgname, pg_get_triggerdef(oid, true) AS definition FROM pg_trigger
WHERE tgrelid = 'public.anexos'::regclass AND NOT tgisinternal ORDER BY tgname;
SELECT grantee, privilege_type, is_grantable FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'anexos' AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;
SELECT 'PREFLIGHT PRODUCCION PASS' AS verdict;
