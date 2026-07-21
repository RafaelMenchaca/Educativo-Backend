# 07 - Known Bugs And Decisions

> Estado: histórico. No describe el flujo visual vigente. El flujo actual es Biblioteca. Confirmar decisiones actuales en los documentos canónicos antes de actuar.

## Decisiones actuales

- La Biblioteca es el hub principal para documentos generados.
- `planeacion_batches` agrupa documentos por bloque/unidad.
- El frontend usa JavaScript vanilla, no framework.
- El proyecto mezcla Tailwind y Bootstrap de forma intencional.
- El backend separa routes, controllers y services.
- Todas las rutas privadas usan Bearer token de Supabase.
- `user_id` se deriva del token validado, no del body.
- Las metricas nuevas viven en `ai_generation_jobs` y `ai_generation_calls`.
- `ia_metrics` se mantiene como tabla legacy para compatibilidad.
- `pages/batch.html`, `pages/planeacion.html` y `js/planeacion.js` se consideran legacy segun README.
- La generacion automatica/enriquecimiento de imagenes aparece desactivada del flujo principal segun README, aunque quedan servicios disponibles.

## Bugs o riesgos visibles

- `dashboard.page.js` es muy grande segun README y es candidato a refactor, pero no debe refactorizarse sin permiso.
- Hay usos residuales de `alert()` en frontend, aunque el README indica que se migraron muchas operaciones a toasts.
- Algunas migraciones de tablas principales no estan visibles en este workspace.
- El README del backend menciona que un `.env` con credenciales reales estuvo versionado; no copiar ni documentar secretos.
- Existen logs de debug (`planeacion-debug`, `exam-debug`) que pueden ser utiles pero no deben exponer datos sensibles.

## Cosas que Codex no debe cambiar sin permiso

- Contratos de endpoints.
- Nombres de tablas o columnas.
- RLS, auth o forma de crear clientes Supabase.
- Prompts y estructura JSON esperada por generacion IA.
- Modelo OpenAI usado en produccion.
- Escritura de metricas IA.
- Zonas protegidas de `js/ui/wordExport.js`.
- Flujo principal de Biblioteca.
- Archivos legacy si no son parte directa del cambio.
- Dependencias o frameworks.

## Pendiente de confirmar

- Estado actual de despliegue de frontend/backend.
- Si `alert()` residual se considera bug prioritario o deuda aceptada.
- Lista completa de bugs historicos fuera de comentarios, README y CHANGELOG.
