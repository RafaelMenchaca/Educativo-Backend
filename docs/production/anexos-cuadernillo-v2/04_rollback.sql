-- SOLO SUPABASE PRODUCCION.
-- DESTRUCTIVO DE ESQUEMA.
-- NO EJECUTAR SIN AUTORIZACION EXPRESA.
-- NO EJECUTAR COMO PASO NORMAL.
-- Proyecto esperado: Educativo IA produccion.
-- Project ref esperado: bfnkaqmhcsyxdxoqnahk.
-- NO EJECUTAR EN TEST (gwdtlbisykzzplgzczzq).
-- Verificar visualmente el project ref en Supabase Dashboard antes de ejecutar.

BEGIN;

DO $rollback_gate_produccion$
DECLARE
  target_table regclass := to_regclass('public.anexos');
  column_exists boolean;
  constraint_exists boolean;
BEGIN
  IF target_table IS NULL THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: public.anexos no existe'; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
      AND cols.column_name = 'tipo_cuadernillo') INTO column_exists;
  SELECT EXISTS (SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conname = 'anexos_tipo_cuadernillo_check'
      AND constraints.conrelid = target_table) INTO constraint_exists;

  IF NOT column_exists AND constraint_exists THEN
    RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: CHECK existe sin columna';
  END IF;
  IF column_exists AND EXISTS (SELECT 1 FROM public.anexos AS a WHERE a.tipo_cuadernillo IS NOT NULL) THEN
    RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: existen tipos no NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.anexos AS a
    WHERE a.contenido->>'schema_version' = '2' OR a.contenido ? 'secciones') THEN
    RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: existen contenidos v2';
  END IF;
END
$rollback_gate_produccion$;

ALTER TABLE public.anexos DROP CONSTRAINT IF EXISTS anexos_tipo_cuadernillo_check;
ALTER TABLE public.anexos DROP COLUMN IF EXISTS tipo_cuadernillo;

DO $rollback_verify_produccion$
DECLARE
  target_table regclass := 'public.anexos'::regclass;
  expected_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
      AND cols.column_name = 'tipo_cuadernillo')
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: columna continua presente'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conname = 'anexos_tipo_cuadernillo_check' AND constraints.conrelid = target_table)
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: CHECK continua presente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns AS cols
    WHERE cols.table_schema = 'public' AND cols.table_name = 'anexos'
      AND cols.column_name = 'contenido' AND cols.data_type = 'jsonb'
      AND cols.is_nullable = 'NO' AND cols.column_default = '''{}''::jsonb')
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: contenido cambio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint AS constraints
    WHERE constraints.conrelid = target_table AND constraints.conname = 'anexos_pkey'
      AND constraints.contype = 'p')
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: PK cambio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class AS index_class JOIN pg_index AS index_meta
    ON index_meta.indexrelid = index_class.oid
    WHERE index_class.relname = 'unique_anexo_por_planeacion'
      AND index_meta.indrelid = target_table AND index_meta.indisunique)
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: UNIQUE cambio'; END IF;
  SELECT count(*) INTO expected_count FROM pg_constraint AS constraints
  WHERE constraints.conrelid = target_table AND constraints.contype = 'f'
    AND constraints.conname::text = ANY (ARRAY['anexos_planeacion_id_fkey', 'anexos_user_id_fkey',
      'educativo_ia_anexos_batch_owner_fkey', 'educativo_ia_anexos_planeacion_owner_fkey']::text[]);
  IF expected_count <> 4 OR (SELECT count(*) FROM pg_constraint AS constraints
    WHERE constraints.conrelid = target_table AND constraints.contype = 'f') <> 4
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: FKs cambiaron'; END IF;
  SELECT count(*) INTO expected_count FROM pg_indexes AS indexes
  WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos'
    AND indexes.indexname::text = ANY (ARRAY['anexos_pkey', 'idx_anexos_batch_id',
      'idx_anexos_planeacion_id', 'idx_anexos_tema_id', 'idx_anexos_user_id',
      'unique_anexo_por_planeacion']::text[]);
  IF expected_count <> 6 OR (SELECT count(*) FROM pg_indexes AS indexes
    WHERE indexes.schemaname = 'public' AND indexes.tablename = 'anexos') <> 6
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: indices cambiaron'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class AS classes WHERE classes.oid = target_table
    AND classes.relrowsecurity AND NOT classes.relforcerowsecurity)
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: RLS cambio'; END IF;
  IF (SELECT count(*) FROM pg_policies AS policies
    WHERE policies.schemaname = 'public' AND policies.tablename = 'anexos'
      AND policies.roles = ARRAY['authenticated']::name[]) <> 4
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: policies cambiaron'; END IF;
  IF (SELECT count(*) FROM pg_trigger AS triggers
    WHERE triggers.tgrelid = target_table AND NOT triggers.tgisinternal) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_trigger AS triggers WHERE triggers.tgrelid = target_table
      AND NOT triggers.tgisinternal AND triggers.tgname = 'set_anexos_updated_at')
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: triggers cambiaron'; END IF;
  IF (SELECT count(*) FROM information_schema.role_table_grants AS grants
    WHERE grants.table_schema = 'public' AND grants.table_name = 'anexos'
      AND grants.grantee = 'authenticated'
      AND grants.privilege_type = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])) <> 4
    OR EXISTS (SELECT 1 FROM information_schema.role_table_grants AS grants
      WHERE grants.table_schema = 'public' AND grants.table_name = 'anexos' AND grants.grantee = 'anon')
  THEN RAISE EXCEPTION 'ROLLBACK PRODUCCION FAIL: grants cambiaron'; END IF;
END
$rollback_verify_produccion$;

COMMIT;
