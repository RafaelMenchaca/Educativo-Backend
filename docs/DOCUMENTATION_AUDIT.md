# Auditoría final de documentación

## Alcance y autoridad

Auditoría realizada el 2026-07-21 sobre todos los Markdown existentes de frontend y backend, contrastados con el código relevante en modo solo lectura.

Regla central resultante:

> Biblioteca es el único flujo visual principal vigente y el único objetivo de nuevas implementaciones. El explorador visual jerárquico antiguo es legacy. La jerarquía técnica puede seguir activa como datos, API, compatibilidad o soporte de Archivados.

Las migraciones y el código siguen siendo la fuente técnica real. Esta auditoría clasifica documentos; no redefine schema, payloads ni contratos IA.

## Contradicciones encontradas antes de corregir

| Documento | Contradicción o ambigüedad | Resolución |
| --- | --- | --- |
| Frontend `README.md` | Describía el dashboard como explorador jerárquico vigente, hacía que Biblioteca pareciera una etapa posterior y referenciaba `pages/biblioteca.html`, inexistente. | Reescrito con Biblioteca como único flujo visual y Archivados separado. |
| Frontend `README.md` | Documentaba una URL de producción distinta de `js/core/config.js`. | Alineado con la configuración ejecutable, sin copiar secretos. |
| Frontend `docs/ARCHITECTURE.md` | Decía que Biblioteca era “el flujo vigente”, pero no prohibía inequívocamente un modo dual. | Añadida regla central, terminología y matriz funcional. |
| Backend `docs/ai-context/02-frontend-guide.md` | Indicaba que el dashboard mostraba la jerarquía como flujo principal. | Convertido en ruta de compatibilidad hacia la documentación frontend canónica. |
| Backend `docs/ARCHITECTURE.md` y auditorías de refactor | Eran snapshots frontend guardados en backend sin aviso visible; el lenguaje “dos sistemas” podía interpretarse como dos UIs soportadas. | Marcados como históricos/compatibilidad y aclarados como código de dos épocas, no dos flujos vigentes. |
| Backend `docs/refactor/LEGACY_HIERARCHY.md` | Llamaba “sistema de jerarquía vigente” a APIs/helpers técnicos y mezclaba Dashboard con Archivados. | Separado en jerarquía técnica activa, Archivados separado y explorador visual legacy. |
| Backend `docs/refactor/REFACTOR_BACKLOG.md` | Proponía modularizar/cargar condicionalmente el explorador antiguo, dirección incompatible con Biblioteca como único objetivo. | Marcado histórico y no ejecutable; enlaza al playbook frontend canónico. |
| Backend `docs/refactor/TEST_MATRIX.md` | Podía leerse como matriz vigente duplicada, con pruebas de jerarquía. | Marcada histórica; Archivados queda separado y la matriz canónica vive en frontend. |
| Backend `CHANGELOG.md` | “Eliminación de jerarquía” podía significar eliminación del modelo completo. | Aclarado como endpoints de eliminación de entidades jerárquicas. |
| Backend `README.md` | Afirmaba que RLS garantizaba aislamiento pese a que no hay policies/migraciones locales para comprobarlo. | Alineado con la limitación de `DATABASE_SCHEMA.md`. |
| Varios documentos | Usaban unidad, batch, bloque y conjunto como equivalentes implícitos. | La terminología canónica prohíbe asumir equivalencia sin revisar contrato. |

## Inventario y clasificación

| Repositorio | Documento | Propósito | Estado | Menciona Biblioteca | Menciona jerarquía | Acción |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend | `AGENTS.md` | Reglas obligatorias | Canónico | Sí | Sí | Actualizado |
| Frontend | `README.md` | Entrada al repositorio | Vigente | Sí | Sí | Reescrito |
| Frontend | `CHANGELOG.md` | Historial de versiones | Histórico | Sí | Sí | Aviso agregado |
| Frontend | `docs/ARCHITECTURE.md` | Arquitectura y terminología UI | Canónico | Sí | Sí | Reescrito |
| Frontend | `docs/refactor/REFACTOR_PLAYBOOK.md` | Método de extracción | Canónico | Sí | Sí | Reescrito |
| Frontend | `docs/refactor/SESSION_HANDOFF.md` | Estado de sesión | Vigente | Sí | Sí | Actualizado |
| Frontend | `docs/refactor/TEST_MATRIX.md` | Pruebas manuales | Canónico | Sí | Sí | Reescrito |
| Backend | `AGENTS.md` | Reglas obligatorias | Canónico | Sí | Sí | Actualizado |
| Backend | `README.md` | Introducción a API | Vigente | Sí | Sí | Actualizado |
| Backend | `AI_CONTEXT.md` | Índice para agentes | Compatibilidad / vigente | Sí | Sí | Actualizado |
| Backend | `CHANGELOG.md` | Historial de versiones | Histórico | Sí | Sí | Aviso y término corregidos |
| Backend | `docs/03-backend-guide.md` | Arquitectura backend | Canónico descriptivo | Sí | Sí | Actualizado |
| Backend | `docs/DATABASE_SCHEMA.md` | Schema documental | Canónico | Sí | Sí | Nota de separación agregada |
| Backend | `docs/AI_GENERATION_CONTRACTS.md` | Contratos IA | Canónico | Sí | No | Protección frontend agregada |
| Backend | `docs/DOCUMENTATION_AUDIT.md` | Inventario y contradicciones | Canónico | Sí | Sí | Reescrito |
| Backend | `docs/ARCHITECTURE.md` | Snapshot frontend anterior | Histórico / compatibilidad | Sí | Sí | Aviso agregado |
| Backend | `docs/FRONTEND_MAP.md` | Inventario frontend anterior | Histórico / compatibilidad | Sí | Sí | Aviso agregado |
| Backend | `docs/observability/LOG_AUDIT.md` | Inventario de logs | Vigente | Sí | Sí | Sin cambio; no relacionado con UI |
| Backend | `docs/observability/LOG_CONVENTIONS.md` | Reglas de logs | Canónico | Sí | No | Sin cambio; no relacionado con UI |
| Backend | `docs/ai-context/00-project-overview.md` | Contexto de producto | Vigente | Sí | Sí | Actualizado |
| Backend | `docs/ai-context/01-architecture.md` | Vista general del workspace | Vigente | Sí | Sí | Actualizado |
| Backend | `docs/ai-context/02-frontend-guide.md` | Ruta histórica frontend | Compatibilidad | Sí | Sí | Sustituido por enlaces canónicos |
| Backend | `docs/ai-context/03-backend-guide.md` | Alias histórico de guía backend | Compatibilidad | No | No | Conservado |
| Backend | `docs/ai-context/04-database-guide.md` | Alias histórico de schema | Compatibilidad | No | No | Conservado |
| Backend | `docs/ai-context/05-ai-generation-flow.md` | Alias histórico de contratos IA | Compatibilidad | No | No | Conservado |
| Backend | `docs/ai-context/06-ui-rules.md` | Ruta histórica de UI | Compatibilidad | Sí | Sí | Sustituido por enlaces canónicos |
| Backend | `docs/ai-context/07-known-bugs-and-decisions.md` | Decisiones anteriores | Histórico | Sí | No | Aviso agregado |
| Backend | `docs/ai-context/08-codex-working-rules.md` | Alias histórico de reglas | Compatibilidad | No | No | Conservado |
| Backend | `docs/ai_rules/anexos.md` | Referencia anterior de anexos | Histórico / compatibilidad | No | No | Conservado; apunta al contrato IA |
| Backend | `docs/refactor/CURRENT_BEHAVIOR.md` | Snapshot de Biblioteca | Histórico / compatibilidad | Sí | No | Aviso agregado |
| Backend | `docs/refactor/FRONTEND_AUDIT.md` | Auditoría frontend anterior | Histórico / compatibilidad | Sí | Sí | Aviso agregado |
| Backend | `docs/refactor/LEGACY_HIERARCHY.md` | Inventario de jerarquía | Histórico / compatibilidad | Sí | Sí | Aviso y términos corregidos |
| Backend | `docs/refactor/REFACTOR_BACKLOG.md` | Plan anterior | Obsoleto / histórico | Sí | Sí | Marcado no ejecutable |
| Backend | `docs/refactor/SESSION_HANDOFF.md` | Registro cronológico | Vigente / histórico por sesión | Sí | Sí | Sesión actual agregada |
| Backend | `docs/refactor/TEST_MATRIX.md` | Matriz frontend anterior | Duplicado / histórico | Sí | Sí | Enlazada a matriz canónica |

## Terminología canónica

- **Biblioteca:** único flujo visual principal vigente para administrar recursos.
- **Bloque o conjunto de Biblioteca:** agrupación visual y funcional; no equivale automáticamente a una unidad u otra entidad jerárquica.
- **Jerarquía técnica:** modelo de datos y endpoints de planteles, grados, materias, unidades y temas.
- **Explorador visual jerárquico:** interfaz antigua por niveles; legacy y no apta para nuevas implementaciones.
- **Compatibilidad legacy:** código, globals o wrappers conservados por consumidores existentes; no arquitectura objetivo.
- **Archivados:** flujo separado que puede usar jerarquía técnica.
- **`unidad_id`:** ID técnico de contratos concretos; no fuente única automática de selección visual o temática.
- **`planeacion_ids`:** selección explícita de planeaciones usada por contratos como exámenes desde Biblioteca.
- **`tema_id` / `tema_ids`:** IDs de temas; nunca reciben IDs de planeaciones.

## Matriz de estado funcional

| Área | Estado | Puede recibir funciones nuevas | Puede eliminarse | Notas |
| --- | --- | ---: | ---: | --- |
| Biblioteca | Vigente | Sí | No | Flujo visual principal. |
| Explorador visual jerárquico | Legacy | No | Solo tras auditoría | No usar en módulos nuevos. |
| Jerarquía técnica backend | Activa/compatibilidad | Solo según contrato | No asumir | Datos y endpoints. |
| Archivados | Activo separado | Solo mantenimiento | No asumir | Puede usar jerarquía. |
| `explorerState` | Mixto | No como arquitectura | Parcialmente | Separar consumidores. |
| Wrappers `window.*` | Compatibilidad | No ampliar sin necesidad | Tras migrar consumidores | Documentar retiro. |
| Páginas históricas | Por confirmar | No | Tras auditoría | No activar. |

## Resultado

No se eliminó documentación histórica. Se conservaron rutas documentales, se añadieron avisos y se dirigió a cada agente hacia las fuentes canónicas. No quedan referencias rotas conocidas tras la validación final.
