-- Educativo IA 03D3A. ONE-SHOT transactional migration; apply to test only in 03D3B.
-- Preconditions: the read-only preflight returned zero mismatch/orphan counts.
BEGIN;

ALTER TABLE public.planeacion_batches ADD CONSTRAINT educativo_ia_planeacion_batches_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.planeaciones ADD CONSTRAINT educativo_ia_planeaciones_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.unidades ADD CONSTRAINT educativo_ia_unidades_id_user_key UNIQUE (id, user_id);
ALTER TABLE public.examen_generation_jobs ADD CONSTRAINT educativo_ia_examen_jobs_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.planeaciones ADD CONSTRAINT educativo_ia_planeaciones_batch_owner_present CHECK (batch_id IS NULL OR user_id IS NOT NULL);

ALTER TABLE public.planeaciones ADD CONSTRAINT educativo_ia_planeaciones_batch_owner_fkey
  FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);

ALTER TABLE public.anexos ADD CONSTRAINT educativo_ia_anexos_planeacion_owner_fkey
  FOREIGN KEY (planeacion_id, user_id) REFERENCES public.planeaciones (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.anexos ADD CONSTRAINT educativo_ia_anexos_batch_owner_fkey
  FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);

ALTER TABLE public.listas_cotejo ADD CONSTRAINT educativo_ia_listas_planeacion_owner_fkey
  FOREIGN KEY (planeacion_id, user_id) REFERENCES public.planeaciones (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.listas_cotejo ADD CONSTRAINT educativo_ia_listas_batch_owner_fkey
  FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);

ALTER TABLE public.examenes ADD CONSTRAINT educativo_ia_examenes_unidad_owner_fkey
  FOREIGN KEY (unidad_id, user_id) REFERENCES public.unidades (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE public.examenes ADD CONSTRAINT educativo_ia_examenes_batch_owner_fkey
  FOREIGN KEY (batch_id, user_id) REFERENCES public.planeacion_batches (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (batch_id);

ALTER TABLE public.examen_generation_items ADD CONSTRAINT educativo_ia_examen_items_job_owner_fkey
  FOREIGN KEY (job_id, user_id) REFERENCES public.examen_generation_jobs (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE public.examenes ADD CONSTRAINT educativo_ia_examenes_generation_job_owner_fkey
  FOREIGN KEY (generation_job_id, user_id) REFERENCES public.examen_generation_jobs (id, user_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (generation_job_id);

COMMIT;
