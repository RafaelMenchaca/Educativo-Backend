-- SOLO SUPABASE TEST.
-- NO EJECUTAR EN PRODUCCION.
-- EJECUTAR UNICAMENTE CON AUTORIZACION EXPRESA.
-- Contingencia manual: este archivo no forma parte del flujo rutinario.

BEGIN;

DO $rollback_gate$
DECLARE
  target_table regclass := to_regclass('public.anexos');
  non_null_type_count bigint;
  v2_content_count bigint;
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: public.anexos no existe';
  END IF;

  SELECT count(*)
  INTO non_null_type_count
  FROM public.anexos AS a
  WHERE to_jsonb(a)->>'tipo_cuadernillo' IS NOT NULL;

  IF non_null_type_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: existen anexos con tipo_cuadernillo no NULL';
  END IF;

  SELECT count(*)
  INTO v2_content_count
  FROM public.anexos
  WHERE contenido->>'schema_version' = '2'
     OR contenido ? 'secciones';

  IF v2_content_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: contenido contiene estructura v2';
  END IF;
END
$rollback_gate$;

ALTER TABLE public.anexos
  DROP CONSTRAINT IF EXISTS anexos_tipo_cuadernillo_check;

ALTER TABLE public.anexos
  DROP COLUMN IF EXISTS tipo_cuadernillo;

DO $rollback_verify$
DECLARE
  target_table regclass := 'public.anexos'::regclass;
  expected_fk_count integer;
  expected_index_count integer;
  expected_policy_count integer;
  expected_grant_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = 'anexos'
      AND cols.column_name = 'tipo_cuadernillo'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: tipo_cuadernillo continua presente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anexos_tipo_cuadernillo_check'
      AND conrelid = target_table
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: CHECK canonico continua presente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = 'anexos'
      AND cols.column_name = 'contenido'
      AND cols.data_type = 'jsonb'
      AND cols.is_nullable = 'NO'
      AND cols.column_default = '''{}''::jsonb'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: contenido cambio su contrato';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = target_table
      AND conname = 'anexos_pkey'
      AND contype = 'p'
      AND pg_get_constraintdef(oid, true) = 'PRIMARY KEY (id)'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: PK cambio';
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
    RAISE EXCEPTION 'ROLLBACK FAIL: UNIQUE por planeacion_id cambio';
  END IF;

  SELECT count(*) INTO expected_fk_count
  FROM pg_constraint
  WHERE conrelid = target_table
    AND contype = 'f'
    AND conname::text = ANY (ARRAY[
      'anexos_planeacion_id_fkey',
      'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey',
      'educativo_ia_anexos_planeacion_owner_fkey'
    ]::text[]);

  IF expected_fk_count <> 4 OR (SELECT count(*) FROM pg_constraint WHERE conrelid = target_table AND contype = 'f') <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: FKs cambiaron';
  END IF;

  SELECT count(*) INTO expected_index_count
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

  IF expected_index_count <> 6 OR (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'anexos') <> 6 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: indices cambiaron';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = target_table AND relrowsecurity AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: estado RLS cambio';
  END IF;

  SELECT count(*) INTO expected_policy_count
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

  IF expected_policy_count <> 4 OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anexos') <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: policies cambiaron';
  END IF;

  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = target_table AND NOT tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = target_table AND NOT tgisinternal AND tgname = 'set_anexos_updated_at'
    )
  THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: triggers cambiaron';
  END IF;

  SELECT count(*) INTO expected_grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'anexos'
    AND grantee = 'authenticated'
    AND privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]);

  IF expected_grant_count <> 4 OR EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'anexos'
      AND grantee IN ('anon', 'authenticated')
      AND NOT (
        grantee = 'authenticated'
        AND privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
      )
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAIL: grants cambiaron';
  END IF;
END
$rollback_verify$;

COMMIT;
