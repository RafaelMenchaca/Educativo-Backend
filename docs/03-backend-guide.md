# Guía del backend de Educativo IA

## Naturaleza de este documento

Este documento describe la arquitectura actual del backend.

No sustituye:

- las migraciones SQL;
- el código ejecutable;
- `docs/DATABASE_SCHEMA.md`;
- `docs/AI_GENERATION_CONTRACTS.md`;
- `AGENTS.md`.

No es una especificación alternativa de schema, prompts, payloads ni observabilidad. Cuando un detalle contractual importe, se debe consultar la fuente especializada y confirmar la implementación.

## Alcance del backend

Este repositorio implementa la API REST de Educativo IA. Autentica requests con Supabase, aplica acceso por usuario mediante clientes ligados al token, administra jerarquía académica y Biblioteca, persiste documentos y coordina generación con OpenAI.

Los recursos principales son planeaciones, anexos, listas de cotejo y exámenes. Biblioteca los agrupa por `batch_id`.

## Tecnologías

- Node.js con ES Modules.
- Express 4.
- Supabase JavaScript SDK y PostgreSQL/RLS en Supabase.
- OpenAI SDK.
- `dotenv` y `cors`.
- ExcelJS como dependencia declarada.

La versión efectiva de cada dependencia está en `package.json`.

## Estructura de carpetas

```text
src/
├── server.js             arranque HTTP
├── app.js                Express, CORS, JSON, rutas y healthcheck
├── middleware/           autenticación
├── routes/               métodos, paths y middleware por recurso
├── controllers/          validación HTTP y serialización de respuestas
├── services/             dominio, Supabase, OpenAI y métricas
└── utils/                builders y utilidades especializadas
supabaseClient.js         cliente admin y fábrica de cliente por usuario
docs/                     documentación del backend
```

No hay archivos de migración SQL presentes en este árbol al 2026-07-20. La ausencia se debe reportar; no se deben reconstruir migraciones a partir de suposiciones.

## Flujo de una request

```text
route
  → requireAuth
  → controller
  → service
  → Supabase y, cuando aplica, OpenAI
  → respuesta JSON o SSE
```

1. La route monta `requireAuth` en endpoints privados.
2. El middleware valida el Bearer token con `supabaseAdmin.auth.getUser()` y adjunta `req.user` y `req.accessToken`.
3. El controller toma `user_id` de `req.user.id` y crea `createUserClient(req.accessToken)`.
4. El service ejecuta reglas de dominio y consultas sujetas a RLS con ese cliente.
5. Los flujos IA crean contenido, validan la salida, persisten el artefacto y registran métricas.
6. El controller responde JSON o SSE según el endpoint.

Las excepciones backend-only actuales, como el servicio de métricas y el worker interno de exámenes, usan el cliente admin de forma explícita. Esa excepción no autoriza a sustituir el cliente de usuario en otros flujos.

## Rutas principales

Todas las rutas privadas se montan bajo `/api` desde `src/routes/index.js`.

| Prefijo | Responsabilidad | Definición |
| --- | --- | --- |
| `/api/planeaciones` | CRUD, archivo, batches y generación | `src/routes/planeaciones.routes.js` |
| `/api/examenes` | creación de jobs, polling, consulta y eliminación | `src/routes/examenes.routes.js` |
| `/api/listas-cotejo` | generación, consulta y eliminación | `src/routes/listas_cotejo.routes.js` |
| `/api/anexos` | generación, regeneración, consulta y eliminación | `src/routes/anexos.routes.js` |
| `/api/biblioteca` | conjuntos y eliminación de bloques | `src/routes/biblioteca.routes.js` |
| `/api` | planteles, grados, materias, unidades y temas | `src/routes/jerarquia.routes.js` |

`GET /` y `GET /health` son endpoints públicos definidos en `src/app.js`. Los métodos y paths exactos se consultan en los archivos de routes; este resumen no los reemplaza.

## Servicios principales

| Servicio | Responsabilidad descriptiva |
| --- | --- |
| `planeaciones.service.js` | planeaciones, batches, archivado, generación y métricas legacy |
| `anexos.service.js` | generación/regeneración y persistencia de anexos por planeación |
| `listas_cotejo.service.js` | listas por selección de planeaciones y flujo legacy por unidad |
| `examenes.service.js` | jobs, worker en proceso, validación y persistencia de exámenes |
| `biblioteca.service.js` | lectura agregada y eliminación de bloques |
| `jerarquia.service.js` | dominio de la jerarquía académica |
| `aiMetrics.service.js` | jobs/calls de métricas, tokens y costo estimado |

Los contratos IA detallados están en `AI_GENERATION_CONTRACTS.md`, no aquí.

## SSE y jobs

Planeaciones admite SSE en `POST /api/planeaciones/generate?stream=1` y `POST /api/unidades/:unidadId/generar?stream=1`; también se detecta `Accept: text/event-stream`. Los eventos observados incluyen `item_started`, `item_completed`, `item_error`, `item_skipped`, `done` y un evento de error del stream según el flujo.

Exámenes usa un job persistido: el POST devuelve `202` con `job_id`, el worker se agenda dentro del proceso Node y el cliente consulta `GET /api/examenes/generacion/:jobId`. Los estados y reglas exactos están protegidos por `docs/AI_GENERATION_CONTRACTS.md`.

## Manejo de errores

Los controllers validan entradas básicas y convierten errores conocidos con `error.status` en respuestas HTTP. Los fallos inesperados se responden con mensajes genéricos. En SSE, el error se escribe como evento antes de cerrar cuando la conexión sigue abierta.

Agregar observabilidad no debe eliminar `throw`, cambiar status HTTP ni exponer detalles internos. Las reglas específicas están en los documentos de observabilidad.

## Autenticación y RLS

`requireAuth` valida el token y `createUserClient(req.accessToken)` crea el cliente de usuario que conserva el contexto de RLS. `user_id` procede de `req.user.id`, no del body.

La definición documental de tablas, relaciones y estado de verificación de RLS está en `DATABASE_SCHEMA.md`. Como no hay migraciones visibles en este árbol, cualquier afirmación sobre políticas debe tratarse con la limitación allí indicada.

## Métricas

`aiMetrics.service.js` registra jobs y llamadas IA en tablas dedicadas mediante operaciones backend-only. Planeaciones también conserva escritura en `ia_metrics` por compatibilidad. Un fallo al registrar una llamada no debe romper la generación principal.

Los campos, versiones de prompt, retries y diferencias por recurso se documentan en `AI_GENERATION_CONTRACTS.md`.

## Fuentes de verdad obligatorias

| Tema | Consultar | Cuándo |
| --- | --- | --- |
| Reglas de trabajo | [`../AGENTS.md`](../AGENTS.md) | antes de cualquier cambio |
| Schema y persistencia | [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) | antes de tocar tablas, IDs, relaciones, cascadas, índices o RLS |
| Generación IA | [`AI_GENERATION_CONTRACTS.md`](AI_GENERATION_CONTRACTS.md) | antes de tocar prompts, parsing, modelos, retries, jobs o métricas IA |
| Convenciones de logs | [`observability/LOG_CONVENTIONS.md`](observability/LOG_CONVENTIONS.md) | antes de agregar o modificar logs |
| Estado auditado de logs | [`observability/LOG_AUDIT.md`](observability/LOG_AUDIT.md) | para evitar duplicados y conocer riesgos existentes |
| Implementación real | código y migraciones SQL | para confirmar comportamiento ejecutable |

Si hay contradicción entre documentación e implementación, se debe detener el cambio y documentarla. No se elige ni se “corrige” un contrato silenciosamente.
