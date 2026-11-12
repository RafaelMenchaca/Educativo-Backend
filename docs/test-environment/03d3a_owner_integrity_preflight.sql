-- Educativo IA 03D3A: preflight READ-ONLY.
-- Ejecutar únicamente en Supabase test gwdtlbisykzzplgzczzq durante 03D3B.
-- Bloqueo: cualquier conteo distinto de cero salvo optional_reference_count.

SELECT 'planeaciones.batch_id' AS check_name,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS evaluated_rows,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.planeacion_batches GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS optional_reference_count
FROM public.planeaciones c LEFT JOIN public.planeacion_batches p ON p.id = c.batch_id;

SELECT 'anexos.planeacion_id' AS check_name,
  count(*) AS evaluated_rows,
  count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.planeaciones GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  0::bigint AS optional_reference_count
FROM public.anexos c LEFT JOIN public.planeaciones p ON p.id = c.planeacion_id;

SELECT 'anexos.batch_id' AS check_name,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS evaluated_rows,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.planeacion_batches GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS optional_reference_count
FROM public.anexos c LEFT JOIN public.planeacion_batches p ON p.id = c.batch_id;

SELECT 'listas_cotejo.planeacion_id' AS check_name,
  count(*) AS evaluated_rows,
  count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.planeaciones GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  0::bigint AS optional_reference_count
FROM public.listas_cotejo c LEFT JOIN public.planeaciones p ON p.id = c.planeacion_id;

SELECT 'listas_cotejo.batch_id' AS check_name,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS evaluated_rows,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.planeacion_batches GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS optional_reference_count
FROM public.listas_cotejo c LEFT JOIN public.planeacion_batches p ON p.id = c.batch_id;

SELECT 'examenes.unidad_id' AS check_name,
  count(*) AS evaluated_rows,
  count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.unidades GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  0::bigint AS optional_reference_count
FROM public.examenes c LEFT JOIN public.unidades p ON p.id = c.unidad_id;

SELECT 'examenes.batch_id' AS check_name,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS evaluated_rows,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.planeacion_batches GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS optional_reference_count
FROM public.examenes c LEFT JOIN public.planeacion_batches p ON p.id = c.batch_id;

SELECT 'examen_generation_items.job_id' AS check_name,
  count(*) AS evaluated_rows,
  count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.examen_generation_jobs GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  0::bigint AS optional_reference_count
FROM public.examen_generation_items c LEFT JOIN public.examen_generation_jobs p ON p.id = c.job_id;

SELECT 'examenes.generation_job_id' AS check_name,
  count(*) FILTER (WHERE c.generation_job_id IS NOT NULL) AS evaluated_rows,
  count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
  count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND p.id IS NULL) AS orphan_count,
  count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND c.user_id IS NULL) AS child_owner_null_count,
  count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
  (SELECT count(*) FROM (SELECT id, user_id FROM public.examen_generation_jobs GROUP BY id, user_id HAVING count(*) > 1) d) AS parent_key_duplicate_count,
  count(*) FILTER (WHERE c.generation_job_id IS NOT NULL) AS optional_reference_count
FROM public.examenes c LEFT JOIN public.examen_generation_jobs p ON p.id = c.generation_job_id;
