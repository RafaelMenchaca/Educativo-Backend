# 03D2C — jobs técnicos, relaciones terminales y exposición directa

Estado: **03D2C completada con cuatro vulnerabilidades relacionales confirmadas y fixtures completamente limpiados. Fase 03 continúa abierta.** Biblioteca es el único flujo visual principal; Archivados permanece independiente y la jerarquía visual retirada continúa congelada.

La primera ejecución real (`8e88918b-93fe-4018-a187-f26624b9b3a8`) terminó con prepare/execute/cleanup completos, ledgers vacíos y exit 1. Emitió 23 PASS y 3 FAIL, pero el supuesto PASS de `03D2C-SB-ITEM-EDIT-JOB-CROSS-A` queda invalidado: HTTP 409 correspondió a `23505` por `unique_job_question_number (job_id, pregunta_numero)`, pues el item A número 1 se intentó mover al job B base, que ya contenía su item B número 1. Ese caso es evidencia diagnóstica INCONCLUSIVE, no evidencia de aislamiento. Los tres FAIL concluyentes fueron item INSERT→job ajeno, examen INSERT→job ajeno y examen UPDATE→job ajeno. Cleanup fue completo y no quedaron residuos conocidos. Esta corrida no cierra 03D2C.

La evidencia definitiva procede únicamente del segundo run (`daa49447-b17a-42f6-89ea-9c35719ef64e`): 26 caseIds, 22 PASS, 4 FAIL, cero INCONCLUSIVE, cero errores, prepare/execute/cleanup completos, ledgers vacíos y exit 1 deliberado por los hallazgos. El primer run no se suma a estos conteos.

## Alcance y autoridad

El alcance **ejecutable ahora** prueba PostgREST directo con A/B/anónimo sobre `examen_generation_jobs`, `examen_generation_items` y `examenes.generation_job_id`. No duplica el polling API: 03C ya obtuvo evidencia real A=200, B=404 y anon=401.

`ai_generation_jobs` y `ai_generation_calls` quedan **solo auditadas y transferidas a 03D3**. La primera carece de policy DELETE; la segunda carece de UPDATE y DELETE. Aunque ambas tienen grants catalogales amplios, el ciclo normal A/B bajo RLS no ofrece una eliminación verificable. Probar INSERT dejaría residuos deliberadamente si DELETE devuelve 200/204 con cero filas. El harness y recovery no las consultan, crean, mutan ni prometen eliminarlas; no usan admin, SQL, RPC ni bypass.

| Tabla | PK / obligatorios | relaciones y estados | policies versionadas/live 03D1 | owner funcional |
| --- | --- | --- | --- | --- |
| `examen_generation_jobs` | UUID; `user_id`, `titulo`, `total_preguntas`; defaults de arrays/config/progreso | `examen_id` y contexto jerárquico nullable; `pending/processing/completed/failed` usados por app | SELECT/INSERT/UPDATE/DELETE propios, `TO PUBLIC`; RLS activa | request autenticada crea; worker admin reclama, actualiza y termina tras revalidar autoridad |
| `examen_generation_items` | UUID; `job_id`, `user_id`, `pregunta_numero`, `tipo_pregunta`; defaults retry/validation | FK job CASCADE; UNIQUE `(job_id, pregunta_numero)`; `tema_id` nullable; estados `pending/processing/completed/failed` | CRUD propio, `TO PUBLIC`; solo compara `auth.uid()` con `user_id` | request crea snapshot; worker admin procesa con filtros id+job+user |
| `ai_generation_jobs` | UUID; `user_id`, `artifact_type`; defaults action/status/acumuladores | batch/planeación/examen/lista/anexo nullable y sin FKs versionadas; `started/success/partial/error` | SELECT/INSERT/UPDATE propios; sin policy DELETE | `aiMetrics.service.js`, admin backend |
| `ai_generation_calls` | UUID; `job_id`, `user_id`, `artifact_type`, `model`; contadores/defaults | FK job CASCADE; fila terminal por llamada | SELECT/INSERT propios; sin policy UPDATE/DELETE | `aiMetrics.service.js`, admin backend |
| `examenes` | UUID; `user_id`, `unidad_id`; payload mínimo terminal | `generation_job_id` nullable, FK job SET NULL; unidad obligatoria | CRUD propio; owner policy no valida owner del job/unidad | worker admin inserta resultado; GET/delete usan cliente RLS |

No hay CHECK de status en estas tablas. 03D1 no encontró trigger de propietario común en estas relaciones. Los grants efectivos live son más amplios que las policies, incluidas operaciones técnicas y TRUNCATE/REFERENCES/TRIGGER en varias tablas. RLS limita filas para CRUD normal, pero no protege TRUNCATE. 03D2C no ejecuta TRUNCATE, DDL, REFERENCES, TRIGGER ni cambios de grants; su reducción pertenece a 03D3.

### Columnas obligatorias y payloads terminales

- `examen_generation_jobs`: NOT NULL `id`, `user_id`, `titulo`, `tipos_pregunta`, `total_preguntas`, `contexto_temas`, `configuracion`, `status`, `progress_current`, `progress_total`, `created_at`, `updated_at`. Los arrays/JSON, status y progreso tienen defaults; no hay UNIQUE ni CHECK adicional. FKs: `user_id`; `examen_id` nullable SET NULL. Payload: `{id, user_id:<sesión>, titulo:<marcador>, total_preguntas:0, tipos_pregunta:[], contexto_temas:[], configuracion:{fixture_marker:<marcador>}, status:"failed", progress_current:0, progress_total:0, current_step:"Fixture terminal.", error_message:"Fixture terminal.", failed_at:<ISO>}`.
- `examen_generation_items`: NOT NULL `id`, `job_id`, `user_id`, `pregunta_numero`, `tipo_pregunta`, `status`, `validation_errors`, `retry_count`, `max_retries`, `created_at`, `updated_at`. `tema_id`, `tema`, `pregunta_ia` y `error_message` son nullable. Defaults cubren id/status/validation/retries/timestamps. FKs: job CASCADE y user CASCADE; UNIQUE `unique_job_question_number (job_id, pregunta_numero)`; sin CHECK. Payload: `{id, job_id:<job propio>, user_id:<sesión>, pregunta_numero:1, tema_id:null, tema:<marcador>, tipo_pregunta:"fixture", status:"failed", validation_errors:[], retry_count:0, max_retries:0, error_message:"Fixture terminal."}`. **No se necesita tema externo.**
- `examenes`: NOT NULL `id`, `user_id`, `unidad_id`, `tipos_pregunta`, `total_preguntas`, `contexto_temas`, `examen_ia`, `status`, `created_at`, `updated_at`, `validation_errors`. CHECK `total_preguntas >= 0`; `generation_job_id` y batch/plantel/grado/materia son nullable. Payload: `{id, user_id:<sesión>, unidad_id:<unidad propia read-only>, titulo:<marcador>, tipos_pregunta:[], total_preguntas:0, contexto_temas:[], examen_ia:[], status:"generado", generation_job_id:null, validation_errors:[]}`.

El SQL versionado no define triggers sobre jobs/items; `examenes` solo tiene `set_examenes_updated_at` para UPDATE. Los timers y el worker se programan en el servicio Express después de crear job+items. El harness usa PostgREST directo, nunca llama esos controllers/services ni endpoints de generación; por ello insertar `failed`, `failed` y `generado` no agenda código de aplicación ni invoca OpenAI.

## Fixtures y precondiciones

El manifiesto conserva **26 casos únicos**: cuatro resultados de prepare y 22 de execute. Prepare crea dos jobs base `failed`, un job B target `failed` exclusivo y vacío para ITEM UPDATE, dos items `failed` y dos exámenes terminales `generado`. El target usa el sufijo exacto `item-update-target`, pertenece al ledger y no añade un caseId.

Un run seguro crea nueve filas confirmadas: siete durante prepare y dos copias para DELETE propio. Puede llegar a trece si las dos inserciones relacionales y los dos intentos de owner falsificado son aceptados; todas quedan en el ledger. El número de resultados permanece en 26 porque esos fixtures operativos no son casos adicionales.

Los exámenes requieren dos unidades sintéticas externas. El launcher las recibe ocultas; cada unidad debe ser UUID canónico, visible únicamente para su owner y se valida solo por GET. No entra al ledger y jamás se actualiza o elimina. No se crean planteles, grados, materias, unidades ni temas.

Cada UUID se reserva antes del POST y se comprueba ausente como A y B. El marcador exacto es `Educativo IA 03D2C <runId> <actor> <tabla> <sufijo>`; los jobs lo guardan en `titulo`, los items en `tema` y los exámenes en `titulo`. Antes de escribir se emite `UNCERTAIN`; solo una respuesta 201 con fila exacta mueve el fixture al ledger confirmado.

## Casos y semántica

Por `examen_generation_jobs` e `examen_generation_items`: creación terminal A/B, lectura propia/cruzada/anónima, owner falsificado en INSERT, UPDATE cruzado, cambio de owner, DELETE cruzado/anónimo y DELETE propio de copia desechable. Relaciones dirigidas: item A→job examen B y examen A→generation job B, cada una por INSERT y UPDATE. ITEM CREATE usa el job B base; ITEM UPDATE usa exclusivamente el job B target vacío. No cambia `pregunta_numero` para sortear la restricción.

Los targets son independientes. `23503`, `23505` o `23514` producen INCONCLUSIVE y diagnóstico sanitizado (`reason`, `dbCode`, actor, phase y status), porque impiden medir propiedad; HTTP 409 nunca acredita aislamiento. `42501` puede acreditar rechazo RLS únicamente con snapshot sin cambios. Una relación persistida es FAIL y se elimina/restaura conservando el hallazgo. Un HTTP vacío solo es PASS tras relectura del owner y before/after.

Todas las operaciones y relaciones de `ai_generation_jobs`/`ai_generation_calls` pasan a 03D3 después de definir policies/grants y un ciclo reversible. Sus relaciones nullable no tienen FKs versionadas. La exclusión no constituye garantía.

### Evidencia real definitiva

Los cuatro FAIL fueron:

| caseId | operación | HTTP |
| --- | --- | --- |
| `03D2C-SB-ITEM-CREATE-JOB-CROSS-A` | A insertó un item propio ligado al job B | 201 |
| `03D2C-SB-ITEM-EDIT-JOB-CROSS-A` | A movió su item al job B target independiente | 200 |
| `03D2C-SB-EXAM-CREATE-JOB-CROSS-A` | A insertó un examen propio ligado al generation job B | 201 |
| `03D2C-SB-EXAM-EDIT-JOB-CROSS-A` | A movió su examen al generation job B | 200 |

En los cuatro casos el child conservó a A como owner, el padre B permaneció sin cambios, los INSERT se eliminaron y los UPDATE se restauraron con verificación. No se demostró lectura o modificación del contenido del padre, enumeración de IDs ni bypass del owner del child. La explotabilidad requiere conocer un UUID ajeno; el impacto confirmado es de severidad alta para integridad multiusuario.

Los 22 PASS exactos fueron:

- Prepare: `03D2C-PREP-EJOB-A`, `03D2C-PREP-ITEM-A`, `03D2C-PREP-EJOB-B`, `03D2C-PREP-ITEM-B`.
- Jobs: `03D2C-SB-EJOB-READ-OWN-A`, `03D2C-SB-EJOB-READ-CROSS-A`, `03D2C-SB-EJOB-READ-ANON`, `03D2C-SB-EJOB-CREATE-OWNER-A`, `03D2C-SB-EJOB-EDIT-CROSS-A`, `03D2C-SB-EJOB-EDIT-OWNER-A`, `03D2C-SB-EJOB-DELETE-CROSS-A`, `03D2C-SB-EJOB-DELETE-ANON`, `03D2C-SB-EJOB-DELETE-OWN-A`.
- Items: `03D2C-SB-ITEM-READ-OWN-A`, `03D2C-SB-ITEM-READ-CROSS-A`, `03D2C-SB-ITEM-READ-ANON`, `03D2C-SB-ITEM-CREATE-OWNER-A`, `03D2C-SB-ITEM-EDIT-CROSS-A`, `03D2C-SB-ITEM-EDIT-OWNER-A`, `03D2C-SB-ITEM-DELETE-CROSS-A`, `03D2C-SB-ITEM-DELETE-ANON`, `03D2C-SB-ITEM-DELETE-OWN-A`.

Los HTTP 200/204 vacíos de mutaciones rechazadas cuentan como PASS solo porque snapshots before/after y relecturas del owner confirmaron cero efectos. Los exámenes base y el job B target fueron fixtures operativos sin caseId adicional.

## Cleanup y recovery

Cleanup está disponible tras prepare o execute parcial. Elimina hijos (`items`, `examenes`) antes que jobs, filtra `id + user_id`, confirma ausencia A/B y mantiene `delete_unverified` ante ambigüedad. Nunca borra `uncertainPending` automáticamente. FAIL/INCONCLUSIVE sobreviven al cleanup.

Recovery acepta únicamente runId y credenciales A/B; rechaza IDs externos. Reconoce `item-update-target`, admite como máximo cinco jobs del run y rechaza dos targets lógicos, owner incorrecto o items externos inesperados. Descubre por marcador exacto y allowlists finitas, exige owner, cardinalidad y grafo cerrado item/examen→job. Elimina hijos antes que padres, confirma ausencia A/B y nunca toca unidades. La observación A/B no prueba ausencia ante terceros; requiere cuentas sintéticas exclusivas y ausencia de concurrencia.

## Perfiles y legacy

| Objeto | decisión |
| --- | --- |
| `profiles`, `user_settings` | aprovisionamiento Auth activo; no mutar ni incorporar |
| `user_profiles` | sin fila creada por trigger ni consumidor vigente demostrado; revisar exposición/retiro en 03D3 |
| `ia_metrics_legacy` | histórica; no crear datos; resolver el drift con `ia_metrics` separadamente |
| `ai_model_prices` | lectura admin para costo y SELECT authenticated; no mutar precios; mínimo privilegio en 03D3 |

## Procedimiento reproducible

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\isolation\start-technical-jobs.ps1
```

La ejecución definitiva ya se completó. Una futura regresión autorizada usaría clave pública, UUID/token A/B y unidad sintética propia de cada actor mediante entrada oculta, seguida de `prepare`, `execute`, `cleanup`, `quit`. Exit 0 exige 26 PASS, cero FAIL/INCONCLUSIVE/errores, etapas completas y ledgers vacíos. Los hallazgos actuales produjeron correctamente 22 PASS, 4 FAIL, cero INCONCLUSIVE, cleanup completo y exit 1.

Para recuperar confirmados tras perder el proceso:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\isolation\start-technical-recovery.ps1
```

Introducir solo runId y credenciales ocultas; ejecutar `discover`, `recover`, `quit`. No introducir IDs de filas.

## Transferencia a 03D3

Relaciones de propietario común confirmadas: `planeaciones.batch_id → planeacion_batches`, `anexos.planeacion_id → planeaciones`, `anexos.batch_id → planeacion_batches`, `listas_cotejo.planeacion_id → planeaciones`, `listas_cotejo.batch_id → planeacion_batches`, `examenes.unidad_id → unidades`, `examenes.batch_id → planeacion_batches`, `examen_generation_items.job_id → examen_generation_jobs` y `examenes.generation_job_id → examen_generation_jobs`.

También pasan a 03D3 las relaciones nullable de `ai_generation_jobs`, `ai_generation_calls.job_id`, policies técnicas `TO PUBLIC`, CRUD directo innecesario de jobs/items, ausencia de DELETE/UPDATE reversible en métricas, grants amplios y TRUNCATE, EXECUTE concedido a PUBLIC, `handle_new_user` SECURITY DEFINER sin `search_path` fijo, atomicidad/reconciliación heredadas de 03C y decisiones sobre `user_profiles`, `ia_metrics_legacy` y mínimo privilegio de `ai_model_prices`. No ampliar la jerarquía ni modificar Biblioteca.

Codex no ejecutó el harness ni recovery, no conectó Supabase/API y no invocó workers, timers, SSE, Storage, generación u OpenAI.
