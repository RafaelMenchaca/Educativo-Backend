-- SOLO SUPABASE TEST: educativo-backend-test / gwdtlbisykzzplgzczzq.
-- Agrega exclusivamente la columna canonica y su CHECK allowlisted.

BEGIN;

DO $migration_gate$
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
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAIL: public.anexos no existe';
  END IF;

  SELECT count(*), max(cols.data_type), max(cols.is_nullable), max(cols.column_default)
  INTO column_count, column_type, column_nullable, column_default
  FROM information_schema.columns AS cols
  WHERE cols.table_schema = 'public'
    AND cols.table_name = 'anexos'
    AND cols.column_name = 'tipo_cuadernillo';

  IF column_count > 1 OR (
    column_count = 1 AND (
      column_type IS DISTINCT FROM 'text'
      OR column_nullable IS DISTINCT FROM 'YES'
      OR column_default IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAIL: tipo_cuadernillo tiene contrato incompatible';
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
    RAISE EXCEPTION 'MIGRATION FAIL: constraint homonimo pertenece a otra tabla';
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

  IF named_constraint_count > 1 OR column_check_count > 1 THEN
    RAISE EXCEPTION 'MIGRATION FAIL: existen CHECK duplicados para tipo_cuadernillo';
  END IF;

  IF column_check_count = 1 AND named_constraint_count <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAIL: existe un CHECK no canonico para tipo_cuadernillo';
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
      RAISE EXCEPTION 'MIGRATION FAIL: constraint homonimo tiene definicion incompatible';
    END IF;
  END IF;
END
$migration_gate$;

ALTER TABLE public.anexos
  ADD COLUMN IF NOT EXISTS tipo_cuadernillo text NULL;

DO $migration_constraint$
DECLARE
  target_table regclass := 'public.anexos'::regclass;
  named_constraint_count integer;
BEGIN
  SELECT count(*)
  INTO named_constraint_count
  FROM pg_constraint
  WHERE conname = 'anexos_tipo_cuadernillo_check'
    AND conrelid = target_table;

  IF named_constraint_count = 0 THEN
    ALTER TABLE public.anexos
      ADD CONSTRAINT anexos_tipo_cuadernillo_check
      CHECK (
        tipo_cuadernillo IS NULL
        OR tipo_cuadernillo IN (
          'ejercicios_aplicacion',
          'actividades_integradoras',
          'aprendizaje_guiado'
        )
      );
  ELSIF named_constraint_count <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAIL: cantidad inesperada del CHECK canonico';
  END IF;
END
$migration_constraint$;

COMMIT;
