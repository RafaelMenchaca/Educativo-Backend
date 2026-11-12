# 03E1 — aislamiento adversarial de Storage

Preparado offline el 2026-11-03 y cerrado documentalmente el 2026-11-04. **03E1 validado exclusivamente en educativo-backend-test: rerun definitivo 20 PASS, cero FAIL/INCONCLUSIVE/commandErrors, cleanup completo y cero pendientes.** La primera ejecucion inconclusa y su correccion se conservan como historial. La evidencia live fue aportada por el operador; el agente no repitio el harness ni se conecto a Supabase. B3 permanece cerrado en test; B4 y 03A–03D no se reabren. Produccion intacta.

Puerta inicial: backend work/features, HEAD `1c61dc5599150c833cb910fdb4c882cd7130dea2`, `fix(security): narrow active RLS policies to authenticated`, arbol limpio. Stash B1-C2 presente y preservado sin inspeccionar contenido. Frontend observado solo en lectura: work/features, HEAD `3ca707f3214e71e37942730d271c913a958041f2`, limpio. No se necesitan credenciales para preparar o validar offline este paquete.

## Owners y alcance

- [AGENTS](../AGENTS.md), [Storage/ambientes](test-environment/STORAGE_AUTH_READINESS.md), [README test](test-environment/README.md) y [matriz historica Storage](ISOLATION_03A_MATRIX.md#casos-storage).
- [Inicializador](test-environment/initialize_application.sql): cuatro policies activity images SELECT/INSERT/UPDATE/DELETE TO authenticated, bucket exacto y primer segmento de storage.foldername(name) = auth.uid(). UPDATE tiene USING y WITH CHECK. Las policies avatars son otra superficie; no se crea ni usa ese bucket. Ningun SQL se modifica o ejecuta.
- [Detalle](../../frontend/js/pages/detalle.page.js): subirImagenActividad, crearSignedUrlActividad, eliminarImagenesStorage, construirTablaIaParaGuardar y guardarCambios. Storage directo del navegador; bucket privado planeacion-actividades, path userId/planeacionId/momento/archivo, TTL 3600, upload upsert:false. No hay endpoint Express de Storage que deba inventarse.
- [Servicio backend](../src/services/planeaciones.service.js), validateActividadImagenMetadata: valida forma de metadata, no relaciona el path con propietario/planeacion. La llamada a [imageEnrichment](../src/services/imageEnrichment.service.js) esta comentada como PAUSED. No se ejecuta generacion ni se modifica esa logica.
- Referencias de interaccion: [03D2A](../tests/isolation/biblioteca-run.js), [03D2B](../tests/isolation/derived-resources-run.js), [03D2C](../tests/isolation/technical-jobs-run.js) y [ownership](../tests/isolation/03d3c1-ownership-run.js), con sus launchers start-*.ps1. Se conserva prepare/execute/cleanup/quit/SUMMARY y entrada oculta via SecureString. No existia ejecutor Storage reutilizable.

Se agregan solo [harness](../tests/isolation/storage-harness.js), [runner](../tests/isolation/storage-run.js), [launcher](../tests/isolation/start-storage.ps1) y [tests offline](../tests/isolation/storage.test.js). Rutas HTTP contrastadas con StorageFileApi del SDK instalado: POST/PUT/GET object/bucket/path, POST object/list/bucket, POST object/sign/bucket/path y DELETE object/bucket con prefixes exactos. No hay infraestructura general, SDK de aplicacion importado ni backend local requerido.

## Ejecucion manual

En una terminal PowerShell dedicada:

```powershell
powershell.exe -NoProfile -File "C:\Users\angel\Documents\educativo_ia\worktrees\features\backend\tests\isolation\start-storage.ps1"
```

No dot-source ni pasar secretos por argumentos. El launcher exige escribir exactamente `educativo-backend-test` y `confirmed` para A/B existentes, sinteticos, distintos y exclusivos de test. URL fija `https://gwdtlbisykzzplgzczzq.supabase.co`, sin destino alternativo. Solicita clave publica, UUID y access token de A/B **con entrada oculta**. No solicita passwords ni service_role. Variables solo del proceso, eliminadas en finally; no lee .env ni escribe credenciales, logs o archivos de fixtures. No activar transcripcion ni compartir tokens/URLs firmadas.

Admite clave publishable o JWT anon de test; rechaza service role, issuer ajeno, rol no authenticated, usuario anonimo y A=B. Las claims locales son una puerta de rechazo, no verificacion criptografica: Storage valida las firmas en las operaciones reales. Prepare exige upload/relectura positivos de ambos usuarios. Los tokens deben conservar al menos un minuto de vigencia por request; usar tokens recientes. No se consulta ni modifica Auth, no hay refresh/login/logout. Anon usa apikey sin Bearer de usuario; si la clave publica es JWT anon tambien se envia como Bearer. A/B siempre usan su access token.

Introducir un comando por vez y revisar su resultado:

```text
prepare
execute
cleanup
quit
```

Prepare crea dos PNG diminutos sinteticos en memoria, prefijos A/B, namespace aleatorio `03e1-<runId>-*.png` y momento desarrollo. Segundo segmento **0**, solo como cadena bigint sintetica: no se afirma existencia de planeacion 0 ni se lee/crea una fila. Se demuestra aislamiento de prefijo en Storage sin fixtures DB; no es una prueba funcional completa de guardar imagenes en Detalle.

Ledger registrado antes de cada upload: dos propios y hasta dos intentos adversariales (prefijo B y anon). Se comprueba ausencia previa en el namespace aleatorio; nunca se lista sin prefijo/search ni se borra recursivamente. Cleanup usa exclusivamente esos paths exactos como propietario del prefijo, incluso si el atacante logro crearlos. No hay autoridad administrativa.

## Cobertura exacta

| Requisito | Caso | Criterio |
|---|---|---|
| 1. A sube bajo prefijo propio | UP-A; UP-B control positivo B | upload upsert:false y relectura de bytes exactos |
| 2. A lee/lista propio | OWN-READ, OWN-LIST | bytes exactos y un nombre exacto en lista acotada |
| 3. A firma/usa propia | OWN-SIGN | expiresIn=3600; GET sin headers de usuario, bytes exactos |
| 4. B no lee A | B-READ | rechazo reconocible, control propio B y relectura A |
| 5. B no descubre A | B-LIST | lista vacia o rechazo; propio A permanece |
| 6. B no firma A | B-SIGN | ninguna respuesta exitosa que otorgue capacidad |
| 7. B no sobrescribe A | B-UPDATE | PUT real, A conserva bytes; OWN-UPDATE controla antes PUT propio |
| 8. B no elimina A | B-DELETE | rechazo/lista vacia y A conserva bytes; 200 vacio solo no prueba aislamiento |
| 9. A no sube bajo B | A-UP-B | rechazo y B confirma ausencia por lista/lectura |
| 10. Relacion con planeacion ajena | Limite auditado, **sin PASS runtime** | SQL valida solo primer segmento; frontend construye path y backend no valida relacion en metadata. No existe tal comprobacion Storage que probar como garantia vigente |
| 11. Anon sin acceso | ANON-READ, ANON-PUBLIC-READ, ANON-LIST, ANON-UP, ANON-SIGN, ANON-UPDATE, ANON-DELETE | lectura directa/publica, listado, upload, firma, PUT y DELETE; propietario confirma invariancia/ausencia |
| 12. Borrado de fixtures | CLEANUP | DELETE exactos, lista propia vacia y lectura denegada/ausente |
| 13. Sin pendientes | SUMMARY | fixturesPending=[], uncertainPending=[], cleanupCompleted=true |

Resultado definitivo **20 PASS**: dos prepare, 17 execute y uno cleanup, sin contar subchecks otra vez. Requisito 10 no se convierte en PASS ficticio ni prueba de escritura DB. ST-MOVE-PREFIX, expiracion real del TTL, limites MIME/tamano, huerfanos por borrado de planeacion y metadata cruzada del plan historico quedan fuera de este subpaquete minimo, sin ejecutar. No modificar CSV ni afirmar cobertura fuera de 03E1.

URL firmada es capacidad temporal utilizable por su poseedor; OWN-SIGN la consume sin identidad y no lo considera fuga. Se prueba la negativa de B a generar firma ajena o leer sin firma. No se imprimen/persisten firmas. Antes de consumir una URL se exige origen test, path exacto y unico parametro token; redirects bloqueados.

## Verificador, limpieza y SUMMARY

Solo denegaciones reconocibles de permisos/objeto no visible se aceptan: 400/404 genericos, HTML, JWT invalido de B, 5xx, red o redirects no son PASS. Ruta publica puede ocultar bucket privado como Bucket not found, con control propietario positivo. Antes/despues de cada ataque B/A se relee su objeto control, evitando atribuir rechazo a token no operativo. Se releen bytes propios tras cada intento sobre A; no se depende solo del status.

Runner intenta cleanup al fallar prepare/execute, o al salir por quit/EOF/Ctrl+C si aun no se intento limpiar. Nunca reintenta recursivamente un cleanup manual fallido ni lo duplica al cerrar. Cada intento recorre todos los paths pendientes aunque uno falle. Antes de DELETE comprueba ausencia con lista y GET fresco; ausencia exige not-found reconocible, no solo permiso denegado. Repetir cleanup ya completado no envia DELETE ni suma PASS/errores. Cleanup parcial puede reintentarse manualmente; errores reales anteriores no se borran del SUMMARY. Matar el proceso, cerrar ventana o corte electrico puede impedir limpieza: mantener terminal hasta resumen.

Timeout/redirect/error de transporte en escritura conserva uncertainPending aun si luego se observa ausencia: podria haber escritura tardia. No declara exito ni elimina incertidumbre automaticamente. Ante pendientes, no iniciar otra corrida ni borrar prefijos completos: conservar resumen sanitizado con runTag abreviado y etiquetas A/B/cross/anon; mantener la terminal y reintentar cleanup cuando corresponda. Los paths exactos permanecen solo en memoria: no imprimirlos ni pedirlos en el reporte. Una incertidumbre de escritura no se borra automaticamente; requiere reconciliacion antes de cerrar. No se serializan errores del proveedor, bytes o config. Ningun resultado incompleto acredita aislamiento.

SUMMARY definitivo aportado por el operador, ademas de caseId y runTag abreviado:

```json
{"prepared":true,"executeCompleted":true,"cleanupCompleted":true,"pass":20,"fail":0,"inconclusive":0,"commandErrors":0,"fixturesPending":[],"uncertainPending":[],"failures":[],"commandsCompleted":["prepare","execute","cleanup"],"successful":true}
```

El rerun termino con exit code 0. El contrato mantiene fail-closed: caso no ejecutado, falla, incertidumbre, error de comando o pendiente produce exit code 1. La evidencia compartida no incluyo credenciales, cuerpos de respuesta ni URLs firmadas.

## Riesgos y limites constatados en codigo

1. Primer segmento es el unico vinculo RLS del path; no se comprueba existencia/propietario del segundo. Metadata backend admite path arbitrario no vacio. Limite de integridad previamente documentado, no nueva regresion B3 ni evidencia live de lectura cruzada.
2. Subida/guardado de tabla_ia no son atomicos. Un fallo intermedio de multiples subidas puede perder uploadedPaths; remove posterior fallido puede dejar huerfanos. No se modifica ni ejecuta ese flujo.
3. TTL 3600 sin renovacion periodica y URLs bearer; no se observa expiracion real aqui. Tamano/MIME dependen del bucket; frontend no valida tamano. Estas propiedades no quedan acreditadas por 20 PASS de aislamiento.

## Validacion offline

```powershell
node --test tests/isolation/storage.test.js
node --check tests/isolation/storage-harness.js
node --check tests/isolation/storage-run.js
node --check tests/isolation/storage.test.js
git diff --check
```

25 tests PASS con transporte simulado, cero FAIL/cancelled/skipped/todo: guardas, ciclo de 20 casos, fugas por superficie, respuestas ambiguas, cleanup tras fallo/EOF, timeout incierto, URL restringida, state machine, launcher oculto, cuatro policies versionadas e imports sin I/O/red/timers. AST PowerShell aprobado sin ejecutar launcher. Los PASS offline no son PASS live. Revision de enlaces, diff y patrones de secretos solo sobre archivos pendientes. Sin stage, commit, push, PR, merge, SQL ni operaciones live.

## Primera ejecucion live y correccion offline

Evidencia aportada por el usuario, exclusivamente educativo-backend-test y A/B sinteticos. UP-A, UP-B, OWN-READ, OWN-LIST y OWN-SIGN PASS; OWN-UPDATE INCONCLUSIVE. Cleanup final PASS despues de reintentos. SUMMARY recibido: prepared=true, executeCompleted=false, cleanupCompleted=true, pass=6, fail=0, inconclusive=1, commandErrors=4, fixturesPending=[], uncertainPending=[], commandsCompleted=["prepare","cleanup"], successful=false, exit code=1. Sin secretos ni URLs compartidas. **No necesita cleanup manual de esa corrida**; no se contabiliza como aislamiento aprobado ni se suman sus seis PASS a un rerun.

Diagnostico: lectura obsoleta/cache es la causa mas probable, no una causa live demostrada. Los GET anteriores reutilizaban exactamente la misma URL antes/despues de PUT y DELETE, sin cache busting ni headers de revalidacion en lectura. max-age=0 solo se enviaba al escribir. Esto explica conjuntamente bytes anteriores tras update y objetos aun visibles durante verificaciones de cleanup que finalmente observaron ausencia. Tambien son posibles rechazo HTTP del PUT, formato/contenido inesperado o fallo de lectura: la salida anterior no permite distinguirlos porque ocultaba status y operacion.

uncertainPending final vacio, junto con el Set anterior que nunca se vaciaba, descarta un timeout/error de transporte/redirect de escritura registrado por aquel codigo. No descarta timeout de lectura. Upload, lectura, listado y firma propios ya habian pasado. PUT es la operacion correcta segun StorageFileApi instalado; x-upsert:false estaba ademas enviado en PUT, aunque el SDK lo envia solo en POST. Se alinea el header con el SDK, sin atribuirle el fallo ni usar upsert:true. La comparacion de bytes sigue siendo obligatoria; el fixture permanece registrado tras INCONCLUSIVE.

Los cuatro command errors se explican por el flujo anterior:

1. record(OWN-UPDATE, INCONCLUSIVE) lanzo error: ERROR execute.
2. El catch intento cleanup automatico, cuya verificacion no completo: ERROR cleanup.
3. El primer cleanup manual tampoco completo: ERROR cleanup.
4. Su catch llamo de nuevo al mismo cleanup, causando otro ERROR cleanup evitable.

El siguiente cleanup manual completo y sumo el sexto PASS. Esto demuestra duplicacion de intentos en el runner; no demuestra cuatro fallas independientes de Storage. SUMMARY era coherente en no marcar executeCompleted ni successful.

Cambios correctivos:

- GET de objetos directos/publicos con nonce distinto por observacion, cache:no-store y Cache-Control/Pragma de revalidacion; path, actor y permisos se conservan. Las URLs firmadas no se alteran. No hay fallback que acepte bytes anteriores ni retry automatico del PUT.
- OWN-UPDATE informa por separado resultado HTTP del PUT y lectura posterior. La expectativa cambia solo tras observar exactamente el PNG nuevo. previous_bytes, bytes_mismatch, http_error, network y timeout siguen abortando como INCONCLUSIVE; executeCompleted permanece false y failures identifica 03E1-OWN-UPDATE.
- Cleanup comprueba primero ausencia, omite borrados ya resueltos y conserva pendientes reales; incertidumbre de mutacion sigue bloqueando exito aun tras observar ausencia. Un fallo local previo al envio no inventa una escritura incierta. No hay retry recursivo ni retry oculto al salir tras un cleanup ya intentado.
- Eventos ERROR/DIAGNOSTIC con vocabulario cerrado: fase, operacion, reason, status, codigo publico permitido, timeout, actor A/B/anon, fixture A/B/cross/anon y tracking. Sin cuerpos, claves, JWT, headers, UUID completos, paths completos ni URLs firmadas. SUMMARY agrega failures y sustituye identificadores por etiquetas/runTag abreviado.

Ejemplo de diagnostico si persiste una lectura anterior (ilustrativo, no observado live):

```json
{"caseId":"ERROR","phase":"execute","operation":"verify_bytes","reason":"previous_bytes","status":200,"timeout":false,"actor":"A","fixture":"A","tracking":"pending_delete","failedCase":"03E1-OWN-UPDATE"}
```

El PUT tiene su propio DIAGNOSTIC con operation=update y status; un timeout lleva reason=timeout, timeout=true y tracking=write_uncertain. Cleanup pendiente informa verify_absence/object_present o el fallo de list/read/delete y la etiqueta afectada. Nunca se imprime el error bruto del proveedor.

Las ocho regresiones offline adicionales cubren cache, bytes viejos persistentes, respuesta HTTP/contenido/lectura fallidos, timeout PUT, timeout DELETE, cleanup parcial/repetido, objeto ausente y fallo local previo al envio, y sanitizacion de eventos/SUMMARY. Se mantienen los 20 casos live y todas las pruebas B/anon: no se omiten para obtener PASS. Los controles offline originales tambien siguen pasando; total final 25, sin sumar ejecuciones repetidas.

## Rerun definitivo y cierre 03E1

Evidencia live aportada por el usuario desde el ambiente exclusivo `educativo-backend-test`, con A/B sinteticos, distintos y exclusivos. No fue ejecutada ni consultada por el agente. Resultado definitivo: prepared=true, executeCompleted=true, cleanupCompleted=true, pass=20, fail=0, inconclusive=0, commandErrors=0, fixturesPending=[], uncertainPending=[], failures=[], commandsCompleted=["prepare","execute","cleanup"], successful=true y exit code=0.

La cobertura live aprobo upload propio A/B; lectura y listado propios; firma y consumo de URL propia; update propio con status 200 y verificacion exacta `bytes_match`; negativas B para leer, descubrir, firmar, sobrescribir y eliminar A; negativa A al subir bajo prefijo B; negativas anon para lectura directa/publica, listado, upload, firma, update y delete; y cleanup completo. Los status 400 observados durante verify_absence fueron clasificados por el verificador como ausencia confirmada, no como errores. Cleanup confirmo ausencia de todos los objetos y no quedaron fixtures ni estados inciertos.

La primera corrida permanece registrada arriba como incidente del harness: seis PASS, OWN-UPDATE INCONCLUSIVE, cuatro command errors, execute incompleto, cleanup finalmente completo y cero pendientes. La correccion offline de cache/observabilidad/cleanup fue seguida por este rerun concluyente; no existe evidencia de una vulnerabilidad Storage derivada del primer intento y sus seis PASS no se suman al resultado definitivo.

03E1 queda **validado exclusivamente en test**. Produccion permanece intacta. No se modificaron policies, bucket, Auth, frontend, backend funcional ni B4. Esta sesion de cierre solo incorpora evidencia documental y repite validaciones offline.

## Limites preservados y siguiente paso

La prueba acredita aislamiento por el primer segmento `userId` de `userId/planeacionId/momento/...`. Storage por si solo no valida que `planeacionId` pertenezca al mismo usuario; esa relacion corresponde al backend/base de datos y no forma parte de los 20 PASS. Tampoco se cierran aqui los riesgos de objetos huerfanos por operaciones no atomicas ni el caracter bearer de las URLs firmadas durante su TTL. Son limites conocidos, no bloqueantes del cierre 03E1 y no autorizan correcciones incidentales.

Siguiente paso documental de Fase 03: **03E2 — estado de navegador/logout**, en un paquete separado. No se inicia ni diseña en esta sesion. Produccion, frontend, Auth y B4 permanecen fuera de alcance; todo queda sin stage ni commit.
