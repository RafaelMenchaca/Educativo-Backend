# Educativo IA — autoridad de batches, exámenes y jobs 03C

Estado al 2026-10-13: **03C completada y validada en su alcance de aplicación y polling local/test**. 03B quedó cerrada en el commit real `5a901fb` (`fix(security): restrict planeacion updates`). Fase 03 sigue abierta.

## Cadena y clientes

```text
Biblioteca / ExamGeneration
  → POST /api/examenes/generate (alias /generar)
  → requireAuth
  → postGenerateExamen
  → createUserClient(req.accessToken) + req.user.id
  → validar body, batch, temas y planeaciones con cliente de usuario
  → INSERT job pending
  → INSERT de todos los items pending
  → confirmar agenda síncrona del worker
  → 202
  → worker admin: revalidar → processing → generar → revalidar → INSERT examen → completed

Polling:
GET /api/examenes/generacion/:jobId
  → requireAuth → cliente de usuario → id + user_id → respuesta acotada
```

El frontend vigente envía `unidad_id`, `batch_id`, `planeacion_ids`, `tipos_pregunta` y `cantidades_pregunta`. El controller acepta además `tema_ids` para el contrato directo histórico. `user_id`, `force_new_batch`, IDs de job y cualquier clave desconocida producen 400 antes de tocar DB. El log de recepción conserva solo una etiqueta fija, conteos y presencia de batch; no registra identidad ni IDs de selección.

## Ciclo de vida seguro

El schema versionado declara `pending` como default de jobs e items y no contiene un `CHECK` que lo excluya. El job se crea explícitamente `pending`. Solo después del INSERT de todos los items se agenda `setTimeout`; el controller no puede devolver 202 hasta que el servicio haya completado ambos pasos.

- Si falla el INSERT de items, el mismo cliente del usuario intenta marcar el job `failed` con `id + user_id + status IN (pending, processing)`. El mensaje persistido es genérico, no se agenda worker y se conserva el error original.
- Si `setTimeout` falla de forma síncrona, se ejecuta la misma compensación y no se devuelve 202.
- Si la compensación falla, el diagnóstico contiene únicamente etapa y booleano `compensado`; no sustituye ni expone el error original. Queda un riesgo residual de job `pending` que requiere reconciliación transaccional en 03D.
- El worker cambia a `processing` solamente después de validar autoridad. Un rechazo posterior marca `failed` solo cuando la lectura del job produjo `jobId + userId` UUID comprobados.

No se borran filas como compensación y no existen timers de rescate o retries globales.

## Selecciones y cardinalidad

### `tema_ids`

Los UUID se normalizan a minúsculas y se deduplican. Los duplicados exactos representan una sola selección, conservando el contrato histórico. La consulta usa el cliente del usuario, `.in('id', ids)` y `.eq('user_id', userId)`. Debe devolver exactamente todos los IDs únicos, y todos deben pertenecer a `unidad_id`; UUID inválido, inexistente, ajeno o filtrado por RLS produce el mismo 404 `Seleccion de temas no encontrada.`. No se crea job, item ni timer con un subconjunto visible.

`planeacion_ids` continúa deduplicándose como bigint serializado, exige todas las filas con `user_id`, deriva temas y conserva la autocorrección histórica de unidad para la selección de Biblioteca. Batch explícito/derivado se valida con `id + user_id`.

### Items

El número esperado se deriva del mismo total calculado por `getRequestedQuestionCountTotal` y persistido de forma redundante en `job.total_preguntas`, `job.progress_total` y `job.configuracion.total_preguntas`.

La autoridad exige que los tres sean el mismo entero positivo y que `examen_generation_items` tenga exactamente esa cardinalidad. Los items deben tener IDs UUID únicos, números únicos y ordenados `1..N`, `job_id` y `user_id` comprobados, `tema_id` autorizado y estado `pending`, `processing`, `retrying` o `completed`. Faltantes, extras, duplicados o estado `failed` rechazan el procesamiento. El batch puede faltar; en ese caso las planeaciones comprobadas deben tener `batch_id IS NULL`.

## Objeto de autoridad y mutaciones admin

`validateExamGenerationWorkerAuthority` devuelve un objeto congelado con datos comprobados:

```text
jobId, userId, unidadId, batchId, status,
temaIds[], planeacionIds[], itemIds[], expectedItemCount,
job, batch, items
```

Los UUID se devuelven normalizados. `job`, `batch` e `items` son snapshots de filas cuya identidad, propietario, jerarquía, relación y cardinalidad fueron comprobados.

| Mutación | Filtros obligatorios |
| --- | --- |
| Job `processing`, progreso o fallo | `id = authority.jobId`, `user_id = authority.userId`, estado esperado |
| Item `processing/retrying/completed/failed` | `id`, `job_id`, `user_id`, pertenencia a `authority.itemIds`, estado admitido |
| Compensación HTTP | cliente del usuario; `id + user_id + status IN (pending, processing)` |
| Job `completed` | `id + user_id + status = processing` |

Cada UPDATE selecciona el ID afectado y falla cerrado ante cero filas. Los retries internos reciben la autoridad y ya no actualizan mediante IDs sueltos.

Inmediatamente antes de insertar `examenes`, el worker vuelve a validar toda la autoridad, exige todos los items `completed`, reconstruye el examen con el job/items revalidados y repite la validación global. El INSERT y el UPDATE `completed` usan esa segunda autoridad. Un cambio de propietario, batch, jerarquía, tema, planeación, item, cardinalidad o estado impide persistir el examen.

## Admin y riesgo residual

El admin permanece únicamente en el worker interno y métricas. Las operaciones HTTP de batch, creación, polling, listado, lectura y eliminación exigen cliente del Bearer; no existe `supabaseClient || supabaseAdmin` ni `getClient` como fallback.

La validación y cada escritura siguen siendo sentencias separadas. Una modificación concurrente puede ocurrir después de la segunda validación y antes del INSERT/UPDATE final. Los filtros y la revalidación reducen la ventana, pero no ofrecen atomicidad. 03D debe evaluar transacción/RPC, constraints de propietario común y reconciliación de jobs pendientes tras una compensación fallida, después de verificar metadatos live. No se añadió SQL en 03C.

## Pruebas automáticas

`node --experimental-vm-modules --test tests/examenes-authority.test.js`: **39/39 PASS**. Supabase, OpenAI, métricas y timers están reemplazados en memoria; no hay red.

La cobertura incluye payload real de Biblioteca; allowlist; job `pending`; orden job→items→agenda; compensación por fallo de items/timer y por compensación fallida; cardinalidad completa y duplicados de temas; batch propio/ajeno/inexistente/ausente; polling propio/cruzado/inexistente; cardinalidad exacta y estados de items; identidad inválida; fallo seguro del worker; filtros completos en mutaciones; segunda validación; cambio de autoridad antes del INSERT; `completed` con estado esperado; y rutas autenticadas. Los caminos inconsistentes comprobados conservan cero llamadas al OpenAI simulado y cero INSERT de examen.

La evidencia automática es **PRUEBA AUTOMÁTICA PASS (transporte/Supabase/OpenAI simulados)** y no sustituye RLS real. El cierre manual posterior elevó únicamente los tres caseIds exactos de polling propio, cruzado B→A y anónimo a **PRUEBA MANUAL REAL PASS**; selección y los demás casos conservan su nivel anterior.

El harness de polling añade `node --test tests/isolation/exam-polling-guards.test.js`: **22/22 PASS**. Sintaxis JS y PowerShell, enlaces relativos y `git diff --check` también quedaron aprobados. Estas pruebas usaron transporte simulado, sin red ni OpenAI real.

## Harness manual de polling validado

La extensión bajo `tests/isolation/exam-polling-*` es independiente del harness 03A de planteles y no importa código de aplicación. Su ejecución manual local/test fue aprobada con el runId `8775bef9-87b4-4d15-b806-b356b62c95d6`.

El SQL versionado permite un job terminal sin items ni jerarquía: `user_id`, `titulo` y `total_preguntas` son las únicas columnas sin default y no anulables que el fixture debe aportar; la única FK obligatoria del job es `user_id -> auth.users`. `unidad_id`, plantel, grado, materia y examen son anulables; no hay `CHECK` de estados ni trigger en jobs/items. El fixture usa un UUID reservado, owner A, `status=failed`, conteos/progreso cero, arrays/objetos vacíos, mensaje público genérico y referencias nulas. No necesita una unidad preexistente y el guard rechaza una referencia aportada por el operador. No crea items, examen, timer o worker.

RLS está habilitado. Las cuatro policies de jobs y las cuatro de items comparan `auth.uid() = user_id`; `authenticated` tiene INSERT/SELECT/UPDATE/DELETE. El harness ejerce solo INSERT/SELECT/DELETE de jobs con el token A, SELECT cruzado con B y polling por API. No usa service role, admin o SQL manual. Estos datos proceden del SQL versionado; los metadatos live continúan siendo precondición del operador, no evidencia remota obtenida durante la implementación.

### Guards, ledger y fallos ambiguos

- Exige `APP_ENV=test`, origen Supabase y API exactos, clave pública, dos UUID/tokens distintos y declaración explícita de cuentas sintéticas. Rechaza `sb_secret`, JWT `service_role`, otros destinos y referencias FK externas.
- Revalida configuración antes de cada solicitud, usa `redirect:error`, timeout y `/auth/v1/user` para vincular cada token con A/B antes de escribir.
- Emite solo campos allowlisted. No serializa cuerpos, configuración, headers, tokens, claves, cookies, URLs o errores raw.
- `RUN` y `UNCERTAIN` exponen `runId` e ID reservado antes del INSERT. Solo una respuesta 201 con fila exacta mueve el ID al ledger confirmado. Un INSERT ambiguo permanece `UNCERTAIN` y nunca se limpia automáticamente.
- Cleanup solo acepta el ID del ledger privado de la ejecución. Antes del DELETE revalida owner, estado, campos y ausencia de items/examen como A/B. El DELETE lleva `id + user_id`. Tras una respuesta ambigua conserva `delete_unverified`; un reintento solo retira la entrada si lecturas exitosas de A y B confirman ausencia. Un timeout, error o JSON inválido nunca equivale a ausencia.

La ausencia observada por A/B no garantiza invisibilidad frente a terceros filtrados por RLS. El procedimiento exige cuentas sintéticas exclusivas y ausencia de concurrencia. Los conteos globales previos `jobs=0`, `items=0` fueron comunicados por el operador; el harness no los presenta como conteos globales ni usa SQL admin.

### Flujo manual exacto para Rafael

Precondiciones: backend local en `http://127.0.0.1:3000` configurado contra test, clave pública test y sesiones vigentes A/B sintéticas. Desde la raíz backend, ejecutar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\isolation\start-exam-polling.ps1
```

El launcher fija los dos destinos, solicita clave/UUID/tokens mediante entrada oculta, los conserva solo en variables del proceso y los elimina en `finally`. No pasarlos como argumentos ni pegarlos en el reporte.

1. Escribir `prepare`. Conservar las líneas sanitizadas `RUN`, `UNCERTAIN` y `CREATED` antes de continuar. Debe quedar exactamente un job `failed` confirmado y ningún item/examen.
2. Escribir `execute`. Debe producir cinco PASS: A/200 propio, B/404 sobre A, B/404 sobre UUID inexistente, anon/401 y snapshot A sin cambios. Este comando usa solo GET.
3. Escribir `cleanup`. Debe emitir `REMOVED` tras DELETE exacto y relecturas A/B; repetir `cleanup` dentro de la misma sesión si el DELETE quedó `delete_unverified`.
4. Escribir `quit`. `SUMMARY.successful=true` y exit code 0 requieren `prepare,execute,cleanup`, 5 PASS, cero FAIL/INCONCLUSIVE/errores y ledger/uncertain vacíos.

Si aparece `UNCERTAIN` sin `CREATED`, no ejecutar cleanup sobre ese intento ni importar el ID manualmente. Conservar `runId`/ID y detener la revisión para resolverlo con lectura exacta autorizada. No enviar `/api/examenes/generate` ni `/generar`; no registrar UUID de usuarios, tokens, claves, headers, bodies o `error_message`.

Pruebas offline del harness: `node --test tests/isolation/exam-polling-guards.test.js`, **22/22 PASS** con fetch, tiempo y UUID simulados; cero red real, worker u OpenAI. Cubren guards, identidad, fixture exacto, cuatro contratos de polling, GET-only, cleanup acotado, INSERT/DELETE ambiguos, lectura fallida, salida allowlisted y semántica del exit code.

### Resultado manual real aprobado

`prepare` creó exactamente un job terminal sintético de A con HTTP 201 y estado `failed`; entró al ledger confirmado sin items, examen, worker o generación. `execute` produjo 5 PASS, 0 FAIL y 0 INCONCLUSIVE: `03C-POLL-OWN-A` 200, `03C-POLL-CROSS-B` 404, `03C-POLL-MISSING-B` 404, `03C-POLL-ANON` 401 y `03C-POLL-NO-EFFECT` PASS.

Durante cleanup se observó el estado preventivo `delete_unverified`; la comprobación posterior confirmó `REMOVED` con HTTP 204. El cierre registró `cleanupCompleted=true`, ledger y uncertain vacíos, cero errores de comando, `successful=true`, exit code 0 y cero residuos conocidos. La precondición global comunicada antes de ejecutar fue jobs=0 e items=0. No hubo POST de generación, worker, OpenAI ni tráfico productivo.

## Estado

03C está completada y validada en su alcance de aplicación y polling local/test. 03D conserva la verificación remota de policies/grants, la ventana no atómica entre validación y persistencia, el posible job `pending` residual si también falla la compensación y la evaluación de RPC/transacción y reconciliación. 03E conserva Storage. 03F conserva estado del navegador y Archivados. Fase 03 sigue abierta.
