-- SESSION 02C: REVIEW DRAFT. NEW EMPTY SUPABASE TEST PROJECT ONLY.
-- NOT a migration, production repair, backup, or automatic deployment input.
-- Source: user CSV blocks 01-11, PostgreSQL 15.8; no application rows.
-- Read README.md first. This script deliberately refuses to run until BOTH
-- local review acknowledgements below are changed. They do not detect a project.
-- Identity sequence settings are NOT in the exports: defaults below provide
-- functional identity only, NOT exact sequence reproduction. See supplemental SQL.
-- Broad observed ACL/RLS are reproduced, NOT endorsed for launch.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE
  confirmed_new_test_project boolean := false;
  accepted_target_identity_defaults boolean := false;
BEGIN
  IF NOT confirmed_new_test_project THEN
    RAISE EXCEPTION 'STOP: independently confirm NEW EMPTY TEST project; never production';
  END IF;
  IF NOT accepted_target_identity_defaults THEN
    RAISE EXCEPTION 'STOP: sequence parameters missing; review supplemental metadata or explicitly accept functional target defaults';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Expected postgres owner/executor; do not change ownership assumptions silently';
  END IF;
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'Requires PostgreSQL >= 15; source was 15.8; target compatibility still needs validation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
  ) THEN RAISE EXCEPTION 'public must have no application relations or sequences'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_proc'::regclass
      AND d.objid=p.oid AND d.deptype='e'
    )
  ) THEN RAISE EXCEPTION 'Unexpected non-extension functions in public'; END IF;
  IF pg_catalog.to_regclass('auth.users') IS NULL OR pg_catalog.to_regclass('storage.objects') IS NULL
     OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
     OR pg_catalog.to_regprocedure('storage.foldername(text)') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Missing managed Supabase dependencies; do not recreate them here';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
             WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Existing custom auth.users trigger: review to prevent duplicate provisioning';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Existing Storage policies: target is not empty as expected';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Managed storage.objects must already have RLS enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS expected(name)
             WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=expected.name)) THEN
    RAISE EXCEPTION 'Missing managed roles';
  END IF;
  IF NOT pg_catalog.has_schema_privilege('authenticated','public','USAGE')
     OR NOT pg_catalog.has_schema_privilege('anon','public','USAGE')
     OR NOT pg_catalog.has_schema_privilege('service_role','public','USAGE') THEN
    RAISE EXCEPTION 'Managed public schema USAGE missing; inspect separately';
  END IF;
END;
$preflight$;

-- 1. Tables without constraints: circular FKs are added only after all keys exist.

CREATE TABLE "public"."ai_generation_calls" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "artifact_type" text COLLATE "pg_catalog"."default" NOT NULL,
  "call_purpose" text COLLATE "pg_catalog"."default" DEFAULT 'main_generation'::text NOT NULL,
  "model" text COLLATE "pg_catalog"."default" NOT NULL,
  "prompt_version" text COLLATE "pg_catalog"."default",
  "prompt_tokens" integer DEFAULT 0 NOT NULL,
  "completion_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "cached_tokens" integer DEFAULT 0 NOT NULL,
  "reasoning_tokens" integer DEFAULT 0 NOT NULL,
  "input_cost_per_1m" numeric(12,6),
  "output_cost_per_1m" numeric(12,6),
  "calculated_cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'success'::text NOT NULL,
  "json_ok" boolean,
  "validation_ok" boolean,
  "retry_number" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "request_id" text COLLATE "pg_catalog"."default",
  "error_type" text COLLATE "pg_catalog"."default",
  "error_message_safe" text COLLATE "pg_catalog"."default",
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."ai_generation_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "artifact_type" text COLLATE "pg_catalog"."default" NOT NULL,
  "action_type" text COLLATE "pg_catalog"."default" DEFAULT 'generate'::text NOT NULL,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'started'::text NOT NULL,
  "batch_id" uuid,
  "planeacion_id" bigint,
  "examen_id" uuid,
  "lista_cotejo_id" uuid,
  "anexo_id" uuid,
  "nivel" text COLLATE "pg_catalog"."default",
  "materia" text COLLATE "pg_catalog"."default",
  "tema" text COLLATE "pg_catalog"."default",
  "titulo" text COLLATE "pg_catalog"."default",
  "input_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "total_prompt_tokens" integer DEFAULT 0 NOT NULL,
  "total_completion_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "total_cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
  "calls_count" integer DEFAULT 0 NOT NULL,
  "retries_count" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "duration_ms" integer,
  "error_type" text COLLATE "pg_catalog"."default",
  "error_message_safe" text COLLATE "pg_catalog"."default",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."ai_model_prices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "model" text COLLATE "pg_catalog"."default" NOT NULL,
  "input_cost_per_1m" numeric(12,6) NOT NULL,
  "output_cost_per_1m" numeric(12,6) NOT NULL,
  "cached_input_cost_per_1m" numeric(12,6),
  "currency" text COLLATE "pg_catalog"."default" DEFAULT 'USD'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "source_note" text COLLATE "pg_catalog"."default",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."anexos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "planeacion_id" bigint NOT NULL,
  "tema_id" uuid,
  "unidad_id" uuid,
  "batch_id" uuid,
  "titulo" text COLLATE "pg_catalog"."default" NOT NULL,
  "materia" text COLLATE "pg_catalog"."default",
  "nivel" text COLLATE "pg_catalog"."default",
  "tema" text COLLATE "pg_catalog"."default",
  "contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prompt_version" text COLLATE "pg_catalog"."default" DEFAULT 'v1_anexos_desde_planeacion'::text NOT NULL,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'generated'::text NOT NULL,
  "error_tipo" text COLLATE "pg_catalog"."default",
  "error_message" text COLLATE "pg_catalog"."default",
  "tokens_prompt" integer,
  "tokens_completion" integer,
  "tokens_total" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."examen_generation_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "pregunta_numero" integer NOT NULL,
  "tema_id" uuid,
  "tema" text COLLATE "pg_catalog"."default",
  "tipo_pregunta" text COLLATE "pg_catalog"."default" NOT NULL,
  "pregunta_ia" jsonb,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'pending'::text NOT NULL,
  "validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "max_retries" integer DEFAULT 3 NOT NULL,
  "error_message" text COLLATE "pg_catalog"."default",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."examen_generation_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "examen_id" uuid,
  "plantel_id" uuid,
  "grado_id" uuid,
  "materia_id" uuid,
  "unidad_id" uuid,
  "titulo" text COLLATE "pg_catalog"."default" NOT NULL,
  "instrucciones" text COLLATE "pg_catalog"."default",
  "tipos_pregunta" text[] COLLATE "pg_catalog"."default" DEFAULT '{}'::text[] NOT NULL,
  "total_preguntas" integer NOT NULL,
  "contexto_temas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "configuracion" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'pending'::text NOT NULL,
  "progress_current" integer DEFAULT 0 NOT NULL,
  "progress_total" integer DEFAULT 0 NOT NULL,
  "current_step" text COLLATE "pg_catalog"."default",
  "error_message" text COLLATE "pg_catalog"."default",
  "prompt_version" text COLLATE "pg_catalog"."default",
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."examenes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "plantel_id" uuid,
  "grado_id" uuid,
  "materia_id" uuid,
  "unidad_id" uuid NOT NULL,
  "titulo" text COLLATE "pg_catalog"."default",
  "instrucciones" text COLLATE "pg_catalog"."default",
  "tipos_pregunta" text[] COLLATE "pg_catalog"."default" DEFAULT '{}'::text[] NOT NULL,
  "total_preguntas" integer DEFAULT 0 NOT NULL,
  "contexto_temas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "examen_ia" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prompt_version" text COLLATE "pg_catalog"."default",
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'generado'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generation_job_id" uuid,
  "generation_error" text COLLATE "pg_catalog"."default",
  "validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "batch_id" uuid
);

CREATE TABLE "public"."grados" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "plantel_id" uuid NOT NULL,
  "nombre" text COLLATE "pg_catalog"."default" NOT NULL,
  "orden" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "nivel_base" text COLLATE "pg_catalog"."default" NOT NULL
);

CREATE TABLE "public"."ia_metrics_legacy" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "nivel" text COLLATE "pg_catalog"."default",
  "materia" text COLLATE "pg_catalog"."default",
  "prompt_version" text COLLATE "pg_catalog"."default",
  "tokens_prompt" integer,
  "tokens_completion" integer,
  "tokens_total" integer,
  "json_ok" boolean,
  "error_tipo" text COLLATE "pg_catalog"."default"
);

CREATE TABLE "public"."listas_cotejo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "planeacion_id" bigint NOT NULL,
  "tema_id" uuid,
  "unidad_id" uuid,
  "batch_id" uuid,
  "titulo" text COLLATE "pg_catalog"."default" DEFAULT 'Lista de cotejo'::text NOT NULL,
  "materia" text COLLATE "pg_catalog"."default",
  "nivel" text COLLATE "pg_catalog"."default",
  "tema" text COLLATE "pg_catalog"."default",
  "actividad_cierre" text COLLATE "pg_catalog"."default" DEFAULT ''::text,
  "criterios" jsonb NOT NULL,
  "total_puntos" integer DEFAULT 10 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actividades_evaluadas" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE "public"."materias" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "grado_id" uuid NOT NULL,
  "nombre" text COLLATE "pg_catalog"."default" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."planeacion_batches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "titulo" text COLLATE "pg_catalog"."default" NOT NULL,
  "descripcion" text COLLATE "pg_catalog"."default",
  "nivel" text COLLATE "pg_catalog"."default",
  "materia" text COLLATE "pg_catalog"."default",
  "unidad" text COLLATE "pg_catalog"."default",
  "plantel_id" uuid,
  "grado_id" uuid,
  "materia_id" uuid,
  "unidad_id" uuid,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'ready'::text,
  "is_archived" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."planeaciones" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public.planeaciones_id_seq) NOT NULL,
  "materia" text COLLATE "pg_catalog"."default",
  "nivel" text COLLATE "pg_catalog"."default",
  "tema" text COLLATE "pg_catalog"."default",
  "duracion" smallint,
  "fecha_creacion" timestamp with time zone DEFAULT now(),
  "subtema" text COLLATE "pg_catalog"."default",
  "sesiones" smallint,
  "tabla_ia" jsonb,
  "user_id" uuid DEFAULT auth.uid(),
  "batch_id" uuid,
  "unidad" integer,
  "tema_id" uuid,
  "status" text COLLATE "pg_catalog"."default" DEFAULT 'ready'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "custom_title" text COLLATE "pg_catalog"."default",
  "actividad_cierre" text COLLATE "pg_catalog"."default",
  "actividades_momentos" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE "public"."planteles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "nombre" text COLLATE "pg_catalog"."default" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."profiles" (
  "id" uuid NOT NULL,
  "full_name" text COLLATE "pg_catalog"."default",
  "email" text COLLATE "pg_catalog"."default",
  "avatar_url" text COLLATE "pg_catalog"."default",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."temas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "unidad_id" uuid NOT NULL,
  "titulo" text COLLATE "pg_catalog"."default" NOT NULL,
  "duracion" integer,
  "orden" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."unidades" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "materia_id" uuid NOT NULL,
  "nombre" text COLLATE "pg_catalog"."default" NOT NULL,
  "orden" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."user_profiles" (
  "user_id" uuid NOT NULL,
  "email" text COLLATE "pg_catalog"."default",
  "full_name" text COLLATE "pg_catalog"."default",
  "role" text COLLATE "pg_catalog"."default" DEFAULT 'tester'::text NOT NULL,
  "is_test_user" boolean DEFAULT true NOT NULL,
  "tester_group" text COLLATE "pg_catalog"."default",
  "notes" text COLLATE "pg_catalog"."default",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."user_settings" (
  "user_id" uuid NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Primary/unique/check constraints, then foreign keys (including exam/job cycle).

ALTER TABLE "public"."ai_generation_calls" ADD CONSTRAINT "ai_generation_calls_artifact_type_check" CHECK (artifact_type = ANY (ARRAY['planeacion'::text, 'examen'::text, 'lista_cotejo'::text, 'anexo'::text]));

ALTER TABLE "public"."ai_generation_calls" ADD CONSTRAINT "ai_generation_calls_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."ai_generation_calls" ADD CONSTRAINT "ai_generation_calls_status_check" CHECK (status = ANY (ARRAY['success'::text, 'error'::text]));

ALTER TABLE "public"."ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_action_type_check" CHECK (action_type = ANY (ARRAY['generate'::text, 'regenerate'::text, 'preview'::text, 'download'::text]));

ALTER TABLE "public"."ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_artifact_type_check" CHECK (artifact_type = ANY (ARRAY['planeacion'::text, 'examen'::text, 'lista_cotejo'::text, 'anexo'::text]));

ALTER TABLE "public"."ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_status_check" CHECK (status = ANY (ARRAY['started'::text, 'success'::text, 'error'::text, 'partial'::text, 'cancelled'::text]));

ALTER TABLE "public"."ai_model_prices" ADD CONSTRAINT "ai_model_prices_model_key" UNIQUE (model);

ALTER TABLE "public"."ai_model_prices" ADD CONSTRAINT "ai_model_prices_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."anexos" ADD CONSTRAINT "anexos_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."examen_generation_items" ADD CONSTRAINT "examen_generation_items_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."examen_generation_items" ADD CONSTRAINT "unique_job_question_number" UNIQUE (job_id, pregunta_numero);

ALTER TABLE "public"."examen_generation_jobs" ADD CONSTRAINT "examen_generation_jobs_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_total_preguntas_check" CHECK (total_preguntas >= 0);

ALTER TABLE "public"."grados" ADD CONSTRAINT "grados_nivel_base_check" CHECK (nivel_base = ANY (ARRAY['Primaria'::text, 'Secundaria'::text, 'Preparatoria'::text, 'Universidad'::text]));

ALTER TABLE "public"."grados" ADD CONSTRAINT "grados_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."grados" ADD CONSTRAINT "grados_plantel_id_nombre_key" UNIQUE (plantel_id, nombre);

ALTER TABLE "public"."ia_metrics_legacy" ADD CONSTRAINT "ia_metrics_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_criterios_array_check" CHECK (jsonb_typeof(criterios) = 'array'::text);

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_total_puntos_check" CHECK (total_puntos = 10);

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_una_por_planeacion" UNIQUE (planeacion_id);

ALTER TABLE "public"."materias" ADD CONSTRAINT "materias_grado_id_nombre_key" UNIQUE (grado_id, nombre);

ALTER TABLE "public"."materias" ADD CONSTRAINT "materias_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."planeacion_batches" ADD CONSTRAINT "planeacion_batches_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."planeaciones" ADD CONSTRAINT "planeaciones_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."planteles" ADD CONSTRAINT "planteles_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."planteles" ADD CONSTRAINT "planteles_user_id_nombre_key" UNIQUE (user_id, nombre);

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."temas" ADD CONSTRAINT "temas_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."unidades" ADD CONSTRAINT "unidades_materia_id_nombre_key" UNIQUE (materia_id, nombre);

ALTER TABLE "public"."unidades" ADD CONSTRAINT "unidades_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."user_profiles" ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY (user_id);

ALTER TABLE "public"."user_settings" ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY (user_id);

ALTER TABLE "public"."ai_generation_calls" ADD CONSTRAINT "ai_generation_calls_job_id_fkey" FOREIGN KEY (job_id) REFERENCES "public"."ai_generation_jobs"(id) ON DELETE CASCADE;

ALTER TABLE "public"."ai_generation_calls" ADD CONSTRAINT "ai_generation_calls_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."anexos" ADD CONSTRAINT "anexos_planeacion_id_fkey" FOREIGN KEY (planeacion_id) REFERENCES "public"."planeaciones"(id) ON DELETE CASCADE;

ALTER TABLE "public"."anexos" ADD CONSTRAINT "anexos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."examen_generation_items" ADD CONSTRAINT "examen_generation_items_job_id_fkey" FOREIGN KEY (job_id) REFERENCES "public"."examen_generation_jobs"(id) ON DELETE CASCADE;

ALTER TABLE "public"."examen_generation_items" ADD CONSTRAINT "examen_generation_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."examen_generation_jobs" ADD CONSTRAINT "examen_generation_jobs_examen_id_fkey" FOREIGN KEY (examen_id) REFERENCES "public"."examenes"(id) ON DELETE SET NULL;

ALTER TABLE "public"."examen_generation_jobs" ADD CONSTRAINT "examen_generation_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES "public"."planeacion_batches"(id) ON DELETE SET NULL;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_generation_job_id_fkey" FOREIGN KEY (generation_job_id) REFERENCES "public"."examen_generation_jobs"(id) ON DELETE SET NULL;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_grado_id_fkey" FOREIGN KEY (grado_id) REFERENCES "public"."grados"(id) ON DELETE SET NULL;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_materia_id_fkey" FOREIGN KEY (materia_id) REFERENCES "public"."materias"(id) ON DELETE SET NULL;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_plantel_id_fkey" FOREIGN KEY (plantel_id) REFERENCES "public"."planteles"(id) ON DELETE SET NULL;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_unidad_id_fkey" FOREIGN KEY (unidad_id) REFERENCES "public"."unidades"(id) ON DELETE CASCADE;

ALTER TABLE "public"."examenes" ADD CONSTRAINT "examenes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."grados" ADD CONSTRAINT "grados_plantel_id_fkey" FOREIGN KEY (plantel_id) REFERENCES "public"."planteles"(id) ON DELETE CASCADE;

ALTER TABLE "public"."grados" ADD CONSTRAINT "grados_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES "public"."planeacion_batches"(id) ON DELETE SET NULL;

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_planeacion_id_fkey" FOREIGN KEY (planeacion_id) REFERENCES "public"."planeaciones"(id) ON DELETE CASCADE;

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_tema_id_fkey" FOREIGN KEY (tema_id) REFERENCES "public"."temas"(id) ON DELETE SET NULL;

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_unidad_id_fkey" FOREIGN KEY (unidad_id) REFERENCES "public"."unidades"(id) ON DELETE SET NULL;

ALTER TABLE "public"."listas_cotejo" ADD CONSTRAINT "listas_cotejo_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."materias" ADD CONSTRAINT "materias_grado_id_fkey" FOREIGN KEY (grado_id) REFERENCES "public"."grados"(id) ON DELETE CASCADE;

ALTER TABLE "public"."materias" ADD CONSTRAINT "materias_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."planeacion_batches" ADD CONSTRAINT "planeacion_batches_grado_id_fkey" FOREIGN KEY (grado_id) REFERENCES "public"."grados"(id) ON DELETE SET NULL;

ALTER TABLE "public"."planeacion_batches" ADD CONSTRAINT "planeacion_batches_materia_id_fkey" FOREIGN KEY (materia_id) REFERENCES "public"."materias"(id) ON DELETE SET NULL;

ALTER TABLE "public"."planeacion_batches" ADD CONSTRAINT "planeacion_batches_plantel_id_fkey" FOREIGN KEY (plantel_id) REFERENCES "public"."planteles"(id) ON DELETE SET NULL;

ALTER TABLE "public"."planeacion_batches" ADD CONSTRAINT "planeacion_batches_unidad_id_fkey" FOREIGN KEY (unidad_id) REFERENCES "public"."unidades"(id) ON DELETE SET NULL;

ALTER TABLE "public"."planeacion_batches" ADD CONSTRAINT "planeacion_batches_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."planeaciones" ADD CONSTRAINT "planeaciones_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES "public"."planeacion_batches"(id) ON DELETE SET NULL;

ALTER TABLE "public"."planeaciones" ADD CONSTRAINT "planeaciones_tema_id_fkey" FOREIGN KEY (tema_id) REFERENCES "public"."temas"(id) ON DELETE SET NULL;

ALTER TABLE "public"."planeaciones" ADD CONSTRAINT "planeaciones_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id);

ALTER TABLE "public"."planteles" ADD CONSTRAINT "planteles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."temas" ADD CONSTRAINT "temas_unidad_id_fkey" FOREIGN KEY (unidad_id) REFERENCES "public"."unidades"(id) ON DELETE CASCADE;

ALTER TABLE "public"."temas" ADD CONSTRAINT "temas_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."unidades" ADD CONSTRAINT "unidades_materia_id_fkey" FOREIGN KEY (materia_id) REFERENCES "public"."materias"(id) ON DELETE CASCADE;

ALTER TABLE "public"."unidades" ADD CONSTRAINT "unidades_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "auth"."users"(id) ON DELETE CASCADE;

-- 3. Non-constraint indexes; PK/UNIQUE indexes already created above.

CREATE INDEX idx_ai_generation_calls_artifact_type ON public.ai_generation_calls USING btree (artifact_type);

CREATE INDEX idx_ai_generation_calls_created_at ON public.ai_generation_calls USING btree (created_at DESC);

CREATE INDEX idx_ai_generation_calls_job_id ON public.ai_generation_calls USING btree (job_id);

CREATE INDEX idx_ai_generation_calls_model ON public.ai_generation_calls USING btree (model);

CREATE INDEX idx_ai_generation_calls_user_id ON public.ai_generation_calls USING btree (user_id);

CREATE INDEX idx_ai_generation_jobs_artifact_type ON public.ai_generation_jobs USING btree (artifact_type);

CREATE INDEX idx_ai_generation_jobs_created_at ON public.ai_generation_jobs USING btree (created_at DESC);

CREATE INDEX idx_ai_generation_jobs_status ON public.ai_generation_jobs USING btree (status);

CREATE INDEX idx_ai_generation_jobs_user_id ON public.ai_generation_jobs USING btree (user_id);

CREATE INDEX idx_anexos_batch_id ON public.anexos USING btree (batch_id);

CREATE INDEX idx_anexos_planeacion_id ON public.anexos USING btree (planeacion_id);

CREATE INDEX idx_anexos_tema_id ON public.anexos USING btree (tema_id);

CREATE INDEX idx_anexos_user_id ON public.anexos USING btree (user_id);

CREATE UNIQUE INDEX unique_anexo_por_planeacion ON public.anexos USING btree (planeacion_id);

CREATE INDEX idx_examen_generation_items_job_id ON public.examen_generation_items USING btree (job_id);

CREATE INDEX idx_examen_generation_items_status ON public.examen_generation_items USING btree (status);

CREATE INDEX idx_examen_generation_items_tema_id ON public.examen_generation_items USING btree (tema_id);

CREATE INDEX idx_examen_generation_items_user_id ON public.examen_generation_items USING btree (user_id);

CREATE INDEX idx_examen_generation_jobs_examen_id ON public.examen_generation_jobs USING btree (examen_id);

CREATE INDEX idx_examen_generation_jobs_status ON public.examen_generation_jobs USING btree (status);

CREATE INDEX idx_examen_generation_jobs_unidad_id ON public.examen_generation_jobs USING btree (unidad_id);

CREATE INDEX idx_examen_generation_jobs_user_id ON public.examen_generation_jobs USING btree (user_id);

CREATE INDEX examenes_created_at_idx ON public.examenes USING btree (created_at DESC);

CREATE INDEX examenes_unidad_id_idx ON public.examenes USING btree (unidad_id);

CREATE INDEX examenes_user_id_idx ON public.examenes USING btree (user_id);

CREATE INDEX idx_examenes_batch_id ON public.examenes USING btree (batch_id);

CREATE INDEX idx_examenes_generation_job_id ON public.examenes USING btree (generation_job_id);

CREATE INDEX idx_grados_plantel ON public.grados USING btree (plantel_id);

CREATE INDEX idx_listas_cotejo_batch_id ON public.listas_cotejo USING btree (batch_id);

CREATE INDEX idx_listas_cotejo_planeacion_id ON public.listas_cotejo USING btree (planeacion_id);

CREATE INDEX idx_listas_cotejo_unidad_id ON public.listas_cotejo USING btree (unidad_id);

CREATE INDEX idx_listas_cotejo_user_id ON public.listas_cotejo USING btree (user_id);

CREATE INDEX idx_materias_grado ON public.materias USING btree (grado_id);

CREATE INDEX idx_planeacion_batches_created_at ON public.planeacion_batches USING btree (created_at DESC);

CREATE INDEX idx_planeacion_batches_user_id ON public.planeacion_batches USING btree (user_id);

CREATE INDEX idx_planeaciones_batch_id ON public.planeaciones USING btree (batch_id);

CREATE INDEX idx_planeaciones_tema ON public.planeaciones USING btree (tema_id);

CREATE INDEX idx_planeaciones_user ON public.planeaciones USING btree (user_id);

CREATE INDEX idx_planeaciones_user_archived ON public.planeaciones USING btree (user_id, is_archived);

CREATE INDEX idx_planeaciones_user_archived_created ON public.planeaciones USING btree (user_id, is_archived, fecha_creacion DESC);

CREATE UNIQUE INDEX planeaciones_unq_tema ON public.planeaciones USING btree (tema_id) WHERE (tema_id IS NOT NULL);

CREATE INDEX idx_temas_unidad ON public.temas USING btree (unidad_id);

CREATE INDEX idx_unidades_materia ON public.unidades USING btree (materia_id);

-- 4. Application functions only. No managed auth/storage/extension definitions.

CREATE FUNCTION public.enforce_grado_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (
    select 1
    from public.planteles p
    where p.id = new.plantel_id
      and p.user_id = new.user_id
  ) then
    raise exception 'plantel_id no pertenece a este usuario';
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "public"."enforce_grado_ownership"() OWNER TO "postgres";

CREATE FUNCTION public.enforce_materia_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (
    select 1
    from public.grados g
    where g.id = new.grado_id
      and g.user_id = new.user_id
  ) then
    raise exception 'grado_id no pertenece a este usuario';
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "public"."enforce_materia_ownership"() OWNER TO "postgres";

CREATE FUNCTION public.enforce_planeacion_tema_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.tema_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.temas t
    where t.id = new.tema_id
      and t.user_id = new.user_id
  ) then
    raise exception 'tema_id no pertenece a este usuario';
  end if;

  return new;
end;
$function$;

ALTER FUNCTION "public"."enforce_planeacion_tema_ownership"() OWNER TO "postgres";

CREATE FUNCTION public.enforce_tema_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (
    select 1
    from public.unidades u
    where u.id = new.unidad_id
      and u.user_id = new.user_id
  ) then
    raise exception 'unidad_id no pertenece a este usuario';
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "public"."enforce_tema_ownership"() OWNER TO "postgres";

CREATE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, settings)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

-- 5. Observed RLS state and policies. No security hardening in this reproduction.

ALTER TABLE "public"."ai_generation_calls" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_generation_calls" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_generation_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_generation_jobs" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_model_prices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_model_prices" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."anexos" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."anexos" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."examen_generation_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."examen_generation_items" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."examen_generation_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."examen_generation_jobs" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."examenes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."examenes" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."grados" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."grados" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."ia_metrics_legacy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ia_metrics_legacy" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."listas_cotejo" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."listas_cotejo" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."materias" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."materias" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."planeacion_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planeacion_batches" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."planeaciones" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planeaciones" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."planteles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planteles" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."temas" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."temas" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."unidades" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."unidades" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_profiles" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_settings" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own AI calls" ON "public"."ai_generation_calls" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read own AI calls" ON "public"."ai_generation_calls" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own AI jobs" ON "public"."ai_generation_jobs" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read own AI jobs" ON "public"."ai_generation_jobs" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own AI jobs" ON "public"."ai_generation_jobs" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Authenticated users can read AI model prices" ON "public"."ai_model_prices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Users can delete their own anexos" ON "public"."anexos" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own anexos" ON "public"."anexos" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can select their own anexos" ON "public"."anexos" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own anexos" ON "public"."anexos" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own exam generation items" ON "public"."examen_generation_items" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own exam generation items" ON "public"."examen_generation_items" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read their own exam generation items" ON "public"."examen_generation_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own exam generation items" ON "public"."examen_generation_items" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own exam generation jobs" ON "public"."examen_generation_jobs" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own exam generation jobs" ON "public"."examen_generation_jobs" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read their own exam generation jobs" ON "public"."examen_generation_jobs" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own exam generation jobs" ON "public"."examen_generation_jobs" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own examenes" ON "public"."examenes" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own examenes" ON "public"."examenes" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update their own examenes" ON "public"."examenes" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view their own examenes" ON "public"."examenes" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "grados_owner" ON "public"."grados" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can delete their own listas de cotejo" ON "public"."listas_cotejo" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own listas de cotejo" ON "public"."listas_cotejo" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read their own listas de cotejo" ON "public"."listas_cotejo" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own listas de cotejo" ON "public"."listas_cotejo" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "materias_owner" ON "public"."materias" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can delete own planeacion batches" ON "public"."planeacion_batches" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own planeacion batches" ON "public"."planeacion_batches" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can select own planeacion batches" ON "public"."planeacion_batches" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own planeacion batches" ON "public"."planeacion_batches" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "delete own planeaciones" ON "public"."planeaciones" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "insert own planeaciones" ON "public"."planeaciones" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "planeaciones_owner" ON "public"."planeaciones" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "select own planeaciones" ON "public"."planeaciones" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "update own planeaciones" ON "public"."planeaciones" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "planteles_owner" ON "public"."planteles" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "profiles_insert_own" ON "public"."profiles" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((id = auth.uid()));

CREATE POLICY "profiles_select_own" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((id = auth.uid()));

CREATE POLICY "profiles_update_own" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY "temas_owner" ON "public"."temas" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "unidades_owner" ON "public"."unidades" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read own profile" ON "public"."user_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own profile" ON "public"."user_profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "user_settings_insert_own" ON "public"."user_settings" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "user_settings_select_own" ON "public"."user_settings" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));

CREATE POLICY "user_settings_update_own" ON "public"."user_settings" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can delete their own activity images" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'planeacion-actividades'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "Users can update their own activity images" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'planeacion-actividades'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid)))) WITH CHECK (((bucket_id = 'planeacion-actividades'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "Users can upload their own activity images" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'planeacion-actividades'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "Users can view their own activity images" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'planeacion-actividades'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "avatars_delete_own" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "avatars_insert_own" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "avatars_read_own" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "avatars_update_own" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- 6. Application triggers; includes exactly ONE custom trigger on auth.users.
-- The function body provisions profiles + user_settings, NOT user_profiles.

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER set_anexos_updated_at BEFORE UPDATE ON public.anexos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_examenes_updated_at BEFORE UPDATE ON public.examenes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_grado_ownership BEFORE INSERT OR UPDATE ON public.grados FOR EACH ROW EXECUTE FUNCTION public.enforce_grado_ownership();

CREATE TRIGGER trg_grados_updated_at BEFORE UPDATE ON public.grados FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_listas_cotejo_updated_at BEFORE UPDATE ON public.listas_cotejo FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_materia_ownership BEFORE INSERT OR UPDATE ON public.materias FOR EACH ROW EXECUTE FUNCTION public.enforce_materia_ownership();

CREATE TRIGGER trg_materias_updated_at BEFORE UPDATE ON public.materias FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_planeacion_tema_ownership BEFORE INSERT OR UPDATE ON public.planeaciones FOR EACH ROW EXECUTE FUNCTION public.enforce_planeacion_tema_ownership();

CREATE TRIGGER trg_planeaciones_updated_at BEFORE UPDATE ON public.planeaciones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_planteles_updated_at BEFORE UPDATE ON public.planteles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tema_ownership BEFORE INSERT OR UPDATE ON public.temas FOR EACH ROW EXECUTE FUNCTION public.enforce_tema_ownership();

CREATE TRIGGER trg_temas_updated_at BEFORE UPDATE ON public.temas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_unidades_updated_at BEFORE UPDATE ON public.unidades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Normalize ACL only on the NEW application objects, then restore exported ACL.
-- No managed Storage/schema ACL, roles, or global default privileges are changed.
-- Clear inherited target default grants so existing application ACL is reproducible.
DO $acl$
DECLARE a record;
BEGIN
  FOR a IN
    SELECT n.nspname, c.relname, c.relkind, x.grantee
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault(
      CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) x
    WHERE n.nspname='public' AND c.relkind IN ('r','S')
      AND c.relname IN ('ai_generation_calls','ai_generation_jobs','ai_model_prices','anexos','examen_generation_items','examen_generation_jobs','examenes','grados','ia_metrics_legacy','listas_cotejo','materias','planeacion_batches','planeaciones','planteles','profiles','temas','unidades','user_profiles','user_settings','planeaciones_id_seq')
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON %s %I.%I FROM %s',
      CASE WHEN a.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,a.nspname,a.relname,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(a.grantee)) END);
  END LOOP;
  FOR a IN
    SELECT n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,x.grantee
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
    WHERE n.nspname='public' AND p.proname IN ('enforce_grado_ownership','enforce_materia_ownership','enforce_planeacion_tema_ownership','enforce_tema_ownership','handle_new_user','set_updated_at')
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s',a.nspname,a.proname,a.args,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(a.grantee)) END);
  END LOOP;
END;
$acl$;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_calls" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_calls" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_calls" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_calls" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_jobs" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_jobs" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_jobs" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_generation_jobs" TO "service_role";

GRANT SELECT ON TABLE "public"."ai_model_prices" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_model_prices" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ai_model_prices" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."anexos" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."anexos" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."anexos" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."anexos" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_items" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_items" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_items" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_items" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_jobs" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_jobs" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_jobs" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examen_generation_jobs" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examenes" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examenes" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examenes" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."examenes" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."grados" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."grados" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."grados" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."grados" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ia_metrics_legacy" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ia_metrics_legacy" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."listas_cotejo" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."listas_cotejo" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."listas_cotejo" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."listas_cotejo" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."materias" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."materias" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."materias" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."materias" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeacion_batches" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeacion_batches" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeacion_batches" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeacion_batches" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeaciones" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeaciones" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeaciones" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planeaciones" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."planeaciones_id_seq" TO "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."planeaciones_id_seq" TO "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."planeaciones_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."planeaciones_id_seq" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planteles" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planteles" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planteles" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planteles" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."temas" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."temas" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."temas" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."temas" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."unidades" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."unidades" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."unidades" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."unidades" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "postgres";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."enforce_grado_ownership"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."enforce_grado_ownership"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_grado_ownership"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."enforce_grado_ownership"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."enforce_grado_ownership"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."enforce_materia_ownership"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."enforce_materia_ownership"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_materia_ownership"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."enforce_materia_ownership"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."enforce_materia_ownership"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."enforce_planeacion_tema_ownership"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."enforce_planeacion_tema_ownership"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_planeacion_tema_ownership"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."enforce_planeacion_tema_ownership"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."enforce_planeacion_tema_ownership"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."enforce_tema_ownership"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."enforce_tema_ownership"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_tema_ownership"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."enforce_tema_ownership"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."enforce_tema_ownership"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";

-- No seeds, users, bucket creation, grants on managed objects, or default privileges.
COMMIT;
