# Educativo IA — auditoría de aislamiento 03A

Fecha: 2026-10-07; estado actualizado el 2026-10-18. Fases 00–02 cerradas según handoff y [cierre 02E/02F](ENVIRONMENT_SCHEMA_READINESS.md). **03A completada y validada; commit `4b8de11`. 03B completada y validada; commit `5a901fb`. 03C completada y validada; commit `fac93a2`. 03D1 completada y validada mediante metadata read-only en Supabase test. 03D2A y 03D2B completadas con vulnerabilidades relacionales confirmadas y fixtures completamente limpiados. Fase 03 sigue abierta.** 03D2C, hardening 03D3, Storage y estado del navegador continúan pendientes para 03D–03F.

03D2B completó 72 casos reales sobre anexos, listas de cotejo y exámenes: 60 PASS y 12 FAIL de integridad relacional, sin inconclusos, errores ni residuos. La primera corrida parcial se recuperó por completo antes de la definitiva. Biblioteca sigue siendo el único flujo visual principal; las unidades fueron precondiciones externas read-only y la jerarquía visual permanece retirada y congelada. La corrección de propietario común pasa a 03D3.

## Puerta y límites de evidencia

| Repositorio | Rama | HEAD real | status inicial | origin/main...HEAD tras fetch |
| --- | --- | --- | --- | --- |
| frontend | work/features | 63ade6e34f302fce6e299c46da5cfdcfdd327858 | limpio | 0 0 |
| backend | work/features | a3a608bbe79fb51d55e6931bed1d04dfae5f3c7e | limpio | 0 0 |

En ambos se ejecutaron primero `git status --short`, `git branch --show-current`, `git log -3 --oneline`, `git fetch origin`, `git rev-list --left-right --count origin/main...HEAD`, todos exit 0. Primer contador: commits de origin/main ausentes en HEAD; segundo: commits de HEAD ausentes en origin/main. HEAD coincide con las referencias históricas; no hay alcance posterior por mezclar. No se creó commit de 03A.

Clasificación usada en este documento y sus anexos:

- **A**: comprobado por lectura del código o SQL versionado. SQL versionado no es esquema live.
- **B**: metadatos actuales de test. 03D1 confirmó live, mediante 17 consultas read-only, existencia/RLS, policies públicas, grants, constraints, triggers, funciones, conteos e integridad agregada. Esta evidencia catalogal no equivale a pruebas funcionales A/B/anon ni ejecuta la matriz.
- **C**: ejecución real del harness acotado sobre planteles: 11/11 comprobaciones PASS en Supabase test y API local, con aislamiento de lectura por ID/listado, rechazo anónimo API y ausencia de efectos; fixtures eliminados y cero residuos conocidos.
- **D**: hipótesis, explotación, permisos efectivos, estado remoto o validación manual pendientes.

Durante la preparación inicial del agente no se dispuso de conexión autorizada de metadatos Supabase ni de credenciales A/B suministradas al proceso. No se buscaron en archivos ignorados, historial, logs ni sesiones. `scripts/check-environment.js` fue leído: su salida es acotada, pero importa runtime que carga `.env`; el agente no lo ejecutó para conservar la prohibición de lectura. La ejecución conectada posterior fue realizada por el operador con metadatos test y API local confirmados como precondiciones.

## Fuentes e instrucciones

Leídos AGENTS.md y README de ambos repositorios, package.json y convenciones/pruebas existentes. No se encontraron AGENTS.md descendientes ni en los tres directorios ancestros inspeccionados del workspace. Frontend: docs/ARCHITECTURE.md, FRONTEND_MAP.md, TESTING.md; APIs por dominio, Auth, owners de Biblioteca, generación/polling, Archivados, estado persistente y Storage en Detalle. Backend: docs/03-backend-guide.md, DATABASE_SCHEMA.md; secciones pertinentes de AI_GENERATION_CONTRACTS.md, PRODUCT_PLANS_CONSUMPTION.md, ENVIRONMENT_SCHEMA_READINESS.md, test-environment/{README,SOURCE_MANIFEST,STORAGE_AUTH_READINESS}.md, diagnostics/README.md y observability/{LOG_CONVENTIONS,LOG_AUDIT}.md. Rutas, seis controllers, middleware, clientes y consultas/validaciones de los servicios del inventario fueron inspeccionados.

SQL revisado como fuente estática: test-environment/initialize_application.sql (definiciones, relaciones, funciones, RLS, policies), verify_initialization_readonly.sql, verify_storage_bucket_readonly.sql y diagnostics/supabase_metadata_readonly.sql. No hay historial de migraciones equivalente: el inicializador es reproducción inicial, no una migración a repetir. No fue ejecutado.

Backend AGENTS.md, «Fuentes de verdad»: “Si faltan migraciones o un documento contradice la implementación, declarar la limitación y detener cualquier cambio contractual.” Frontend AGENTS.md exige detener el cambio ante contradicciones. Esta sesión registra las discrepancias y **no realiza cambios contractuales**: mantiene el alcance expresamente autorizado de auditoría/pruebas/documentación.

## Contratos y ownership

`src/routes/index.js` monta seis routers bajo `/api`; las 59 rutas privadas inventariadas tienen requireAuth. Este valida el Bearer mediante admin.auth.getUser y entrega req.user.id/accessToken. Los seis controllers construyen createUserClient(accessToken). Jerarquía omite user_id al insertar: depende del default auth.uid() y RLS de la base, no del body. Los demás servicios reciben userId de req.user.id; muchos filtros son condicionales.

Fuente completa por operación: [inventario](ISOLATION_03A_INVENTORY.md). Los nombres de función allí son owners técnicos reales, no asignaciones a personas. Transporte frontend en js/api; servicios de sesión/adaptación en js/services; Biblioteca usa biblioteca-loader.js y biblioteca.page.js, Quick Create usa jerarquia.service.js; owners de documentos en js/features; Detalle posee edición/Storage; Archivados consume archivo/restauración y registro local. Se preservan scripts clásicos, explorerState, Word, SSE, polling, retries, generación parcial y los IDs históricos protegidos.

## Hallazgos priorizados

| ID / prioridad | Evidencia mínima A | Impacto y límite | Capa / sesión propuesta |
| --- | --- | --- | --- |
| H01 / alta | planeaciones.service.js:835–865: safeUpdate copia update; solo borra user_id; controller:118 pasa req.body | Campos como id, batch_id, tema_id, status, is_archived, fechas llegan a UPDATE. Filtro user_id protege fila seleccionada, no whitelist de atributos ni todas sus relaciones. Explotación y constraints efectivos D. | API/DB; 03B |
| H02 / alta | 03C: allowlist/UUID; job `pending`; compensación segura; batch, selección y cardinalidad completas; worker revalida autoridad antes de IA y antes del INSERT final | Mitigado en aplicación con 39/39 pruebas offline y polling A/B/anon real aprobado. La ventana transaccional residual pasa a 03D. | API/worker/DB; 03C validada, 03D atomicidad |
| H03 / alta | 03B eliminó fallback en update de planeaciones; 03C eliminó `getClient` de todas las operaciones HTTP del módulo exámenes. Persisten fallbacks en anexos, listas, biblioteca y otras cadenas no autorizadas aquí. | Mitigado solo en 03B/03C. No se afirma cierre global ni bypass HTTP demostrado en los módulos restantes. | Servicios; continuar según alcance posterior |
| H04 / alta | planeaciones.service.js:1144–1199 crea/reutiliza batches con admin fuera de métricas/workers | Admin en generación de planeaciones, fuera de la cadena de exámenes autorizada en 03C. Reuso explícito filtra id+user_id, pero no exige unidad coincidente. | Servicio/batches de planeaciones; sesión posterior |
| H05 / alta | 03D1 confirmó 41 FK y triggers ownership solo grado→plantel, materia→grado, tema→unidad, planeación→tema; integridad agregada actual sin mismatches | Propietario de fila no implica propietario de cada FK. El estado puntual limpio no impide asociaciones futuras ajenas. Metadata live B; explotación D pendiente. | Supabase directo; probar en 03D2 y endurecer en 03D3 |
| H06 / alta | 03C exige que todos los `planeacion_ids` sean visibles para el usuario y que sus batches no se mezclen ni contradigan `batch_id`; ya no cae silenciosamente a todos los temas en esa selección | Mitigado para exámenes con pruebas offline. La cadena de listas de cotejo permanece pendiente y fuera de 03C. | Exámenes 03C; listas en sesión posterior |
| H07 / alta | 03D1 confirmó grants efectivos amplios, incluido CRUD técnico, TRUNCATE/REFERENCES/TRIGGER en 17 tablas, UPDATE de secuencia y EXECUTE general de funciones | Confianza ciega mitigada en aplicación, pero mínimo privilegio DB no está cerrado. PostgREST/explotabilidad no demostrados; carrera y atomicidad siguen pendientes. | Probar límites en 03D2; grants/atomicidad en 03D3 |
| H08 / media | detalle.page.js:301–327 arma userId/planeacionId/momento; SQL:925–931 verifica bucket+segmento 1. planeaciones.service.js:754–798 valida metadata pero no vincula path con usuario/planeación | Aislamiento de usuario distinto de integridad relacional. Segmento 2 ajeno/inexistente podría aceptarse con prefijo propio; objetos huérfanos y referencias inconsistentes. Firmas son credenciales temporales, nunca evidencia publicable. | Storage/API; 03E |
| H09 / media | frontend planeaciones.service.js:1,215–235 usa educativo.archivedHierarchy.registry; auth.service.js SIGNED_OUT redirige sin separar/borrar registro | Metadata de Archivados persiste entre identidades del mismo navegador. Impacto visual/filtración local D; no demuestra bypass backend. | Navegador; 03F |
| H10 / media | jerarquia.service.js elimina descendientes en pasos; biblioteca.service.js:225–281 borra cinco tablas secuencialmente; no cleanup Storage en esos servicios | Fallo parcial y objetos huérfanos. RLS/FK puede causar efectos indirectos; comprobar before/after, no solo status. | API/DB/Storage; 03D–03E |
| H11 / revisión | SQL user_profiles es distinto de profiles; trigger handle_new_user solo crea profiles + user_settings; user_profiles permite update propio | No confiar en role/is_test_user como autoridad comercial ni como prueba automática de identidad sintética. No implementar perfiles/planes aquí. | DB; revisión posterior, fuera de implementación 03A |

Discrepancias documentales registradas sin corregir comportamiento: README llama soft a DELETE /planeaciones/:id, pero eliminarPlaneacion ejecuta DELETE físico; README no enumera todos los PATCH de jerarquía. La documentación legacy menciona ia_metrics; inicializador contiene ia_metrics_legacy y el código sigue escribiendo ia_metrics. No se corrigen métricas incidentalmente.

Excepciones admin: requireAuth valida token (no suplanta usuario); aiMetrics usa admin para jobs/calls/precios; worker exámenes usa admin para job/items y examen; helpers de batches usan admin en flujo de generación; cinco getClient tienen fallback admin; alias histórico `supabase = supabaseAdmin` sigue exportado. No se cambiaron privilegios ni alias.

## Metadatos pendientes y SQL de lectura

Rafael debe seleccionar visualmente **educativo-backend-test / gwdtlbisykzzplgzczzq** antes de cualquier consulta. Reutilizar [postflight](test-environment/verify_initialization_readonly.sql) y [bucket](test-environment/verify_storage_bucket_readonly.sql). Para propiedad y permisos revisar bloques 01/02/04/05/06/08 de [inventario SQL](diagnostics/supabase_metadata_readonly.sql): columnas/defaults, FK/checks, RLS/policies, triggers, grants y funciones. Son SELECT de metadatos; no ejecutar los textos de definiciones devueltos ni el inicializador. Fecha/proyecto, conteos, diferencias y SQLSTATE sanitizado son evidencia; no filas de usuarios ni contenido docente. No basta reconfirmar solo el total 57: revisar condiciones, roles y grants.

Revisión requerida antes de escrituras del harness: planteles UUID/PK, nombre, owner auth.users, defaults/timestamps, RLS CRUD propio; FK entrantes de grados/batches/exámenes/jobs y acciones; triggers sin efectos externos. No concurrencia sobre fixtures ni terceros que puedan vincularlos. Los guards no pueden certificar configuración de un servidor que solo expone health genérico: operador verifica backend test con validador y Network. La confirmación requerida por proceso documenta esa precondición, no demuestra metadatos automáticamente.

Potencial SQL posterior, **no aplicado**: migraciones revisadas para integridad de ownership de FK faltantes, privilegios de escritura en jobs/métricas y policies Storage por relación; revisar datos incompatibles antes de constraints. No usar service role para sortear tests. Mantener planeaciones_user_id_fkey NO ACTION; no asumir cascada completa. Grants amplios del inicializador deben revisarse por separado, sin intentar TRUNCATE/TRIGGER ni DDL adversarial.

## Matriz, harness y resultados

[Matriz completa CSV](ISOLATION_03A_MATRIX.csv), [contratos y fixtures de matriz](ISOLATION_03A_MATRIX.md), [uso seguro y procedimiento manual](ISOLATION_03A_HARNESS.md). La matriz distingue API de Supabase directo; no equipara rechazo API a RLS. El harness solo implementa preparación de 2 planteles, 11 comprobaciones de lectura/ausencia de cambios y limpieza explícita; el resto es diseño pendiente, no cobertura ejecutable atribuida.

| Comando ejecutado | Resultado |
| --- | --- |
| backend: node --test tests/isolation/guards.test.js | 45/45 PASS tras correcciones de resultado/recuperación/cleanup y diagnóstico seguro Auth/transporte, transporte falso en memoria, sin RLS real |
| backend: node --experimental-vm-modules --test tests/environment.test.js tests/client-configuration.test.js | 36/36 PASS; warning esperado de VM experimental |
| frontend: node --test tests/environment-config.cjs | 28/28 PASS, hosts simulados, sin conexión productiva |
| frontend: npm test -- --runInBand | exit 1 antes de ejecutar suites: jest no reconocido; dependencia ausente en checkout; no fallo funcional demostrado |

`npm test` backend es placeholder declarado, no suite real; no se cuenta como cobertura. No se instalaron dependencias. Sintaxis, enlaces y comprobaciones Git se registran al cierre de sesión.

Validaciones adicionales ejecutadas: `node --check` sobre los tres JS nuevos, parser PowerShell sobre start-local.ps1 (sin ejecutarlo), enlaces relativos de los documentos 03A resueltos, CSV con 310 filas/0 IDs duplicados/0 resultados distintos de NO EJECUTADO. Un intento de búsqueda rg con glob literal de PowerShell falló y fue repetido correctamente contra el directorio; no afectó la puerta Git ni las pruebas.

La validación real anon/A/B queda **APROBADA únicamente para el subconjunto de planteles implementado por el harness**. No acredita la matriz CSV de 310 casos, relaciones, escrituras adversariales adicionales, jobs, Storage, navegador, paginación completa ni otros recursos. Generación permaneció excluida.

Ejecución manual inconclusa comunicada el 2026-10-08: runId `b52d583f-4918-4223-911a-5cde25cccdbc`; cuatro errores de comando durante `prepare`, antes del primer POST. Se observaron cero `UNCERTAIN`, cero `CREATED`, `fixturesPending=[]` y `uncertainPending=[]`. Por ello no hay escrituras ni residuos conocidos de esa ejecución. La causa segura no pudo distinguirse con la salida anterior; el diagnóstico allowlisted posterior queda preparado, pero no se ejecutó remotamente en esta corrección. No se registran UUID de usuarios, tokens ni claves.

Ejecución posterior aprobada, comunicada el 2026-10-10: runId `ca11685d-5e72-4b16-a92c-4fff42ec1a35`. El operador confirmó los metadatos test y la API local como precondiciones. `prepare` creó y confirmó un plantel sintético por A y B con HTTP 201, sin diagnósticos ni errores. `execute` completó 6/6 lecturas directas por ID, 3/3 listados API y 2/2 comprobaciones de ausencia de efectos: **11 PASS, 0 FAIL, 0 INCONCLUSIVE**. El anónimo obtuvo HTTP 401 con el contrato esperado en la API; en acceso directo no observó ninguno de los dos planteles. `cleanup` eliminó ambos fixtures con HTTP 204. Resumen: `commandsCompleted=["prepare","execute","cleanup"]`, `commandErrors=0`, `prepared=true`, `executeCompleted=true`, `fixturesPending=[]`, `uncertainPending=[]`, `successful=true`. No quedan residuos conocidos. No se documentan UUID de usuarios o fixtures, credenciales, headers ni URLs de sesión.

Cierre documental 03B comunicado el 2026-10-12: 46/46 pruebas offline y 36/36 pruebas de configuración aprobadas; cuatro casos manuales reales PASS sobre `PUT /api/planeaciones/:id`: edición propia persistida y posteriormente restaurada, rechazo HTTP 400 de `user_id`, rechazo HTTP 404 de edición cruzada y rechazo HTTP 401 sin Bearer. Cada rechazo conservó la planeación sin cambios. El contenido original fue restaurado exactamente, no quedaron residuos conocidos, no hubo generación/OpenAI y solo se observaron destinos locales, CDN pública y el proyecto Supabase test. La matriz registra esos cuatro caseIds con evidencia manual real y conserva dos casos relacionales únicamente con evidencia simulada. Los otros 304 casos del CSV continúan NO EJECUTADOS.

03C cerró su alcance el 2026-10-13 con 39/39 pruebas de autoridad y 22/22 del harness de polling offline. La ejecución manual local/test obtuvo cinco comprobaciones PASS: polling propio 200, cruzado 404, inexistente 404, anónimo 401 y ausencia de efectos. El job terminal fue eliminado tras observar y resolver `delete_unverified`; ledger vacío y cero residuos conocidos. No hubo POST de generación, worker, OpenAI ni tráfico productivo. El CSV queda con siete casos manuales reales, tres únicamente simulados y 300 NO EJECUTADOS.

## Secuencia de correcciones propuesta

1. **03B**: completada y validada mediante pruebas automáticas y cuatro casos manuales reales. La edición de planeaciones queda limitada a `tabla_ia`, exige cliente/identidad de usuario y rechaza campos desconocidos, de sistema y relacionales. Ver [contrato 03B](ISOLATION_03B.md).
2. **03C**: completada y validada en su alcance de aplicación y polling local/test. Exámenes/jobs exigen cliente de usuario, batch propio y selección completa; el worker admin revalida job, propietario y relaciones antes de IA. Listas y excepciones admin ajenas a esta cadena permanecen fuera del cierre 03C. Ver [contrato 03C](ISOLATION_03C.md).
3. **03D1**: completada mediante 17 consultas read-only en test; confirmó metadata, grants amplios e integridad agregada puntual. No ejecuta los 310 casos ni sustituye 03D2. Ver [auditoría 03D1](ISOLATION_03D1.md).
3. **03D**: confirmar metadatos y ejecutar A/B/anon directo; migraciones de ownership/grants solo tras revisión (H05/H07/H10). Probar cascadas y fallos parciales con fixtures aislados. Depende de contratos acordados en 03B/C.
4. **03E**: integridad Storage/planeación, upload/update/delete, huérfanos y ciclo de firmas (H08/H10). Depende de relaciones y orden de borrado de 03D; sin alterar TTL incidentalmente.
5. **03F**: separar estado del navegador, logout/cambio A→B, regresión Biblioteca/Archivados y cierre de matriz (H09). Consolidar evidencia real de API/RLS/navegador; no declarar Fase 03 completa antes.

Decisiones abiertas: whitelist de edición, si el batch explícito incompatible debe rechazarse, selección parcial versus rechazo, control de escrituras directas de jobs y política de integridad del segundo segmento Storage. Revisar autorización y compatibilidad antes de cada corrección. Perfil, planes, cuotas, cuenta, pagos y métricas legacy no se implementan en esas sesiones por inferencia.

## Archivos y cierre de alcance

Backend: un enlace de seguimiento en ENVIRONMENT_SCHEMA_READINESS.md; cinco documentos nuevos ISOLATION_03A* (auditoría, inventario, matriz CSV, explicación/fixtures y guía); cuatro utilidades/pruebas nuevas en tests/isolation (harness.js, run.js, guards.test.js, start-local.ps1). Frontend sin modificaciones. Todo permanece sin stage. `git diff --stat` no incluye los nueve archivos nuevos no rastreados; contabilizarlos además de las dos líneas del enlace. No hay cambios en package.json, src, schema, policies, funciones, configuración remota ni comportamiento funcional.

Confirmaciones de ejecución 03A: no se probaron destinos productivos; no se invocó OpenAI; no se leyeron ni modificaron backend/.env ni frontend/js/core/config.local.js; no se cambiaron servicios remotos ni se hizo stage, commit, push, PR, merge o despliegue. Los únicos accesos remotos fueron los fetch Git exigidos por la puerta. No hay residuos remotos de esta sesión. El cierre Git incluye diff --check, diff --stat, diff --cached --stat y status --short en ambos repositorios; resultado detallado entregado en el reporte final.
