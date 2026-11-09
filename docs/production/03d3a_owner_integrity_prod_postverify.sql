-- Educativo IA 03D3A: postverify productivo READ-ONLY.
-- La salida no sustituye la confirmacion visual del Project ref de Supabase.
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
), summary AS (
 SELECT
   (SELECT count(*) FROM expected) expected_constraint_count,
   (SELECT count(*) FROM expected e JOIN actual a USING(name,table_name,type,definition) WHERE a.convalidated) matched_constraint_count,
   (SELECT count(*) FROM expected e LEFT JOIN actual a USING(name) WHERE a.name IS NULL OR a.table_name<>e.table_name OR a.type<>e.type OR a.definition<>e.definition OR NOT a.convalidated) missing_or_changed_constraint_count,
   (SELECT count(*) FROM actual a WHERE a.name LIKE 'educativo_ia_%' AND a.name NOT IN (SELECT name FROM expected)
     AND a.table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades')) unexpected_03d3a_constraint_count
)
SELECT jsonb_build_object(
 'expected_project_name','educativo-backend','expected_project_ref','bfnkaqmhcsyxdxoqnahk',
 'project_ref_verified_by_sql',false,'session_user',session_user,'current_user',current_user,
 'server_version_num',current_setting('server_version_num')::integer,
 'expected_constraint_count',expected_constraint_count,'matched_constraint_count',matched_constraint_count,
 'missing_or_changed_constraint_count',missing_or_changed_constraint_count,
 'unexpected_03d3a_constraint_count',unexpected_03d3a_constraint_count,
 'postverify_ok',matched_constraint_count=14 AND missing_or_changed_constraint_count=0 AND unexpected_03d3a_constraint_count=0
) AS production_postverify_result
FROM summary;
