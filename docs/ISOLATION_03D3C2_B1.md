# 03D3C2-B1 - DML authenticated por tabla

Fecha: 2026-10-27. Estado: **auditoria y preflight read-only preparados offline; B1 no aplicado**. B0-current fue cerrado en test por el commit `bbe9dc3b571399552f1d7b326f732d7d304133a9` (`fix(security): revoke unnecessary runtime grants`). Produccion permanece intacta; 03D3C2, 03D3C y Fase 03 siguen abiertas.

El commit de esta auditoria es `cb4d01bad40fc92a555a7c352afeab4ba3c621c8`. El [diseno B1-C2](ISOLATION_03D3C2_B1_C2_DESIGN.md) confirma las ocho dependencias test-only y recomienda un runner/recovery administrativo local, exclusivo de test y separado del runtime antes de cualquier revocacion. La validacion conectada B1-C2 sigue pendiente.

El [paquete de runner/recovery](ISOLATION_03D3C2_B1_C2_RUNNER.md) implementa esa separacion solo bajo tests y permanece sin ejecucion conectada. Los ocho grants siguen presentes; no existe migracion B1.

Biblioteca sigue siendo el flujo visual principal; Archivados permanece independiente y la jerarquia se conserva como dependencia congelada. Esta auditoria no cambia grants, policies, RLS, secuencias, defaults, funciones, triggers, constraints, datos ni codigo funcional.

## Metodo y clasificacion

Se cruzaron routes, controllers, services, clientes Supabase, worker, frontend y harnesses/recovery con el inicializador versionado y la evidencia live de 03D3C2A/B0. El frontend no llama tablas `public` directamente: usa la API backend; sus accesos Supabase directos son Auth y Storage, fuera de B1.

- `KEEP`: consumidor authenticated productivo demostrado.
- `TEST_ONLY_DEPENDENCY`: sin consumidor productivo authenticated; harness/recovery necesita hoy el grant.
- `DECISION_REQUIRED`: superficie B4 o contrato de producto/retencion no resuelto.
- `NOT_GRANTED`: authenticated no tiene el grant posterior a B0.
- `REVOKE_CANDIDATE`: reservado a una revocacion C1 inequívoca. El inventario actual contiene cero.

## Matriz 19 tablas x 4 DML

Las 17 tablas target de B0 conservan SELECT/INSERT/UPDATE/DELETE para authenticated. `ai_model_prices` conserva solo SELECT y `ia_metrics_legacy` ninguno.

| Tabla | SELECT | INSERT | UPDATE | DELETE | Consumidor/owner |
|---|---|---|---|---|---|
| `ai_generation_calls` | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | solo `supabaseAdmin` en `aiMetrics.service.js`; B4 |
| `ai_generation_jobs` | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | solo `supabaseAdmin` en metricas; B4 |
| `ai_model_prices` | DECISION_REQUIRED | NOT_GRANTED | NOT_GRANTED | NOT_GRANTED | SELECT real usa admin; decision B4 |
| `anexos` | KEEP | KEEP | KEEP | KEEP | API authenticated: generacion, regeneracion, lecturas y delete |
| `examen_generation_items` | KEEP | KEEP | TEST_ONLY_DEPENDENCY | TEST_ONLY_DEPENDENCY | prepare/polling S/I; worker admin U; harness/recovery U/D |
| `examen_generation_jobs` | KEEP | KEEP | KEEP | TEST_ONLY_DEPENDENCY | prepare I/U, polling S; harness/recovery D |
| `examenes` | KEEP | TEST_ONLY_DEPENDENCY | TEST_ONLY_DEPENDENCY | KEEP | API/Biblioteca S/D; worker admin I/U; harness I/U |
| `grados` | KEEP | KEEP | KEEP | KEEP | endpoints authenticated de dependencia jerarquica congelada |
| `ia_metrics_legacy` | NOT_GRANTED | NOT_GRANTED | NOT_GRANTED | NOT_GRANTED | sin grant ni consumidor actual |
| `listas_cotejo` | KEEP | KEEP | KEEP | KEEP | API authenticated de recurso derivado |
| `materias` | KEEP | KEEP | KEEP | KEEP | endpoints authenticated de dependencia jerarquica congelada |
| `planeacion_batches` | KEEP | TEST_ONLY_DEPENDENCY | TEST_ONLY_DEPENDENCY | KEEP | Biblioteca S/D; generacion crea con admin; harness I/U |
| `planeaciones` | KEEP | KEEP | KEEP | KEEP | Biblioteca, Archivados, Quick Create y generacion |
| `planteles` | KEEP | KEEP | KEEP | KEEP | endpoints authenticated de dependencia jerarquica congelada |
| `profiles` | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | trigger Auth y verificador 03D3C1; contrato de cuenta B4 |
| `temas` | KEEP | KEEP | TEST_ONLY_DEPENDENCY | KEEP | Quick Create/recursos S/I/D; ownership harness U |
| `unidades` | KEEP | KEEP | KEEP | KEEP | Quick Create, jerarquia congelada y examenes |
| `user_profiles` | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | sin consumidor productivo versionado; retencion B4 |
| `user_settings` | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | DECISION_REQUIRED | trigger Auth y verificador 03D3C1; contrato de cuenta B4 |

Totales: 40 `KEEP`, 8 `TEST_ONLY_DEPENDENCY`, 21 `DECISION_REQUIRED`, 7 `NOT_GRANTED` y 0 `REVOKE_CANDIDATE`. Las 29 operaciones no resueltas impiden preparar una migracion B1.

### Cobertura de policies por tabla

`S/I/U/D` indica que existe una policy para el comando; `ALL` cubre los cuatro. Todas salvo precios estan actualmente `TO PUBLIC`, sujeto a expresiones de owner; precios usa `TO authenticated`.

| Tabla | Policies que pueden habilitar DML authenticated |
|---|---|
| `ai_generation_calls` | S/I |
| `ai_generation_jobs` | S/I/U |
| `ai_model_prices` | S (`TO authenticated`, USING true) |
| `anexos` | S/I/U/D owner |
| `examen_generation_items` | S/I/U/D owner |
| `examen_generation_jobs` | S/I/U/D owner |
| `examenes` | S/I/U/D owner |
| `grados` | ALL owner |
| `ia_metrics_legacy` | ninguna |
| `listas_cotejo` | S/I/U/D owner |
| `materias` | ALL owner |
| `planeacion_batches` | S/I/U/D owner |
| `planeaciones` | S/I/U/D owner y `ALL` owner redundante |
| `planteles` | ALL owner |
| `profiles` | S/I/U por `id=auth.uid()`; sin D |
| `temas` | ALL owner |
| `unidades` | ALL owner |
| `user_profiles` | S/I/U owner; sin D |
| `user_settings` | S/I/U owner; sin D |

## Policies y grants no equivalentes

Las 49 policies permanecen intactas. Una policy no acredita necesidad funcional y un grant sin policy no da por si solo acceso a filas. En particular, metrics, profiles/settings y user_profiles conservan decisiones de B4; items/jobs/examenes/batches/temas tienen grants que hoy sostienen reversibilidad de pruebas aunque no todos tengan consumidor productivo authenticated. B1 no cambia roles `TO PUBLIC`: eso pertenece a B3.

## Matriz endpoint o accion -> tabla -> operacion

| Endpoint/accion | Actor y cliente | Tabla/operacion | Ownership/policy | Si se retira | Evidencia actual / prueba futura |
|---|---|---|---|---|---|
| Biblioteca listar/detalle | usuario; `createUserClient` | batches, planeaciones, examenes, listas, anexos: SELECT | `user_id=auth.uid()` | rompe Biblioteca | 03D2A/B reales; regresion Biblioteca futura |
| Biblioteca borrar bloque | usuario; `createUserClient` | derivados, planeaciones, batch: DELETE; SELECT batch | owner RLS | rompe delete funcional | 03D2A/B; repetir por grant candidato |
| Archivados archive/restore | usuario; `createUserClient` | planeaciones: SELECT/UPDATE | owner RLS | rompe Archivados | servicios y pruebas de planeaciones |
| Quick Create/jerarquia congelada | usuario; `createUserClient` | planteles/grados/materias/unidades: S/I/U/D; temas S/I/D | policies owner + triggers | rompe Quick Create/dependencias | ownership 03D3C1; E2E 03F |
| Generar planeaciones | usuario + admin acotado | planeaciones I/S/U; batch I/S con admin | owner y constraints 03D3A | retirar planeaciones rompe generacion | 03D2A; generacion real fuera de esta sesion |
| Anexos | usuario; `createUserClient` | anexos S/I/U/D; planeaciones/temas S | owner RLS | rompe generar/regenerar/listar/delete | 03D2B y API |
| Listas de cotejo | usuario; `createUserClient` | listas S/I/U/D; planeaciones/temas S | owner RLS | rompe recurso derivado | 03D2B y API |
| Preparar examen | usuario; `createUserClient` | jobs I/S/U; items I; jerarquia/batch/planeaciones S | owner RLS + constraints | rompe prepare/compensacion | 03C polling; prueba futura sin OpenAI |
| Polling examen | usuario; `createUserClient` | jobs SELECT | owner RLS | rompe polling | 03C real/offline |
| Worker examen | interno; `supabaseAdmin` | jobs/items U/S; examenes I/U | filtros de autoridad, omite RLS | grant authenticated no gobierna worker | pruebas worker offline; fuera de B1 |
| Leer/eliminar examen | usuario; `createUserClient` | examenes SELECT/DELETE | owner RLS | rompe Biblioteca/API | 03D2B |
| Metricas IA | backend; `supabaseAdmin` | prices S; metric jobs S/I/U; calls I | autoridad admin | retirar authenticated no rompe consumidor observado | B4 decide superficie y retention |
| Provision Auth | trigger owner | profiles/settings INSERT | SECURITY DEFINER endurecida | grants authenticated no gobiernan trigger | 03D3C1 Auth real |
| Verificador cuenta 03D3C1 | prueba; authenticated | profiles/settings S/U | own policies | solo dependencia de prueba hoy | transferido B4; no justificar grant permanente |
| Harnesses/recovery | A/B authenticated | CRUD de fixtures | owner RLS, marcadores exactos | perder D/U impide cleanup/restauracion | adaptar antes de cualquier C2 |

Las rutas funcionales usan `requireAuth`; los controllers construyen `createUserClient(req.accessToken)`. Los fallbacks a admin de algunos services no convierten el flujo HTTP normal en admin. `aiMetrics.service.js` y el worker de examenes son las excepciones administrativas demostradas.

### Evidencia versionada de consumidores

- `src/routes/{biblioteca,planeaciones,anexos,listas_cotejo,examenes,jerarquia}.routes.js`: endpoints y `requireAuth`.
- `src/controllers/*.controller.js`: construccion de `createUserClient(req.accessToken)` para los flujos de usuario.
- `src/services/biblioteca.service.js`: SELECT de los cinco recursos y DELETE de bloque.
- `src/services/planeaciones.service.js`: CRUD de planeaciones; batches creados/reutilizados mediante `supabaseAdmin`.
- `src/services/anexos.service.js` y `listas_cotejo.service.js`: CRUD authenticated de derivados.
- `src/services/examenes.service.js`: prepare authenticated de jobs/items, polling authenticated y worker con `supabaseAdmin` para mutaciones terminales/examen.
- `src/services/jerarquia.service.js`: DML authenticated heredado que sostiene Quick Create y relaciones; no autoriza reactivar Explorer.
- `src/services/aiMetrics.service.js`: prices/jobs/calls exclusivamente con `supabaseAdmin`.
- `supabaseClient.js`: separacion entre `createUserClient` y `supabaseAdmin`.
- `frontend/js/api/*.api.js`: transporte a la API; la busqueda versionada no encontro `.from()` hacia tablas publicas. Los `.from()` directos del navegador pertenecen a Storage en Detalle.
- `tests/isolation/`: identifica por separado CRUD de fixtures, restauracion y cleanup; no se considera consumidor productivo.

## Dependencias exclusivas de pruebas

| Operacion | Dependencia | Opciones evaluadas, no implementadas |
|---|---|---|
| items UPDATE/DELETE | 03D2C y recovery | mantener temporalmente; rediseñar fixture; herramienta administrativa separada solo con autorizacion |
| jobs DELETE | 03D2C/recovery | mantener hasta ciclo funcional o cleanup autorizado |
| examenes INSERT/UPDATE | 03D2B/03D2C | no reemplazar por service role; evaluar fixture creado por flujo terminal seguro |
| batches INSERT/UPDATE | 03D2A/B | mantener mientras el harness necesite fixture directo; ruta funcional no se presume equivalente |
| temas UPDATE | ownership 03D3C1 | conservar hasta promocion/regresion o rediseñar prueba sin ampliar jerarquia |

Ninguna alternativa que amplie autoridad queda aprobada. El cleanup seguro prevalece sobre una revocacion prematura.

## Clasificacion final

- **B1-C1:** vacio. No hay revocacion inmediatamente ejecutable que carezca simultaneamente de consumidor, dependencia de pruebas y decision B4.
- **B1-C2:** ocho operaciones `TEST_ONLY_DEPENDENCY`; requieren adaptar y volver a validar cleanup/recovery.
- **B1-C3:** 21 operaciones de metrics, prices, profiles/settings y user_profiles; se transfieren a B4/03D3C3.
- **KEEP:** 40 operaciones productivas demostradas.
- **BLOCKED:** cualquier sustitucion por autoridad administrativa y cualquier revocacion que deje fixtures sin cleanup.
- **NOT_GRANTED:** siete celdas ya ausentes; se conservan como invariantes.

B2 conserva secuencia authenticated/service_role; B3 conserva policies; B0-defaults y B0-service-role siguen separados.

## Preflight read-only

El [preflight B1](test-environment/03d3c2_b1_authenticated_dml_preflight.sql) contiene cuatro sentencias:

1. matriz 19 x 4 de grants directos, efectivos/heredados, grantor, grant option y RLS;
2. 49 policies con roles convertidos elemento por elemento a `text`;
3. memberships directas/transitivas de anon/authenticated;
4. resumen fail-closed con 19 tablas, fingerprint de policies, 76 celdas, cero C1 y 29 decisiones abiertas.

Es exclusivamente catalogal/read-only y no devuelve datos de aplicacion. `apt_to_apply=false` es deliberado. No se preparan migracion, postverify ni rollback B1.

## Siguiente subpaquete recomendado

Preparar **B1-C2-design**, sin revocaciones: decidir el ciclo reversible para las ocho operaciones de pruebas y demostrar que cada harness puede crear, restaurar y limpiar sin service role. En paralelo, B4 debe resolver metrics/prices/profiles/legacy. Solo despues puede definirse un B1-C1 real.
