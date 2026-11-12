-- Educativo IA 03D3A: rollback productivo manual y transaccional.
-- Ejecutar solo por autorizacion explicita ante fallo confirmado de 03D3A.
BEGIN;

LOCK TABLE public.anexos, public.examen_generation_items,
  public.examen_generation_jobs, public.examenes, public.listas_cotejo,
  public.planeacion_batches, public.planeaciones, public.unidades
  IN ACCESS EXCLUSIVE MODE;

WITH expected(name,table_name,type,definition) AS (VALUES
 ('educativo_ia_planeacion_batches_id_user_key','planeacion_batches','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_id_user_key','planeaciones','u','UNIQUE (id, user_id)'),
 ('educativo_ia_unidades_id_user_key','unidades','u','UNIQUE (id, user_id)'),
 ('educativo_ia_examen_jobs_id_user_key','examen_generation_jobs','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_batch_owner_present','planeaciones','c','CHECK (batch_id IS NULL OR user_id IS NOT NULL)'),
 ('educativo_ia_planeaciones_batch_owner_fkey','planeaciones','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_anexos_planeacion_owner_fkey','anexos','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_anexos_batch_owner_fkey','anexos','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_listas_planeacion_owner_fkey','listas_cotejo','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_listas_batch_owner_fkey','listas_cotejo','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examenes_unidad_owner_fkey','examenes','f','FOREIGN KEY (unidad_id, user_id) REFERENCES unidades(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_examenes_batch_owner_fkey','examenes','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examen_items_job_owner_fkey','examen_generation_items','f','FOREIGN KEY (job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE CASCADE'),
 ('educativo_ia_examenes_generation_job_owner_fkey','examenes','f','FOREIGN KEY (generation_job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE SET NULL (generation_job_id)')
), actual AS (
 SELECT c.conname::text name,t.relname::text table_name,c.contype::text type,c.convalidated,
   pg_catalog.pg_get_constraintdef(c.oid,true) definition
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
), gate AS (
 SELECT
  (SELECT count(*) FROM expected e JOIN actual a USING(name,table_name,type,definition) WHERE a.convalidated)=14 AS exact_installation,
  NOT EXISTS(SELECT 1 FROM actual a WHERE a.name LIKE 'educativo_ia_%' AND a.name NOT IN (SELECT name FROM expected)
    AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades')) AS no_unexpected_constraints
)
SELECT 1 / CASE WHEN exact_installation AND no_unexpected_constraints THEN 1 ELSE 0 END AS rollback_baseline_gate FROM gate;

ALTER TABLE public.examenes DROP CONSTRAINT educativo_ia_examenes_generation_job_owner_fkey;
ALTER TABLE public.examen_generation_items DROP CONSTRAINT educativo_ia_examen_items_job_owner_fkey;
ALTER TABLE public.examenes DROP CONSTRAINT educativo_ia_examenes_batch_owner_fkey;
ALTER TABLE public.examenes DROP CONSTRAINT educativo_ia_examenes_unidad_owner_fkey;
ALTER TABLE public.listas_cotejo DROP CONSTRAINT educativo_ia_listas_batch_owner_fkey;
ALTER TABLE public.listas_cotejo DROP CONSTRAINT educativo_ia_listas_planeacion_owner_fkey;
ALTER TABLE public.anexos DROP CONSTRAINT educativo_ia_anexos_batch_owner_fkey;
ALTER TABLE public.anexos DROP CONSTRAINT educativo_ia_anexos_planeacion_owner_fkey;
ALTER TABLE public.planeaciones DROP CONSTRAINT educativo_ia_planeaciones_batch_owner_fkey;
ALTER TABLE public.planeaciones DROP CONSTRAINT educativo_ia_planeaciones_batch_owner_present;
ALTER TABLE public.examen_generation_jobs DROP CONSTRAINT educativo_ia_examen_jobs_id_user_key;
ALTER TABLE public.unidades DROP CONSTRAINT educativo_ia_unidades_id_user_key;
ALTER TABLE public.planeaciones DROP CONSTRAINT educativo_ia_planeaciones_id_user_key;
ALTER TABLE public.planeacion_batches DROP CONSTRAINT educativo_ia_planeacion_batches_id_user_key;

COMMIT;
