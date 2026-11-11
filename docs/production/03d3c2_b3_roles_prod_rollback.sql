-- 03D3C2-B3 rollback productivo: restaura roles PUBLIC, transaccional y fail-closed.
BEGIN;
DO $b3$
DECLARE gate_payload jsonb;
BEGIN
-- Fingerprint includes schema, table, exact name, command, permissiveness, roles,
-- USING and WITH CHECK. NULL is distinct from an empty expression.
WITH RECURSIVE expected_tables(table_name) AS (VALUES
    ('ai_generation_calls'),
    ('ai_generation_jobs'),
    ('ai_model_prices'),
    ('anexos'),
    ('examen_generation_items'),
    ('examen_generation_jobs'),
    ('examenes'),
    ('grados'),
    ('ia_metrics_legacy'),
    ('listas_cotejo'),
    ('materias'),
    ('planeacion_batches'),
    ('planeaciones'),
    ('planteles'),
    ('profiles'),
    ('temas'),
    ('unidades'),
    ('user_profiles'),
    ('user_settings')
), expected_policies(schema_name,table_name,policy_name,command,permissive,roles,using_expr,check_expr) AS (VALUES
    ('public','ai_generation_calls','Users can insert own AI calls','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','ai_generation_calls','Users can read own AI calls','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','ai_generation_jobs','Users can insert own AI jobs','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','ai_generation_jobs','Users can read own AI jobs','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','ai_generation_jobs','Users can update own AI jobs','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','ai_model_prices','Authenticated users can read AI model prices','SELECT','PERMISSIVE',ARRAY['authenticated']::text[],'true',NULL),
    ('public','anexos','Users can delete their own anexos','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','anexos','Users can insert their own anexos','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','anexos','Users can select their own anexos','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','anexos','Users can update their own anexos','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','examen_generation_items','Users can delete their own exam generation items','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','examen_generation_items','Users can insert their own exam generation items','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','examen_generation_items','Users can read their own exam generation items','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','examen_generation_items','Users can update their own exam generation items','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','examen_generation_jobs','Users can delete their own exam generation jobs','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','examen_generation_jobs','Users can insert their own exam generation jobs','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','examen_generation_jobs','Users can read their own exam generation jobs','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','examen_generation_jobs','Users can update their own exam generation jobs','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','examenes','Users can delete their own examenes','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','examenes','Users can insert their own examenes','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','examenes','Users can update their own examenes','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','examenes','Users can view their own examenes','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','grados','grados_owner','ALL','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())'),
    ('public','listas_cotejo','Users can delete their own listas de cotejo','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','listas_cotejo','Users can insert their own listas de cotejo','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','listas_cotejo','Users can read their own listas de cotejo','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','listas_cotejo','Users can update their own listas de cotejo','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','materias','materias_owner','ALL','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())'),
    ('public','planeacion_batches','Users can delete own planeacion batches','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','planeacion_batches','Users can insert own planeacion batches','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','planeacion_batches','Users can select own planeacion batches','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','planeacion_batches','Users can update own planeacion batches','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','planeaciones','delete own planeaciones','DELETE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','planeaciones','insert own planeaciones','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','planeaciones','planeaciones_owner','ALL','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())'),
    ('public','planeaciones','select own planeaciones','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','planeaciones','update own planeaciones','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','planteles','planteles_owner','ALL','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())'),
    ('public','profiles','profiles_insert_own','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(id = auth.uid())'),
    ('public','profiles','profiles_select_own','SELECT','PERMISSIVE',ARRAY['public']::text[],'(id = auth.uid())',NULL),
    ('public','profiles','profiles_update_own','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(id = auth.uid())','(id = auth.uid())'),
    ('public','temas','temas_owner','ALL','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())'),
    ('public','unidades','unidades_owner','ALL','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())'),
    ('public','user_profiles','Users can insert own profile','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(auth.uid() = user_id)'),
    ('public','user_profiles','Users can read own profile','SELECT','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)',NULL),
    ('public','user_profiles','Users can update own profile','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(auth.uid() = user_id)','(auth.uid() = user_id)'),
    ('public','user_settings','user_settings_insert_own','INSERT','PERMISSIVE',ARRAY['public']::text[],NULL,'(user_id = auth.uid())'),
    ('public','user_settings','user_settings_select_own','SELECT','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())',NULL),
    ('public','user_settings','user_settings_update_own','UPDATE','PERMISSIVE',ARRAY['public']::text[],'(user_id = auth.uid())','(user_id = auth.uid())')
), proposed_classification(table_name,policy_name,classification) AS (VALUES
    ('ai_generation_calls','Users can insert own AI calls','LEGACY_OR_DEFERRED'),
    ('ai_generation_calls','Users can read own AI calls','LEGACY_OR_DEFERRED'),
    ('ai_generation_jobs','Users can insert own AI jobs','LEGACY_OR_DEFERRED'),
    ('ai_generation_jobs','Users can read own AI jobs','LEGACY_OR_DEFERRED'),
    ('ai_generation_jobs','Users can update own AI jobs','LEGACY_OR_DEFERRED'),
    ('ai_model_prices','Authenticated users can read AI model prices','ALREADY_AUTHENTICATED'),
    ('anexos','Users can delete their own anexos','NARROW_CANDIDATE'),
    ('anexos','Users can insert their own anexos','NARROW_CANDIDATE'),
    ('anexos','Users can select their own anexos','NARROW_CANDIDATE'),
    ('anexos','Users can update their own anexos','NARROW_CANDIDATE'),
    ('examen_generation_items','Users can delete their own exam generation items','LEGACY_OR_DEFERRED'),
    ('examen_generation_items','Users can insert their own exam generation items','NARROW_CANDIDATE'),
    ('examen_generation_items','Users can read their own exam generation items','NARROW_CANDIDATE'),
    ('examen_generation_items','Users can update their own exam generation items','LEGACY_OR_DEFERRED'),
    ('examen_generation_jobs','Users can delete their own exam generation jobs','LEGACY_OR_DEFERRED'),
    ('examen_generation_jobs','Users can insert their own exam generation jobs','NARROW_CANDIDATE'),
    ('examen_generation_jobs','Users can read their own exam generation jobs','NARROW_CANDIDATE'),
    ('examen_generation_jobs','Users can update their own exam generation jobs','NARROW_CANDIDATE'),
    ('examenes','Users can delete their own examenes','NARROW_CANDIDATE'),
    ('examenes','Users can insert their own examenes','LEGACY_OR_DEFERRED'),
    ('examenes','Users can update their own examenes','LEGACY_OR_DEFERRED'),
    ('examenes','Users can view their own examenes','NARROW_CANDIDATE'),
    ('grados','grados_owner','NARROW_CANDIDATE'),
    ('listas_cotejo','Users can delete their own listas de cotejo','NARROW_CANDIDATE'),
    ('listas_cotejo','Users can insert their own listas de cotejo','NARROW_CANDIDATE'),
    ('listas_cotejo','Users can read their own listas de cotejo','NARROW_CANDIDATE'),
    ('listas_cotejo','Users can update their own listas de cotejo','NARROW_CANDIDATE'),
    ('materias','materias_owner','NARROW_CANDIDATE'),
    ('planeacion_batches','Users can delete own planeacion batches','NARROW_CANDIDATE'),
    ('planeacion_batches','Users can insert own planeacion batches','LEGACY_OR_DEFERRED'),
    ('planeacion_batches','Users can select own planeacion batches','NARROW_CANDIDATE'),
    ('planeacion_batches','Users can update own planeacion batches','LEGACY_OR_DEFERRED'),
    ('planeaciones','delete own planeaciones','NARROW_CANDIDATE'),
    ('planeaciones','insert own planeaciones','NARROW_CANDIDATE'),
    ('planeaciones','planeaciones_owner','NARROW_CANDIDATE'),
    ('planeaciones','select own planeaciones','NARROW_CANDIDATE'),
    ('planeaciones','update own planeaciones','NARROW_CANDIDATE'),
    ('planteles','planteles_owner','NARROW_CANDIDATE'),
    ('profiles','profiles_insert_own','LEGACY_OR_DEFERRED'),
    ('profiles','profiles_select_own','LEGACY_OR_DEFERRED'),
    ('profiles','profiles_update_own','LEGACY_OR_DEFERRED'),
    ('temas','temas_owner','LEGACY_OR_DEFERRED'),
    ('unidades','unidades_owner','NARROW_CANDIDATE'),
    ('user_profiles','Users can insert own profile','LEGACY_OR_DEFERRED'),
    ('user_profiles','Users can read own profile','LEGACY_OR_DEFERRED'),
    ('user_profiles','Users can update own profile','LEGACY_OR_DEFERRED'),
    ('user_settings','user_settings_insert_own','LEGACY_OR_DEFERRED'),
    ('user_settings','user_settings_select_own','LEGACY_OR_DEFERRED'),
    ('user_settings','user_settings_update_own','LEGACY_OR_DEFERRED')
), expected_post_policies AS (
  SELECT e.schema_name,e.table_name,e.policy_name,e.command,e.permissive,
    CASE WHEN p.classification='NARROW_CANDIDATE' THEN ARRAY['authenticated']::text[] ELSE e.roles END roles,
    e.using_expr,e.check_expr
  FROM expected_policies e JOIN proposed_classification p USING(table_name,policy_name)
), expected_acl(table_name,role_name,privilege) AS (VALUES
    ('ai_generation_calls','authenticated','DELETE'),
    ('ai_generation_calls','authenticated','INSERT'),
    ('ai_generation_calls','authenticated','SELECT'),
    ('ai_generation_calls','authenticated','UPDATE'),
    ('ai_generation_calls','postgres','DELETE'),
    ('ai_generation_calls','postgres','INSERT'),
    ('ai_generation_calls','postgres','REFERENCES'),
    ('ai_generation_calls','postgres','SELECT'),
    ('ai_generation_calls','postgres','TRIGGER'),
    ('ai_generation_calls','postgres','TRUNCATE'),
    ('ai_generation_calls','postgres','UPDATE'),
    ('ai_generation_calls','service_role','DELETE'),
    ('ai_generation_calls','service_role','INSERT'),
    ('ai_generation_calls','service_role','REFERENCES'),
    ('ai_generation_calls','service_role','SELECT'),
    ('ai_generation_calls','service_role','TRIGGER'),
    ('ai_generation_calls','service_role','TRUNCATE'),
    ('ai_generation_calls','service_role','UPDATE'),
    ('ai_generation_jobs','authenticated','DELETE'),
    ('ai_generation_jobs','authenticated','INSERT'),
    ('ai_generation_jobs','authenticated','SELECT'),
    ('ai_generation_jobs','authenticated','UPDATE'),
    ('ai_generation_jobs','postgres','DELETE'),
    ('ai_generation_jobs','postgres','INSERT'),
    ('ai_generation_jobs','postgres','REFERENCES'),
    ('ai_generation_jobs','postgres','SELECT'),
    ('ai_generation_jobs','postgres','TRIGGER'),
    ('ai_generation_jobs','postgres','TRUNCATE'),
    ('ai_generation_jobs','postgres','UPDATE'),
    ('ai_generation_jobs','service_role','DELETE'),
    ('ai_generation_jobs','service_role','INSERT'),
    ('ai_generation_jobs','service_role','REFERENCES'),
    ('ai_generation_jobs','service_role','SELECT'),
    ('ai_generation_jobs','service_role','TRIGGER'),
    ('ai_generation_jobs','service_role','TRUNCATE'),
    ('ai_generation_jobs','service_role','UPDATE'),
    ('ai_model_prices','authenticated','SELECT'),
    ('ai_model_prices','postgres','DELETE'),
    ('ai_model_prices','postgres','INSERT'),
    ('ai_model_prices','postgres','REFERENCES'),
    ('ai_model_prices','postgres','SELECT'),
    ('ai_model_prices','postgres','TRIGGER'),
    ('ai_model_prices','postgres','TRUNCATE'),
    ('ai_model_prices','postgres','UPDATE'),
    ('ai_model_prices','service_role','DELETE'),
    ('ai_model_prices','service_role','INSERT'),
    ('ai_model_prices','service_role','REFERENCES'),
    ('ai_model_prices','service_role','SELECT'),
    ('ai_model_prices','service_role','TRIGGER'),
    ('ai_model_prices','service_role','TRUNCATE'),
    ('ai_model_prices','service_role','UPDATE'),
    ('anexos','authenticated','DELETE'),
    ('anexos','authenticated','INSERT'),
    ('anexos','authenticated','SELECT'),
    ('anexos','authenticated','UPDATE'),
    ('anexos','postgres','DELETE'),
    ('anexos','postgres','INSERT'),
    ('anexos','postgres','REFERENCES'),
    ('anexos','postgres','SELECT'),
    ('anexos','postgres','TRIGGER'),
    ('anexos','postgres','TRUNCATE'),
    ('anexos','postgres','UPDATE'),
    ('anexos','service_role','DELETE'),
    ('anexos','service_role','INSERT'),
    ('anexos','service_role','REFERENCES'),
    ('anexos','service_role','SELECT'),
    ('anexos','service_role','TRIGGER'),
    ('anexos','service_role','TRUNCATE'),
    ('anexos','service_role','UPDATE'),
    ('examen_generation_items','authenticated','DELETE'),
    ('examen_generation_items','authenticated','INSERT'),
    ('examen_generation_items','authenticated','SELECT'),
    ('examen_generation_items','authenticated','UPDATE'),
    ('examen_generation_items','postgres','DELETE'),
    ('examen_generation_items','postgres','INSERT'),
    ('examen_generation_items','postgres','REFERENCES'),
    ('examen_generation_items','postgres','SELECT'),
    ('examen_generation_items','postgres','TRIGGER'),
    ('examen_generation_items','postgres','TRUNCATE'),
    ('examen_generation_items','postgres','UPDATE'),
    ('examen_generation_items','service_role','DELETE'),
    ('examen_generation_items','service_role','INSERT'),
    ('examen_generation_items','service_role','REFERENCES'),
    ('examen_generation_items','service_role','SELECT'),
    ('examen_generation_items','service_role','TRIGGER'),
    ('examen_generation_items','service_role','TRUNCATE'),
    ('examen_generation_items','service_role','UPDATE'),
    ('examen_generation_jobs','authenticated','DELETE'),
    ('examen_generation_jobs','authenticated','INSERT'),
    ('examen_generation_jobs','authenticated','SELECT'),
    ('examen_generation_jobs','authenticated','UPDATE'),
    ('examen_generation_jobs','postgres','DELETE'),
    ('examen_generation_jobs','postgres','INSERT'),
    ('examen_generation_jobs','postgres','REFERENCES'),
    ('examen_generation_jobs','postgres','SELECT'),
    ('examen_generation_jobs','postgres','TRIGGER'),
    ('examen_generation_jobs','postgres','TRUNCATE'),
    ('examen_generation_jobs','postgres','UPDATE'),
    ('examen_generation_jobs','service_role','DELETE'),
    ('examen_generation_jobs','service_role','INSERT'),
    ('examen_generation_jobs','service_role','REFERENCES'),
    ('examen_generation_jobs','service_role','SELECT'),
    ('examen_generation_jobs','service_role','TRIGGER'),
    ('examen_generation_jobs','service_role','TRUNCATE'),
    ('examen_generation_jobs','service_role','UPDATE'),
    ('examenes','authenticated','DELETE'),
    ('examenes','authenticated','INSERT'),
    ('examenes','authenticated','SELECT'),
    ('examenes','authenticated','UPDATE'),
    ('examenes','postgres','DELETE'),
    ('examenes','postgres','INSERT'),
    ('examenes','postgres','REFERENCES'),
    ('examenes','postgres','SELECT'),
    ('examenes','postgres','TRIGGER'),
    ('examenes','postgres','TRUNCATE'),
    ('examenes','postgres','UPDATE'),
    ('examenes','service_role','DELETE'),
    ('examenes','service_role','INSERT'),
    ('examenes','service_role','REFERENCES'),
    ('examenes','service_role','SELECT'),
    ('examenes','service_role','TRIGGER'),
    ('examenes','service_role','TRUNCATE'),
    ('examenes','service_role','UPDATE'),
    ('grados','authenticated','DELETE'),
    ('grados','authenticated','INSERT'),
    ('grados','authenticated','SELECT'),
    ('grados','authenticated','UPDATE'),
    ('grados','postgres','DELETE'),
    ('grados','postgres','INSERT'),
    ('grados','postgres','REFERENCES'),
    ('grados','postgres','SELECT'),
    ('grados','postgres','TRIGGER'),
    ('grados','postgres','TRUNCATE'),
    ('grados','postgres','UPDATE'),
    ('grados','service_role','DELETE'),
    ('grados','service_role','INSERT'),
    ('grados','service_role','REFERENCES'),
    ('grados','service_role','SELECT'),
    ('grados','service_role','TRIGGER'),
    ('grados','service_role','TRUNCATE'),
    ('grados','service_role','UPDATE'),
    ('ia_metrics_legacy','postgres','DELETE'),
    ('ia_metrics_legacy','postgres','INSERT'),
    ('ia_metrics_legacy','postgres','REFERENCES'),
    ('ia_metrics_legacy','postgres','SELECT'),
    ('ia_metrics_legacy','postgres','TRIGGER'),
    ('ia_metrics_legacy','postgres','TRUNCATE'),
    ('ia_metrics_legacy','postgres','UPDATE'),
    ('ia_metrics_legacy','service_role','DELETE'),
    ('ia_metrics_legacy','service_role','INSERT'),
    ('ia_metrics_legacy','service_role','REFERENCES'),
    ('ia_metrics_legacy','service_role','SELECT'),
    ('ia_metrics_legacy','service_role','TRIGGER'),
    ('ia_metrics_legacy','service_role','TRUNCATE'),
    ('ia_metrics_legacy','service_role','UPDATE'),
    ('listas_cotejo','authenticated','DELETE'),
    ('listas_cotejo','authenticated','INSERT'),
    ('listas_cotejo','authenticated','SELECT'),
    ('listas_cotejo','authenticated','UPDATE'),
    ('listas_cotejo','postgres','DELETE'),
    ('listas_cotejo','postgres','INSERT'),
    ('listas_cotejo','postgres','REFERENCES'),
    ('listas_cotejo','postgres','SELECT'),
    ('listas_cotejo','postgres','TRIGGER'),
    ('listas_cotejo','postgres','TRUNCATE'),
    ('listas_cotejo','postgres','UPDATE'),
    ('listas_cotejo','service_role','DELETE'),
    ('listas_cotejo','service_role','INSERT'),
    ('listas_cotejo','service_role','REFERENCES'),
    ('listas_cotejo','service_role','SELECT'),
    ('listas_cotejo','service_role','TRIGGER'),
    ('listas_cotejo','service_role','TRUNCATE'),
    ('listas_cotejo','service_role','UPDATE'),
    ('materias','authenticated','DELETE'),
    ('materias','authenticated','INSERT'),
    ('materias','authenticated','SELECT'),
    ('materias','authenticated','UPDATE'),
    ('materias','postgres','DELETE'),
    ('materias','postgres','INSERT'),
    ('materias','postgres','REFERENCES'),
    ('materias','postgres','SELECT'),
    ('materias','postgres','TRIGGER'),
    ('materias','postgres','TRUNCATE'),
    ('materias','postgres','UPDATE'),
    ('materias','service_role','DELETE'),
    ('materias','service_role','INSERT'),
    ('materias','service_role','REFERENCES'),
    ('materias','service_role','SELECT'),
    ('materias','service_role','TRIGGER'),
    ('materias','service_role','TRUNCATE'),
    ('materias','service_role','UPDATE'),
    ('planeacion_batches','authenticated','DELETE'),
    ('planeacion_batches','authenticated','INSERT'),
    ('planeacion_batches','authenticated','SELECT'),
    ('planeacion_batches','authenticated','UPDATE'),
    ('planeacion_batches','postgres','DELETE'),
    ('planeacion_batches','postgres','INSERT'),
    ('planeacion_batches','postgres','REFERENCES'),
    ('planeacion_batches','postgres','SELECT'),
    ('planeacion_batches','postgres','TRIGGER'),
    ('planeacion_batches','postgres','TRUNCATE'),
    ('planeacion_batches','postgres','UPDATE'),
    ('planeacion_batches','service_role','DELETE'),
    ('planeacion_batches','service_role','INSERT'),
    ('planeacion_batches','service_role','REFERENCES'),
    ('planeacion_batches','service_role','SELECT'),
    ('planeacion_batches','service_role','TRIGGER'),
    ('planeacion_batches','service_role','TRUNCATE'),
    ('planeacion_batches','service_role','UPDATE'),
    ('planeaciones','authenticated','DELETE'),
    ('planeaciones','authenticated','INSERT'),
    ('planeaciones','authenticated','SELECT'),
    ('planeaciones','authenticated','UPDATE'),
    ('planeaciones','postgres','DELETE'),
    ('planeaciones','postgres','INSERT'),
    ('planeaciones','postgres','REFERENCES'),
    ('planeaciones','postgres','SELECT'),
    ('planeaciones','postgres','TRIGGER'),
    ('planeaciones','postgres','TRUNCATE'),
    ('planeaciones','postgres','UPDATE'),
    ('planeaciones','service_role','DELETE'),
    ('planeaciones','service_role','INSERT'),
    ('planeaciones','service_role','REFERENCES'),
    ('planeaciones','service_role','SELECT'),
    ('planeaciones','service_role','TRIGGER'),
    ('planeaciones','service_role','TRUNCATE'),
    ('planeaciones','service_role','UPDATE'),
    ('planteles','authenticated','DELETE'),
    ('planteles','authenticated','INSERT'),
    ('planteles','authenticated','SELECT'),
    ('planteles','authenticated','UPDATE'),
    ('planteles','postgres','DELETE'),
    ('planteles','postgres','INSERT'),
    ('planteles','postgres','REFERENCES'),
    ('planteles','postgres','SELECT'),
    ('planteles','postgres','TRIGGER'),
    ('planteles','postgres','TRUNCATE'),
    ('planteles','postgres','UPDATE'),
    ('planteles','service_role','DELETE'),
    ('planteles','service_role','INSERT'),
    ('planteles','service_role','REFERENCES'),
    ('planteles','service_role','SELECT'),
    ('planteles','service_role','TRIGGER'),
    ('planteles','service_role','TRUNCATE'),
    ('planteles','service_role','UPDATE'),
    ('profiles','authenticated','DELETE'),
    ('profiles','authenticated','INSERT'),
    ('profiles','authenticated','SELECT'),
    ('profiles','authenticated','UPDATE'),
    ('profiles','postgres','DELETE'),
    ('profiles','postgres','INSERT'),
    ('profiles','postgres','REFERENCES'),
    ('profiles','postgres','SELECT'),
    ('profiles','postgres','TRIGGER'),
    ('profiles','postgres','TRUNCATE'),
    ('profiles','postgres','UPDATE'),
    ('profiles','service_role','DELETE'),
    ('profiles','service_role','INSERT'),
    ('profiles','service_role','REFERENCES'),
    ('profiles','service_role','SELECT'),
    ('profiles','service_role','TRIGGER'),
    ('profiles','service_role','TRUNCATE'),
    ('profiles','service_role','UPDATE'),
    ('temas','authenticated','DELETE'),
    ('temas','authenticated','INSERT'),
    ('temas','authenticated','SELECT'),
    ('temas','authenticated','UPDATE'),
    ('temas','postgres','DELETE'),
    ('temas','postgres','INSERT'),
    ('temas','postgres','REFERENCES'),
    ('temas','postgres','SELECT'),
    ('temas','postgres','TRIGGER'),
    ('temas','postgres','TRUNCATE'),
    ('temas','postgres','UPDATE'),
    ('temas','service_role','DELETE'),
    ('temas','service_role','INSERT'),
    ('temas','service_role','REFERENCES'),
    ('temas','service_role','SELECT'),
    ('temas','service_role','TRIGGER'),
    ('temas','service_role','TRUNCATE'),
    ('temas','service_role','UPDATE'),
    ('unidades','authenticated','DELETE'),
    ('unidades','authenticated','INSERT'),
    ('unidades','authenticated','SELECT'),
    ('unidades','authenticated','UPDATE'),
    ('unidades','postgres','DELETE'),
    ('unidades','postgres','INSERT'),
    ('unidades','postgres','REFERENCES'),
    ('unidades','postgres','SELECT'),
    ('unidades','postgres','TRIGGER'),
    ('unidades','postgres','TRUNCATE'),
    ('unidades','postgres','UPDATE'),
    ('unidades','service_role','DELETE'),
    ('unidades','service_role','INSERT'),
    ('unidades','service_role','REFERENCES'),
    ('unidades','service_role','SELECT'),
    ('unidades','service_role','TRIGGER'),
    ('unidades','service_role','TRUNCATE'),
    ('unidades','service_role','UPDATE'),
    ('user_profiles','authenticated','DELETE'),
    ('user_profiles','authenticated','INSERT'),
    ('user_profiles','authenticated','SELECT'),
    ('user_profiles','authenticated','UPDATE'),
    ('user_profiles','postgres','DELETE'),
    ('user_profiles','postgres','INSERT'),
    ('user_profiles','postgres','REFERENCES'),
    ('user_profiles','postgres','SELECT'),
    ('user_profiles','postgres','TRIGGER'),
    ('user_profiles','postgres','TRUNCATE'),
    ('user_profiles','postgres','UPDATE'),
    ('user_profiles','service_role','DELETE'),
    ('user_profiles','service_role','INSERT'),
    ('user_profiles','service_role','REFERENCES'),
    ('user_profiles','service_role','SELECT'),
    ('user_profiles','service_role','TRIGGER'),
    ('user_profiles','service_role','TRUNCATE'),
    ('user_profiles','service_role','UPDATE'),
    ('user_settings','authenticated','DELETE'),
    ('user_settings','authenticated','INSERT'),
    ('user_settings','authenticated','SELECT'),
    ('user_settings','authenticated','UPDATE'),
    ('user_settings','postgres','DELETE'),
    ('user_settings','postgres','INSERT'),
    ('user_settings','postgres','REFERENCES'),
    ('user_settings','postgres','SELECT'),
    ('user_settings','postgres','TRIGGER'),
    ('user_settings','postgres','TRUNCATE'),
    ('user_settings','postgres','UPDATE'),
    ('user_settings','service_role','DELETE'),
    ('user_settings','service_role','INSERT'),
    ('user_settings','service_role','REFERENCES'),
    ('user_settings','service_role','SELECT'),
    ('user_settings','service_role','TRIGGER'),
    ('user_settings','service_role','TRUNCATE'),
    ('user_settings','service_role','UPDATE')
), tables AS (
  SELECT c.oid,c.relname::text AS table_name,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), policies AS (
  SELECT p.schemaname::text AS schema_name,p.tablename::text AS table_name,
    p.policyname::text AS policy_name,p.cmd::text AS command,p.permissive::text AS permissive,
    ARRAY(SELECT role_name::text FROM pg_catalog.unnest(p.roles) role_name ORDER BY role_name::text COLLATE "C") AS roles,
    btrim(regexp_replace(p.qual,'[[:space:]]+',' ','g')) AS using_expr,
    btrim(regexp_replace(p.with_check,'[[:space:]]+',' ','g')) AS check_expr
  FROM pg_catalog.pg_policies p WHERE p.schemaname='public'
), missing_policies AS (
  SELECT * FROM expected_post_policies EXCEPT SELECT * FROM policies
), additional_policies AS (
  SELECT * FROM policies EXCEPT SELECT * FROM expected_post_policies
), observed_fingerprint AS (
  SELECT md5(string_agg(schema_name||'|'||table_name||'|'||policy_name||'|'||command||'|'||permissive||'|'||
    array_to_string(roles,',')||'|'||coalesce(using_expr,'<NULL>')||'|'||coalesce(check_expr,'<NULL>'),E'\n'
    ORDER BY schema_name COLLATE "C",table_name COLLATE "C",policy_name COLLATE "C")) AS full_md5 FROM policies
), acl AS (
  SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,
    x.privilege_type::text AS privilege,g.rolname::text AS grantor,x.is_grantable
  FROM tables t CROSS JOIN LATERAL pg_catalog.aclexplode(t.relacl) x
  LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee LEFT JOIN pg_catalog.pg_roles g ON g.oid=x.grantor
), runtime_roles(role_name) AS (VALUES ('anon'),('authenticated'),('service_role')),
privileges(privilege) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
effective AS (
  SELECT t.table_name,r.role_name,p.privilege,
    EXISTS(SELECT 1 FROM acl a WHERE (a.table_name,a.role_name,a.privilege)=(t.table_name,r.role_name,p.privilege)) AS direct_grant,
    pg_catalog.has_table_privilege(pr.oid,t.oid,p.privilege) AS effective_grant,
    EXISTS(SELECT 1 FROM expected_acl e WHERE (e.table_name,e.role_name,e.privilege)=(t.table_name,r.role_name,p.privilege)) AS expected_grant
  FROM tables t CROSS JOIN runtime_roles r CROSS JOIN privileges p
  LEFT JOIN pg_catalog.pg_roles pr ON pr.rolname::text=r.role_name
), membership(root,member_oid,role_oid,depth,visited,admin_option) AS (
  SELECT r.rolname::text,m.member,m.roleid,1,ARRAY[m.member,m.roleid],m.admin_option
  FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
  WHERE r.rolname::text IN ('anon','authenticated','service_role')
  UNION ALL
  SELECT w.root,m.member,m.roleid,w.depth+1,w.visited||m.roleid,m.admin_option
  FROM membership w JOIN pg_catalog.pg_auth_members m ON m.member=w.role_oid
  WHERE NOT m.roleid=ANY(w.visited)
), role_attributes AS (
  SELECT r.rolname::text AS role_name,r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcanlogin
  FROM pg_catalog.pg_roles r WHERE r.rolname::text IN ('anon','authenticated','service_role','postgres',current_user,session_user)
    OR r.oid IN (SELECT relowner FROM tables UNION SELECT role_oid FROM membership)
), seq AS (
  SELECT c.oid,c.relowner,c.relacl,c.relname::text AS sequence_name
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='S'
), seq_acl AS (
  SELECT s.sequence_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,
    x.privilege_type::text AS privilege,g.rolname::text AS grantor,x.is_grantable
  FROM seq s CROSS JOIN LATERAL pg_catalog.aclexplode(s.relacl) x
  LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee LEFT JOIN pg_catalog.pg_roles g ON g.oid=x.grantor
), expected_seq(role_name,privilege) AS (VALUES
  ('authenticated','USAGE'),('service_role','USAGE'),('postgres','SELECT'),('postgres','UPDATE'),('postgres','USAGE')
), allowlist(schema_name,table_name,policy_name) AS (VALUES
('public','anexos','Users can delete their own anexos'),
('public','anexos','Users can insert their own anexos'),
('public','anexos','Users can select their own anexos'),
('public','anexos','Users can update their own anexos'),
('public','examen_generation_items','Users can insert their own exam generation items'),
('public','examen_generation_items','Users can read their own exam generation items'),
('public','examen_generation_jobs','Users can insert their own exam generation jobs'),
('public','examen_generation_jobs','Users can read their own exam generation jobs'),
('public','examen_generation_jobs','Users can update their own exam generation jobs'),
('public','examenes','Users can delete their own examenes'),
('public','examenes','Users can view their own examenes'),
('public','grados','grados_owner'),
('public','listas_cotejo','Users can delete their own listas de cotejo'),
('public','listas_cotejo','Users can insert their own listas de cotejo'),
('public','listas_cotejo','Users can read their own listas de cotejo'),
('public','listas_cotejo','Users can update their own listas de cotejo'),
('public','materias','materias_owner'),
('public','planeacion_batches','Users can delete own planeacion batches'),
('public','planeacion_batches','Users can select own planeacion batches'),
('public','planeaciones','delete own planeaciones'),
('public','planeaciones','insert own planeaciones'),
('public','planeaciones','planeaciones_owner'),
('public','planeaciones','select own planeaciones'),
('public','planeaciones','update own planeaciones'),
('public','planteles','planteles_owner'),
('public','unidades','unidades_owner')
), expected_functions(name,body_md5,security_definer,config) AS (VALUES
('handle_new_user','db4596f1ea835acc5d79e921e94c803a',true,ARRAY['search_path=pg_catalog, public']::text[]),
('set_updated_at','204b9b9355e61b7541bc0633bbc9294c',false,NULL::text[]),
('enforce_grado_ownership','f97d9b07b705d78bd7dbaf5c960c543c',false,NULL::text[]),
('enforce_materia_ownership','b50a030da78990d83a0d3549a12092b0',false,NULL::text[]),
('enforce_tema_ownership','65fd6a9c4bc24803bf097347782c5cef',false,NULL::text[]),
('enforce_planeacion_tema_ownership','0905147358485175b60fa446011e1e88',false,NULL::text[])
), actual_functions AS (
  SELECT p.*,n.nspname::text AS schema_name,l.lanname::text AS language_name
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d
    WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
), functions_check AS (
  SELECT (SELECT count(*)=6 FROM actual_functions) AND count(*)=6 AND coalesce(bool_and(
    p.oid IS NOT NULL AND pg_catalog.pg_get_userbyid(p.proowner)::text='postgres'
    AND p.language_name='plpgsql' AND p.prorettype='pg_catalog.trigger'::regtype
    AND p.pronargs=0 AND p.pronargdefaults=0 AND p.provariadic=0 AND p.prosupport=0
    AND NOT p.proisstrict AND NOT p.proleakproof AND NOT p.proretset
    AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
    AND p.prosecdef=e.security_definer AND p.proconfig IS NOT DISTINCT FROM e.config AND md5(p.prosrc)=e.body_md5
    AND pg_catalog.has_function_privilege('postgres',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    AND (SELECT count(*)=1 AND bool_and(x.grantee=p.proowner AND x.grantor=p.proowner
      AND x.privilege_type='EXECUTE' AND NOT x.is_grantable) FROM pg_catalog.aclexplode(p.proacl) x)
  ),false) AS functions_exact
  FROM expected_functions e LEFT JOIN actual_functions p ON p.proname::text=e.name
), expected_triggers(schema_name,table_name,trigger_name,function_name,tgtype) AS (VALUES
('auth','users','on_auth_user_created','handle_new_user',5),
('public','anexos','set_anexos_updated_at','set_updated_at',19),
('public','examenes','set_examenes_updated_at','set_updated_at',19),
('public','grados','trg_grado_ownership','enforce_grado_ownership',23),
('public','grados','trg_grados_updated_at','set_updated_at',19),
('public','listas_cotejo','set_listas_cotejo_updated_at','set_updated_at',19),
('public','materias','trg_materia_ownership','enforce_materia_ownership',23),
('public','materias','trg_materias_updated_at','set_updated_at',19),
('public','planeaciones','trg_planeacion_tema_ownership','enforce_planeacion_tema_ownership',23),
('public','planeaciones','trg_planeaciones_updated_at','set_updated_at',19),
('public','planteles','trg_planteles_updated_at','set_updated_at',19),
('public','profiles','trg_profiles_updated_at','set_updated_at',19),
('public','temas','trg_tema_ownership','enforce_tema_ownership',23),
('public','temas','trg_temas_updated_at','set_updated_at',19),
('public','unidades','trg_unidades_updated_at','set_updated_at',19),
('public','user_settings','trg_user_settings_updated_at','set_updated_at',19)
), actual_triggers AS (
  SELECT n.nspname::text AS schema_name,c.relname::text AS table_name,t.tgname::text AS trigger_name,
    p.proname::text AS function_name,t.tgtype::integer AS tgtype,
    t.tgenabled='O' AND pn.nspname='public' AND p.pronargs=0 AND t.tgqual IS NULL
    AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgattr::text=''
    AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgconstraint=0 AND t.tgparentid=0
    AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS attributes_exact
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
  WHERE NOT t.tgisinternal AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users'))
), triggers_check AS (
  SELECT (SELECT count(*)=16 AND bool_and(attributes_exact) FROM actual_triggers)
    AND NOT EXISTS(SELECT * FROM expected_triggers EXCEPT SELECT schema_name,table_name,trigger_name,function_name,tgtype FROM actual_triggers)
    AND NOT EXISTS(SELECT schema_name,table_name,trigger_name,function_name,tgtype FROM actual_triggers EXCEPT SELECT * FROM expected_triggers) AS triggers_exact
), expected_defaults(grantor,grantee,object_type,privilege) AS (
  SELECT g.grantor,r.grantee,p.object_type,p.privilege
  FROM (VALUES ('postgres'),('supabase_admin')) g(grantor)
  CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role'),('postgres')) r(grantee)
  CROSS JOIN (VALUES ('f','EXECUTE'),('r','DELETE'),('r','INSERT'),('r','REFERENCES'),('r','SELECT'),
    ('r','TRIGGER'),('r','TRUNCATE'),('r','UPDATE'),('S','SELECT'),('S','UPDATE'),('S','USAGE')) p(object_type,privilege)
), actual_defaults AS (
  SELECT grantor.rolname::text grantor,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname::text END grantee,
    d.defaclobjtype::text object_type,x.privilege_type::text privilege,x.is_grantable
  FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles grantor ON grantor.oid=d.defaclrole
  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
  LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=x.grantee
  LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
  WHERE d.defaclnamespace=0 OR n.nspname='public'
), defaults_check AS (
  SELECT count(*)=88
    AND NOT EXISTS(SELECT grantor,grantee,object_type,privilege FROM expected_defaults EXCEPT SELECT grantor,grantee,object_type,privilege FROM actual_defaults)
    AND NOT EXISTS(SELECT grantor,grantee,object_type,privilege FROM actual_defaults EXCEPT SELECT * FROM expected_defaults)
    AND NOT bool_or(is_grantable) AS defaults_exact FROM actual_defaults
), expected_03d3a(name,table_name,type,definition) AS (VALUES
 ('educativo_ia_planeacion_batches_id_user_key','planeacion_batches','u','UNIQUE (id, user_id)'),('educativo_ia_planeaciones_id_user_key','planeaciones','u','UNIQUE (id, user_id)'),
 ('educativo_ia_unidades_id_user_key','unidades','u','UNIQUE (id, user_id)'),('educativo_ia_examen_jobs_id_user_key','examen_generation_jobs','u','UNIQUE (id, user_id)'),
 ('educativo_ia_planeaciones_batch_owner_present','planeaciones','c','CHECK (batch_id IS NULL OR user_id IS NOT NULL)'),('educativo_ia_planeaciones_batch_owner_fkey','planeaciones','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_anexos_planeacion_owner_fkey','anexos','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),('educativo_ia_anexos_batch_owner_fkey','anexos','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_listas_planeacion_owner_fkey','listas_cotejo','f','FOREIGN KEY (planeacion_id, user_id) REFERENCES planeaciones(id, user_id) ON DELETE CASCADE'),('educativo_ia_listas_batch_owner_fkey','listas_cotejo','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examenes_unidad_owner_fkey','examenes','f','FOREIGN KEY (unidad_id, user_id) REFERENCES unidades(id, user_id) ON DELETE CASCADE'),('educativo_ia_examenes_batch_owner_fkey','examenes','f','FOREIGN KEY (batch_id, user_id) REFERENCES planeacion_batches(id, user_id) ON DELETE SET NULL (batch_id)'),
 ('educativo_ia_examen_items_job_owner_fkey','examen_generation_items','f','FOREIGN KEY (job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE CASCADE'),('educativo_ia_examenes_generation_job_owner_fkey','examenes','f','FOREIGN KEY (generation_job_id, user_id) REFERENCES examen_generation_jobs(id, user_id) ON DELETE SET NULL (generation_job_id)')
), actual_03d3a AS (
 SELECT c.conname::text name,t.relname::text table_name,c.contype::text type,c.convalidated,pg_catalog.pg_get_constraintdef(c.oid,true) definition
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
), constraints_check AS (
 SELECT count(*)=14
   AND NOT EXISTS(SELECT * FROM expected_03d3a EXCEPT SELECT name,table_name,type,definition FROM actual_03d3a WHERE convalidated)
   AND NOT EXISTS(SELECT name,table_name,type,definition FROM actual_03d3a WHERE name LIKE 'educativo_ia_%' AND table_name IN ('anexos','examen_generation_items','examen_generation_jobs','examenes','listas_cotejo','planeacion_batches','planeaciones','unidades') EXCEPT SELECT * FROM expected_03d3a) AS constraints_exact
 FROM expected_03d3a
), predicates AS (
  SELECT
    (SELECT count(*)=1 AND bool_and(q.seqtypid='pg_catalog.int8'::regtype AND q.seqstart=1
      AND q.seqincrement=1 AND q.seqmin=1 AND q.seqmax=9223372036854775807 AND q.seqcache=1 AND NOT q.seqcycle)
      FROM seq s JOIN pg_catalog.pg_sequence q ON q.seqrelid=s.oid)
      AND (SELECT count(*)=1 AND bool_and(n.nspname='public' AND t.relname='planeaciones'
        AND a.attname='id' AND a.attidentity='d' AND a.atttypid='pg_catalog.int8'::regtype AND NOT a.attisdropped)
        FROM seq s JOIN pg_catalog.pg_depend d ON d.objid=s.oid AND d.classid='pg_catalog.pg_class'::regclass
          AND d.refclassid='pg_catalog.pg_class'::regclass AND d.deptype='i'
        JOIN pg_catalog.pg_class t ON t.oid=d.refobjid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid) AS sequence_structure_exact,
    (SELECT functions_exact FROM functions_check) AS functions_exact,
    (SELECT triggers_exact FROM triggers_check) AS triggers_exact,
    (SELECT defaults_exact FROM defaults_check) AS defaults_exact,
    (SELECT constraints_exact FROM constraints_check) AS constraints_exact,
    (SELECT count(*)=4 AND bool_and(rolbypassrls=(role_name IN ('postgres','service_role')))
      FROM role_attributes WHERE role_name IN ('anon','authenticated','service_role','postgres')) AS bypass_exact,
    (SELECT count(*)=26 FROM allowlist)
      AND NOT EXISTS(SELECT table_name,policy_name FROM allowlist EXCEPT SELECT table_name,policy_name FROM proposed_classification WHERE classification='NARROW_CANDIDATE')
      AND NOT EXISTS(SELECT table_name,policy_name FROM proposed_classification WHERE classification='NARROW_CANDIDATE' EXCEPT SELECT table_name,policy_name FROM allowlist)
      AND NOT EXISTS(SELECT 1 FROM proposed_classification WHERE classification='DECISION_REQUIRED') AS allowlist_exact,
    current_setting('server_version_num')::integer=150008 AS server_context_matches,
    current_user='postgres' AND session_user='postgres' AS authority_context_matches,
    (SELECT count(*)=19 FROM tables) AND NOT EXISTS(SELECT table_name FROM tables EXCEPT SELECT table_name FROM expected_tables)
      AND NOT EXISTS(SELECT table_name FROM expected_tables EXCEPT SELECT table_name FROM tables) AS tables_exact,
    (SELECT count(*)=49 FROM policies) AND NOT EXISTS(SELECT 1 FROM missing_policies)
      AND NOT EXISTS(SELECT 1 FROM additional_policies) AND (SELECT full_md5='3c533f67f0e5cbeee119171f9e4a30bf' FROM observed_fingerprint) AS policies_exact,
    (SELECT count(*) FILTER(WHERE roles=ARRAY['public']::text[])=22 AND count(*) FILTER(WHERE roles=ARRAY['authenticated']::text[])=27 FROM policies) AS policy_roles_exact,
    (SELECT count(*)=19 AND bool_and(relrowsecurity) AND NOT bool_or(relforcerowsecurity) FROM tables) AS rls_and_force_exact,
    (SELECT count(*)=19 AND bool_and(pg_catalog.pg_get_userbyid(relowner)::text='postgres') FROM tables) AS table_owners_exact,
    NOT EXISTS(SELECT table_name,role_name,privilege FROM acl EXCEPT SELECT * FROM expected_acl)
      AND NOT EXISTS(SELECT * FROM expected_acl EXCEPT SELECT table_name,role_name,privilege FROM acl)
      AND NOT EXISTS(SELECT 1 FROM acl WHERE grantor IS DISTINCT FROM 'postgres' OR is_grantable)
      AND (SELECT count(*)=399 FROM effective)
      AND NOT EXISTS(SELECT 1 FROM effective WHERE direct_grant IS DISTINCT FROM expected_grant OR effective_grant IS DISTINCT FROM expected_grant) AS post_b0_grants_exact,
    NOT EXISTS(SELECT 1 FROM membership) AS runtime_memberships_absent,
    (SELECT count(*)=3 FROM role_attributes WHERE role_name IN ('anon','authenticated','service_role')) AS runtime_roles_present,
    (SELECT count(*)=2 AND bool_and(NOT rolsuper AND NOT rolbypassrls) FROM role_attributes WHERE role_name IN ('anon','authenticated')) AS user_roles_subject_to_rls,
    coalesce((SELECT rolbypassrls OR rolsuper FROM role_attributes WHERE role_name='service_role'),false) AS service_role_bypass_observed,
    (SELECT count(*)=1 AND bool_and(sequence_name='planeaciones_id_seq' AND pg_catalog.pg_get_userbyid(relowner)::text='postgres') FROM seq)
      AND NOT EXISTS(SELECT role_name,privilege FROM seq_acl EXCEPT SELECT * FROM expected_seq)
      AND NOT EXISTS(SELECT * FROM expected_seq EXCEPT SELECT role_name,privilege FROM seq_acl)
      AND NOT EXISTS(SELECT 1 FROM seq_acl WHERE grantor IS DISTINCT FROM 'postgres' OR is_grantable)
      AND NOT EXISTS(SELECT 1 FROM seq s CROSS JOIN runtime_roles r CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) p(privilege)
        LEFT JOIN pg_catalog.pg_roles pr ON pr.rolname::text=r.role_name
        WHERE pg_catalog.has_sequence_privilege(pr.oid,s.oid,p.privilege) IS DISTINCT FROM (r.role_name<>'anon' AND p.privilege='USAGE')) AS post_b2_sequence_exact
), classification_counts AS (
  SELECT c.classification,count(p.classification)::integer AS proposed_count
  FROM (VALUES ('NARROW_CANDIDATE'),('KEEP_PUBLIC'),('ALREADY_AUTHENTICATED'),('DECISION_REQUIRED'),('LEGACY_OR_DEFERRED')) c(classification)
  LEFT JOIN proposed_classification p USING(classification) GROUP BY c.classification
)
SELECT jsonb_build_object(
  'allowlist',(SELECT jsonb_agg(to_jsonb(a) ORDER BY table_name,policy_name) FROM allowlist a),
  'session',jsonb_build_object('server_version_num',current_setting('server_version_num'),'current_user',current_user,'session_user',session_user),
  'policies',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity) ORDER BY p.table_name,p.policy_name) FROM policies p LEFT JOIN tables t USING(table_name)),'[]'::jsonb),
  'table_grants_direct',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY table_name,role_name,privilege) FROM acl a),'[]'::jsonb),
  'table_grants_effective',coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('inherited_or_public_effect',effective_grant AND NOT direct_grant) ORDER BY table_name,role_name,privilege) FROM effective e),'[]'::jsonb),
  'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('root',root,'member',pg_catalog.pg_get_userbyid(member_oid)::text,'role',pg_catalog.pg_get_userbyid(role_oid)::text,'depth',depth,'direct',depth=1,'admin_option',admin_option) ORDER BY root,depth,role_oid) FROM membership),'[]'::jsonb),
  'role_attributes',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY role_name) FROM role_attributes r),'[]'::jsonb),
  'table_owners',coalesce((SELECT jsonb_agg(jsonb_build_object('table',table_name,'owner',pg_catalog.pg_get_userbyid(relowner)::text,'rls',relrowsecurity,'force_rls',relforcerowsecurity) ORDER BY table_name) FROM tables),'[]'::jsonb),
  'sequence_grants',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY role_name,privilege) FROM seq_acl s),'[]'::jsonb),
  'summary',(SELECT to_jsonb(p)||jsonb_build_object('table_count',(SELECT count(*) FROM tables),'policy_count',(SELECT count(*) FROM policies),
    'public_policy_count',(SELECT count(*) FROM policies WHERE roles=ARRAY['public']::text[]),
    'authenticated_policy_count',(SELECT count(*) FROM policies WHERE roles=ARRAY['authenticated']::text[]),
    'rls_enabled_count',(SELECT count(*) FROM tables WHERE relrowsecurity),'force_rls_count',(SELECT count(*) FROM tables WHERE relforcerowsecurity),
    'missing_or_changed',(SELECT count(*) FROM missing_policies),'additional_or_changed',(SELECT count(*) FROM additional_policies),
    'expected_full_md5','3c533f67f0e5cbeee119171f9e4a30bf','observed_full_md5',(SELECT full_md5 FROM observed_fingerprint),
    'classification_counts',(SELECT jsonb_object_agg(classification,proposed_count) FROM classification_counts),
    'catalog_context_matches',coalesce(server_context_matches AND authority_context_matches AND tables_exact AND policies_exact AND policy_roles_exact AND rls_and_force_exact AND table_owners_exact AND post_b0_grants_exact AND runtime_memberships_absent AND runtime_roles_present AND user_roles_subject_to_rls AND service_role_bypass_observed AND post_b2_sequence_exact AND sequence_structure_exact AND functions_exact AND triggers_exact AND defaults_exact AND constraints_exact AND bypass_exact AND allowlist_exact,false),
    'apt_to_apply',coalesce(server_context_matches AND authority_context_matches AND tables_exact AND policies_exact AND policy_roles_exact AND rls_and_force_exact AND table_owners_exact AND post_b0_grants_exact AND runtime_memberships_absent AND runtime_roles_present AND user_roles_subject_to_rls AND service_role_bypass_observed AND post_b2_sequence_exact AND sequence_structure_exact AND functions_exact AND triggers_exact AND defaults_exact AND constraints_exact AND bypass_exact AND allowlist_exact,false)) FROM predicates p)
) || jsonb_build_object(
  'expected_project_name','educativo-backend','expected_project_ref','bfnkaqmhcsyxdxoqnahk','expected_region','us-east-2',
  'project_ref_verified_by_sql',false,'visual_project_ref_confirmation_required',true,
  'server_context_matches',(SELECT server_context_matches FROM predicates),
  'authority_context_matches',(SELECT authority_context_matches FROM predicates),
  'policy_count',(SELECT count(*) FROM policies),
  'public_policy_count',(SELECT count(*) FROM policies WHERE roles=ARRAY['public']::text[]),
  'authenticated_policy_count',(SELECT count(*) FROM policies WHERE roles=ARRAY['authenticated']::text[]),
  'candidate_policy_count',(SELECT count(*) FROM allowlist),
  'matched_candidate_policy_count',(SELECT count(*) FROM allowlist a JOIN policies p USING(schema_name,table_name,policy_name) WHERE EXISTS(SELECT 1 FROM expected_post_policies e WHERE e.schema_name=p.schema_name AND e.table_name=p.table_name AND e.policy_name=p.policy_name AND e.command=p.command AND e.permissive=p.permissive AND e.roles=p.roles AND e.using_expr IS NOT DISTINCT FROM p.using_expr AND e.check_expr IS NOT DISTINCT FROM p.check_expr)),
  'missing_or_changed_candidate_count',(SELECT count(*) FROM allowlist a LEFT JOIN policies p USING(schema_name,table_name,policy_name) WHERE p.policy_name IS NULL OR NOT EXISTS(SELECT 1 FROM expected_post_policies e WHERE e.schema_name=p.schema_name AND e.table_name=p.table_name AND e.policy_name=p.policy_name AND e.command=p.command AND e.permissive=p.permissive AND e.roles=p.roles AND e.using_expr IS NOT DISTINCT FROM p.using_expr AND e.check_expr IS NOT DISTINCT FROM p.check_expr)),
  'unexpected_candidate_count',(SELECT count(*) FROM (SELECT table_name,policy_name FROM allowlist EXCEPT SELECT table_name,policy_name FROM proposed_classification WHERE classification='NARROW_CANDIDATE') x) + (SELECT count(*) FROM (SELECT table_name,policy_name FROM proposed_classification WHERE classification='NARROW_CANDIDATE' EXCEPT SELECT table_name,policy_name FROM allowlist) y),
  'allowlist_exact',(SELECT allowlist_exact FROM predicates),
  'observed_baseline_fingerprint',(SELECT full_md5 FROM observed_fingerprint),
  'expected_baseline_fingerprint','3c533f67f0e5cbeee119171f9e4a30bf',
  'expected_post_b3_fingerprint','3c533f67f0e5cbeee119171f9e4a30bf',
  'expected_post_b3_public_policy_count',22,'expected_post_b3_authenticated_policy_count',27,
  'legacy_or_deferred_policy_count',(SELECT count(*) FROM proposed_classification WHERE classification='LEGACY_OR_DEFERRED'),
  'already_authenticated_policy_count',(SELECT count(*) FROM proposed_classification WHERE classification='ALREADY_AUTHENTICATED'),
  'catalog_context_matches',(SELECT coalesce(server_context_matches AND authority_context_matches AND tables_exact AND policies_exact AND policy_roles_exact AND rls_and_force_exact AND table_owners_exact AND post_b0_grants_exact AND runtime_memberships_absent AND runtime_roles_present AND user_roles_subject_to_rls AND service_role_bypass_observed AND post_b2_sequence_exact AND sequence_structure_exact AND functions_exact AND triggers_exact AND defaults_exact AND constraints_exact AND bypass_exact AND allowlist_exact,false) FROM predicates),
  'postverify_ok',(SELECT coalesce(server_context_matches AND authority_context_matches AND tables_exact AND policies_exact AND policy_roles_exact AND rls_and_force_exact AND table_owners_exact AND post_b0_grants_exact AND runtime_memberships_absent AND runtime_roles_present AND user_roles_subject_to_rls AND service_role_bypass_observed AND post_b2_sequence_exact AND sequence_structure_exact AND functions_exact AND triggers_exact AND defaults_exact AND constraints_exact AND bypass_exact AND allowlist_exact,false) FROM predicates)
) AS production_postverify_result INTO gate_payload;
IF coalesce((gate_payload->>'postverify_ok')::boolean,false) IS NOT TRUE THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='03D3C2-B3 rollback gate failed before ALTER POLICY';
END IF;
END;
$b3$;
ALTER POLICY "Users can delete their own anexos" ON "public"."anexos" TO PUBLIC;
ALTER POLICY "Users can insert their own anexos" ON "public"."anexos" TO PUBLIC;
ALTER POLICY "Users can select their own anexos" ON "public"."anexos" TO PUBLIC;
ALTER POLICY "Users can update their own anexos" ON "public"."anexos" TO PUBLIC;
ALTER POLICY "Users can insert their own exam generation items" ON "public"."examen_generation_items" TO PUBLIC;
ALTER POLICY "Users can read their own exam generation items" ON "public"."examen_generation_items" TO PUBLIC;
ALTER POLICY "Users can insert their own exam generation jobs" ON "public"."examen_generation_jobs" TO PUBLIC;
ALTER POLICY "Users can read their own exam generation jobs" ON "public"."examen_generation_jobs" TO PUBLIC;
ALTER POLICY "Users can update their own exam generation jobs" ON "public"."examen_generation_jobs" TO PUBLIC;
ALTER POLICY "Users can delete their own examenes" ON "public"."examenes" TO PUBLIC;
ALTER POLICY "Users can view their own examenes" ON "public"."examenes" TO PUBLIC;
ALTER POLICY "grados_owner" ON "public"."grados" TO PUBLIC;
ALTER POLICY "Users can delete their own listas de cotejo" ON "public"."listas_cotejo" TO PUBLIC;
ALTER POLICY "Users can insert their own listas de cotejo" ON "public"."listas_cotejo" TO PUBLIC;
ALTER POLICY "Users can read their own listas de cotejo" ON "public"."listas_cotejo" TO PUBLIC;
ALTER POLICY "Users can update their own listas de cotejo" ON "public"."listas_cotejo" TO PUBLIC;
ALTER POLICY "materias_owner" ON "public"."materias" TO PUBLIC;
ALTER POLICY "Users can delete own planeacion batches" ON "public"."planeacion_batches" TO PUBLIC;
ALTER POLICY "Users can select own planeacion batches" ON "public"."planeacion_batches" TO PUBLIC;
ALTER POLICY "delete own planeaciones" ON "public"."planeaciones" TO PUBLIC;
ALTER POLICY "insert own planeaciones" ON "public"."planeaciones" TO PUBLIC;
ALTER POLICY "planeaciones_owner" ON "public"."planeaciones" TO PUBLIC;
ALTER POLICY "select own planeaciones" ON "public"."planeaciones" TO PUBLIC;
ALTER POLICY "update own planeaciones" ON "public"."planeaciones" TO PUBLIC;
ALTER POLICY "planteles_owner" ON "public"."planteles" TO PUBLIC;
ALTER POLICY "unidades_owner" ON "public"."unidades" TO PUBLIC;
COMMIT;
