# 03D2A — harness adversarial de Biblioteca, batches y planeaciones

Estado: **COMPLETADA CON VULNERABILIDAD RELACIONAL CONFIRMADA Y FIXTURES COMPLETAMENTE LIMPIADOS**. Fase 03 continúa abierta. Biblioteca es el único flujo visual principal. La jerarquía heredada permaneció congelada.

## Evidencia real completa

La segunda ejecución en local/Supabase test, run sanitizado `f19689ac-9e86-42c8-9c74-52a63f9a6844`, recorrió `prepare → execute → cleanup → quit` y emitió los 42 resultados del manifiesto:

| Resultado | Conteo |
| --- | ---: |
| PASS | 39 |
| FAIL | 3 |
| INCONCLUSIVE | 0 |
| errores de comando | 0 |

`prepared=true`, `executeCompleted=true`, `cleanupCompleted=true`, `fixturesPending=[]` y `uncertainPending=[]`. El harness terminó con `successful=false` y exit code `1`, como exige el contrato ante cualquier FAIL. Todos los fixtures confirmados se eliminaron y no quedaron residuos conocidos.

### PASS por superficie

**Batches.** Pasaron creación propia A/B; lectura propia; ocultamiento cruzado A→B y B→A; lecturas anónimas sin filas; listados separados A/B; rechazo de owner falsificado y de INSERT anónimo; UPDATE cruzado sin efecto; rechazo del cambio de owner; DELETE cruzado sin efecto; UPDATE/DELETE anónimos sin efecto; y DELETE propio de una copia desechable. Los UPDATE/DELETE que respondieron HTTP 200/204 con cero filas se aprobaron únicamente tras comparar snapshots before/after con el owner legítimo.

**Planeaciones.** Pasaron creación propia A/B; lectura propia; ocultamiento cruzado; lecturas anónimas sin filas; listados separados; rechazo de owner falsificado; UPDATE cruzado sin efecto; rechazo del cambio de owner; INSERT/UPDATE/DELETE anónimos sin efecto; DELETE cruzado sin efecto; y DELETE propio de una copia desechable.

**API Biblioteca.** Pasaron listado A (HTTP 200, sin fixture B), listado B (HTTP 200, sin fixture A), detalle del batch propio de A (HTTP 200), detalle del batch de B consultado por A (HTTP 404) y acceso anónimo (HTTP 401). No se infiere evidencia para operaciones fuera de estos 42 casos.

### FAIL y vulnerabilidad confirmada

| CaseId | HTTP | Evidencia segura |
| --- | ---: | --- |
| `03D2A-SB-PLAN-CREATE-CROSS-BATCH-A` | 201 | planeación de A persistida con batch de B; owner de la planeación conservado; batch B sin cambios; fixture eliminado |
| `03D2A-SB-PLAN-CREATE-CROSS-BATCH-B` | 201 | planeación de B persistida con batch de A; owner de la planeación conservado; batch A sin cambios; fixture eliminado |
| `03D2A-SB-PLAN-EDIT-CROSS-BATCH-A` | 200 | planeación de A persistió batch de B; owner conservado; batch B sin cambios; relación restaurada |

**Hallazgo confirmado:** un usuario autenticado puede insertar o actualizar una planeación propia con `batch_id` perteneciente a otro usuario cuando conoce dicho UUID. La relación aceptada persistió, aunque el propietario de la planeación y el batch ajeno no cambiaron.

Se clasifica como vulnerabilidad de severidad alta para integridad multiusuario. Su explotabilidad está condicionada a conocer un UUID ajeno, pero la seguridad no puede depender de que ese UUID sea difícil de adivinar. Requiere defensa en base de datos durante 03D3.

No se demostró lectura de datos del batch ajeno, modificación del batch ajeno, enumeración de UUID, bypass del owner de la planeación, impacto sobre anexos/listas/exámenes ni explotación anónima.

## Primera ejecución parcial y corrección del harness

La primera ejecución, run sanitizado `4be84e71-2f39-4f2b-87e4-4e6c418c8bef`, obtuvo 27 PASS y los mismos tres FAIL. Después se interrumpió por una comparación byte a byte de `updated_at`; `trg_planeaciones_updated_at` ejecuta `set_updated_at()` en cada UPDATE y la restauración legítima avanzó ese campo. Cleanup terminó completo, con ledgers vacíos y cero residuos conocidos.

La corrección offline mantuvo igualdad exacta de identidad, propietario, marcador, `batch_id`, `tema_id`, creación, relaciones y campos funcionales. Para `updated_at` exige timestamps válidos y orden temporal coherente. La segunda ejecución completa confirmó los mismos tres hallazgos. Los FAIL de la primera ejecución no se suman de nuevo a los conteos.

## Alcance y fixtures

PostgREST directo probó RLS para `planeacion_batches`, `planeaciones` y la relación `planeaciones.batch_id`. La API local probó los GET consumidos por Biblioteca. No se llamó generación, Quick Create, SSE, workers, OpenAI, Storage, Archivados ni rutas jerárquicas.

| Tabla | Campos usados sin default | Relaciones nulas | Identidad reservada |
| --- | --- | --- | --- |
| `planeacion_batches` | `id`, `user_id`, `titulo` | `plantel_id`, `grado_id`, `materia_id`, `unidad_id` | UUID antes del POST |
| `planeaciones` | `id`, `user_id`, `batch_id` y marcador/render mínimo | `tema_id`; sin FK directa a plantel/grado/materia/unidad | decimal canónico positivo de hasta 15 dígitos antes del POST |

Fixtures base: batch A → planeación A y batch B → planeación B. Las copias desechables se reservaron antes de escribir y solo entraron al ledger tras confirmación exacta. Biblioteca toleró las referencias jerárquicas nulas y el contenido sintético mínimo.

### Contrato bigint y preflight

`planeaciones.id` usa un string decimal canónico que cumple `1 <= id <= 999999999999999`. No admite signo, espacios, exponencial, fracción, cero ni ceros iniciales. Una respuesta JSON numérica solo se acepta si es un entero seguro dentro del mismo rango y normaliza al mismo string. El ID explícito puede no avanzar la secuencia identity.

Antes de cada POST, A y B consultan el ID reservado y ambas respuestas deben ser exitosas, arrays y vacías. Un 401/403, timeout, redirect, JSON inválido, fila visible o ID repetido falla cerrado. La ausencia observada por A/B no prueba ausencia frente a terceros; las precondiciones siguen siendo cuentas sintéticas exclusivas y ausencia de concurrencia.

## Endpoints API

Incluidos, solo GET:

- `GET /api/biblioteca/conjuntos`
- `GET /api/biblioteca/conjuntos/:batchId`

Excluidos: `DELETE /api/biblioteca/bloques/:batchId`, generación, Archivados, Quick Create, SSE, jobs, workers y Storage.

## CaseIds y correspondencia con la matriz

`BIBLIOTECA_CASE_MANIFEST` contiene 42 caseIds únicos: 17 de batches, 20 de planeaciones y 5 de API Biblioteca. Prepare emitió 4 resultados y execute 38; cleanup no añadió casos.

La matriz CSV eleva únicamente las 26 correspondencias exactas entre sus filas y los PASS del harness: 11 de batches, 11 de planeaciones y 4 de API Biblioteca. Conserva dos correspondencias exactas como **PRUEBA MANUAL REAL FAIL**. Trece PASS quedan como evidencia suplementaria porque el CSV no contiene la misma orientación o semántica: seis de batches (creación B, anónimo sobre B, listado B y tres mutaciones anónimas), seis de planeaciones con esas mismas diferencias y el listado API de B. El INSERT B→batch A también queda suplementario. No se modifican evidencias de 03A–03C.

## Before/after, ledger y cleanup

Toda mutación negativa obtuvo snapshot con el owner, ejecutó el intento y volvió a leer. PASS exigió igualdad de campos relevantes, owner, marcador y relaciones; HTTP 200/204 por sí solo no fue suficiente.

Para cada relación cruzada aceptada se confirmó que el batch ajeno seguía intacto. Los INSERT vulnerables se eliminaron con el owner observado. El UPDATE vulnerable se restauró al batch propio y la restauración semántica fue verificada. El FAIL persistió después de la recuperación.

Cada ledger conserva `runId`, actor, tabla, ID, marcador, batch esperado y estado. El orden de cleanup fue planeaciones desechables → planeaciones base → batches desechables → batches base. DELETE filtró `id + user_id` y la ausencia se confirmó como A y B. La corrida completa no dejó `delete_unverified`, fixtures ni inserciones inciertas.

## Seguridad y límites

Los guards exigen `APP_ENV=test`, Supabase test exacto, API local exacta, clave pública, A/B distintos y sintéticos y tokens correspondientes. Rechazan service role, claves secretas y destinos alternos. La salida no contiene tokens, claves, UUID de usuarios, headers, cookies, bodies, URLs completas ni errores raw.

- El aislamiento de filas quedó comprobado solo en los 39 casos ejecutados que terminaron PASS.
- La integridad relacional batch–planeación falló y permanece abierta.
- La ejecución no acredita atomicidad ni corrige policies, grants o constraints.
- 03D2B debe cubrir recursos vigentes derivados; 03D3 debe corregir y probar la relación batch–planeación, además del hardening ya transferido; la regresión completa de Biblioteca permanece para 03F.

## Repeticion posterior a 03D3A

Pendiente de ejecucion real. Los tres casos batch-planeacion esperan
exclusivamente educativo_ia_planeaciones_batch_owner_fkey. Un 23503 solo es
PASS con ese nombre exacto y snapshots limpios; cualquier otra FK queda
INCONCLUSIVE. Cleanup y recovery no cambian.

## Cierre posterior 03D3B

La repeticion real posterior se completo con 42/42 PASS, incluidos los tres rechazos relacionales por `educativo_ia_planeaciones_batch_owner_fkey`; cleanup completo, ledgers vacios y exit 0. Se conserva el hallazgo historico como evidencia anterior a la correccion. Estado actual: remediado y verificado en Supabase test, pendiente de produccion. Vease [03D3B](ISOLATION_03D3B.md).
