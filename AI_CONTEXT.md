# AI_CONTEXT.md

Este archivo es el punto de entrada para cualquier IA/Codex que vaya a modificar Educativo IA / Planea.

La UI vigente tiene un solo flujo visual principal: Biblioteca. Para trabajo frontend, leer primero `../../educativo_frontend/planeacion-docente-ia/AGENTS.md` y `../../educativo_frontend/planeacion-docente-ia/docs/ARCHITECTURE.md`. Los documentos frontend históricos conservados en este backend no son arquitectura objetivo.

Antes de cambiar el proyecto, leer primero `AGENTS.md` y después usar `docs/ai-context/` como índice. El objetivo es entender el producto, la arquitectura y las reglas de seguridad sin convertir rutas históricas en fuentes canónicas.

## Orden recomendado de lectura

1. `docs/ai-context/00-project-overview.md`
2. `docs/ai-context/01-architecture.md`
3. `docs/ai-context/02-frontend-guide.md` como ruta de compatibilidad hacia la documentación frontend vigente
4. `docs/03-backend-guide.md`
5. `docs/DATABASE_SCHEMA.md` cuando el cambio toque datos o persistencia
6. `docs/AI_GENERATION_CONTRACTS.md` cuando el cambio toque generación IA
7. `docs/ai-context/06-ui-rules.md`
8. `docs/ai-context/07-known-bugs-and-decisions.md`
9. `docs/ai-context/08-codex-working-rules.md`

Las reglas obligatorias para agentes están en `AGENTS.md`. Los archivos de `docs/ai-context/` que apuntan a fuentes canónicas se conservan únicamente por compatibilidad histórica.

## Regla principal

Hacer siempre el cambio mas pequeno y seguro posible. No refactorizar, renombrar rutas, cambiar contratos API, tocar base de datos ni modificar prompts de IA sin una razon clara y permiso explicito.

## Alcance de esta documentacion

Esta documentacion se basa en los archivos existentes del repo. Si un dato no esta confirmado por codigo, migraciones o README, debe tratarse como `pendiente de confirmar`.
