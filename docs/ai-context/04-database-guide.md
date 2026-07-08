# 04 - Database Guide

## Base de datos

El proyecto usa Supabase/PostgreSQL con RLS. El backend crea clientes por usuario con el access token para que las consultas respeten politicas.

## Migraciones visibles

- `sql/migrations/20260517_anexos.sql`
- `sql/migrations/20260523_ai_metrics.sql`

## Tablas confirmadas por migraciones

- `anexos`
  - Vincula `user_id`, `planeacion_id`, `tema_id`, `unidad_id`, `batch_id`.
  - Tiene `contenido jsonb`, `prompt_version`, `status`, errores y tokens.
  - Restriccion unica: un anexo por planeacion.
  - RLS habilitado con politicas por `auth.uid() = user_id`.
- `user_profiles`
- `ai_generation_jobs`
- `ai_generation_calls`
- `ai_model_prices`

## Tablas detectadas por servicios/README

- `planteles`
- `grados`
- `materias`
- `unidades`
- `temas`
- `planeaciones`
- `planeacion_batches`
- `examenes`
- `listas_cotejo`
- `ia_metrics`
- `examen_generation_jobs`
- `examen_generation_items`

## Recursos por tabla

- Planeaciones: `planeaciones`, `planeacion_batches`.
- Anexos: `anexos`.
- Listas de cotejo: `listas_cotejo`.
- Examenes: `examenes`, y jobs internos `examen_generation_jobs`, `examen_generation_items`.
- Usuarios/perfiles: `auth.users`, `user_profiles`.
- Metricas IA: `ai_generation_jobs`, `ai_generation_calls`, `ai_model_prices`, `ia_metrics`.
- Jerarquia academica: `planteles`, `grados`, `materias`, `unidades`, `temas`.

## Reglas para migraciones

- No tocar base de datos sin permiso explicito.
- Crear migraciones nuevas en `sql/migrations` si se cambia schema.
- Mantener RLS en tablas con datos por usuario.
- Incluir indices para campos usados en filtros (`user_id`, `batch_id`, FK principales).
- No borrar tablas legacy sin plan de migracion.

## Reglas para RLS/Supabase

- No confiar en `user_id` enviado desde frontend.
- Para operaciones de usuario, usar `createUserClient(accessToken)`.
- `supabaseAdmin` debe reservarse para validacion de auth, metricas backend-only o tareas administrativas justificadas.
- Las politicas deben filtrar por `auth.uid() = user_id` cuando la tabla sea por usuario.

## Pendiente de confirmar

- Schema completo de `planeaciones`, `planeacion_batches`, `planteles`, `grados`, `materias`, `unidades`, `temas`, `examenes`, `listas_cotejo`, `ia_metrics`, `examen_generation_jobs` y `examen_generation_items`; aparecen en codigo, pero no hay migraciones completas visibles en este workspace.
- Si todas las tablas detectadas tienen RLS activo; el README lo afirma, pero no todas las politicas estan visibles aqui.
