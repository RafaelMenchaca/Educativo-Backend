-- SOLO SUPABASE TEST: educativo-backend-test / gwdtlbisykzzplgzczzq.
-- Produccion bfnkaqmhcsyxdxoqnahk esta prohibida.
-- Preflight read-only: no crea, modifica ni elimina objetos o filas.

DO $preflight$
DECLARE
  target_table regclass := to_regclass('public.anexos');
  column_count integer;
  column_type text;
  column_nullable text;
  column_default text;
  type_column_attnum smallint;
  named_constraint_count integer;
  foreign_named_constraint_count integer;
  column_check_count integer;
  check_expression text;
  normalized_check_expression text;
  invalid_type_count bigint;
  expected_policy_count integer;
  unexpected_policy_count integer;
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: public.anexos no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = 'anexos'
      AND cols.column_name = 'contenido'
      AND cols.data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: contenido no es jsonb';
  END IF;

  SELECT count(*), max(cols.data_type), max(cols.is_nullable), max(cols.column_default)
  INTO column_count, column_type, column_nullable, column_default
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public'
    AND cols.table_name = 'anexos'
    AND cols.column_name = 'tipo_cuadernillo';

  IF column_count > 1 THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: tipo_cuadernillo aparece mas de una vez';
  END IF;

  IF column_count = 1 AND (
    column_type IS DISTINCT FROM 'text'
    OR column_nullable IS DISTINCT FROM 'YES'
    OR column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: tipo_cuadernillo tiene contrato incompatible';
  END IF;

  IF column_count = 1 THEN
    SELECT attrs.attnum
    INTO type_column_attnum
    FROM pg_attribute AS attrs
    WHERE attrs.attrelid = target_table
      AND attrs.attname = 'tipo_cuadernillo'
      AND NOT attrs.attisdropped;
  END IF;

  SELECT count(*)
  INTO foreign_named_constraint_count
  FROM pg_constraint
  WHERE conname = 'anexos_tipo_cuadernillo_check'
    AND conrelid <> target_table;

  IF foreign_named_constraint_count <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: constraint homonimo pertenece a otra tabla';
  END IF;

  SELECT count(*)
  INTO named_constraint_count
  FROM pg_constraint
  WHERE conname = 'anexos_tipo_cuadernillo_check'
    AND conrelid = target_table;

  SELECT count(*)
  INTO column_check_count
  FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table
    AND constraints.contype = 'c'
    AND type_column_attnum = ANY (constraints.conkey);

  IF column_count = 0 AND (named_constraint_count <> 0 OR column_check_count <> 0) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: existe CHECK de tipo sin columna compatible';
  END IF;

  IF column_count = 1 AND (named_constraint_count <> 1 OR column_check_count <> 1) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: falta el CHECK canonico o existen CHECK duplicados';
  END IF;

  IF named_constraint_count = 1 THEN
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
      RAISE EXCEPTION 'PREFLIGHT FAIL: definicion del CHECK incompatible';
    END IF;
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
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = target_table
          AND attname = 'planeacion_id'
          AND NOT attisdropped
      )
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: unique_anexo_por_planeacion no es el UNIQUE esperado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = target_table
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: RLS no esta habilitado en public.anexos';
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
    RAISE EXCEPTION 'PREFLIGHT FAIL: policies de public.anexos no coinciden con la linea base';
  END IF;

  IF column_count = 1 THEN
    SELECT count(*)
    INTO invalid_type_count
    FROM public.anexos AS a
    WHERE to_jsonb(a)->>'tipo_cuadernillo' IS NOT NULL
      AND NOT (
        to_jsonb(a)->>'tipo_cuadernillo' = ANY (
          ARRAY['ejercicios_aplicacion', 'actividades_integradoras', 'aprendizaje_guiado']::text[]
        )
      );
    IF invalid_type_count <> 0 THEN
      RAISE EXCEPTION 'PREFLIGHT FAIL: existen tipos historicos fuera de allowlist';
    END IF;
  END IF;
END
$preflight$;

SELECT
  count(*)::bigint AS total_anexos,
  count(*) FILTER (WHERE to_jsonb(a)->>'tipo_cuadernillo' IS NULL)::bigint AS anexos_tipo_null,
  count(*) FILTER (WHERE to_jsonb(a)->>'tipo_cuadernillo' IS NOT NULL)::bigint AS anexos_tipo_no_null
FROM public.anexos AS a;

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

SELECT 'PREFLIGHT PASS' AS verdict;
