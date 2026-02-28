## [v1.3-backend-hierarchy-tree] - 2026-02-28

### 🚀 Novedades
- Endpoints jerárquicos para Planteles → Grados → Materias → Unidades → Temas.
- Endpoint de generación contextual por unidad: crea N temas y genera N planeaciones (1 tema = 1 planeación) con `tema_id`.
- Soporte de consulta de planeación por `tema_id` para navegación desde UI.

### 🔒 Seguridad / Datos
- Integración con nuevo esquema Supabase (tablas jerárquicas con RLS + ownership triggers).
- `user_id` se maneja desde Supabase (no se envía desde frontend).

### 🧩 Compatibilidad
- Se conservan campos legacy en `planeaciones` (batch/strings) para transición; nueva lógica usa `tema_id`.


## [v1.2-Backend-Refactor-Architecture] - 2026-02-01

### 🚀 Novedades
- Backend refactorizado completamente a una **arquitectura por capas profesional**.
- Separación clara de responsabilidades: **routes, controllers, services, middleware y utils**.
- Flujo de generación IA por batch totalmente estable y escalable.
- Eliminación definitiva del entrypoint legacy (`index.js`).

### 🧰 Técnicos
- Nuevo entrypoint único: `src/server.js`.
- Configuración de Express centralizada en `src/app.js`.
- Rutas desacopladas de la lógica de negocio.
- Controllers delgados enfocados solo en HTTP (`req / res`).
- Services aislando lógica de dominio, Supabase y OpenAI.
- Middleware de autenticación (`requireAuth`) reutilizable y desacoplado.
- Utilidad `buildPromptByLevel` extraída a `utils/` sin modificar el prompt original.

### 🤖 Inteligencia Artificial
- Prompt adaptativo por nivel educativo movido a `utils`.
- Control de flujo corregido para soportar **batch real (N temas → N planeaciones)**.
- Recuperación segura de JSON parcial desde respuestas de IA.
- Fallback automático cuando la IA devuelve contenido inválido.
- Registro de métricas IA por planeación:
  - `tokens_prompt`
  - `tokens_completion`
  - `tokens_total`
  - `json_ok`
  - `error_tipo`
- Versionado explícito de prompt (`prompt_version`).

### 🗄️ Base de datos
- Persistencia estable de planeaciones por batch (`batch_id`).
- Métricas IA almacenadas en tabla `ia_metrics`.
- Flujo alineado con políticas RLS existentes.
- Sin cambios destructivos al esquema previo.

### 🧱 Infraestructura
- Actualización del Start Command en Render para usar `node src/server.js`.
- Eliminación de conflictos por entrypoint incorrecto.
- Deploy limpio y estable tras refactor completo.

### 🧩 Próximos pasos
- Hacer el batch **resiliente** (errores parciales por tema).
- Extraer métricas IA a `iaMetrics.service.js`.
- Documentar API (OpenAPI / Swagger).
- Volver al frontend para consumir el backend refactorizado.


## [v1.1-Batch-Planeacion-Unidad] - 2026-01-18

### 🚀 Novedades
- Generación de **múltiples planeaciones por múltiples temas** en un solo request.
- Introducción del concepto **Batch (`batch_id`)** para agrupar planeaciones creadas juntas.
- Nuevo endpoint `/api/planeaciones/batch/:batch_id` para listar planeaciones por unidad.
- Soporte completo para el campo **Unidad** como dimensión principal de planeación.
- Cada planeación conserva su ID individual y es editable de forma independiente.

### 🧰 Técnicos
- Refactor del endpoint `/generate` para procesar arreglos de temas.
- Inserción múltiple de planeaciones por submit.
- Filtro seguro por usuario (`requireAuth` + `user_id`).
- Ordenamiento consistente usando `fecha_creacion`.
- Eliminación definitiva de lógica obsoleta (`subtema`, `sesiones`).

### 🗄️ Base de datos
- Nueva columna `batch_id` (UUID) en `planeaciones`.
- Nueva columna `unidad` integrada al modelo.
- Esquema alineado con el nuevo flujo batch-based.
- Compatibilidad total con registros existentes.

### 🧩 Próximos pasos
- Optimizar métricas de uso por batch.
- Endpoint para exportar unidades completas.
- Consolidar dashboard por unidad.


## [v1.0-IA-Integration-Release] - 2026-01-03

### 🚀 Novedades
- Integración real con **OpenAI GPT-4o-mini** para generación automática de planeaciones didácticas.
- Nuevo endpoint `/api/planeaciones/generate` que guarda automáticamente en Supabase.
- Prompt mejorado para PAEC, productos, instrumentos y tiempos coherentes.
- Manejo de errores y fallback seguro si la IA falla.
- Compatible con frontend existente y base de datos Supabase.

### 🧰 Técnicos
- Node.js + Express + Supabase SDK.
- `.env` y `OPENAI_API_KEY` gestionados desde Render.
- Código totalmente modular y preparado para logs.

### 🧩 Próximos pasos
- Añadir IA adaptativa por nivel educativo.
- Sistema de autenticación docente (JWT o Supabase Auth).
- Endpoint `/update` para edición libre desde el frontend.
