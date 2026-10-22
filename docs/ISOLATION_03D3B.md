# 03D3B - validacion live de integridad de propietario comun

Estado: **03D3B completada en Supabase test. Las vulnerabilidades relacionales estan remediadas y verificadas en test; su promocion controlada a produccion permanece pendiente. Fase 03 continua abierta.**

Biblioteca sigue siendo el unico flujo visual principal. Esta sesion no amplio la jerarquia congelada, no cambio policies o grants y no ejecuto rollback.

## Aplicacion y verificacion

El preflight read-only ejecuto nueve consultas. Las nueve devolvieron cero en `mismatch_count`, `orphan_count`, `child_owner_null_count`, `parent_owner_null_count` y `parent_key_duplicate_count`. Como informacion de contexto, habia cuatro referencias no nulas en `planeaciones.batch_id`, una en `anexos.batch_id` y cero en las otras referencias opcionales. No se expusieron IDs ni contenido.

La migracion se aplico en Supabase test como una unica transaccion, sin errores ni filas de resultado. El rollback no se ejecuto.

La primera ejecucion de la primera consulta de postverify fallo con PostgreSQL 42883 porque `array_agg(a.attname...)` producia `name[]` y se comparaba con `text[]`. Fue un defecto de la consulta de verificacion, no de la migracion. Las expansiones `child_cols`, `parent_cols` y `delete_cols` se corrigieron con `array_agg(a.attname::text ORDER BY k.position)`. La repeticion confirmo 9/9 FK compuestas, 4/4 UNIQUE y 1/1 CHECK: 14/14 constraints validadas y 14/14 coincidentes con su definicion esperada.

Todas las FK usan MATCH SIMPLE y ON UPDATE NO ACTION. Las cuatro relaciones obligatorias usan ON DELETE CASCADE. Las cinco opcionales usan SET NULL limitado exclusivamente a `batch_id` o `generation_job_id`; ninguna accion SET NULL incluye `user_id`.

## Relaciones y evidencia adversarial posterior

| Relacion protegida | Constraint | CaseIds reales rechazados tras la migracion |
| --- | --- | --- |
| `planeaciones.batch_id -> planeacion_batches.id` | `educativo_ia_planeaciones_batch_owner_fkey` | `03D2A-SB-PLAN-CREATE-CROSS-BATCH-A`, `03D2A-SB-PLAN-CREATE-CROSS-BATCH-B`, `03D2A-SB-PLAN-EDIT-CROSS-BATCH-A` |
| `anexos.planeacion_id -> planeaciones.id` | `educativo_ia_anexos_planeacion_owner_fkey` | `03D2B-SB-ANEXO-CREATE-REL-CROSS-A`, `03D2B-SB-ANEXO-EDIT-REL-CROSS-A` |
| `anexos.batch_id -> planeacion_batches.id` | `educativo_ia_anexos_batch_owner_fkey` | `03D2B-SB-ANEXO-CREATE-BATCH-CROSS-A`, `03D2B-SB-ANEXO-EDIT-BATCH-CROSS-A` |
| `listas_cotejo.planeacion_id -> planeaciones.id` | `educativo_ia_listas_planeacion_owner_fkey` | `03D2B-SB-LISTA-CREATE-REL-CROSS-A`, `03D2B-SB-LISTA-EDIT-REL-CROSS-A` |
| `listas_cotejo.batch_id -> planeacion_batches.id` | `educativo_ia_listas_batch_owner_fkey` | `03D2B-SB-LISTA-CREATE-BATCH-CROSS-A`, `03D2B-SB-LISTA-EDIT-BATCH-CROSS-A` |
| `examenes.unidad_id -> unidades.id` | `educativo_ia_examenes_unidad_owner_fkey` | `03D2B-SB-EXAMEN-CREATE-REL-CROSS-A`, `03D2B-SB-EXAMEN-EDIT-REL-CROSS-A` |
| `examenes.batch_id -> planeacion_batches.id` | `educativo_ia_examenes_batch_owner_fkey` | `03D2B-SB-EXAMEN-CREATE-BATCH-CROSS-A`, `03D2B-SB-EXAMEN-EDIT-BATCH-CROSS-A` |
| `examen_generation_items.job_id -> examen_generation_jobs.id` | `educativo_ia_examen_items_job_owner_fkey` | `03D2C-SB-ITEM-CREATE-JOB-CROSS-A`, `03D2C-SB-ITEM-EDIT-JOB-CROSS-A` |
| `examenes.generation_job_id -> examen_generation_jobs.id` | `educativo_ia_examenes_generation_job_owner_fkey` | `03D2C-SB-EXAM-CREATE-JOB-CROSS-A`, `03D2C-SB-EXAM-EDIT-JOB-CROSS-A` |

Cada uno de los 19 intentos fue rechazado con SQLSTATE 23503 y el nombre exacto de la constraint asignada al caseId. El harness exigio tambien snapshots sin cambios; un codigo HTTP o SQLSTATE aislado no se considero suficiente.

## Resultados de los harnesses

- 03D2A: run `e2eedfa1-4be6-4037-846f-4461cececd32`; 42 PASS, cero FAIL/INCONCLUSIVE/commandErrors, cleanup completo, ledgers vacios y exit 0.
- 03D2B: run `9c4fa631-0bd8-448d-ba1b-9a25dbcb691b`; 72 PASS, cero FAIL/INCONCLUSIVE/commandErrors, cleanup completo, ledgers vacios y exit 0.
- 03D2C: run `f428c70e-b2d0-4f15-8647-074f4135c3d3`; 26 PASS, cero FAIL/INCONCLUSIVE/commandErrors, cleanup completo, ledgers vacios y exit 0.

Total posterior a la migracion: **140 PASS, cero FAIL, cero INCONCLUSIVE, tres cleanups completos y cero residuos conocidos**.

La evidencia historica de 03D2A/B/C se conserva: primero demostro que las 19 operaciones se aceptaban; 03D3A diseno la correccion; 03D3B la aplico en test y comprobo el rechazo. Los hallazgos quedan **remediados y verificados en Supabase test; pendientes de promocion controlada a produccion**.

## Limites y continuidad

Quedaron confirmadas en test las constraints validadas, el rechazo de las 19 asociaciones, las operaciones propias de los harnesses, las lecturas/API incluidas y la ausencia de fixtures conocidos.

No quedaron confirmados produccion, la regresion E2E completa de Biblioteca/Quick Create/generacion, workers reales, todas las acciones CASCADE/SET NULL mediante pruebas funcionales, Storage, navegador, hardening de grants/policies/functions ni las tablas metricas excluidas. Las acciones referenciales funcionales completas pertenecen a 03F. El minimo privilegio, funciones y pendientes tecnicos continuan en 03D3C. La Fase 03 permanece abierta.

El alcance de ese trabajo posterior esta delimitado en [03D3C Scope](ISOLATION_03D3C_SCOPE.md). El documento separa funciones, grants/policies y metricas/legacy; no aplica cambios ni altera la evidencia de 03D3B.

