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
