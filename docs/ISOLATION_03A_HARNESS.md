# Educativo IA — harness y comprobación manual 03A

Estado: pruebas offline aprobadas y ejecución real acotada de planteles aprobada el 2026-10-10 contra Supabase test/API local. Navegador, Storage, relaciones, jobs y la matriz completa siguen pendientes. [Auditoría](ISOLATION_03A.md), [inventario](ISOLATION_03A_INVENTORY.md), [matriz](ISOLATION_03A_MATRIX.md).

## Alcance y precondiciones

Node incorporado, sin dependencias nuevas, SDK, dotenv, imports de aplicación ni OpenAI. `tests/isolation/harness.js` no hace I/O al importarse/construirse. `run.js` es el entrypoint interactivo explícito; no lo importa la suite ordinaria. Nunca ejecutar el backend desde este harness.

Rafael debe verificar previamente metadatos actuales con los SELECT ya preparados y el backend local según la auditoría. Confirmar que los triggers de planteles no disparan efectos externos; su PK UUID/defaults/owner y políticas CRUD son compatibles y no han cambiado las FK entrantes. Crear **solo dos planteles sin descendientes**, uno por A y B. A/B deben ser identidades sintéticas existentes distintas, autorizadas, sin actividad concurrente ni terceros que puedan vincular datos a esos IDs. No crear Auth ni perfiles. La marca is_test_user no acredita esto: depende de confirmación del operador.

El agente no lee `.env` ni `js/core/config.local.js`. El validador existente carga `.env`: el usuario puede ejecutarlo personalmente en la terminal de la API siguiendo 02E; en 03A el agente solo inspeccionó su código. Debe reportar test/proyecto test/3000/CORS locales. Comprobar Network en local antes de declarar API verificada. `/health` por sí solo no expone ni certifica el proyecto del backend.

## Uso sin compartir ni persistir secretos

En una **terminal PowerShell nueva dedicada**, desde backend, después de satisfacer las precondiciones:

```powershell
./tests/isolation/start-local.ps1
```

Si la política local no permite ejecutar scripts, usar el mecanismo corporativo/privado autorizado para suministrar las mismas variables al proceso y ejecutar `node tests/isolation/run.js`. No cambiar políticas globales ni poner credenciales en comandos. El script no requiere flags para desactivar comprobaciones.

El launcher pide clave pública test, UUID A/B y access tokens test vigentes con `Read-Host -AsSecureString`; no pide passwords, no inicia sesión ni recupera tokens desde navegador/archivos/historial. Deben ser credenciales **suministradas voluntariamente por el operador por su mecanismo privado**. Si no las tiene, detenerse: no pedir pegarlas en chat. No usar transcript, grabación de terminal ni compartir el portapapeles. El script pasa los valores por entorno del proceso hijo, no argumentos, y los elimina de esa terminal al terminar; usar una terminal dedicada porque no restaura valores anteriores. Cerrar la terminal después. Nunca imprimir variables de entorno.

Variables del proceso si se usa un gestor privado:

| Variable | Contenido esperado, sin valores secretos |
| --- | --- |
| APP_ENV | test |
| SUPABASE_URL | https://gwdtlbisykzzplgzczzq.supabase.co |
| EDUCATIVO_API_URL | http://127.0.0.1:3000 |
| EDUCATIVO_PUBLIC_KEY | clave pública del proyecto test; rechaza secret/service_role y JWT anon de otro ref |
| EDUCATIVO_A_ID / EDUCATIVO_B_ID | UUID distintos de las identidades sintéticas |
| EDUCATIVO_A_TOKEN / EDUCATIVO_B_TOKEN | access tokens test vigentes, role authenticated y sub correspondientes |
| EDUCATIVO_SYNTHETIC_USERS | confirmed después de verificar identidades sintéticas |
| EDUCATIVO_METADATA_REVIEWED | confirmed después de revisar metadatos/precondiciones |
| EDUCATIVO_LOCAL_API_VERIFIED | confirmed después de comprobar que la API local usa test |

Las tres confirmaciones no son opciones para omitir guards: son precondiciones externas que el harness no puede observar mediante `/health`. No sustituir la revisión por escribir confirmed. Claims se validan localmente (rol, issuer, sub, expiración) y después `/auth/v1/user` verifica ambos tokens realmente antes de cada fase. La clave pública moderna no contiene ref decodificable; destino exacto + Auth efectivo constituyen el control disponible. No se afirma que decodificar JWT verifique firma.

Al iniciar, el runner emite `RUN` con el `runId` UUID antes de cualquier escritura. Conservar esa línea. En la sesión interactiva escribir un comando por vez y revisar su salida antes del siguiente:

```text
prepare
execute
cleanup
quit
```

`prepare`: GET Auth para A/B; antes de cada POST emite `UNCERTAIN` con la tupla allowlisted `runId`, `actor`, `id`; POST Supabase directo de dos filas planteles con UUID único reservado por fila, nombre reconstruible exactamente como `Educativo IA 03A <runId> <actor>` y owner de ese actor. Exige 201 y fila exacta confirmada antes de inscribirla en ledger. Al confirmarse, ese intento sale de `uncertainPending`; el evento preventivo no incrementa INCONCLUSIVE. No prepara otros recursos ni genera contenido.

`execute`: revalida Auth; snapshots completos de esas filas como sus owners; seis lecturas directas por ID (A/B/anon), tres listados API (A/B/anon), dos comprobaciones de igualdad before/after. Solo GET. Evalúa ID/nombre/owner y ausencia del fixture ajeno. Errores directos de permisos son INCONCLUSIVE sin evidencia suficiente; éxito HTTP con datos cruzados es FAIL. No certifica todo el listado ni toda la matriz.

`cleanup`: revalida Auth, comprueba nombre/owner exactos, ausencia visible para A/B de grados/batches/exámenes/jobs que referencien el plantel; elimina en orden inverso solo los dos IDs registrados, con filtros id+user_id. Cada fixture confirmado se conserva en memoria como `pending_delete` o, desde que se intenta DELETE hasta confirmar su resultado, `delete_unverified`. Relee como A y B para comprobar ausencia mediante respuestas exitosas y arrays vacíos. No acepta un manifiesto externo, IDs arbitrarios, prefijos, vaciado de tabla/bucket ni SQL destructivo. Esos planteles son hojas sin dependencias; no se asume segura una cascada. Si aparece un dependiente, falla cerrado. La ausencia de terceros/concurrencia sigue siendo precondición externa, pues A/B no pueden inspeccionar filas ocultas de terceros y no hay transacción entre check y delete.

`quit` no limpia automáticamente. Al terminar, el runner emite un único `SUMMARY` sanitizado con comandos completados, totales PASS/FAIL/INCONCLUSIVE, errores de comando, `prepared`, `executeCompleted`, fixtures confirmados pendientes, inserciones inciertas pendientes y `successful`. Los registros pendientes solo contienen runId/actor/ID y estado de limpieza permitido. Toda salida usa allowlists estrictas; no incluye bodies, errores raw, headers, cookies, claves, tokens o firmas. PASS significa únicamente que pasó la aserción limitada de ese caso, no que RLS completo esté aprobado.

Exit code 0 requiere: cero FAIL, INCONCLUSIVE y errores de comando; cero fixtures confirmados o inciertos pendientes; y, si hubo preparación, `execute` terminado. Cleanup exitoso no borra fallos ni inconclusos acumulados. Salir con `quit` antes de `prepare` es un no-op explícito válido: summary con `prepared:false`, `executeCompleted:false`, listas vacías y exit 0. Preparar y salir sin completar execute produce exit distinto de cero aunque no haya casos FAIL. `start-local.ps1` conserva el exit code de Node después de retirar las variables y termina con esa misma señal; debe usarse en la terminal dedicada indicada arriba.

Ejemplo abreviado exclusivamente sintético de una ejecución limpia:

```json
{"caseId":"RUN","result":"PENDING","runId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
{"caseId":"UNCERTAIN","actor":"A","result":"PENDING","id":"11111111-1111-4111-8111-111111111111","runId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
{"caseId":"PREPARE","actor":"A","result":"CREATED","status":201,"id":"11111111-1111-4111-8111-111111111111","runId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","fixtureState":"pending_delete"}
{"caseId":"SUMMARY","commandsCompleted":["prepare","execute","cleanup"],"pass":11,"fail":0,"inconclusive":0,"commandErrors":0,"prepared":true,"executeCompleted":true,"fixturesPending":[],"uncertainPending":[],"successful":true}
```

El SUMMARY siempre conserva los FAIL/INCONCLUSIVE ya observados aunque cleanup retire todos los fixtures. Un error de comando emite solo `ERROR/INCONCLUSIVE`, incrementa `commandErrors` y vuelve al prompt para permitir cleanup; no imprime la excepción.

### Diagnóstico seguro de fallos

Antes del evento genérico `ERROR`, la capa que detecta el problema emite como máximo los campos allowlisted `caseId`, `phase`, `reason`, `actor` y `status`. Las fases permitidas son `config`, `auth`, `prepare`, `execute` y `cleanup`; los motivos permitidos son `http`, `identity_mismatch`, `anonymous_identity`, `invalid_json`, `redirect`, `timeout`, `network`, `unexpected_response` e `invalid_state`. Actor solo puede ser A, B o anon y status solo un entero HTTP 100–599. No se serializan excepciones, bodies, URLs, configuración, tokens, claves, headers, cookies ni errores del proveedor.

Ejemplos exclusivamente sintéticos:

```json
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"http","status":401}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"B","reason":"http","status":403}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"identity_mismatch","status":200}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"anonymous_identity","status":200}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"invalid_json","status":200}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"redirect","status":302}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"timeout"}
{"caseId":"DIAGNOSTIC","phase":"auth","actor":"A","reason":"network"}
{"caseId":"DIAGNOSTIC","phase":"prepare","reason":"invalid_state"}
{"caseId":"DIAGNOSTIC","phase":"execute","actor":"A","reason":"unexpected_response","status":200}
```

Un HTTP 401/403 de Auth suele requerir renovar la sesión test o revisar la clave pública test, sin compartir sus valores. `identity_mismatch` significa que token y UUID declarados no representan la misma sesión. `anonymous_identity` indica que Auth validó una identidad anónima, no el usuario sintético requerido. `invalid_json` o `unexpected_response` indican una respuesta incompatible sin mostrarla. `redirect` bloquea cualquier 3xx/cambio de origen. `timeout` y `network` requieren revisar conectividad/destino local, sin concluir que las credenciales sean incorrectas. `invalid_state` indica configuración o secuencia de comandos no admisible.

Una respuesta HTTP no exitosa sigue siendo una respuesta HTTP: `request()` conserva su status y Auth la clasifica como `reason:http`; no la convierte en error de red. El timeout usa estado controlado por el harness, sin depender del texto de la excepción. El diagnóstico no incrementa los contadores de casos adversariales PASS/FAIL/INCONCLUSIVE: `commandErrors` conserva la señal de fallo del comando y determina exit no exitoso.

La ausencia de cualquier evento `UNCERTAIN` confirma que el harness no alcanzó el punto inmediatamente anterior al primer POST. No pegar tokens, claves, bodies, URLs firmadas ni capturas con headers al reportar un diagnóstico.

## Fallos, residuos y límites

- Antes de `prepare`, registrar el `runId`; para cada intento conservar localmente `runId`, actor e ID de `UNCERTAIN`/`CREATED`. Con esa tupla el nombre se reconstruye como `Educativo IA 03A <runId> <actor>`. No conservar tokens ni configuración. No cerrar terminal antes de cleanup.
- Ledger y estados de DELETE solo viven en memoria. Un cierre abrupto no autoriza redescubrir por prefijo ni importar un listado para borrado. Antes de cada POST se informa un ID reservado `UNCERTAIN`: si se pierde respuesta, ese ID no entra al ledger de confirmados y no se borra automáticamente.
- Si DELETE fue enviado y la comprobación posterior falla, el fixture queda `delete_unverified`. Repetir `cleanup` en el mismo proceso: primero exige respuestas exitosas y arrays vacíos para A y B. Si ambos confirman ausencia, lo retira y emite REMOVED. Si el owner aún lo ve con nombre/propietario exactos y la otra identidad no lo ve, vuelve a comprobar dependientes antes de otro DELETE. Un 401/403, timeout, JSON inválido, identidad incorrecta o forma incompatible nunca significa ausencia.
- Para un incierto/residual, con la identidad original y destino test verificados, revisar exclusivamente ese ID por REST de usuario. Confirmar que corresponde al nombre/run y propietario indicados, revisar dependientes y planificar borrado exacto en una acción posterior revisada. Si no es visible, cambió owner o usuario no puede limpiarlo: registrar ID/estado pendiente, sin escalar privilegios ni usar SQL destructivo.
- Ante expiración/401/fallo de entorno, no modificar guards. Conservar IDs para procedimiento anterior; una nueva ejecución no recupera ledger previo. Las variables se mantienen secretas; no adjuntar error del proveedor.
- Las comparaciones de no efectos cubren los dos planteles y, en limpieza, sus relaciones visibles a A/B. No son auditoría de triggers desconocidos ni de cambios globales; de ahí la revisión previa de metadatos. No hay prueba de atomicidad ni resiliencia general a concurrencia.
- Tests automáticos pueden inyectar un fetch falso; el entrypoint real no ofrece selección de transporte ni bypass. Suite ordinaria no prepara/limpia remotamente.

## Verificación automática

Desde backend:

```powershell
node --test tests/isolation/guards.test.js
node --experimental-vm-modules --test tests/environment.test.js tests/client-configuration.test.js
node --check tests/isolation/harness.js
node --check tests/isolation/run.js
node --check tests/isolation/guards.test.js
```

Desde frontend: `node --test tests/environment-config.cjs` y `npm test -- --runInBand`. No ejecutar `run.js` como parte de tests. Resultados de la corrección diagnóstica: 45 guards/lifecycle/diagnóstico aprobados sin red. Los resultados históricos de 03A permanecen: 36 backend configuración y 28 frontend configuración aprobados; Jest no arrancó por dependencia ausente. Los tests que mencionan hosts productivos usan VM/transporte simulado, sin visitar esos destinos. No hay instalación de dependencias ni cambios a package.json.

## Procedimiento manual breve para Rafael

Los pasos 1–5 fueron completados por el operador para la ejecución acotada con runId `ca11685d-5e72-4b16-a92c-4fff42ec1a35`: 11/11 comprobaciones PASS, cleanup completo y cero residuos conocidos. Los pasos de navegador y los casos ampliados siguen pendientes. Esta aprobación no sustituye ni invalida el cierre manual 02F. Nunca generar planeación/anexo/lista/examen, pulsar Quick Create ni regenerar. No enviar rutas generate/generar/regenerate ni abrir jobs activos que dependan de generación.

| Paso | Precondición | Acción local/test | Esperado | Evidencia segura a devolver |
| --- | --- | --- | --- | --- |
| 1 | Configuración test preparada por usuario; API local iniciada por usuario después del validador seguro | Abrir http://127.0.0.1:5500/pages/login.html; ver banner y evaluar solo window.EDUCATIVO_ENVIRONMENT | test, gwdtlbisykzzplgzczzq, API 127.0.0.1:3000 | transcripción de esos tres datos; nunca EDUCATIVO_CONFIG |
| 2 | Paso 1 correcto | Network desde antes del login; revisar solo destinos Auth/REST/Storage/API, sin copiar headers | servicios solo Supabase test y API local; cero destinos productivos y cero rutas de generación. Assets/CDN estáticos no son tráfico a API productiva | conteos por hostname y rutas sin query/firmas, no HAR ni capturas completas |
| 3 | A/B sintéticos existentes; no crear usuarios | Login A y B en perfiles separados; abrir Biblioteca | cada uno ve únicamente recursos propios; usar fixtures del usuario solo para lectura | actor, conteo y etiquetas sintéticas comparadas; no tokens/passwords ni cuerpos |
| 4 | SQL de metadatos revisado en test; terminal/API verificados; credenciales suministradas privadamente | Launcher; conservar RUN runId; prepare; conservar tuplas UNCERTAIN/CREATED; execute | 11 observaciones limitadas; ningún job/IA; fixtures raíces no aparecen necesariamente en Biblioteca porque no tienen batch | salida sanitizada y tuplas runId/actor/ID, número de PASS/FAIL/INCONCLUSIVE |
| 5 | Misma sesión del harness | cleanup; si falla, revisar summary y reintentar cleanup en el mismo proceso; comprobar REMOVED A/B; quit | sin pendientes; un DELETE ambiguo solo se considera ausente tras lecturas exitosas y vacías A/B | SUMMARY completo sanitizado y exit code; IDs pendientes exactos, sin inventar limpieza |
| 6 | A/B en mismo perfil; recursos sintéticos de lectura autorizados | Visitar Archivados con A, logout, entrar B; contrastar con perfil limpio B (03A-BROWSER-SWITCH) | sin metadata/selección residual de A; no editar localStorage ni copiar su contenido | comparación booleana y descripción de UI sin datos privados |
| 7 | F_A/F_B ampliados y ejecutor revisado, todavía no disponibles | Casos de jobs terminales/relaciones/Storage de matriz se mantienen pendientes; revisar instrucciones antes de futura ejecución | sin generación ni creación improvisada de fixtures | indicar NO EJECUTADO y precondición faltante, no afirmar aprobado |

Las URLs firmadas son credenciales temporales: no deben aparecer en evidencia ni capturas. Si una prueba manual futura falla, reportar caseId, actor, status/resultado seguro, comparación before/after e IDs residuales sintéticos; no compartir claves, Bearer, cookies, passwords ni URLs firmadas.
