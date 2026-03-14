# Educativo Backend

Backend de Educativo IA. Este repositorio expone una API en Node.js y Express para autenticacion con Supabase, administracion de jerarquia academica y generacion de planeaciones didacticas con IA.

## Alcance del repositorio

Este proyecto concentra la capa backend del producto y cubre estas responsabilidades:

- API REST para planeaciones y jerarquia academica.
- Validacion de tokens Bearer emitidos por Supabase.
- Clientes Supabase para operaciones administrativas y consultas con contexto de usuario.
- Generacion de planeaciones con OpenAI.
- Respuestas JSON y streaming SSE para mostrar progreso de generacion.
- Persistencia de planeaciones, temas y metricas de IA en Supabase.

## Stack tecnico

- Node.js
- Express 4
- Supabase JavaScript SDK
- OpenAI SDK
- dotenv
- cors
- nodemon

## Arquitectura general

- `src/server.js`: arranque del servidor HTTP.
- `src/app.js`: configuracion de Express, CORS, JSON body parser, healthcheck y montaje de rutas.
- `src/routes/`: definicion de endpoints de planeaciones y jerarquia.
- `src/middleware/auth.middleware.js`: validacion de `Authorization: Bearer <token>`.
- `src/controllers/`: parsing de requests, validaciones y armado de respuestas JSON o SSE.
- `src/services/`: acceso a Supabase, generacion con OpenAI y reglas de negocio.
- `src/utils/buildPromptByLevel.js`: construccion del prompt segun materia, nivel, unidad, tema y duracion.
- `supabaseClient.js`: cliente admin y cliente por usuario para consultas con token de acceso.

## Flujo principal

1. El frontend envia un token Bearer de Supabase.
2. `requireAuth` valida el token y adjunta `req.user` y `req.accessToken`.
3. El controlador crea un cliente Supabase ligado al usuario.
4. El servicio consulta o persiste datos en tablas como `planteles`, `grados`, `materias`, `unidades`, `temas` y `planeaciones`.
5. Cuando aplica, el servicio llama a OpenAI para generar `tabla_ia` y registra metricas en `ia_metrics`.
6. La API responde en JSON o por SSE cuando se solicita progreso en tiempo real.

## Autenticacion

- Todas las rutas bajo `/api` requieren encabezado `Authorization: Bearer <supabase_access_token>`.
- La validacion se hace con `supabaseAdmin.auth.getUser(token)`.
- Despues de validar el token, el backend crea un cliente con `SUPABASE_KEY` para operar con contexto de usuario.

## Endpoints

Rutas publicas:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Respuesta simple para confirmar que el servidor esta arriba |
| GET | `/health` | Healthcheck JSON |

Rutas de planeaciones:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/planeaciones` | Lista planeaciones del usuario autenticado |
| GET | `/api/planeaciones/batches` | Lista batches disponibles |
| GET | `/api/planeaciones/batch/:batch_id` | Obtiene planeaciones agrupadas por batch |
| POST | `/api/planeaciones/generate` | Genera una o varias planeaciones con IA |
| GET | `/api/planeaciones/:id` | Obtiene una planeacion por ID |
| PUT | `/api/planeaciones/:id` | Actualiza una planeacion existente |
| DELETE | `/api/planeaciones/:id` | Elimina una planeacion |

Rutas de jerarquia academica:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/planteles` | Lista planteles |
| POST | `/api/planteles` | Crea un plantel |
| DELETE | `/api/planteles/:plantelId` | Elimina un plantel y su cascada relacionada |
| GET | `/api/planteles/:plantelId/grados` | Lista grados de un plantel |
| POST | `/api/grados` | Crea un grado |
| DELETE | `/api/grados/:gradoId` | Elimina un grado |
| GET | `/api/grados/:gradoId/materias` | Lista materias de un grado |
| POST | `/api/materias` | Crea una materia |
| DELETE | `/api/materias/:materiaId` | Elimina una materia |
| GET | `/api/materias/:materiaId/unidades` | Lista unidades de una materia |
| POST | `/api/unidades` | Crea una unidad |
| DELETE | `/api/unidades/:unidadId` | Elimina una unidad |
| GET | `/api/unidades/:unidadId/temas` | Lista temas de una unidad |
| POST | `/api/temas` | Crea uno o varios temas |
| DELETE | `/api/temas/:temaId` | Elimina un tema |
| POST | `/api/unidades/:unidadId/generar` | Genera planeaciones por unidad |
| GET | `/api/temas/:temaId/planeacion` | Obtiene la ultima planeacion asociada a un tema |

## Streaming SSE

Los endpoints de generacion soportan streaming con Server-Sent Events:

- `POST /api/planeaciones/generate?stream=1`
- `POST /api/unidades/:unidadId/generar?stream=1`

Tambien pueden activarse enviando `Accept: text/event-stream`.

Eventos esperados:

- `item_started`
- `item_completed`
- `item_error`
- `done`

## Variables de entorno

Este backend depende de un archivo `.env` con al menos estas variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_KEY=your-anon-public-key
OPENAI_API_KEY=your-openai-api-key
CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5500
PORT=3000
NODE_ENV=development
```

Descripcion rapida:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: clave admin para validar usuarios y operaciones privilegiadas.
- `SUPABASE_KEY`: clave publica usada para crear clientes por usuario autenticado.
- `OPENAI_API_KEY`: clave para generacion de planeaciones.
- `CORS_ORIGIN`: lista separada por comas de origenes permitidos en produccion.
- `PORT`: puerto del servidor Express.
- `NODE_ENV`: controla comportamiento de CORS y entorno.

## Instalacion

```bash
npm install
```

## Scripts disponibles

```bash
npm start
npm run dev
npm test
```

Estado de los scripts:

- `npm start`: inicia el servidor con `node src/server.js`.
- `npm run dev`: inicia el servidor con `nodemon`.
- `npm test`: hoy es un placeholder y devuelve error porque no hay suite configurada.

## Ejecucion local

1. Crea y completa el archivo `.env`.
2. Instala dependencias con `npm install`.
3. Ejecuta `npm run dev` para desarrollo o `npm start` para una corrida normal.
4. Verifica el servicio en `http://localhost:3000/health`.

## Estructura del proyecto

Se muestra la estructura actual del repositorio. Se omiten `.git/` y `node_modules/` por brevedad:

```text
Educativo-Backend/
|-- .env
|-- .gitignore
|-- CHANGELOG.md
|-- package-lock.json
|-- package.json
|-- README.md
|-- src/
|   |-- app.js
|   |-- controllers/
|   |   |-- jerarquia.controller.js
|   |   `-- planeaciones.controller.js
|   |-- middleware/
|   |   `-- auth.middleware.js
|   |-- routes/
|   |   |-- index.js
|   |   |-- jerarquia.routes.js
|   |   `-- planeaciones.routes.js
|   |-- server.js
|   |-- services/
|   |   |-- jerarquia.service.js
|   |   `-- planeaciones.service.js
|   `-- utils/
|       `-- buildPromptByLevel.js
`-- supabaseClient.js
```

## Notas de mantenimiento

- El `README` anterior mezclaba dos versiones del proyecto; este archivo se rehizo contra el codigo actual.
- La generacion por unidad crea temas nuevos, registra estados `pending`, `generating`, `ready` o `error` y devuelve un `batch_id`.
- El backend registra metricas de uso de IA en la tabla `ia_metrics`.
- Si este repo va a publicarse, conviene retirar `.env` del workspace versionado y mantener solo un ejemplo como `.env.example`.

## Licencia

El `package.json` declara licencia `ISC`. Si el proyecto requiere otra politica de distribucion, conviene actualizarla de forma explicita.
