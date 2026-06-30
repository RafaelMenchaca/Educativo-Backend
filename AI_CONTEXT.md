# AI_CONTEXT.md

Este archivo es el punto de entrada para cualquier IA/Codex que vaya a modificar Educativo IA / Planea.

Antes de cambiar el proyecto, leer primero la documentacion interna en `docs/ai-context/`. El objetivo es entender el producto, la arquitectura y las reglas de seguridad para no romper flujos existentes.

## Orden recomendado de lectura

1. `docs/ai-context/00-project-overview.md`
2. `docs/ai-context/01-architecture.md`
3. `docs/ai-context/02-frontend-guide.md`
4. `docs/ai-context/03-backend-guide.md`
5. `docs/ai-context/04-database-guide.md`
6. `docs/ai-context/05-ai-generation-flow.md`
7. `docs/ai-context/06-ui-rules.md`
8. `docs/ai-context/07-known-bugs-and-decisions.md`
9. `docs/ai-context/08-codex-working-rules.md`

## Regla principal

Hacer siempre el cambio mas pequeno y seguro posible. No refactorizar, renombrar rutas, cambiar contratos API, tocar base de datos ni modificar prompts de IA sin una razon clara y permiso explicito.

## Alcance de esta documentacion

Esta documentacion se basa en los archivos existentes del repo. Si un dato no esta confirmado por codigo, migraciones o README, debe tratarse como `pendiente de confirmar`.
