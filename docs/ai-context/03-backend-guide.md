# 03 - Backend Guide

## Aplica

Este workspace si contiene backend: `educativo_backend/Educativo-Backend`.

## Tecnologias

- Node.js con ES Modules.
- Express 4.
- Supabase JS.
- OpenAI SDK.
- dotenv, cors.
- ExcelJS como dependencia.

## Rutas principales

Todas se montan bajo `/api` en `src/routes/index.js`.

- `/api/planeaciones`
- `/api/examenes`
- `/api/listas-cotejo`
- `/api/biblioteca`
- `/api/anexos`
- `/api/*` jerarquia academica desde `jerarquia.routes.js`.

Endpoints publicos:

- `GET /`
- `GET /health`

## Flujo API -> controller -> service -> Supabase/OpenAI

1. Ruta aplica `requireAuth`.
2. `requireAuth` valida `Authorization: Bearer ...` con `supabaseAdmin.auth.getUser`.
3. Controller crea `createUserClient(req.accessToken)`.
4. Service usa ese cliente para operaciones sujetas a RLS.
5. Si hay IA, service llama OpenAI y registra metricas.
6. Controller devuelve JSON o SSE.

## Servicios principales

- `planeaciones.service.js`: CRUD, archivado, batches, generacion IA y escritura legacy en `ia_metrics`.
- `examenes.service.js`: generacion de examenes, jobs internos y persistencia.
- `listas_cotejo.service.js`: generacion y consulta de listas.
- `anexos.service.js`: generacion, regeneracion y consulta de anexos.
- `biblioteca.service.js`: agrupa y elimina bloques completos.
- `jerarquia.service.js`: CRUD de planteles, grados, materias, unidades y temas.
- `aiMetrics.service.js`: jobs, calls, precios, tokens y costos.

## SSE

Planeaciones soporta streaming con:

- `POST /api/planeaciones/generate?stream=1`
- `POST /api/unidades/:unidadId/generar?stream=1`

Eventos vistos en codigo/documentacion: `item_started`, `item_completed`, `item_error`, `done`. En frontend tambien se contempla `item_skipped`.

## Reglas de errores

- Validar payload en controller y responder `400` cuando falten datos.
- Si el service lanza error con `status`, responder ese status y mensaje.
- Para errores inesperados, responder mensaje generico.
- No devolver stack traces ni datos internos.
- Logs pueden usar `console.error/warn`, pero no deben incluir tokens ni API keys.
- `aiMetrics.service.js` sanitiza mensajes de error para remover `sk-...` y `Bearer ...`.

## Reglas de validacion y logs

- `user_id` siempre sale de `req.user.id`, nunca del body.
- IDs numericos de planeacion se validan con `Number.isInteger` donde aplica.
- Mantener logs de debug existentes si se esta diagnosticando, pero evitar agregar ruido permanente.
- Si se agrega generacion IA, integrar `createAiJob`, `logAiCall`, `finishAiJob` y `failAiJob`.
