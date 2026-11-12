-- Educativo IA 03D3A rollback. Manual only; removes the owner-integrity protection.
BEGIN;

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
