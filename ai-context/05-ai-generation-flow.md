# 05 - AI Generation Flow

## Recursos que usan IA

- Planeaciones.
- Examenes.
- Listas de cotejo.
- Anexos.
- Queries de imagenes en `src/utils/generateImageQuery.js` y servicios relacionados, aunque el README indica que la generacion/enriquecimiento automatico de imagenes no esta activo en el flujo principal.

## Servicios y prompts

- `src/services/planeaciones.service.js`
- `src/services/examenes.service.js`
- `src/services/listas_cotejo.service.js`
- `src/services/anexos.service.js`
- `src/utils/buildPromptByLevel.js`
- `src/utils/buildExamPromptByUnit.js`
- `src/utils/buildImageSearchQuery.js`
- `src/utils/generateImageQuery.js`

El modelo detectado en servicios de generacion es principalmente `gpt-4o-mini`.

## Flujo general

1. Frontend envia request con Bearer token.
2. Backend valida token.
3. Controller valida payload minimo.
4. Service consulta contexto en Supabase.
5. Service crea job de metricas con `createAiJob`.
6. Service llama OpenAI.
7. Service registra llamada con `logAiCall`.
8. Service persiste artefacto generado.
9. Service cierra job con `finishAiJob` o `failAiJob`.
10. Frontend actualiza cards/tabs con resultado o error amigable.

## Planeaciones

- Endpoint principal: `POST /api/planeaciones/generate`.
- Soporta SSE con `?stream=1`.
- El frontend parsea chunks `data:` y usa eventos para actualizar progreso.
- `planeaciones.service.js` tambien escribe en `ia_metrics` por compatibilidad legacy.

## Examenes

- Endpoints principales:
  - `POST /api/examenes/generate`
  - `POST /api/examenes/generar`
  - `GET /api/examenes/generacion/:jobId`
- El frontend Biblioteca usa estado pendiente y polling para mostrar avance.
- El servicio tiene logica de reintentos, validacion y fallbacks para preguntas.

## Listas de cotejo

- Endpoint principal: `POST /api/listas-cotejo/generate`.
- Puede generarse por planeaciones seleccionadas o por unidad segun el service.

## Anexos

- Endpoints principales:
  - `POST /api/anexos/generate`
  - `POST /api/anexos/:id/regenerate`
- La tabla `anexos` permite maximo un anexo por planeacion.
- Si ya existe, el controller puede responder `200`; si se crea, `201`.

## Metricas

- `ai_generation_jobs`: job por operacion.
- `ai_generation_calls`: llamada individual a OpenAI.
- `ai_model_prices`: precios por modelo.
- `docs/ai-metrics-queries.sql`: consultas de analisis.

Las metricas no deben romper la experiencia de usuario: `logAiCall` atrapa errores y no debe propagar fallos al flujo principal.

## Reglas para no romper generacion

- No cambiar prompts, versiones de prompt ni estructura esperada de JSON sin revisar consumidores frontend/backend.
- No cambiar modelo sin actualizar precios y revisar metricas.
- No eliminar retries/fallbacks existentes.
- No cambiar contratos de respuesta (`batch_id`, `planeaciones`, `resultados`, `error_count`, etc.) sin revisar Biblioteca y dashboard.
- No mostrar errores internos de OpenAI, Supabase, stack traces, tokens o claves al usuario.

## Pendiente de confirmar

- Versionado formal de prompts para planeaciones, examenes y listas; hay `prompt_version` en metricas/anexos, pero no se confirma una politica global.
