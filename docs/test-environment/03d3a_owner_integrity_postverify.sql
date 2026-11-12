-- Educativo IA 03D3A: verificación estructural segura posterior a la migración.
-- confmatchtype: s=SIMPLE. confupdtype/confdeltype: a=NO ACTION, c=CASCADE,
-- n=SET NULL. confdelsetcols identifica las columnas afectadas por SET NULL.
WITH expected(
  name, child_table, child_columns, child_types, parent_table, parent_columns,
  parent_types, match_type, update_action, delete_action, delete_set_columns
) AS (VALUES
 ('educativo_ia_planeaciones_batch_owner_fkey','planeaciones',ARRAY['batch_id','user_id'],ARRAY['uuid','uuid'],'planeacion_batches',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','n',ARRAY['batch_id']),
 ('educativo_ia_anexos_planeacion_owner_fkey','anexos',ARRAY['planeacion_id','user_id'],ARRAY['bigint','uuid'],'planeaciones',ARRAY['id','user_id'],ARRAY['bigint','uuid'],'s','a','c',ARRAY[]::text[]),
 ('educativo_ia_anexos_batch_owner_fkey','anexos',ARRAY['batch_id','user_id'],ARRAY['uuid','uuid'],'planeacion_batches',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','n',ARRAY['batch_id']),
 ('educativo_ia_listas_planeacion_owner_fkey','listas_cotejo',ARRAY['planeacion_id','user_id'],ARRAY['bigint','uuid'],'planeaciones',ARRAY['id','user_id'],ARRAY['bigint','uuid'],'s','a','c',ARRAY[]::text[]),
 ('educativo_ia_listas_batch_owner_fkey','listas_cotejo',ARRAY['batch_id','user_id'],ARRAY['uuid','uuid'],'planeacion_batches',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','n',ARRAY['batch_id']),
 ('educativo_ia_examenes_unidad_owner_fkey','examenes',ARRAY['unidad_id','user_id'],ARRAY['uuid','uuid'],'unidades',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','c',ARRAY[]::text[]),
 ('educativo_ia_examenes_batch_owner_fkey','examenes',ARRAY['batch_id','user_id'],ARRAY['uuid','uuid'],'planeacion_batches',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','n',ARRAY['batch_id']),
 ('educativo_ia_examen_items_job_owner_fkey','examen_generation_items',ARRAY['job_id','user_id'],ARRAY['uuid','uuid'],'examen_generation_jobs',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','c',ARRAY[]::text[]),
 ('educativo_ia_examenes_generation_job_owner_fkey','examenes',ARRAY['generation_job_id','user_id'],ARRAY['uuid','uuid'],'examen_generation_jobs',ARRAY['id','user_id'],ARRAY['uuid','uuid'],'s','a','n',ARRAY['generation_job_id'])
), actual AS (
 SELECT c.conname AS name, child.relname AS child_table, parent.relname AS parent_table,
   c.convalidated, c.confmatchtype::text AS match_type,
   c.confupdtype::text AS update_action, c.confdeltype::text AS delete_action,
   child_cols.names AS child_columns, child_cols.types AS child_types,
   parent_cols.names AS parent_columns, parent_cols.types AS parent_types,
   COALESCE(delete_cols.names, ARRAY[]::text[]) AS delete_set_columns
 FROM pg_catalog.pg_constraint c
 JOIN pg_catalog.pg_class child ON child.oid = c.conrelid
 JOIN pg_catalog.pg_namespace ns ON ns.oid = child.relnamespace AND ns.nspname = 'public'
 JOIN pg_catalog.pg_class parent ON parent.oid = c.confrelid
 LEFT JOIN LATERAL (
   SELECT array_agg(a.attname::text ORDER BY k.position) AS names,
          array_agg(pg_catalog.format_type(a.atttypid,a.atttypmod) ORDER BY k.position) AS types
   FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum,position)
   JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
 ) child_cols ON true
 LEFT JOIN LATERAL (
   SELECT array_agg(a.attname::text ORDER BY k.position) AS names,
          array_agg(pg_catalog.format_type(a.atttypid,a.atttypmod) ORDER BY k.position) AS types
   FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum,position)
   JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum
 ) parent_cols ON true
 LEFT JOIN LATERAL (
   SELECT array_agg(a.attname::text ORDER BY k.position) AS names
   FROM unnest(c.confdelsetcols) WITH ORDINALITY AS k(attnum,position)
   JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
 ) delete_cols ON true
 WHERE c.contype='f' AND c.conname IN (SELECT name FROM expected)
)
SELECT e.*, a.convalidated,
  a.child_table=e.child_table AND a.child_columns=e.child_columns AND a.child_types=e.child_types
  AND a.parent_table=e.parent_table AND a.parent_columns=e.parent_columns AND a.parent_types=e.parent_types
  AND a.match_type=e.match_type AND a.update_action=e.update_action
  AND a.delete_action=e.delete_action AND a.delete_set_columns=e.delete_set_columns
  AND a.convalidated AS matches_expected
FROM expected e LEFT JOIN actual a USING(name)
ORDER BY e.name;

WITH expected(name, table_name, type, definition) AS (VALUES
 ('educativo_ia_planeacion_batches_id_user_key','planeacion_batches','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_id_user_key','planeaciones','u','UNIQUE (id, user_id)'),
 ('educativo_ia_unidades_id_user_key','unidades','u','UNIQUE (id, user_id)'),
 ('educativo_ia_examen_jobs_id_user_key','examen_generation_jobs','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_batch_owner_present','planeaciones','c','CHECK (batch_id IS NULL OR user_id IS NOT NULL)')
)
SELECT e.name, e.table_name, e.type, e.definition AS expected_definition,
  c.convalidated, pg_catalog.pg_get_constraintdef(c.oid,true) AS actual_definition,
  c.convalidated AND c.contype::text=e.type
    AND pg_catalog.pg_get_constraintdef(c.oid,true)=e.definition AS matches_expected
FROM expected e
LEFT JOIN pg_catalog.pg_constraint c
  ON c.conname=e.name AND c.connamespace='public'::regnamespace
ORDER BY e.name;
