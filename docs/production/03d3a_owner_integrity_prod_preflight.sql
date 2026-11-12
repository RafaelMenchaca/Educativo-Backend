-- Educativo IA 03D3A: preflight productivo estrictamente READ-ONLY.
-- Antes de ejecutar, el operador debe confirmar visualmente en el dashboard/URL:
-- proyecto educativo-backend, ref exacto bfnkaqmhcsyxdxoqnahk, region us-east-2.
-- PostgreSQL no acredita de forma confiable el Project ref de Supabase; el contexto
-- catalogal siguiente no sustituye esa confirmacion humana.

WITH
expected_tables(table_name) AS (VALUES
  ('anexos'),
  ('examen_generation_items'),
  ('examen_generation_jobs'),
  ('examenes'),
  ('listas_cotejo'),
  ('planeacion_batches'),
  ('planeaciones'),
  ('unidades')
),
expected_columns(table_name, column_name, data_type, is_nullable) AS (VALUES
  ('planeacion_batches','id','uuid',false),
  ('planeacion_batches','user_id','uuid',false),
  ('planeaciones','id','bigint',false),
  ('planeaciones','user_id','uuid',true),
  ('planeaciones','batch_id','uuid',true),
  ('anexos','planeacion_id','bigint',false),
  ('anexos','user_id','uuid',false),
  ('anexos','batch_id','uuid',true),
  ('listas_cotejo','planeacion_id','bigint',false),
  ('listas_cotejo','user_id','uuid',false),
  ('listas_cotejo','batch_id','uuid',true),
  ('unidades','id','uuid',false),
  ('unidades','user_id','uuid',false),
  ('examenes','user_id','uuid',false),
  ('examenes','unidad_id','uuid',false),
  ('examenes','batch_id','uuid',true),
  ('examenes','generation_job_id','uuid',true),
  ('examen_generation_jobs','id','uuid',false),
  ('examen_generation_jobs','user_id','uuid',false),
  ('examen_generation_items','job_id','uuid',false),
  ('examen_generation_items','user_id','uuid',false)
),
actual_tables AS (
  SELECT c.relname::text AS table_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname IN (SELECT table_name FROM expected_tables)
),
actual_columns AS (
  SELECT c.relname::text AS table_name, a.attname::text AS column_name,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
    NOT a.attnotnull AS is_nullable
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND a.attnum>0 AND NOT a.attisdropped
    AND c.relname IN (SELECT table_name FROM expected_tables)
    AND a.attname IN (SELECT column_name FROM expected_columns WHERE table_name=c.relname)
),
table_column_status AS (
  SELECT
    (SELECT count(*) FROM expected_tables) AS expected_table_count,
    (SELECT count(*) FROM actual_tables) AS matched_table_count,
    (SELECT count(*) FROM expected_tables e LEFT JOIN actual_tables a USING(table_name)
      WHERE a.table_name IS NULL) AS missing_table_count,
    (SELECT count(*) FROM expected_columns) AS expected_column_count,
    (SELECT count(*) FROM expected_columns e JOIN actual_columns a USING(table_name,column_name)
      WHERE a.data_type=e.data_type AND a.is_nullable=e.is_nullable) AS matched_column_count,
    (SELECT count(*) FROM expected_columns e LEFT JOIN actual_columns a USING(table_name,column_name)
      WHERE a.column_name IS NULL OR a.data_type<>e.data_type OR a.is_nullable<>e.is_nullable) AS missing_or_changed_column_count
),
expected_baseline_constraints(name, table_name, type, definition) AS (VALUES
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
actual_baseline_constraints AS (
  SELECT c.conname::text AS name, t.relname::text AS table_name, c.contype::text AS type,
    c.convalidated, pg_catalog.pg_get_constraintdef(c.oid,true) AS definition
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND c.conname IN (SELECT name FROM expected_baseline_constraints)
),
baseline_status AS (
  SELECT
    (SELECT count(*) FROM expected_baseline_constraints) AS expected_constraint_count,
    (SELECT count(*) FROM expected_baseline_constraints e JOIN actual_baseline_constraints a USING(name,table_name,type,definition)
      WHERE a.convalidated) AS matched_constraint_count,
    (SELECT count(*) FROM expected_baseline_constraints e LEFT JOIN actual_baseline_constraints a USING(name)
      WHERE a.name IS NULL OR a.table_name<>e.table_name OR a.type<>e.type OR a.definition<>e.definition OR NOT a.convalidated) AS missing_or_changed_constraint_count
),
target_constraints(name) AS (VALUES
  ('educativo_ia_planeacion_batches_id_user_key'),
  ('educativo_ia_planeaciones_id_user_key'),
  ('educativo_ia_unidades_id_user_key'),
  ('educativo_ia_examen_jobs_id_user_key'),
  ('educativo_ia_planeaciones_batch_owner_present'),
  ('educativo_ia_planeaciones_batch_owner_fkey'),
  ('educativo_ia_anexos_planeacion_owner_fkey'),
  ('educativo_ia_anexos_batch_owner_fkey'),
  ('educativo_ia_listas_planeacion_owner_fkey'),
  ('educativo_ia_listas_batch_owner_fkey'),
  ('educativo_ia_examenes_unidad_owner_fkey'),
  ('educativo_ia_examenes_batch_owner_fkey'),
  ('educativo_ia_examen_items_job_owner_fkey'),
  ('educativo_ia_examenes_generation_job_owner_fkey')
),
partial_state AS (
  SELECT count(*) AS present_target_constraint_count
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
  WHERE n.nspname='public' AND c.conname IN (SELECT name FROM target_constraints)
),
relevant_child_columns(table_name,column_name) AS (VALUES
  ('planeaciones','batch_id'),
  ('anexos','planeacion_id'),
  ('anexos','batch_id'),
  ('listas_cotejo','planeacion_id'),
  ('listas_cotejo','batch_id'),
  ('examenes','unidad_id'),
  ('examenes','batch_id'),
  ('examen_generation_items','job_id'),
  ('examenes','generation_job_id')
),
unexpected_relevant_constraints AS (
  SELECT count(*) AS unexpected_relevant_constraint_count
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public'
    AND t.relname IN (SELECT table_name FROM expected_tables)
    AND c.conname NOT IN (SELECT name FROM expected_baseline_constraints)
    AND c.conname NOT IN (SELECT name FROM target_constraints)
    AND (
      (c.contype='f' AND EXISTS (
        SELECT 1 FROM relevant_child_columns r
        WHERE r.table_name=t.relname
          AND pg_catalog.pg_get_constraintdef(c.oid,true) LIKE 'FOREIGN KEY ('||r.column_name||')%'
      ))
      OR pg_catalog.pg_get_constraintdef(c.oid,true) LIKE 'FOREIGN KEY (%, user_id)%'
      OR pg_catalog.pg_get_constraintdef(c.oid,true)='UNIQUE (id, user_id)'
      OR pg_catalog.pg_get_constraintdef(c.oid,true)='CHECK (batch_id IS NULL OR user_id IS NOT NULL)'
    )
),
integrity_checks AS (
  SELECT 'planeaciones.batch_id'::text AS check_name,
    count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS evaluated_rows,
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id) AS mismatch_count,
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL) AS orphan_count,
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL) AS child_owner_null_count,
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL) AS parent_owner_null_count,
    (SELECT count(*) FROM (SELECT id,user_id FROM public.planeacion_batches GROUP BY id,user_id HAVING count(*)>1) d) AS parent_key_duplicate_count,
    count(*) FILTER (WHERE c.batch_id IS NOT NULL) AS optional_reference_count
  FROM public.planeaciones c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id
  UNION ALL
  SELECT 'anexos.planeacion_id',count(*),
    count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE p.id IS NULL),
    count(*) FILTER (WHERE c.user_id IS NULL),count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.planeaciones GROUP BY id,user_id HAVING count(*)>1) d),0::bigint
  FROM public.anexos c LEFT JOIN public.planeaciones p ON p.id=c.planeacion_id
  UNION ALL
  SELECT 'anexos.batch_id',count(*) FILTER (WHERE c.batch_id IS NOT NULL),
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL),
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL),count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.planeacion_batches GROUP BY id,user_id HAVING count(*)>1) d),count(*) FILTER (WHERE c.batch_id IS NOT NULL)
  FROM public.anexos c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id
  UNION ALL
  SELECT 'listas_cotejo.planeacion_id',count(*),
    count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE p.id IS NULL),
    count(*) FILTER (WHERE c.user_id IS NULL),count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.planeaciones GROUP BY id,user_id HAVING count(*)>1) d),0::bigint
  FROM public.listas_cotejo c LEFT JOIN public.planeaciones p ON p.id=c.planeacion_id
  UNION ALL
  SELECT 'listas_cotejo.batch_id',count(*) FILTER (WHERE c.batch_id IS NOT NULL),
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL),
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL),count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.planeacion_batches GROUP BY id,user_id HAVING count(*)>1) d),count(*) FILTER (WHERE c.batch_id IS NOT NULL)
  FROM public.listas_cotejo c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id
  UNION ALL
  SELECT 'examenes.unidad_id',count(*),
    count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE p.id IS NULL),
    count(*) FILTER (WHERE c.user_id IS NULL),count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.unidades GROUP BY id,user_id HAVING count(*)>1) d),0::bigint
  FROM public.examenes c LEFT JOIN public.unidades p ON p.id=c.unidad_id
  UNION ALL
  SELECT 'examenes.batch_id',count(*) FILTER (WHERE c.batch_id IS NOT NULL),
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NULL),
    count(*) FILTER (WHERE c.batch_id IS NOT NULL AND c.user_id IS NULL),count(*) FILTER (WHERE c.batch_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.planeacion_batches GROUP BY id,user_id HAVING count(*)>1) d),count(*) FILTER (WHERE c.batch_id IS NOT NULL)
  FROM public.examenes c LEFT JOIN public.planeacion_batches p ON p.id=c.batch_id
  UNION ALL
  SELECT 'examen_generation_items.job_id',count(*),
    count(*) FILTER (WHERE p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE p.id IS NULL),
    count(*) FILTER (WHERE c.user_id IS NULL),count(*) FILTER (WHERE p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.examen_generation_jobs GROUP BY id,user_id HAVING count(*)>1) d),0::bigint
  FROM public.examen_generation_items c LEFT JOIN public.examen_generation_jobs p ON p.id=c.job_id
  UNION ALL
  SELECT 'examenes.generation_job_id',count(*) FILTER (WHERE c.generation_job_id IS NOT NULL),
    count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND p.id IS NOT NULL AND c.user_id IS DISTINCT FROM p.user_id),count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND p.id IS NULL),
    count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND c.user_id IS NULL),count(*) FILTER (WHERE c.generation_job_id IS NOT NULL AND p.id IS NOT NULL AND p.user_id IS NULL),
    (SELECT count(*) FROM (SELECT id,user_id FROM public.examen_generation_jobs GROUP BY id,user_id HAVING count(*)>1) d),count(*) FILTER (WHERE c.generation_job_id IS NOT NULL)
  FROM public.examenes c LEFT JOIN public.examen_generation_jobs p ON p.id=c.generation_job_id
),
integrity_summary AS (
  SELECT count(*) AS check_count,
    COALESCE(sum(mismatch_count),0)+COALESCE(sum(orphan_count),0)+COALESCE(sum(child_owner_null_count),0)
      +COALESCE(sum(parent_owner_null_count),0)+COALESCE(sum(parent_key_duplicate_count),0) AS total_blocking_count,
    COALESCE(sum(optional_reference_count),0) AS total_optional_reference_count,
    jsonb_agg(jsonb_build_object(
      'check_name',check_name,'evaluated_rows',evaluated_rows,
      'mismatch_count',mismatch_count,'orphan_count',orphan_count,
      'child_owner_null_count',child_owner_null_count,'parent_owner_null_count',parent_owner_null_count,
      'parent_key_duplicate_count',parent_key_duplicate_count,
      'optional_reference_count',optional_reference_count
    ) ORDER BY check_name) AS checks
  FROM integrity_checks
),
decision AS (
  SELECT tc.*,bs.*,ps.present_target_constraint_count,ur.unexpected_relevant_constraint_count,
    i.check_count,i.total_blocking_count,i.total_optional_reference_count,i.checks,
    tc.matched_table_count=tc.expected_table_count AND tc.missing_table_count=0
      AND tc.matched_column_count=tc.expected_column_count AND tc.missing_or_changed_column_count=0
      AND bs.matched_constraint_count=bs.expected_constraint_count AND bs.missing_or_changed_constraint_count=0
      AND ps.present_target_constraint_count=0
      AND ur.unexpected_relevant_constraint_count=0 AS catalog_context_matches
  FROM table_column_status tc CROSS JOIN baseline_status bs CROSS JOIN partial_state ps
  CROSS JOIN unexpected_relevant_constraints ur CROSS JOIN integrity_summary i
)
SELECT jsonb_build_object(
  'expected_project_name','educativo-backend',
  'expected_project_ref','bfnkaqmhcsyxdxoqnahk',
  'expected_region','us-east-2',
  'project_ref_verified_by_sql',false,
  'visual_project_ref_confirmation_required',true,
  'catalog_check_does_not_verify_project_ref',true,
  'session_user',session_user,
  'current_user',current_user,
  'server_version_num',current_setting('server_version_num')::integer,
  'catalog_context_matches',catalog_context_matches,
  'table_column_prerequisites',jsonb_build_object(
    'expected_table_count',expected_table_count,'matched_table_count',matched_table_count,'missing_table_count',missing_table_count,
    'expected_column_count',expected_column_count,'matched_column_count',matched_column_count,
    'missing_or_changed_column_count',missing_or_changed_column_count
  ),
  'constraint_baseline',jsonb_build_object(
    'expected_constraint_count',expected_constraint_count,'matched_constraint_count',matched_constraint_count,
    'missing_or_changed_constraint_count',missing_or_changed_constraint_count,
    'present_target_constraint_count',present_target_constraint_count,
    'unexpected_relevant_constraint_count',unexpected_relevant_constraint_count
  ),
  'integrity_check_count',check_count,
  'integrity_checks',checks,
  'total_blocking_count',total_blocking_count,
  'total_optional_reference_count',total_optional_reference_count,
  'apt_to_apply',catalog_context_matches AND check_count=9 AND total_blocking_count=0
) AS production_preflight_result
FROM decision;
