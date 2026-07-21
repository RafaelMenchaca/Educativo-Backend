# 01 - Architecture

## Estructura general

El workspace contiene varias areas:

- `educativo_frontend/planeacion-docente-ia`: frontend estatico.
- `educativo_backend/Educativo-Backend`: API REST.
- No hay migraciones SQL visibles dentro de este repositorio al 2026-07-20; no asumir su ruta ni contenido.
- `docs`: consultas y documentacion.
- `bitacora`: notas historicas del proyecto.

La raiz del workspace no aparece como repo Git unico. Puede haber repos separados dentro de frontend/backend.

## Frontend

Biblioteca es el único flujo visual principal vigente. El explorador jerárquico antiguo del dashboard es legacy; los módulos jerárquicos que sigan consumidos por datos, creación o Archivados se consideran soporte técnico, no una segunda UI.

Organizacion principal:

- `index.html` y `pages/`: paginas publicas y privadas.
- `components/`: navbar, footer, sidebar y layout cargados dinamicamente.
- `css/`: estilos por area/pagina y salida de Tailwind.
- `js/core/`: config global, utilidades y Supabase.
- `js/api/`: llamadas `fetch` al backend.
- `js/services/`: orquestacion de sesion y operaciones.
- `js/pages/`: controladores por pagina.
- `js/ui/`: renderizado, modales, toasts y exportacion Word.

## Backend

Organizacion principal:

- `src/server.js`: arranque HTTP.
- `src/app.js`: Express, CORS, JSON, rutas, healthcheck.
- `src/routes`: montaje de endpoints bajo `/api`.
- `src/controllers`: validacion/parsing de request y respuestas HTTP.
- `src/services`: logica de dominio, Supabase, OpenAI y metricas.
- `src/middleware/auth.middleware.js`: valida Bearer token de Supabase.
- `src/utils`: builders de prompts y busqueda de imagenes.
- `supabaseClient.js`: cliente admin y cliente por usuario.

## Separacion de responsabilidades

- Frontend `js/api/*`: solo transporte HTTP y errores de API.
- Frontend `js/pages/*`: estado de pagina, eventos y orquestacion.
- Frontend `js/ui/*`: renderizado, componentes, modales y descargas.
- Backend routes: solo definen rutas y middleware.
- Backend controllers: validan entrada, crean cliente Supabase por usuario y responden.
- Backend services: implementan reglas de negocio, persistencia, generacion IA y metricas.

## Configuracion

- Backend: variables en `.env` leidas por `dotenv`. No documentar valores reales.
- Frontend: `js/core/config.js` define `API_BASE_URL` segun hostname:
  - local: `http://localhost:3000`
  - produccion: `https://api.educativoia.com`
- Supabase frontend: `js/core/supabase.client.js` contiene la configuracion publica anon.
- CORS backend: `src/app.js` permite defaults de produccion y origenes en `CORS_ORIGIN`; en desarrollo permite todo.

## Conexion frontend/backend

El frontend llama al backend con `Authorization: Bearer <access_token>`. El backend valida el token con Supabase y crea un cliente por usuario para respetar RLS.

## Reglas para no romper arquitectura

- No mover responsabilidades entre capas sin permiso.
- No cambiar nombres de rutas ni endpoints existentes.
- No cambiar la forma de `API_BASE_URL` sin revisar despliegues.
- No reemplazar JavaScript vanilla por framework.
- No saltarse `requireAuth` en rutas privadas.
- No usar `supabaseAdmin` para operaciones de usuario salvo casos backend-only justificados.
