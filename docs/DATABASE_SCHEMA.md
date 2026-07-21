# Schema documental del backend

## Naturaleza de este documento

Este archivo documenta el schema conocido de Educativo IA. No contiene credenciales ni debe contener datos reales de usuarios.

Las migraciones SQL son la fuente ejecutable del schema. El código ejecutable confirma cómo se consumen tablas y campos, pero no crea relaciones que no existan en la base. Al 2026-07-20 no hay archivos `.sql` presentes en este repositorio, por lo que las definiciones siguientes son un snapshot documental y no permiten verificar por sí solas el historial de migraciones ni todas las políticas RLS.

Cualquier cambio de tablas, columnas, tipos, relaciones, constraints, índices, cascadas o RLS debe actualizar este documento en la misma sesión. Todos los ejemplos deben usar datos ficticios.

Para reglas generales de trabajo, consultar [`../AGENTS.md`](../AGENTS.md). Para arquitectura descriptiva, consultar [`03-backend-guide.md`](03-backend-guide.md).

## Reglas para agentes

- No inventar columnas.
- No asumir cascadas.
- No asumir foreign keys.
- No cambiar tipos de IDs.
- No cambiar relaciones sin revisar las migraciones SQL.
- No tratar ejemplos de este documento como datos reales.
- No copiar service role, URLs privadas, connection strings, credenciales ni datos reales.
- Si este documento contradice las migraciones, detenerse y reportar la contradicción.
- Si no están disponibles las migraciones necesarias, declarar la limitación y no completar huecos por inferencia.

## Estado de RLS

El backend usa `createUserClient(req.accessToken)` para operaciones de usuario y filtra además por `user_id` en múltiples consultas. El código también usa service role en operaciones backend-only de métricas y en el worker interno de exámenes.

Este snapshot incluye tablas, columnas, constraints, cascadas e índices, pero no contiene sentencias de creación de policies ni `enable row level security`. Por tanto, no permite confirmar documentalmente que todas las tablas tengan RLS ni enumerar sus políticas. Esa verificación requiere las migraciones o el schema exportado con policies. No asumir policies a partir del patrón del código.

## Relación con Biblioteca y la jerarquía técnica

Las tablas y relaciones jerárquicas documentadas aquí son parte del modelo técnico. Su existencia no define la interfaz principal ni significa que el explorador visual jerárquico antiguo siga vigente. Biblioteca es la UI principal actual, mientras Archivados y otros contratos pueden seguir usando `unidad_id`, `tema_id`, `batch_id` y relaciones jerárquicas.

Una decisión de refactor frontend no autoriza a eliminar, cambiar de tipo ni reinterpretar esos IDs o relaciones.

## Definiciones de tablas

Las sentencias siguientes se conservan como snapshot documental. No deben ejecutarse como sustituto de una migración revisada.

<!-- Table ai_generation_calls -->

create table public.ai_generation_calls (
  id uuid not null default gen_random_uuid (),
  job_id uuid not null,
  user_id uuid not null,
  artifact_type text not null,
  call_purpose text not null default 'main_generation'::text,
  model text not null,
  prompt_version text null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  input_cost_per_1m numeric(12, 6) null,
  output_cost_per_1m numeric(12, 6) null,
  calculated_cost_usd numeric(12, 6) not null default 0,
  status text not null default 'success'::text,
  json_ok boolean null,
  validation_ok boolean null,
  retry_number integer not null default 0,
  duration_ms integer null,
  request_id text null,
  error_type text null,
  error_message_safe text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint ai_generation_calls_pkey primary key (id),
  constraint ai_generation_calls_job_id_fkey foreign KEY (job_id) references ai_generation_jobs (id) on delete CASCADE,
  constraint ai_generation_calls_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint ai_generation_calls_artifact_type_check check (
    (
      artifact_type = any (
        array[
          'planeacion'::text,
          'examen'::text,
          'lista_cotejo'::text,
          'anexo'::text
        ]
      )
    )
  ),
  constraint ai_generation_calls_status_check check (
    (
      status = any (array['success'::text, 'error'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_calls_job_id on public.ai_generation_calls using btree (job_id) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_calls_user_id on public.ai_generation_calls using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_calls_artifact_type on public.ai_generation_calls using btree (artifact_type) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_calls_model on public.ai_generation_calls using btree (model) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_calls_created_at on public.ai_generation_calls using btree (created_at desc) TABLESPACE pg_default;


<!-- Table ai_generation_jobs -->

create table public.ai_generation_jobs (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  artifact_type text not null,
  action_type text not null default 'generate'::text,
  status text not null default 'started'::text,
  batch_id uuid null,
  planeacion_id bigint null,
  examen_id uuid null,
  lista_cotejo_id uuid null,
  anexo_id uuid null,
  nivel text null,
  materia text null,
  tema text null,
  titulo text null,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  total_prompt_tokens integer not null default 0,
  total_completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  total_cost_usd numeric(12, 6) not null default 0,
  calls_count integer not null default 0,
  retries_count integer not null default 0,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone null,
  duration_ms integer null,
  error_type text null,
  error_message_safe text null,
  created_at timestamp with time zone not null default now(),
  constraint ai_generation_jobs_pkey primary key (id),
  constraint ai_generation_jobs_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint ai_generation_jobs_action_type_check check (
    (
      action_type = any (
        array[
          'generate'::text,
          'regenerate'::text,
          'preview'::text,
          'download'::text
        ]
      )
    )
  ),
  constraint ai_generation_jobs_artifact_type_check check (
    (
      artifact_type = any (
        array[
          'planeacion'::text,
          'examen'::text,
          'lista_cotejo'::text,
          'anexo'::text
        ]
      )
    )
  ),
  constraint ai_generation_jobs_status_check check (
    (
      status = any (
        array[
          'started'::text,
          'success'::text,
          'error'::text,
          'partial'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_jobs_user_id on public.ai_generation_jobs using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_jobs_artifact_type on public.ai_generation_jobs using btree (artifact_type) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_jobs_status on public.ai_generation_jobs using btree (status) TABLESPACE pg_default;

create index IF not exists idx_ai_generation_jobs_created_at on public.ai_generation_jobs using btree (created_at desc) TABLESPACE pg_default;


<!-- Table ai_model_prices -->

create table public.ai_model_prices (
  id uuid not null default gen_random_uuid (),
  model text not null,
  input_cost_per_1m numeric(12, 6) not null,
  output_cost_per_1m numeric(12, 6) not null,
  cached_input_cost_per_1m numeric(12, 6) null,
  currency text not null default 'USD'::text,
  active boolean not null default true,
  source_note text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ai_model_prices_pkey primary key (id),
  constraint ai_model_prices_model_key unique (model)
) TABLESPACE pg_default;


<!-- Table anexos  -->

create table public.anexos (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  planeacion_id bigint not null,
  tema_id uuid null,
  unidad_id uuid null,
  batch_id uuid null,
  titulo text not null,
  materia text null,
  nivel text null,
  tema text null,
  contenido jsonb not null default '{}'::jsonb,
  prompt_version text not null default 'v1_anexos_desde_planeacion'::text,
  status text not null default 'generated'::text,
  error_tipo text null,
  error_message text null,
  tokens_prompt integer null,
  tokens_completion integer null,
  tokens_total integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint anexos_pkey primary key (id),
  constraint anexos_planeacion_id_fkey foreign KEY (planeacion_id) references planeaciones (id) on delete CASCADE,
  constraint anexos_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_anexos_user_id on public.anexos using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_anexos_planeacion_id on public.anexos using btree (planeacion_id) TABLESPACE pg_default;

create index IF not exists idx_anexos_batch_id on public.anexos using btree (batch_id) TABLESPACE pg_default;

create index IF not exists idx_anexos_tema_id on public.anexos using btree (tema_id) TABLESPACE pg_default;

create unique INDEX IF not exists unique_anexo_por_planeacion on public.anexos using btree (planeacion_id) TABLESPACE pg_default;

create trigger set_anexos_updated_at BEFORE
update on anexos for EACH row
execute FUNCTION set_updated_at ();


<!-- Table examen_generation_items -->

create table public.examen_generation_items (
  id uuid not null default gen_random_uuid (),
  job_id uuid not null,
  user_id uuid not null,
  pregunta_numero integer not null,
  tema_id uuid null,
  tema text null,
  tipo_pregunta text not null,
  pregunta_ia jsonb null,
  status text not null default 'pending'::text,
  validation_errors jsonb not null default '[]'::jsonb,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  error_message text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint examen_generation_items_pkey primary key (id),
  constraint unique_job_question_number unique (job_id, pregunta_numero),
  constraint examen_generation_items_job_id_fkey foreign KEY (job_id) references examen_generation_jobs (id) on delete CASCADE,
  constraint examen_generation_items_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_items_job_id on public.examen_generation_items using btree (job_id) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_items_user_id on public.examen_generation_items using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_items_status on public.examen_generation_items using btree (status) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_items_tema_id on public.examen_generation_items using btree (tema_id) TABLESPACE pg_default;


<!-- examen_generation_jobs  -->

create table public.examen_generation_jobs (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  examen_id uuid null,
  plantel_id uuid null,
  grado_id uuid null,
  materia_id uuid null,
  unidad_id uuid null,
  titulo text not null,
  instrucciones text null,
  tipos_pregunta text[] not null default '{}'::text[],
  total_preguntas integer not null,
  contexto_temas jsonb not null default '[]'::jsonb,
  configuracion jsonb not null default '{}'::jsonb,
  status text not null default 'pending'::text,
  progress_current integer not null default 0,
  progress_total integer not null default 0,
  current_step text null,
  error_message text null,
  prompt_version text null,
  started_at timestamp with time zone null,
  completed_at timestamp with time zone null,
  failed_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint examen_generation_jobs_pkey primary key (id),
  constraint examen_generation_jobs_examen_id_fkey foreign KEY (examen_id) references examenes (id) on delete set null,
  constraint examen_generation_jobs_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_jobs_user_id on public.examen_generation_jobs using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_jobs_status on public.examen_generation_jobs using btree (status) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_jobs_unidad_id on public.examen_generation_jobs using btree (unidad_id) TABLESPACE pg_default;

create index IF not exists idx_examen_generation_jobs_examen_id on public.examen_generation_jobs using btree (examen_id) TABLESPACE pg_default;


<!--  -->

create table public.examenes (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  plantel_id uuid null,
  grado_id uuid null,
  materia_id uuid null,
  unidad_id uuid not null,
  titulo text null,
  instrucciones text null,
  tipos_pregunta text[] not null default '{}'::text[],
  total_preguntas integer not null default 0,
  contexto_temas jsonb not null default '[]'::jsonb,
  examen_ia jsonb not null default '[]'::jsonb,
  prompt_version text null,
  status text not null default 'generado'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  generation_job_id uuid null,
  generation_error text null,
  validation_errors jsonb not null default '[]'::jsonb,
  batch_id uuid null,
  constraint examenes_pkey primary key (id),
  constraint examenes_generation_job_id_fkey foreign KEY (generation_job_id) references examen_generation_jobs (id) on delete set null,
  constraint examenes_grado_id_fkey foreign KEY (grado_id) references grados (id) on delete set null,
  constraint examenes_materia_id_fkey foreign KEY (materia_id) references materias (id) on delete set null,
  constraint examenes_plantel_id_fkey foreign KEY (plantel_id) references planteles (id) on delete set null,
  constraint examenes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint examenes_batch_id_fkey foreign KEY (batch_id) references planeacion_batches (id) on delete set null,
  constraint examenes_unidad_id_fkey foreign KEY (unidad_id) references unidades (id) on delete CASCADE,
  constraint examenes_total_preguntas_check check ((total_preguntas >= 0))
) TABLESPACE pg_default;

create index IF not exists examenes_user_id_idx on public.examenes using btree (user_id) TABLESPACE pg_default;

create index IF not exists examenes_unidad_id_idx on public.examenes using btree (unidad_id) TABLESPACE pg_default;

create index IF not exists examenes_created_at_idx on public.examenes using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists idx_examenes_generation_job_id on public.examenes using btree (generation_job_id) TABLESPACE pg_default;

create index IF not exists idx_examenes_batch_id on public.examenes using btree (batch_id) TABLESPACE pg_default;

create trigger set_examenes_updated_at BEFORE
update on examenes for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.grados (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null default auth.uid (),
  plantel_id uuid not null,
  nombre text not null,
  orden integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  nivel_base text not null,
  constraint grados_pkey primary key (id),
  constraint grados_plantel_id_nombre_key unique (plantel_id, nombre),
  constraint grados_plantel_id_fkey foreign KEY (plantel_id) references planteles (id) on delete CASCADE,
  constraint grados_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint grados_nivel_base_check check (
    (
      nivel_base = any (
        array[
          'Primaria'::text,
          'Secundaria'::text,
          'Preparatoria'::text,
          'Universidad'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_grados_plantel on public.grados using btree (plantel_id) TABLESPACE pg_default;

create trigger trg_grado_ownership BEFORE INSERT
or
update on grados for EACH row
execute FUNCTION enforce_grado_ownership ();

create trigger trg_grados_updated_at BEFORE
update on grados for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.listas_cotejo (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  planeacion_id bigint not null,
  tema_id uuid null,
  unidad_id uuid null,
  batch_id uuid null,
  titulo text not null default 'Lista de cotejo'::text,
  materia text null,
  nivel text null,
  tema text null,
  actividad_cierre text null default ''::text,
  criterios jsonb not null,
  total_puntos integer not null default 10,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  actividades_evaluadas jsonb not null default '[]'::jsonb,
  constraint listas_cotejo_pkey primary key (id),
  constraint listas_cotejo_una_por_planeacion unique (planeacion_id),
  constraint listas_cotejo_tema_id_fkey foreign KEY (tema_id) references temas (id) on delete set null,
  constraint listas_cotejo_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint listas_cotejo_planeacion_id_fkey foreign KEY (planeacion_id) references planeaciones (id) on delete CASCADE,
  constraint listas_cotejo_unidad_id_fkey foreign KEY (unidad_id) references unidades (id) on delete set null,
  constraint listas_cotejo_batch_id_fkey foreign KEY (batch_id) references planeacion_batches (id) on delete set null,
  constraint listas_cotejo_total_puntos_check check ((total_puntos = 10)),
  constraint listas_cotejo_criterios_array_check check ((jsonb_typeof(criterios) = 'array'::text))
) TABLESPACE pg_default;

create index IF not exists idx_listas_cotejo_user_id on public.listas_cotejo using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_listas_cotejo_planeacion_id on public.listas_cotejo using btree (planeacion_id) TABLESPACE pg_default;

create index IF not exists idx_listas_cotejo_unidad_id on public.listas_cotejo using btree (unidad_id) TABLESPACE pg_default;

create index IF not exists idx_listas_cotejo_batch_id on public.listas_cotejo using btree (batch_id) TABLESPACE pg_default;

create trigger set_listas_cotejo_updated_at BEFORE
update on listas_cotejo for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.materias (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null default auth.uid (),
  grado_id uuid not null,
  nombre text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint materias_pkey primary key (id),
  constraint materias_grado_id_nombre_key unique (grado_id, nombre),
  constraint materias_grado_id_fkey foreign KEY (grado_id) references grados (id) on delete CASCADE,
  constraint materias_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_materias_grado on public.materias using btree (grado_id) TABLESPACE pg_default;

create trigger trg_materia_ownership BEFORE INSERT
or
update on materias for EACH row
execute FUNCTION enforce_materia_ownership ();

create trigger trg_materias_updated_at BEFORE
update on materias for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.planeacion_batches (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  titulo text not null,
  descripcion text null,
  nivel text null,
  materia text null,
  unidad text null,
  plantel_id uuid null,
  grado_id uuid null,
  materia_id uuid null,
  unidad_id uuid null,
  status text null default 'ready'::text,
  is_archived boolean not null default false,
  archived_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint planeacion_batches_pkey primary key (id),
  constraint planeacion_batches_grado_id_fkey foreign KEY (grado_id) references grados (id) on delete set null,
  constraint planeacion_batches_materia_id_fkey foreign KEY (materia_id) references materias (id) on delete set null,
  constraint planeacion_batches_plantel_id_fkey foreign KEY (plantel_id) references planteles (id) on delete set null,
  constraint planeacion_batches_unidad_id_fkey foreign KEY (unidad_id) references unidades (id) on delete set null,
  constraint planeacion_batches_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_planeacion_batches_user_id on public.planeacion_batches using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_planeacion_batches_created_at on public.planeacion_batches using btree (created_at desc) TABLESPACE pg_default;


<!--  -->

create table public.planeaciones (
  id bigint generated by default as identity not null,
  materia text null,
  nivel text null,
  tema text null,
  duracion smallint null,
  fecha_creacion timestamp with time zone null default now(),
  subtema text null,
  sesiones smallint null,
  tabla_ia jsonb null,
  user_id uuid null default auth.uid (),
  batch_id uuid null,
  unidad integer null,
  tema_id uuid null,
  status text not null default 'ready'::text,
  updated_at timestamp with time zone not null default now(),
  is_archived boolean not null default false,
  archived_at timestamp with time zone null,
  custom_title text null,
  actividad_cierre text null,
  actividades_momentos jsonb not null default '{}'::jsonb,
  constraint planeaciones_pkey primary key (id),
  constraint planeaciones_batch_id_fkey foreign KEY (batch_id) references planeacion_batches (id) on delete set null,
  constraint planeaciones_tema_id_fkey foreign KEY (tema_id) references temas (id) on delete set null,
  constraint planeaciones_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists planeaciones_unq_tema on public.planeaciones using btree (tema_id) TABLESPACE pg_default
where
  (tema_id is not null);

create index IF not exists idx_planeaciones_tema on public.planeaciones using btree (tema_id) TABLESPACE pg_default;

create index IF not exists idx_planeaciones_user on public.planeaciones using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_planeaciones_user_archived_created on public.planeaciones using btree (user_id, is_archived, fecha_creacion desc) TABLESPACE pg_default;

create index IF not exists idx_planeaciones_user_archived on public.planeaciones using btree (user_id, is_archived) TABLESPACE pg_default;

create index IF not exists idx_planeaciones_batch_id on public.planeaciones using btree (batch_id) TABLESPACE pg_default;

create trigger trg_planeacion_tema_ownership BEFORE INSERT
or
update on planeaciones for EACH row
execute FUNCTION enforce_planeacion_tema_ownership ();

create trigger trg_planeaciones_updated_at BEFORE
update on planeaciones for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.planteles (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null default auth.uid (),
  nombre text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint planteles_pkey primary key (id),
  constraint planteles_user_id_nombre_key unique (user_id, nombre),
  constraint planteles_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger trg_planteles_updated_at BEFORE
update on planteles for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.temas (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null default auth.uid (),
  unidad_id uuid not null,
  titulo text not null,
  duracion integer null,
  orden integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint temas_pkey primary key (id),
  constraint temas_unidad_id_titulo_key unique (unidad_id, titulo),
  constraint temas_unidad_id_fkey foreign KEY (unidad_id) references unidades (id) on delete CASCADE,
  constraint temas_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_temas_unidad on public.temas using btree (unidad_id) TABLESPACE pg_default;

create trigger trg_tema_ownership BEFORE INSERT
or
update on temas for EACH row
execute FUNCTION enforce_tema_ownership ();

create trigger trg_temas_updated_at BEFORE
update on temas for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.unidades (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null default auth.uid (),
  materia_id uuid not null,
  nombre text not null,
  orden integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint unidades_pkey primary key (id),
  constraint unidades_materia_id_nombre_key unique (materia_id, nombre),
  constraint unidades_materia_id_fkey foreign KEY (materia_id) references materias (id) on delete CASCADE,
  constraint unidades_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_unidades_materia on public.unidades using btree (materia_id) TABLESPACE pg_default;

create trigger trg_unidades_updated_at BEFORE
update on unidades for EACH row
execute FUNCTION set_updated_at ();


<!--  -->

create table public.user_profiles (
  user_id uuid not null,
  email text null,
  full_name text null,
  role text not null default 'tester'::text,
  is_test_user boolean not null default true,
  tester_group text null,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_profiles_pkey primary key (user_id),
  constraint user_profiles_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;


<!--  -->
create table public.user_settings (
  user_id uuid not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_settings_pkey primary key (user_id),
  constraint user_settings_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger trg_user_settings_updated_at BEFORE
update on user_settings for EACH row
execute FUNCTION set_updated_at ();
