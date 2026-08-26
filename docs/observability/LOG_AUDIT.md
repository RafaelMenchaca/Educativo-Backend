# Auditoría de logs del backend

## Estado de la auditoría

Inventario documental actualizado el 2026-07-20 a partir de búsquedas de `console.log`, `console.info`, `console.warn` y `console.error` en `src/` y `supabaseClient.js`. La auditoría no modificó logs funcionales.

Consultar las reglas en [`LOG_CONVENTIONS.md`](LOG_CONVENTIONS.md) y las reglas generales en [`../../AGENTS.md`](../../AGENTS.md).

## Cobertura observada

| Dominio | Archivos principales | Eventos observados |
| --- | --- | --- |
| Planeaciones/batches | controllers y `planeaciones.service.js` | request/resumen, intentos IA, fallback, guardado, estados SSE, delete |
| Exámenes | controller y `examenes.service.js` | recepción, job/worker, pregunta aceptada/reintentada, duplicados, guardado, fallo |
| Listas de cotejo | controller y `listas_cotejo.service.js` | inicio, item generado/omitido, resultado agregado, delete |
| Anexos | controller y `anexos.service.js` | generar/regenerar, métricas, éxito/error, delete |
| Biblioteca | controller y `biblioteca.service.js` | delete y fallos |
| Jerarquía | controller y `jerarquia.service.js` | errores HTTP y operaciones de dominio dispersas |
| Métricas IA | `aiMetrics.service.js` | fallos de persistencia/acumulación y finalización de jobs |
| Imágenes | servicios de imagen y utility GPT | queries/fallbacks y fallos; flujo automático principal documentado como pausado |

## Hallazgos vigentes

- Existen prefijos históricos mezclados: `[planeacion-debug]`, `[exam-debug]`, `[batch]`, `[lista-cotejo]` y `[listas-cotejo]`. No renombrarlos como limpieza incidental.
- Algunos controllers registran el error resumido y luego el objeto `error`, lo que puede duplicar eventos y exponer detalles del proveedor. Requiere un cambio dedicado antes de modificarlo.
- `biblioteca.controller.js` registra el objeto de error completo.
- Los errores SSE de planeaciones y jerarquía registran el error completo. No se cambian aquí porque podría afectar diagnóstico y requiere revisión específica.
- El flujo de exámenes conserva helpers aparentemente no usados que también emiten logs. No se eliminan ni reclasifican sin confirmar consumidores.
- Los logs de generación ya resumen respuestas IA mediante conteos/longitudes en los puntos auditados; no deben volver a imprimir contenido crudo.
- Hay eventos que incluyen `userId`. Es un identificador técnico, pero debe conservarse solo cuando sea necesario para correlación y nunca combinarse con email u otros datos personales.
- No existe middleware global de errores en `src/app.js`; es una observación arquitectónica, no autorización para agregarlo incidentalmente al cambiar logs.

## Zonas sensibles

Revisar con especial cuidado antes de tocar:

- helpers `logPlaneacionDebug` de controllers;
- `sendError` de controllers;
- worker y fallbacks de `examenes.service.js`;
- `safeErrorMessage` y escrituras admin de `aiMetrics.service.js`;
- logs de queries de imagen, que pueden incorporar texto derivado de contenido;
- cualquier evento con `error`, `rawText`, `response`, `prompt`, `headers`, `token` o `userId`.

## Huecos y pendientes

- No hay correlación de request uniforme fuera de IDs de dominio/jobs.
- No hay formato ni logger central; la implementación usa `console.*`.
- No hay política ejecutable de redacción para logs generales; solo sanitización localizada en métricas.
- No se confirmó configuración externa de retención o acceso a logs.
- Cualquier mejora debe conservar errores, status, payloads y contratos, y actualizar este inventario.

## Comando de reauditoría

```powershell
rg -n "console\.(log|info|warn|error|debug)" src supabaseClient.js
```

La salida debe revisarse manualmente; un grep no demuestra por sí solo que el payload sea seguro.
