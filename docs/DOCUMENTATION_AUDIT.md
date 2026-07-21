# Auditoría de autoridad documental

## Alcance

Lista de contradicciones y mezclas encontradas antes de la consolidación del 2026-07-20. Este archivo registra el diagnóstico; las fuentes vigentes están enlazadas al final.

## Contradicciones encontradas

- `docs/ai-context/03-backend-guide.md` mezclaba arquitectura descriptiva con reglas de validación, logs y métricas, por lo que competía con `AGENTS.md` y los contratos especializados.
- `docs/ai-context/04-database-guide.md` referenciaba `sql/migrations/20260517_anexos.sql` y `sql/migrations/20260523_ai_metrics.sql`, pero no hay archivos `.sql` en este repositorio.
- El README afirmaba que todas las tablas tienen RLS, pero el snapshot `docs/DATABASE_SCHEMA.md` no incluye policies ni sentencias `enable row level security`, y no hay migraciones locales para comprobarlo.
- El handoff ubicaba `LOG_AUDIT.md` y `LOG_CONVENTIONS.md` fuera del repositorio, pero esas rutas tampoco existían en el workspace; no podían ser lecturas obligatorias estables.
- La documentación de IA estaba dispersa entre `docs/ai-context/05-ai-generation-flow.md`, `docs/ai_rules/anexos.md`, README, CHANGELOG y services. `docs/ai_rules/anexos.md` contenía un prompt propuesto que podía confundirse con el ejecutable.
- La documentación previa no fijaba con claridad que Biblioteca selecciona exámenes mediante `planeacion_ids`, que el backend deriva `tema_ids` y que ambos tipos de ID no son intercambiables.
- La documentación describía listas de cotejo como dependientes del cierre, mientras el código vigente primero usa las actividades disponibles en `actividades_momentos`, luego el cierre legacy y finalmente un fallback desde `tabla_ia`.
- La razón `skipped` `missing_closing_activity` sugiere ausencia de cierre, pero el código la usa cuando no encuentra ninguna actividad evaluable; se conserva como contrato legacy y se documenta sin renombrarla.
- `AGENTS.md` era una copia orientada principalmente al refactor frontend e incluía “No modificar el backend”, una regla ambigua dentro del propio repositorio backend.
- `AGENTS.md` listaba `docs/refactor/REFACTOR_RULES.md` y `docs/refactor/DECISIONS.md`, archivos inexistentes.
- El README mostraba una carpeta `supabase/migrations/` que no existe en el árbol actual.

## Resolución documental

- Reglas obligatorias: [`../AGENTS.md`](../AGENTS.md).
- Arquitectura descriptiva: [`03-backend-guide.md`](03-backend-guide.md).
- Schema documental: [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).
- Contratos IA: [`AI_GENERATION_CONTRACTS.md`](AI_GENERATION_CONTRACTS.md).
- Convenciones e inventario de logs: [`observability/LOG_CONVENTIONS.md`](observability/LOG_CONVENTIONS.md) y [`observability/LOG_AUDIT.md`](observability/LOG_AUDIT.md).

Los archivos históricos de `docs/ai-context/` se conservan como rutas de compatibilidad cuando corresponde, sin duplicar reglas ni contratos completos.
