-- Educativo IA 03D3A: migracion productiva transaccional.
-- Requiere autorizacion separada y preflight productivo apt_to_apply=true.
-- Confirmar visualmente proyecto educativo-backend / bfnkaqmhcsyxdxoqnahk.
BEGIN;

LOCK TABLE public.anexos, public.examen_generation_items,
  public.examen_generation_jobs, public.examenes, public.listas_cotejo,
  public.planeacion_batches, public.planeaciones, public.unidades
  IN ACCESS EXCLUSIVE MODE;

WITH
expected_columns(table_name,column_name,data_type,is_nullable) AS (VALUES
 ('planeacion_batches','id','uuid',false),('planeacion_batches','user_id','uuid',false),
 ('planeaciones','id','bigint',false),('planeaciones','user_id','uuid',true),('planeaciones','batch_id','uuid',true),
 ('anexos','planeacion_id','bigint',false),('anexos','user_id','uuid',false),('anexos','batch_id','uuid',true),
 ('listas_cotejo','planeacion_id','bigint',false),('listas_cotejo','user_id','uuid',false),('listas_cotejo','batch_id','uuid',true),
 ('unidades','id','uuid',false),('unidades','user_id','uuid',false),
 ('examenes','user_id','uuid',false),('examenes','unidad_id','uuid',false),('examenes','batch_id','uuid',true),('examenes','generation_job_id','uuid',true),
 ('examen_generation_jobs','id','uuid',false),('examen_generation_jobs','user_id','uuid',false),
 ('examen_generation_items','job_id','uuid',false),('examen_generation_items','user_id','uuid',false)
),
expected_baseline(name,table_name,type,definition) AS (VALUES
 ('planeacion_batches_pkey','planeacion_batches','p','PRIMARY KEY (id)'),
 ('planeaciones_pkey','planeaciones','p','PRIMARY KEY (id)'),
 ('unidades_pkey','unidades','p','PRIMARY KEY (id)'),
 ('examen_generation_jobs_pkey','examen_generation_jobs','p','PRIMARY KEY (id)'),
 ('planeaciones_batch_id_fkey','planeaciones','f','FOREIGN KEY (batch_id) REFERENCES planeacion_batches(id) ON DELETE SET NULL'),
 ('anexos_planeacion_id_fkey','anexos','f','FOREIGN KEY (planeacion_id) REFERENCES planeaciones(id) ON DELETE CASCADE'),
 ('listas_cotejo_planeacion_id_fkey','listas_cotejo','f','FOREIGN KEY (planeacion_id) REFERENCES planeaciones(id) ON DELETE CASCADE'),
 ('listas_cotejo_batch_id_fkey','listas_cotejo','f','FOREIGN KEY (batch_id) REFERENCES planeacion_batches(id) ON DELETE SET NULL'),
 ('examenes_unidad_id_fkey','examenes','f','FOREIGN KEY (unidad_id) REFERENCES unidades(id) ON DELETE CASCADE'),
 ('examenes_batch_id_fkey','examenes','f','FOREIGN KEY (batch_id) REFERENCES planeacion_batches(id) ON DELETE SET NULL'),
 ('examen_generation_items_job_id_fkey','examen_generation_items','f','FOREIGN KEY (job_id) REFERENCES examen_generation_jobs(id) ON DELETE CASCADE'),
 ('examenes_generation_job_id_fkey','examenes','f','FOREIGN KEY (generation_job_id) REFERENCES examen_generation_jobs(id) ON DELETE SET NULL')
),
target_constraints(name) AS (VALUES
 ('educativo_ia_planeacion_batches_id_user_key'),('educativo_ia_planeaciones_id_user_key'),
 ('educativo_ia_unidades_id_user_key'),('educativo_ia_examen_jobs_id_user_key'),
 ('educativo_ia_planeaciones_batch_owner_present'),('educativo_ia_planeaciones_batch_owner_fkey'),
 ('educativo_ia_anexos_planeacion_owner_fkey'),('educativo_ia_anexos_batch_owner_fkey'),
 ('educativo_ia_listas_planeacion_owner_fkey'),('educativo_ia_listas_batch_owner_fkey'),
 ('educativo_ia_examenes_unidad_owner_fkey'),('educativo_ia_examenes_batch_owner_fkey'),
 ('educativo_ia_examen_items_job_owner_fkey'),('educativo_ia_examenes_generation_job_owner_fkey')
),
relevant_child_columns(table_name,column_name) AS (VALUES
 ('planeaciones','batch_id'),('anexos','planeacion_id'),('anexos','batch_id'),
 ('listas_cotejo','planeacion_id'),('listas_cotejo','batch_id'),('examenes','unidad_id'),
 ('examenes','batch_id'),('examen_generation_items','job_id'),('examenes','generation_job_id')
),
actual_columns AS (
 SELECT t.relname::text table_name,a.attname::text column_name,
   pg_catalog.format_type(a.atttypid,a.atttypmod) data_type,NOT a.attnotnull is_nullable
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
),
actual_baseline AS (
 SELECT c.conname::text name,t.relname::text table_name,c.contype::text type,c.convalidated,
   pg_catalog.pg_get_constraintdef(c.oid,true) definition
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
),
catalog_gate AS (
 SELECT
  (SELECT count(*) FROM expected_columns e JOIN actual_columns a USING(table_name,column_name,data_type,is_nullable))=21 AS columns_exact,
  (SELECT count(*) FROM expected_baseline e JOIN actual_baseline a USING(name,table_name,type,definition) WHERE a.convalidated)=12 AS baseline_exact,
  NOT EXISTS(SELECT 1 FROM actual_baseline a JOIN target_constraints t USING(name)) AS target_absent,
  NOT EXISTS(
    SELECT 1 FROM actual_baseline a
    WHERE a.name NOT IN (SELECT name FROM expected_baseline)
      AND a.name NOT IN (SELECT name FROM target_constraints)
      AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades')
      AND (EXISTS(SELECT 1 FROM relevant_child_columns r WHERE r.table_name=a.table_name
             AND a.definition LIKE 'FOREIGN KEY ('||r.column_name||')%')
        OR a.definition LIKE 'FOREIGN KEY (%, user_id)%' OR a.definition='UNIQUE (id, user_id)'
        OR a.definition='CHECK (batch_id IS NULL OR user_id IS NOT NULL)')
  ) AS no_conflicting_composites
),
data_gate AS (
 SELECT
  NOT EXISTS(SELECT 1 FROM public.planeaciones c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id WHERE c.batch_id IS NOT NULL AND (p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id))
  AND NOT EXISTS(SELECT 1 FROM public.anexos c LEFT JOIN public.planeaciones p ON p.id=c.planeacion_id WHERE p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id)
  AND NOT EXISTS(SELECT 1 FROM public.anexos c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id WHERE c.batch_id IS NOT NULL AND (p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id))
  AND NOT EXISTS(SELECT 1 FROM public.listas_cotejo c LEFT JOIN public.planeaciones p ON p.id=c.planeacion_id WHERE p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id)
  AND NOT EXISTS(SELECT 1 FROM public.listas_cotejo c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id WHERE c.batch_id IS NOT NULL AND (p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id))
  AND NOT EXISTS(SELECT 1 FROM public.examenes c LEFT JOIN public.unidades p ON p.id=c.unidad_id WHERE p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id)
  AND NOT EXISTS(SELECT 1 FROM public.examenes c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id WHERE c.batch_id IS NOT NULL AND (p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id))
  AND NOT EXISTS(SELECT 1 FROM public.examen_generation_items c LEFT JOIN public.examen_generation_jobs p ON p.id=c.job_id WHERE p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id)
  AND NOT EXISTS(SELECT 1 FROM public.examenes c LEFT JOIN public.examen_generation_jobs p ON p.id=c.generation_job_id WHERE c.generation_job_id IS NOT NULL AND (p.id IS NULL OR c.user_id IS NULL OR p.user_id IS NULL OR c.user_id IS DISTINCT FROM p.user_id))
  AND NOT EXISTS(SELECT 1 FROM public.planeacion_batches GROUP BY id,user_id HAVING count(*)>1)
  AND NOT EXISTS(SELECT 1 FROM public.planeaciones GROUP BY id,user_id HAVING count(*)>1)
  AND NOT EXISTS(SELECT 1 FROM public.unidades GROUP BY id,user_id HAVING count(*)>1)
  AND NOT EXISTS(SELECT 1 FROM public.examen_generation_jobs GROUP BY id,user_id HAVING count(*)>1) AS integrity_exact
)
SELECT 1 / CASE WHEN columns_exact AND baseline_exact AND target_absent
  AND no_conflicting_composites AND integrity_exact THEN 1 ELSE 0 END AS immediate_baseline_gate
FROM catalog_gate CROSS JOIN data_gate;

ALTER TABLE public.planeacion_batches ADD CONSTRAINT educativo_ia_planeacion_batches_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.planeaciones ADD CONSTRAINT educativo_ia_planeaciones_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.unidades ADD CONSTRAINT educativo_ia_unidades_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.examen_generation_jobs ADD CONSTRAINT educativo_ia_examen_jobs_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.planeaciones ADD CONSTRAINT educativo_ia_planeaciones_batch_owner_present CHECK (batch_id IS NULL OR user_id IS NOT NULL);
ALTER TABLE public.planeaciones ADD CONSTRAINT educativo_ia_planeaciones_batch_owner_fkey FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);
ALTER TABLE public.anexos ADD CONSTRAINT educativo_ia_anexos_planeacion_owner_fkey FOREIGN KEY (planeacion_id, user_id) REFERENCES public.planeaciones (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.anexos ADD CONSTRAINT educativo_ia_anexos_batch_owner_fkey FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);
ALTER TABLE public.listas_cotejo ADD CONSTRAINT educativo_ia_listas_planeacion_owner_fkey FOREIGN KEY (planeacion_id, user_id) REFERENCES public.planeaciones (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.listas_cotejo ADD CONSTRAINT educativo_ia_listas_batch_owner_fkey FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);
ALTER TABLE public.examenes ADD CONSTRAINT educativo_ia_examenes_unidad_owner_fkey FOREIGN KEY (unidad_id, user_id) REFERENCES public.unidades (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.examenes ADD CONSTRAINT educativo_ia_examenes_batch_owner_fkey FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);
ALTER TABLE public.examen_generation_items ADD CONSTRAINT educativo_ia_examen_items_job_owner_fkey FOREIGN KEY (job_id, user_id) REFERENCES public.examen_generation_jobs (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.examenes ADD CONSTRAINT educativo_ia_examenes_generation_job_owner_fkey FOREIGN KEY (generation_job_id, user_id) REFERENCES public.examen_generation_jobs (id, user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (generation_job_id);

COMMIT;
