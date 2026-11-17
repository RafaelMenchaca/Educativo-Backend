-- Paquete 2B: prepara la persistencia de cuadernillos tipados.
-- NULL representa contenido historico v1 y no se realiza backfill.
-- Esta migracion no altera RLS, FKs ni unique_anexo_por_planeacion.

ALTER TABLE public.anexos
  ADD COLUMN IF NOT EXISTS tipo_cuadernillo text NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anexos_tipo_cuadernillo_check'
      AND conrelid = 'public.anexos'::regclass
  ) THEN
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
  END IF;
END
$migration$;
