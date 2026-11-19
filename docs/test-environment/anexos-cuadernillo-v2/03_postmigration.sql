-- SOLO SUPABASE TEST: educativo-backend-test / gwdtlbisykzzplgzczzq.
-- Postmigration read-only y fail-closed.

DO $postmigration$
DECLARE
  target_table regclass := to_regclass('public.anexos');
  matching_column_count integer;
  type_column_attnum smallint;
  check_count integer;
  column_check_count integer;
  check_expression text;
  normalized_check_expression text;
  total_anexos bigint;
  null_types bigint;
  non_null_types bigint;
  expected_fk_count integer;
  unexpected_fk_count integer;
  expected_index_count integer;
  unexpected_index_count integer;
  expected_policy_count integer;
  unexpected_policy_count integer;
  expected_grant_count integer;
  unexpected_grant_count integer;
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: public.anexos no existe';
  END IF;

  SELECT count(*)
  INTO matching_column_count
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public'
    AND cols.table_name = 'anexos'
    AND cols.column_name = 'tipo_cuadernillo'
    AND cols.data_type = 'text'
    AND cols.is_nullable = 'YES'
    AND cols.column_default IS NULL;

  IF matching_column_count <> 1 THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: columna tipo_cuadernillo incompatible o ausente';
  END IF;

  SELECT attrs.attnum
  INTO type_column_attnum
  FROM pg_attribute AS attrs
  WHERE attrs.attrelid = target_table
    AND attrs.attname = 'tipo_cuadernillo'
    AND NOT attrs.attisdropped;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = 'anexos'
      AND cols.column_name = 'contenido'
      AND cols.data_type = 'jsonb'
      AND cols.is_nullable = 'NO'
      AND cols.column_default = '''{}''::jsonb'
  ) THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: contenido cambio su contrato jsonb';
  END IF;

  SELECT count(*)
  INTO check_count
  FROM pg_constraint
  WHERE conname = 'anexos_tipo_cuadernillo_check'
    AND conrelid = target_table
    AND contype = 'c';

  SELECT count(*)
  INTO column_check_count
  FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table
    AND constraints.contype = 'c'
    AND type_column_attnum = ANY (constraints.conkey);

  IF check_count <> 1 OR column_check_count <> 1 THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: CHECK canonico ausente o duplicado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anexos_tipo_cuadernillo_check'
      AND conrelid <> target_table
  ) THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: existe constraint homonimo en otra tabla';
  END IF;

  SELECT pg_get_expr(conbin, conrelid, true)
  INTO check_expression
  FROM pg_constraint AS constraints
  WHERE constraints.conname = 'anexos_tipo_cuadernillo_check'
    AND constraints.conrelid = target_table
    AND constraints.contype = 'c'
    AND constraints.conkey = ARRAY[type_column_attnum]::smallint[];

  normalized_check_expression := regexp_replace(
    regexp_replace(lower(check_expression), '::text\[\]|::text', '', 'g'),
    '[[:space:]()]', '', 'g'
  );

  IF normalized_check_expression IS DISTINCT FROM
    'tipo_cuadernilloisnullortipo_cuadernillo=anyarray[''ejercicios_aplicacion'',''actividades_integradoras'',''aprendizaje_guiado'']'
  THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: definicion del CHECK incompatible';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE tipo_cuadernillo IS NULL),
    count(*) FILTER (WHERE tipo_cuadernillo IS NOT NULL)
  INTO total_anexos, null_types, non_null_types
  FROM public.anexos;

  IF non_null_types <> 0 OR null_types <> total_anexos THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: los historicos no permanecen completamente NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = target_table
      AND conname = 'anexos_pkey'
      AND contype = 'p'
      AND pg_get_constraintdef(oid, true) = 'PRIMARY KEY (id)'
  ) THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: PK anexos_pkey cambio';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class index_class
    JOIN pg_index index_meta ON index_meta.indexrelid = index_class.oid
    WHERE index_class.relname = 'unique_anexo_por_planeacion'
      AND index_meta.indrelid = target_table
      AND index_meta.indisunique
      AND index_meta.indnkeyatts = 1
      AND index_meta.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = target_table AND attname = 'planeacion_id' AND NOT attisdropped
      )
  ) THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: UNIQUE por planeacion_id cambio';
  END IF;

  SELECT count(*)
  INTO expected_fk_count
  FROM pg_constraint
  WHERE conrelid = target_table
    AND contype = 'f'
    AND conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey',
      'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey',
      'educativo_ia_anexos_planeacion_owner_fkey'
    ]::text[]);

  SELECT count(*)
  INTO unexpected_fk_count
  FROM pg_constraint
  WHERE conrelid = target_table
    AND contype = 'f'
    AND NOT (conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey',
      'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey',
      'educativo_ia_anexos_planeacion_owner_fkey'
    ]::text[]));

  IF expected_fk_count <> 4 OR unexpected_fk_count <> 0 THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: conjunto de FKs cambio';
  END IF;

  SELECT count(*)
  INTO expected_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'anexos'
    AND indexname::text = ANY (ARRAY[
      'anexos_pkey',
      'idx_anexos_batch_id',
      'idx_anexos_planeacion_id',
      'idx_anexos_tema_id',
      'idx_anexos_user_id',
      'unique_anexo_por_planeacion'
    ]::text[]);

  SELECT count(*)
  INTO unexpected_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'anexos'
    AND NOT (indexname::text = ANY (ARRAY[
      'anexos_pkey',
      'idx_anexos_batch_id',
      'idx_anexos_planeacion_id',
      'idx_anexos_tema_id',
      'idx_anexos_user_id',
      'unique_anexo_por_planeacion'
    ]::text[]));

  IF expected_index_count <> 6 OR unexpected_index_count <> 0 THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: conjunto de indices cambio';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = target_table AND relrowsecurity AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: estado RLS cambio';
  END IF;

  SELECT count(*)
  INTO expected_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'anexos'
    AND roles = ARRAY['authenticated']::name[]
    AND (policyname, cmd) IN (
      ('Users can delete their own anexos', 'DELETE'),
      ('Users can insert their own anexos', 'INSERT'),
      ('Users can select their own anexos', 'SELECT'),
      ('Users can update their own anexos', 'UPDATE')
    );

  SELECT count(*)
  INTO unexpected_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'anexos'
    AND NOT (
      roles = ARRAY['authenticated']::name[]
      AND (policyname, cmd) IN (
        ('Users can delete their own anexos', 'DELETE'),
        ('Users can insert their own anexos', 'INSERT'),
        ('Users can select their own anexos', 'SELECT'),
        ('Users can update their own anexos', 'UPDATE')
      )
    );

  IF expected_policy_count <> 4 OR unexpected_policy_count <> 0 THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: policies cambiaron';
  END IF;

  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = target_table AND NOT tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = target_table AND NOT tgisinternal AND tgname = 'set_anexos_updated_at'
    )
  THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: triggers cambiaron';
  END IF;

  SELECT count(*)
  INTO expected_grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'anexos'
    AND grantee = 'authenticated'
    AND privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]);

  SELECT count(*)
  INTO unexpected_grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'anexos'
    AND grantee IN ('anon', 'authenticated')
    AND NOT (
      grantee = 'authenticated'
      AND privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
    );

  IF expected_grant_count <> 4 OR unexpected_grant_count <> 0 THEN
    RAISE EXCEPTION 'POSTMIGRATION FAIL: grants de runtime cambiaron';
  END IF;
END
$postmigration$;

SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'anexos' AND column_name = 'tipo_cuadernillo';

SELECT conname, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid = 'public.anexos'::regclass
  AND contype = 'c'
  AND pg_get_expr(conbin, conrelid, true) ILIKE '%tipo_cuadernillo%';

SELECT
  count(*)::bigint AS total_anexos,
  count(*) FILTER (WHERE tipo_cuadernillo IS NULL)::bigint AS anexos_tipo_null,
  count(*) FILTER (WHERE tipo_cuadernillo IS NOT NULL)::bigint AS anexos_tipo_no_null
FROM public.anexos;

SELECT ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'anexos'
ORDER BY ordinal_position;

SELECT conname AS constraint_name, contype AS constraint_type, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid = 'public.anexos'::regclass
ORDER BY conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'anexos'
ORDER BY indexname;

SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid = 'public.anexos'::regclass;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'anexos'
ORDER BY policyname;

SELECT tgname AS trigger_name, pg_get_triggerdef(oid, true) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.anexos'::regclass AND NOT tgisinternal
ORDER BY tgname;

SELECT grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'anexos'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

SELECT 'POSTMIGRATION PASS' AS verdict;
