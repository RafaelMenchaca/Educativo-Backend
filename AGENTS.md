# Reglas para agentes del backend

## Proyecto

Educativo IA / Planea usa este repositorio como API REST para autenticación con Supabase, jerarquía académica, Biblioteca y generación de planeaciones, anexos, listas de cotejo y exámenes.

Este archivo es la entrada obligatoria para una IA que trabaje en el backend. No es necesario leer el archivo histórico del refactor frontend para una feature o fix normal.

## Arquitectura

El backend usa Node.js con ES Modules y Express 4:

```text
route → requireAuth → controller → service → Supabase/OpenAI → response
```

- `src/routes/`: paths, métodos y middleware.
- `src/controllers/`: validación HTTP y serialización.
- `src/services/`: dominio, persistencia, OpenAI, jobs y métricas.
- `src/middleware/auth.middleware.js`: validación Bearer.
- `src/utils/`: builders y utilidades especializadas.
- `supabaseClient.js`: cliente admin y fábrica de cliente por usuario.

Respetar estas fronteras. Una feature debe cambiar el owner real, no copiar lógica entre controller y service.

## Fuentes de verdad

Siempre leer este archivo. Después consultar solo lo relacionado con la tarea:

| Tema | Fuente |
| --- | --- |
| Setup y endpoints | [`README.md`](README.md) |
| Arquitectura backend | [`docs/03-backend-guide.md`](docs/03-backend-guide.md) |
| Tablas, IDs y relaciones | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) |
| Prompts y generación IA | [`docs/AI_GENERATION_CONTRACTS.md`](docs/AI_GENERATION_CONTRACTS.md) |
| Reglas de logs | [`docs/observability/LOG_CONVENTIONS.md`](docs/observability/LOG_CONVENTIONS.md) |
| Estado auditado de logs | [`docs/observability/LOG_AUDIT.md`](docs/observability/LOG_AUDIT.md) |
| Consumidor frontend | [`frontend AGENTS.md`](../../educativo_frontend/planeacion-docente-ia/AGENTS.md) y su documentación relacionada |

El código ejecutable y las migraciones SQL son la fuente técnica real. Si faltan migraciones o un documento contradice la implementación, declarar la limitación y detener cualquier cambio contractual.

## Auth y RLS

- Las rutas privadas usan `requireAuth`.
- `user_id` procede de `req.user.id`, nunca del body.
- Los flujos de usuario crean `createUserClient(req.accessToken)` para conservar el contexto RLS.
- No sustituir el cliente de usuario por service role por conveniencia.
- El cliente admin solo se usa en excepciones backend-only ya justificadas, como métricas y el worker interno de exámenes.
- No afirmar policies RLS que no estén verificadas mediante migraciones o un export del schema.

## Base de datos

Antes de tocar persistencia, leer `docs/DATABASE_SCHEMA.md`.

- No inventar tablas, columnas, constraints, cascadas, índices o relaciones.
- No crear o alterar schema desde una feature incidental.
- No reinterpretar tipos de ID para simplificar un flujo.
- No asumir que el snapshot documental reemplaza el estado live de Supabase cuando el propio documento declara esa limitación.
- Todo cambio autorizado de schema debe tener migración revisada y documentación sincronizada.

## Contratos protegidos

Biblioteca agrupa recursos mediante batches, pero bloque, conjunto, batch y unidad no son equivalentes automáticos.

Conservar la semántica y el tipo de:

- `batch_id`;
- `unidad_id`;
- `tema_id` y `tema_ids`;
- `planeacion_ids`;
- selección explícita de planeaciones para exámenes/listas cuando aplique;
- estados de generation jobs e items;
- rutas, métodos, headers, status HTTP y campos públicos;
- SSE, polling y respuestas `skipped`/error existentes.

No tratar IDs de planeaciones como IDs de temas. No introducir cambios de schema o payload como efecto colateral de una feature, fix, logging o refactor local.

## Generación con IA

Antes de cambiar prompts, mensajes, schemas de salida, parsing, normalización, validaciones, modelos, parámetros, retries, duplicados, jobs, polling o métricas, leer `docs/AI_GENERATION_CONTRACTS.md`.

- No modificar prompts o `prompt_version` incidentalmente.
- Preservar fallbacks y sanitización de errores.
- No registrar prompts ni respuestas completas.
- Un fallo no bloqueante de métricas no debe cambiar el resultado principal si el contrato actual lo tolera.

## Observabilidad

Seguir `LOG_CONVENTIONS.md` y revisar `LOG_AUDIT.md` antes de agregar un evento.

- No registrar tokens, API keys, headers de autorización, cookies, credenciales, prompts, respuestas completas o datos personales.
- No duplicar el mismo fallo en varias capas sin necesidad de correlación.
- Agregar un log no puede cambiar `throw`, return, status, fallback o mensaje público.

## Workflow normal para features y fixes

1. Leer `AGENTS.md` y la fuente especializada de la tarea.
2. Identificar route, controller, service y consumers frontend afectados.
3. Confirmar contratos de auth, datos y respuesta.
4. Implementar el cambio mínimo en el owner correcto.
5. Ejecutar las validaciones existentes y `node --check` para JavaScript modificado.
6. Realizar prueba manual/API cuando cambie comportamiento observable.
7. Actualizar documentación solo si cambió arquitectura o un contrato autorizado.

`package.json` no configura hoy una suite backend real: `npm test` es un placeholder que termina con error. No inventar cobertura ni comandos inexistentes.

No hacer commits, push, tags o releases salvo petición explícita.
