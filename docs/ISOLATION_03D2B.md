# 03D2B — aislamiento adversarial de derivados de Biblioteca

Estado: **03D2B completada con vulnerabilidades relacionales confirmadas y fixtures completamente limpiados. Fase 03 continúa abierta.** 03D2A conserva 39 PASS, tres FAIL relacionales y cero residuos; este trabajo no corrige la relación batch–planeación.

La primera ejecución 03D2B, run sanitizado `685fbd5a-0e1b-4969-b639-8d7c1b62e24b`, terminó con 20 PASS, tres FAIL, un INCONCLUSIVE y tres errores de comando. `executeCompleted=false` y `cleanupCompleted=false`. Inicialmente quedaron reportados 14 fixtures confirmados y un anexo uncertain. Esta corrida se conserva como evidencia diagnóstica y no se suma a los resultados de la ejecución definitiva.

Los tres FAIL confirmaron que un anexo A pudo usar una planeación B en INSERT, una planeación B en UPDATE y un batch B en UPDATE. El INSERT hacia batch B obtuvo `23505` y quedó INCONCLUSIVE: la planeación A usada ya tenía el anexo base, por lo que `unique_anexo_por_planeacion` ocultó la propiedad que se intentaba medir. El diseño de targets se corrigió antes de la ejecución definitiva.

## Recuperación y ejecución definitiva

La recuperación real del primer run descubrió 15 fixtures y confirmó ausente el anexo registrado preventivamente como uncertain. Eliminó los 15 fixtures descubiertos y terminó con `deleteUnverified=0`, `inconclusive=0`, `commandErrors=0`, `fixturesPending=0`, `successful=true` y exit code 0. No se introdujo manualmente ningún ID de fila; las unidades externas no se modificaron ni eliminaron. Desde ese momento no quedaron residuos conocidos del primer run.

La ejecución definitiva, run sanitizado `f7cd5da1-3466-44cd-aec9-945686790bd1`, completó los 72 casos: **60 PASS, 12 FAIL, 0 INCONCLUSIVE y 0 commandErrors**. `prepared=true`, `executeCompleted=true`, `cleanupCompleted=true`, `fixturesPending=[]` y `uncertainPending=[]`. `successful=false` y exit code 1 son deliberados: conservan las vulnerabilidades confirmadas aunque el cleanup haya terminado correctamente. No quedan residuos conocidos.

Los 12 FAIL manuales reales son:

| caseId | recurso | relación ajena | HTTP |
| --- | --- | --- | --- |
| `03D2B-SB-ANEXO-CREATE-REL-CROSS-A` | anexo INSERT | `planeacion_id` | 201 |
| `03D2B-SB-ANEXO-CREATE-BATCH-CROSS-A` | anexo INSERT | `batch_id` | 201 |
| `03D2B-SB-ANEXO-EDIT-REL-CROSS-A` | anexo UPDATE | `planeacion_id` | 200 |
| `03D2B-SB-ANEXO-EDIT-BATCH-CROSS-A` | anexo UPDATE | `batch_id` | 200 |
| `03D2B-SB-LISTA-CREATE-REL-CROSS-A` | lista INSERT | `planeacion_id` | 201 |
| `03D2B-SB-LISTA-CREATE-BATCH-CROSS-A` | lista INSERT | `batch_id` | 201 |
| `03D2B-SB-LISTA-EDIT-REL-CROSS-A` | lista UPDATE | `planeacion_id` | 200 |
| `03D2B-SB-LISTA-EDIT-BATCH-CROSS-A` | lista UPDATE | `batch_id` | 200 |
| `03D2B-SB-EXAMEN-CREATE-REL-CROSS-A` | examen INSERT | `unidad_id` | 201 |
| `03D2B-SB-EXAMEN-CREATE-BATCH-CROSS-A` | examen INSERT | `batch_id` | 201 |
| `03D2B-SB-EXAMEN-EDIT-REL-CROSS-A` | examen UPDATE | `unidad_id` | 200 |
| `03D2B-SB-EXAMEN-EDIT-BATCH-CROSS-A` | examen UPDATE | `batch_id` | 200 |

En todos, el child conservó como owner al atacante y la relación ajena persistió. El padre ajeno se comprobó sin cambios; los INSERT adversariales se eliminaron y los UPDATE se restauraron con verificación. Esto confirma una vulnerabilidad de integridad multiusuario de severidad alta cuando se conoce el identificador ajeno. No demuestra lectura o modificación del contenido del padre, enumeración de IDs, bypass del owner del child ni explotación anónima.

Los 60 PASS manuales reales, sin expandir su alcance, son:

- Anexos: `03D2B-PREP-ANEXO-A`, `03D2B-PREP-ANEXO-B`, `03D2B-SB-ANEXO-READ-OWN-A`, `03D2B-SB-ANEXO-READ-CROSS-A`, `03D2B-SB-ANEXO-READ-CROSS-B`, `03D2B-SB-ANEXO-READ-ANON`, `03D2B-SB-ANEXO-LIST-A`, `03D2B-SB-ANEXO-LIST-B`, `03D2B-SB-ANEXO-CREATE-OWNER-A`, `03D2B-SB-ANEXO-CREATE-ANON`, `03D2B-SB-ANEXO-EDIT-OWN-A`, `03D2B-SB-ANEXO-EDIT-CROSS-A`, `03D2B-SB-ANEXO-EDIT-OWNER-A`, `03D2B-SB-ANEXO-EDIT-ANON`, `03D2B-SB-ANEXO-DELETE-CROSS-A`, `03D2B-SB-ANEXO-DELETE-ANON`, `03D2B-SB-ANEXO-DELETE-OWN-A`, `03D2B-API-ANEXO-ID-A`, `03D2B-API-ANEXO-CROSS-A`, `03D2B-API-ANEXO-ANON`.
- Listas: `03D2B-PREP-LISTA-A`, `03D2B-PREP-LISTA-B`, `03D2B-SB-LISTA-READ-OWN-A`, `03D2B-SB-LISTA-READ-CROSS-A`, `03D2B-SB-LISTA-READ-CROSS-B`, `03D2B-SB-LISTA-READ-ANON`, `03D2B-SB-LISTA-LIST-A`, `03D2B-SB-LISTA-LIST-B`, `03D2B-SB-LISTA-CREATE-OWNER-A`, `03D2B-SB-LISTA-CREATE-ANON`, `03D2B-SB-LISTA-EDIT-OWN-A`, `03D2B-SB-LISTA-EDIT-CROSS-A`, `03D2B-SB-LISTA-EDIT-OWNER-A`, `03D2B-SB-LISTA-EDIT-ANON`, `03D2B-SB-LISTA-DELETE-CROSS-A`, `03D2B-SB-LISTA-DELETE-ANON`, `03D2B-SB-LISTA-DELETE-OWN-A`, `03D2B-API-LISTA-ID-A`, `03D2B-API-LISTA-CROSS-A`, `03D2B-API-LISTA-ANON`.
- Exámenes: `03D2B-PREP-EXAMEN-A`, `03D2B-PREP-EXAMEN-B`, `03D2B-SB-EXAMEN-READ-OWN-A`, `03D2B-SB-EXAMEN-READ-CROSS-A`, `03D2B-SB-EXAMEN-READ-CROSS-B`, `03D2B-SB-EXAMEN-READ-ANON`, `03D2B-SB-EXAMEN-LIST-A`, `03D2B-SB-EXAMEN-LIST-B`, `03D2B-SB-EXAMEN-CREATE-OWNER-A`, `03D2B-SB-EXAMEN-CREATE-ANON`, `03D2B-SB-EXAMEN-EDIT-OWN-A`, `03D2B-SB-EXAMEN-EDIT-CROSS-A`, `03D2B-SB-EXAMEN-EDIT-OWNER-A`, `03D2B-SB-EXAMEN-EDIT-ANON`, `03D2B-SB-EXAMEN-DELETE-CROSS-A`, `03D2B-SB-EXAMEN-DELETE-ANON`, `03D2B-SB-EXAMEN-DELETE-OWN-A`, `03D2B-API-EXAMEN-ID-A`, `03D2B-API-EXAMEN-CROSS-A`, `03D2B-API-EXAMEN-ANON`.

Los HTTP 200/204 vacíos de mutaciones cruzadas o anónimas se aprobaron únicamente después de comparar snapshots before/after y comprobar ausencia de efectos.

## Alcance y auditoría

El harness cubre `anexos`, `listas_cotejo` y `examenes` mediante PostgREST directo y el contrato API de lectura por ID consumido por Biblioteca/Detalle. No invoca generación, regeneración, SSE, workers, OpenAI, Storage, Archivados ni CRUD jerárquico.

| Tabla | PK | Obligatorios mínimos | Opcionales/relaciones | Constraints y riesgo |
| --- | --- | --- | --- | --- |
| `anexos` | UUID, default `gen_random_uuid()` | `user_id`, `planeacion_id`, `titulo`; `contenido` default `{}`, `prompt_version/status` con defaults | `tema_id`, `unidad_id`, `batch_id` nullable | FK planeación CASCADE y user CASCADE; índice UNIQUE `unique_anexo_por_planeacion`; no hay FK versionada para batch/tema/unidad |
| `listas_cotejo` | UUID, default `gen_random_uuid()` | `user_id`, `planeacion_id`, `criterios` array, `total_puntos=10` | `tema_id`, `unidad_id`, `batch_id` nullable | UNIQUE por planeación; CHECK `jsonb_typeof(criterios)='array'`; CHECK puntos=10; planeación/user CASCADE y relaciones opcionales SET NULL |
| `examenes` | UUID, default `gen_random_uuid()` | `user_id`, `unidad_id`; arrays JSON/text con defaults, `total_preguntas=0`, `status='generado'` | `batch_id`, `generation_job_id`, plantel/grado/materia nullable | CHECK total>=0; unidad CASCADE, user CASCADE, restantes SET NULL; sin UNIQUE relacional |
| `planeaciones` | bigint identity, reservado como decimal canónico seguro | `user_id`; el fixture aporta marcador y `tabla_ia` mínima | `tema_id`, `batch_id` nullable | PK; FK batch/tema SET NULL; FK user NO ACTION; índice UNIQUE parcial sobre `tema_id IS NOT NULL`, neutralizado con `tema_id=null` |
| `planeacion_batches` | UUID, reservado por el harness | `user_id`, marcador sintético | plantel/grado/materia/unidad nullable | PK; FK user CASCADE y jerarquía SET NULL; sin UNIQUE relacional adicional |

Los tres triggers `set_*_updated_at` ejecutan `set_updated_at()` en UPDATE. No existe constraint o trigger versionado que imponga propietario común entre child y sus padres.

## Precondiciones y fixtures

El harness crea batches y planeaciones sintéticas A/B con jerarquía nula. No crea planteles, grados, materias, unidades ni temas. Como `examenes.unidad_id` es obligatorio, el launcher solicita mediante entrada oculta una unidad sintética propia de A y otra de B. Cada unidad debe ser visible exactamente con su actor y coincidir con su `user_id`; nunca se modifica ni elimina.

`generation_job_id` permanece `null` y se transfiere a 03D2C, donde puede usarse un job terminal controlado sin mezclar generación o workers.

Fixtures base: batch A/B, planeación A/B, anexo A/B, lista A/B y examen A/B. Se crean cuatro planeaciones objetivo de B, separadas y sin derivados: `target-anexo-insert`, `target-anexo-update`, `target-lista-insert` y `target-lista-update`. Para cada anexo/lista se crean además tres targets propios A distintos: `batch-insert`, `batch-update` y `delete`. El target `batch-update` contiene exclusivamente su child sintético; los otros dos empiezan libres. INSERT relacional, UPDATE relacional, INSERT batch, UPDATE batch y DELETE propio nunca comparten una planeación ocupada.

En el diseño corregido se crean 25 filas durante un camino seguro: dos batches, doce planeaciones, seis derivados base, dos derivados `batch-update` y tres copias para DELETE propio. Tras `prepare` quedan 22 fixtures confirmados; las tres copias se crean y eliminan durante `execute`. Una relación adversarial aceptada añade temporalmente su child al ledger; owner falsificado aceptado hace lo mismo con el owner observado. No existe creación auxiliar fuera del ledger.

## Manifiesto y endpoints

`DERIVED_CASE_MANIFEST` contiene **72 caseIds**: 21 por tabla (dos prepare y 19 execute) y nueve API. Cada tabla cubre creación propia A/B; lectura propia/cruzada/anónima; listados A/B; owner falsificado; creación anónima; INSERT con padre ajeno y batch ajeno; UPDATE propio restaurado, cruzado, owner, padre ajeno, batch ajeno y anónimo; DELETE cruzado, anónimo y propio desechable.

API incluida, cada una con propio A=200, cruzado A→B=404 y anónimo=401:

- `GET /api/anexos/:id`
- `GET /api/listas-cotejo/:id`
- `GET /api/examenes/:id`

Los listados por batch/planeación/unidad no se duplican: la separación se prueba directamente por tabla y los padres se controlan en el fixture. DELETE API tampoco aporta evidencia RLS distinta al DELETE directo con before/after.

Los controllers de los tres GET están detrás de `requireAuth`, crean `createUserClient(req.accessToken)` y pasan `req.user.id`; las consultas filtran `user_id` y son SELECT sin métricas ni escrituras. Exámenes exige cliente de usuario mediante `requireUserClient`. Anexos y listas conservan internamente `getClient(supabaseClient) → supabaseAdmin` como fallback: no es alcanzado por estas rutas HTTP normales, pero impide afirmar que el service falle cerrado si otro caller omite el cliente. Se registra para hardening separado; el harness no lo usa ni lo corrige.

Excluidos: `POST /anexos/generate`, `POST /anexos/:id/regenerate`, `POST /listas-cotejo/generate`, `POST /examenes/generate`, `/generar`, polling, workers y cualquier ruta que produzca contenido.

## Relaciones, snapshots y contenido

- Anexos/listas: `planeacion_id` propio/ajeno y `batch_id` propio/ajeno en INSERT y UPDATE.
- Exámenes: `unidad_id` propia/ajena y `batch_id` propio/ajeno en INSERT y UPDATE.
- `generation_job_id`: pendiente de 03D2C.

Una relación ajena persistida es FAIL. Se confirma owner del child y padre intacto, se elimina el INSERT o restaura el UPDATE, se verifica la recuperación y se conserva el FAIL. La vulnerabilidad 03D2A no sustituye esta evidencia.

| Recurso/operación | Relación medida | Constraint neutralizado |
| --- | --- | --- |
| anexo INSERT | `planeacion_id` B | `target-anexo-insert` exclusivo sin anexo; evita `unique_anexo_por_planeacion` |
| anexo UPDATE | `planeacion_id` B | `target-anexo-update` independiente; no colisiona con el INSERT previo |
| anexo INSERT/UPDATE | `batch_id` B | targets A independientes `batch-insert`/`batch-update`; el UNIQUE queda libre o controlado |
| lista INSERT | `planeacion_id` B | `target-lista-insert` exclusivo sin lista; criterios `[]` es JSON array y puntos=10 |
| lista UPDATE | `planeacion_id` B | `target-lista-update` independiente; criterios/checks satisfechos y sin colisión previa |
| lista INSERT/UPDATE | `batch_id` B | targets A independientes `batch-insert`/`batch-update`; criterios/checks satisfechos |
| examen INSERT/UPDATE | `unidad_id` B | UUID/FK existente; total 0 y arrays válidos |
| examen INSERT/UPDATE | `batch_id` B | unidad A válida; resto de campos válidos |

Los errores se clasifican sin texto raw. `42501` se registra como `rls`; `23503`, `23505` y `23514` como `foreign_key`, `unique` y `check`. En pruebas de propiedad, estos tres últimos producen INCONCLUSIVE. Una respuesta vacía solo puede ser PASS cuando el snapshot before/after confirma ausencia de efecto y no hay código de constraint enmascarante. Relación persistida es FAIL; forma incompatible es INCONCLUSIVE.

Toda mutación toma snapshot con el owner y relee después. HTTP 200/204 vacío no basta. La restauración compara todos los campos salvo `updated_at`, que debe ser válido y no retroceder.

El contenido es sintético: `{fixture:true}`, criterios/actividades y arrays de examen vacíos. La salida solo admite runId, IDs sintéticos, caseId, actor, tabla, status, resultado y ledger; nunca cuerpos, contenido pedagógico, UUID de usuarios/unidades, tokens, claves, headers, cookies, URLs completas o errores raw.

## Cleanup, uso y límites

Orden: derivados desechables/base → planeaciones target → planeaciones base → batches. Antes de borrar una planeación se comprueba que no conserve anexos/listas del run; antes del batch se comprueban planeaciones y todos los derivados. DELETE filtra `id + user_id`; la ausencia se verifica como A/B. `delete_unverified` permite reintento; `uncertainPending` nunca se limpia automáticamente.

El bloqueo observado procedía de dos condiciones del harness. `create()` dejaba el evento preventivo en `uncertain` aunque PostgreSQL hubiera contestado inequívocamente `23505`, y `cleanup()` rechazaba cualquier ejecución con uncertain. Ahora los rechazos definitivos `42501`, `23503`, `23505` y `23514` retiran el preventivo; errores de red o respuestas ambiguas lo conservan. Cleanup puede ejecutarse tras prepare/execute parcial, FAIL o INCONCLUSIVE, limpia los confirmados que siguen siendo seguros y deja el uncertain para recuperación manual. Los resultados adversariales previos no se borran.

## Recuperación del primer run

La herramienta separada no acepta IDs de filas, unidades, URLs ni manifests. Recibe solo runId, clave pública test, identidad/token A y B y confirmación de cuentas sintéticas. Descubre en `planeacion_batches`, `planeaciones`, `anexos`, `listas_cotejo` y `examenes` mediante el prefijo exacto del run; cada fila debe satisfacer la gramática cerrada de marcador, suffix allowlisted, owner derivado del token y grafo interno esperado. Un marcador inesperado, duplicidad lógica, exceso de filas, owner incoherente o dependiente externo detiene toda eliminación.

El posible anexo `delete` se busca por su marcador lógico, nunca por ID suministrado. Ausencia produce `ABSENT_CONFIRMED`; una fila exacta entra al ledger; más de una o una forma incompatible deja la recuperación inconclusa. Las unidades solo pueden aparecer como UUID referenciados por exámenes y nunca son nodos eliminables.

Procedimiento usado por Rafael para la recuperación; Codex no lo ejecutó:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\isolation\start-derived-recovery.ps1
```

1. Introducir el runId sanitizado anterior.
2. Confirmar cuentas A/B sintéticas y proporcionar clave pública, UUID y tokens mediante entrada oculta.
3. Ejecutar `discover` y conservar exclusivamente el resumen sanitizado.
4. Si discovery no reporta inconclusive, ejecutar `recover`.
5. Ante `DELETE_UNVERIFIED`, repetir `recover` en el mismo proceso.
6. Ejecutar `quit`. Exit 0 exige discovery completo, cero inconclusive/errores/pending y ausencia confirmada como A/B.

La recuperación satisfizo la precondición para la ejecución definitiva posterior.

Las unidades externas son UUID canónicos distintos, visibles exactamente para su owner e invisibles para el otro actor. Se toma snapshot completo en prepare y se compara antes de execute y cleanup. Nunca entran al ledger, aparecen en eventos ni se modifican o eliminan.

Después de revisión, Rafael puede iniciar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\isolation\start-derived-resources.ps1
```

Luego: `prepare`, `execute`, `cleanup`, `quit`. Exit 0 exige 72 PASS, cero FAIL/INCONCLUSIVE/errores, etapas completas y ledgers vacíos. La ejecución definitiva produjo exit 1 porque conservó 12 FAIL, aunque cleanup terminó y ambos ledgers quedaron vacíos.

La suite offline simula red, UUID, tiempo y timeout. Comprueba guards, unidades, targets separados, manifiesto, sanitización, restauración, una corrida completa de 72 PASS, relaciones aceptadas con FAIL y escenarios 23503/23505/23514 que quedan INCONCLUSIVE. También cubre escritura incierta, rechazo definitivo, DELETE reintentable, cleanup parcial, reconstrucción del grafo de recovery y exit code. La evidencia real definitiva es la corrida completa de 60 PASS y 12 FAIL descrita arriba.

## Transferencia a 03D3

03D3 debe garantizar propietario común en `planeaciones.batch_id → planeacion_batches`, `anexos.planeacion_id → planeaciones`, `anexos.batch_id → planeacion_batches`, `listas_cotejo.planeacion_id → planeaciones`, `listas_cotejo.batch_id → planeacion_batches`, `examenes.unidad_id → unidades` y `examenes.batch_id → planeacion_batches`. Debe evaluar triggers mínimos, constraints compuestos o una estrategia equivalente, sin ampliar la jerarquía congelada y preservando Biblioteca y los contratos actuales.

También conserva los riesgos de grants amplios, `handle_new_user` SECURITY DEFINER sin `search_path` fijo, EXECUTE por PUBLIC y la atomicidad/reconciliación de jobs heredada de 03C. Este cierre no diseña ni aplica SQL. Biblioteca continúa como único flujo visual principal; las unidades A/B fueron precondiciones externas read-only para exámenes. No se ejecutaron generación, workers, SSE, Storage ni OpenAI.
