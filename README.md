# Educativo Backend

Backend de Educativo IA. Expone una API REST en Node.js y Express para autenticacion con Supabase, administracion de jerarquia academica y generacion de planeaciones didacticas, examenes, anexos y listas de cotejo con IA.

> Este README ofrece una introducción. Las reglas obligatorias están en [`AGENTS.md`](AGENTS.md), la arquitectura descriptiva en [`docs/03-backend-guide.md`](docs/03-backend-guide.md), el schema documental en [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) y los contratos IA en [`docs/AI_GENERATION_CONTRACTS.md`](docs/AI_GENERATION_CONTRACTS.md). El código y las migraciones SQL son la fuente técnica real.

La **Biblioteca** actua como hub de documentos: agrupa recursos mediante `batch_id` y los expone a traves de sus propios endpoints. Un bloque puede conservar metadata o relaciones jerárquicas, pero “bloque” y “unidad” no deben asumirse equivalentes sin revisar el contrato real.

Biblioteca es el consumidor visual principal vigente del frontend. El backend conserva una jerarquía técnica de planteles, grados, materias, unidades y temas, pero esos datos y endpoints no implican que el explorador visual jerárquico antiguo del dashboard siga soportado. Archivados puede conservar dependencias jerárquicas como flujo separado.

## Alcance del repositorio

- API REST para planeaciones y todos los documentos derivados (examenes, anexos, listas de cotejo).
- Validacion de tokens Bearer emitidos por Supabase en todas las rutas privadas.
- Generacion de contenido educativo con OpenAI (planeaciones, examenes, anexos, listas de cotejo).
- Streaming SSE para mostrar progreso de generacion en tiempo real.
- Persistencia en Supabase con RLS; el `user_id` se extrae del token, nunca del frontend.
- Sistema de archivado soft (archive/restore) y eliminacion permanente.
- Metricas de consumo de IA por job, tipo de generacion y modelo.

## Stack tecnico

- Node.js (ES Modules)
- Express 4
- Supabase JavaScript SDK
- OpenAI SDK
- dotenv, cors, nodemon

## Arquitectura general

```
src/
|-- server.js              arranque HTTP
|-- app.js                 Express, CORS, rutas, healthcheck
|-- middleware/
|   `-- auth.middleware.js requireAuth: valida Bearer token y adjunta req.user
|-- routes/
|   |-- index.js           monta todos los routers bajo /api
|   |-- planeaciones.routes.js
|   |-- examenes.routes.js
|   |-- listas_cotejo.routes.js
|   |-- biblioteca.routes.js
|   |-- anexos.routes.js
|   `-- jerarquia.routes.js
|-- controllers/           parsing de request, validaciones, armado de respuesta
|-- services/              logica de dominio, acceso a Supabase y llamadas a OpenAI
|   |-- planeaciones.service.js
|   |-- examenes.service.js
|   |-- listas_cotejo.service.js
|   |-- biblioteca.service.js
|   |-- anexos.service.js
|   |-- aiMetrics.service.js
|   |-- imageEnrichment.service.js
|   `-- imageSearch.service.js
`-- utils/
    |-- buildPromptByLevel.js
    |-- buildExamPromptByUnit.js
    |-- buildImageSearchQuery.js
    `-- generateImageQuery.js
supabaseClient.js          cliente admin + cliente por usuario
```

## Flujo principal

1. El frontend envia `Authorization: Bearer <supabase_access_token>`.
2. `requireAuth` valida el token con `supabaseAdmin.auth.getUser()` y adjunta `req.user` y `req.accessToken`.
3. El controlador crea un cliente Supabase ligado al usuario para que las consultas respeten RLS.
4. El servicio consulta o persiste en Supabase y, cuando aplica, llama a OpenAI.
5. `aiMetrics.service.js` registra el job, las llamadas y el costo estimado antes y despues de cada generacion.
6. La API responde en JSON o por SSE cuando se solicita progreso en tiempo real.

## Endpoints

### Publicos

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Confirma que el servidor esta arriba |
| GET | `/health` | Healthcheck JSON |

### Planeaciones — `/api/planeaciones`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/planeaciones` | Lista planeaciones activas del usuario |
| GET | `/api/planeaciones/archived` | Lista planeaciones archivadas |
| GET | `/api/planeaciones/batches` | Lista batches disponibles |
| GET | `/api/planeaciones/batch/:batch_id` | Planeaciones de un batch |
| POST | `/api/planeaciones/generate` | Genera una o varias planeaciones con IA |
| GET | `/api/planeaciones/:id` | Obtiene una planeacion |
| PUT | `/api/planeaciones/:id` | Actualiza una planeacion |
| PATCH | `/api/planeaciones/:id/archive` | Archiva una planeacion |
| PATCH | `/api/planeaciones/:id/restore` | Restaura una planeacion archivada |
| DELETE | `/api/planeaciones/:id` | Elimina (soft) una planeacion |
| DELETE | `/api/planeaciones/:id/permanent` | Elimina permanentemente |
| DELETE | `/api/planeaciones/:id/directo` | Elimina directamente desde la Biblioteca |
| PATCH | `/api/planeaciones/batch/:batchId/archive` | Archiva todas las planeaciones del batch |
| PATCH | `/api/planeaciones/batch/:batchId/restore` | Restaura todas las planeaciones del batch |
| DELETE | `/api/planeaciones/batch/:batchId/permanent` | Elimina permanentemente el batch completo |

### Biblioteca — `/api/biblioteca`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/biblioteca/conjuntos` | Lista todos los conjuntos (batches) del usuario con sus documentos |
| GET | `/api/biblioteca/conjuntos/:batchId` | Detalle de un conjunto: planeaciones, examenes, anexos y listas de cotejo |
| DELETE | `/api/biblioteca/bloques/:batchId` | Elimina un bloque completo de la Biblioteca |

### Examenes — `/api/examenes`

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/examenes/generate` | Genera un examen con IA |
| POST | `/api/examenes/generar` | Alias de generate |
| GET | `/api/examenes/generacion/:jobId` | Consulta el estado de un job de generacion |
| GET | `/api/examenes/unidad/:unidadId` | Lista examenes de una unidad |
| GET | `/api/examenes/:id` | Obtiene un examen |
| DELETE | `/api/examenes/:id` | Elimina un examen |

### Listas de cotejo — `/api/listas-cotejo`

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/listas-cotejo/generate` | Genera listas de cotejo con IA |
| GET | `/api/listas-cotejo/unidad/:unidadId` | Lista de cotejo de una unidad |
| GET | `/api/listas-cotejo/planeacion/:planeacionId` | Lista de cotejo de una planeacion |
| GET | `/api/listas-cotejo/:id` | Obtiene una lista de cotejo |
| DELETE | `/api/listas-cotejo/:id` | Elimina una lista de cotejo |

### Anexos — `/api/anexos`

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/anexos/generate` | Genera anexos para planeaciones seleccionadas |
| POST | `/api/anexos/:id/regenerate` | Regenera un anexo existente |
| GET | `/api/anexos/batch/:batchId` | Anexos de un batch |
| GET | `/api/anexos/planeacion/:planeacionId` | Anexo de una planeacion |
| GET | `/api/anexos/:id` | Obtiene un anexo |
| DELETE | `/api/anexos/:id` | Elimina un anexo |

### Jerarquia academica

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/planteles` | Lista planteles |
| POST | `/api/planteles` | Crea un plantel |
| DELETE | `/api/planteles/:plantelId` | Elimina un plantel en cascada |
| GET | `/api/planteles/:plantelId/grados` | Grados de un plantel |
| POST | `/api/grados` | Crea un grado |
| DELETE | `/api/grados/:gradoId` | Elimina un grado |
| GET | `/api/grados/:gradoId/materias` | Materias de un grado |
| POST | `/api/materias` | Crea una materia |
| DELETE | `/api/materias/:materiaId` | Elimina una materia |
| GET | `/api/materias/:materiaId/unidades` | Unidades de una materia |
| POST | `/api/unidades` | Crea una unidad |
| DELETE | `/api/unidades/:unidadId` | Elimina una unidad |
| GET | `/api/unidades/:unidadId/temas` | Temas de una unidad |
| POST | `/api/temas` | Crea uno o varios temas |
| DELETE | `/api/temas/:temaId` | Elimina un tema |
| POST | `/api/unidades/:unidadId/generar` | Genera planeaciones por unidad |
| GET | `/api/temas/:temaId/planeacion` | Ultima planeacion asociada a un tema |

## Streaming SSE

Los endpoints de generacion soportan streaming con Server-Sent Events:

- `POST /api/planeaciones/generate?stream=1`
- `POST /api/unidades/:unidadId/generar?stream=1`

Tambien se activan enviando `Accept: text/event-stream`.

Eventos emitidos: `item_started`, `item_completed`, `item_error`, `done`.

## Metricas de IA

`src/services/aiMetrics.service.js` es el servicio central de observabilidad de uso de IA. Registra cada generacion como un job y cada llamada a OpenAI como un evento individual.

Tablas en Supabase:

| Tabla | Descripcion |
|---|---|
| `user_profiles` | Perfil extendido del usuario (vinculado a `auth.users`) |
| `ai_generation_jobs` | Un job por operacion de generacion (tipo, estado, duracion) |
| `ai_generation_calls` | Una fila por llamada a OpenAI: tokens, costo estimado, modelo, error si hubo |
| `ai_model_prices` | Precios de entrada/salida por modelo; consultados en tiempo de ejecucion |
| `ia_metrics` | Tabla legacy mantenida por compatibilidad; sigue recibiendo datos de planeaciones |

Exports del servicio: `createAiJob`, `finishAiJob`, `failAiJob`, `logAiCall`, `getModelPrice`, `calculateAiCost`, `normalizeOpenAiUsage`.

El servicio esta integrado en planeaciones, examenes, listas de cotejo y anexos. Los errores se sanitizan: API keys y tokens nunca aparecen en los registros.

## Tablas principales en Supabase

| Tabla | Descripcion |
|---|---|
| `planteles` | Primer nivel de la jerarquia academica |
| `grados` | Grado o nivel educativo dentro de un plantel |
| `materias` | Materia dentro de un grado |
| `unidades` | Unidad didactica dentro de una materia |
| `temas` | Tema especifico dentro de una unidad |
| `planeaciones` | Planeaciones generadas; vinculadas a un tema y a un batch |
| `planeacion_batches` | Agrupa planeaciones creadas juntas; base del sistema de Biblioteca |
| `examenes` | Examenes generados por unidad |
| `listas_cotejo` | Listas de cotejo por planeacion o actividad |
| `anexos` | Anexos generados para cada planeacion (max 1 por planeacion) |

El backend está diseñado para operar con RLS mediante clientes ligados al token. Este repositorio no contiene las migraciones ni policies necesarias para confirmar que todas las tablas tengan RLS; consultar `docs/DATABASE_SCHEMA.md`. El `user_id` se deriva del token de Supabase, nunca del cuerpo del request.

## Variables de entorno

Crea un archivo `.env` en la raiz con estas variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_KEY=your-anon-public-key
OPENAI_API_KEY=your-openai-api-key
PIXABAY_API_KEY=your-pixabay-api-key
CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5500
PORT=3000
NODE_ENV=development
```

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave admin para validar usuarios |
| `SUPABASE_KEY` | Clave publica usada para clientes por usuario (respeta RLS) |
| `OPENAI_API_KEY` | Generacion de todos los documentos educativos |
| `PIXABAY_API_KEY` | Busqueda de imagenes para enriquecer planeaciones (opcional) |
| `CORS_ORIGIN` | Origenes permitidos separados por coma |
| `PORT` | Puerto del servidor Express (default 3000) |
| `NODE_ENV` | Controla comportamiento de CORS y logs |

## Instalacion

```bash
npm install
```

## Scripts disponibles

```bash
npm start       # node src/server.js
npm run dev     # nodemon (recarga automatica)
npm test        # placeholder, no hay suite configurada
```

## Ejecucion local

1. Crea y completa el archivo `.env`.
2. Instala dependencias con `npm install`.
3. Ejecuta `npm run dev`.
4. Verifica el servicio en `http://localhost:3000/health`.

## Estructura del proyecto

```text
Educativo-Backend/
|-- .env
|-- .gitignore
|-- CHANGELOG.md
|-- package.json
|-- README.md
|-- supabaseClient.js
`-- src/
    |-- app.js
    |-- server.js
    |-- controllers/
    |   |-- anexos.controller.js
    |   |-- biblioteca.controller.js
    |   |-- examenes.controller.js
    |   |-- jerarquia.controller.js
    |   |-- listas_cotejo.controller.js
    |   `-- planeaciones.controller.js
    |-- middleware/
    |   `-- auth.middleware.js
    |-- routes/
    |   |-- index.js
    |   |-- anexos.routes.js
    |   |-- biblioteca.routes.js
    |   |-- examenes.routes.js
    |   |-- jerarquia.routes.js
    |   |-- listas_cotejo.routes.js
    |   `-- planeaciones.routes.js
    |-- services/
    |   |-- aiMetrics.service.js
    |   |-- anexos.service.js
    |   |-- biblioteca.service.js
    |   |-- examenes.service.js
    |   |-- imageEnrichment.service.js
    |   |-- imageSearch.service.js
    |   |-- jerarquia.service.js
    |   |-- listas_cotejo.service.js
    |   `-- planeaciones.service.js
    `-- utils/
        |-- buildExamPromptByUnit.js
        |-- buildImageSearchQuery.js
        |-- buildPromptByLevel.js
        `-- generateImageQuery.js
```

## Relacion con el frontend

El frontend de Educativo IA consume esta API desde el navegador. La URL base se configura en `js/core/config.js` del repo frontend segun el hostname.

CORS esta configurado en `src/app.js`; la variable `CORS_ORIGIN` define los origenes permitidos en produccion. En desarrollo local acepta `localhost` y `127.0.0.1`.

## Seguridad y datos

- Todas las rutas bajo `/api` requieren `Authorization: Bearer <supabase_access_token>`.
- El backend valida el token con `supabaseAdmin.auth.getUser(token)` antes de procesar cualquier request.
- El backend está diseñado para respetar RLS mediante clientes ligados al token; las policies no pueden confirmarse sin migraciones o un export de schema.
- `user_id` se extrae del token validado, nunca del cuerpo del request.
- Los logs de metricas sanitizan API keys y tokens antes de persistir errores.

## Notas de mantenimiento

- `imageEnrichment.service.js` y `imageSearch.service.js` son servicios de busqueda de imagenes por Pixabay. La generacion automatica de imagenes por momento fue desactivada definitivamente (v2.0); estos servicios quedan disponibles pero sin uso activo en el flujo principal.
- La tabla legacy `ia_metrics` se mantiene; `planeaciones.service.js` sigue escribiendo en ella junto con el nuevo sistema de `aiMetrics.service.js`.
- No hay suite de tests configurada mas alla del placeholder en `package.json`.
- No documentar ni versionar credenciales reales. Mantener los valores de entorno fuera de la documentación y del control de versiones.

## Licencia

El `package.json` declara licencia `ISC`. Si el proyecto requiere otra politica de distribucion, conviene actualizarla de forma explicita.
