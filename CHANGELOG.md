## [v1.1-IA-Metrics-and-Export-Release] - 2026-01-10

### 🚀 Novedades
- Nuevo sistema de métricas de IA mediante la tabla `ia_metrics` en Supabase.
- Registro automático de consumo de tokens, consistencia del JSON y versión del prompt por planeación.
- Prompt adaptativo optimizado por nivel educativo (Primaria, Secundaria, Preparatoria y Universidad).
- Nuevo endpoint de exportación **Excel profesional (.xlsx)** para planeaciones didácticas.
- Exportación disponible tanto al crear la planeación como desde la vista de detalle.

### 🧰 Técnicos
- Integración de `exceljs` para generación de archivos Excel desde backend.
- Manejo seguro de métricas sin afectar el flujo principal de generación.
- Arquitectura preparada para análisis posterior de costos y calidad de IA.
- Compatibilidad total con Supabase y frontend existente.

### 🧩 Próximos pasos
- Análisis de métricas IA para optimización de prompts y costos.
- Añadir branding institucional (logo) a los archivos exportados.
- Exportación a PDF con formato oficial.


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
