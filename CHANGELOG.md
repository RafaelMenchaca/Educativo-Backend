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
