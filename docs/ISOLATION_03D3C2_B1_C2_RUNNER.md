# 03D3C2-B1-C2 - runner administrativo test-only

Fecha: 2026-10-27. Estado: **APTO para futura validacion manual coordinada en Supabase test; no ejecutado conectado**. Commit de diseno: `b047b68e2722843b664b21335c7a7280fed35d05` (`docs(security): design reversible B1 test fixtures`). Ningun grant B1 fue revocado y no existe migracion B1.

## Arquitectura

El paquete vive solo en `tests/isolation` y no es importado por app, server, routes, controllers, services, workers, frontend ni deploy:

- `03d3c2-b1-c2-admin-contract.js`: configuracion, allowlists, marcador, manifiesto y eventos puros.
- `03d3c2-b1-c2-admin-transport.js`: adaptador PostgREST inyectable con metodos constantes.
- `03d3c2-b1-c2-admin-runner.js`: preflight, prepare, verify y cleanup.
- `03d3c2-b1-c2-admin-recovery.js`: discover/recover fail-closed.
- `03d3c2-b1-c2-admin-cli.js`: bucle interactivo, sin I/O al importar.
- dos launchers PowerShell separados; tests usan exclusivamente un fake.

## Configuracion e identidad

Entradas autorizadas: confirmacion literal `educativo-backend-test`, URL fija versionada, credencial admin oculta, UUID ocultos de usuarios A/B y unidades A/B. A/B y sus unidades deben ser distintos. No se aceptan IDs de fixtures, listas de IDs, URL libre, token de usuario o campos extra. Variables heredadas no consumidas se ignoran.

Se acepta una clave moderna `sb_secret_...` o JWT legacy con `role=service_role` y `ref` exacto. La clave opaca no contiene un Project ID verificable: su seguridad depende acumulativamente de URL fija, confirmacion literal, `APP_ENV=test` y comprobaciones de autoridad/contexto. Public/publishable/anon y JWT de otro proyecto son rechazados. La credencial solo existe en memoria y se elimina de variables de entorno en `finally`.

Marcador:

```text
EIA-03D3C2-B1C2:<runId>:<A|B>:<tabla>:<rol>
```

El runner genera runId e IDs de filas. El intercambio sanitizado contiene solo runId, IDs sinteticos, actor, tabla, marcador y relacion batch necesaria; nunca owner/user UUID, unidad, token o clave. Preferencia: transferencia en memoria. Si el operador necesita un archivo temporal, debe estar fuera del repositorio, contener solo ese intercambio y borrarse al terminar.

## Allowlist

Mutaciones exactas:

1. `INSERT public.planeacion_batches`.
2. `INSERT public.examenes`.
3. `DELETE public.examen_generation_jobs`.

No hay UPDATE administrativo, DELETE directo de items/batches/examenes, INSERT jobs/items, RPC, SQL arbitrario, Auth, Storage, metricas ni otro schema. SELECT usa columnas constantes y solo cuatro tablas del grafo mas `unidades` para el contexto.

## Ciclo runner

1. `preflight`: valida unidades A/B por owner y ausencia del run.
2. `prepare`: genera el run, registra PENDING, crea batch y examen por actor, y relee cada marcador.
3. `verify`: exige cuatro filas, owners y relaciones exactas.
4. Los harnesses reciben el intercambio sanitizado. Ellos crean jobs/items con authenticated y ejecutan casos.
5. El harness borra exámenes y batches con sus DELETE authenticated todavía vigentes.
6. `cleanup`: descubre jobs del run, valida que todos sus items sean del run, borra job y exige ausencia de job/items. Si quedan batch/examen, devuelve `authenticatedCleanupPending` y no declara exito.
7. `quit`: descarta configuracion desde el CLI/launcher.

HTTP exitoso nunca acredita persistencia o borrado. Una escritura ambigua queda uncertain y no se borra automaticamente.

## Recovery

`discover` recibe solo runId mas el contexto autorizado recogido por launcher. Descubre por gramatica exacta, aplica maximos (2 batches, 2 examenes, 4 jobs, 6 items), valida owner, unidades, batch del run y job del run. Marcador, owner, cardinalidad, parent o dependiente externo detienen todo.

`recover` elimina solo jobs validados y comprueba la cascada de items. Batches/examenes quedan para cleanup authenticated; mientras existan, `successful=false`. Un DELETE ambiguo queda pending y produce exit no cero. No se aceptan IDs manuales.

## Eventos y fallos

Allowlist: RUN, DIAGNOSTIC, PENDING/UNCERTAIN, CREATED, REMOVED, PASS/FAIL/INCONCLUSIVE y SUMMARY. Solo pueden incluir fase, actor, tabla, operacion, resultado, razon canonica, HTTP status y runId. Nunca se serializan body, message/details/hint, headers, stack, claves, tokens o UUID de usuarios.

## Estado y siguiente validacion

El paquete queda sujeto a pruebas offline. Una futura validacion manual, autorizada separadamente, debe ejecutarse solo en test, primero con runner y luego con los harnesses adaptados; las revocaciones T1/T2/T3 siguen fuera de alcance. Produccion permanece intacta; los ocho grants siguen presentes.

La aptitud es para una validacion **coordinada**, no para ejecutar `prepare` aisladamente: los harnesses aun no consumen este intercambio. No se publican comandos ejecutables hasta que esa adaptacion tenga sus propias pruebas y pueda borrar examenes/batches con A/B. El runner y recovery fallan cerrado y nunca declaran exito mientras exista `authenticatedCleanupPending`.
