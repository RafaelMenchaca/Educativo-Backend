# 03D3C Scope - minimo privilegio, funciones y deuda tecnica

Fecha: 2026-10-21.

Estado: **03D3B y 03D3C1 completadas en Supabase test; 03D3C permanece abierta por 03D3C2 y 03D3C3; produccion pendiente; Fase 03 abierta.** Este documento conserva el alcance del hardening restante.

Biblioteca sigue siendo el unico flujo visual principal. Archivados permanece independiente. Planteles, grados, materias, unidades y temas son una capa relacional congelada: se preservan los contratos internos vigentes sin reintroducir Explorer ni crear funcionalidad jerarquica.

## Base de evidencia

- SQL versionado: `test-environment/initialize_application.sql`, paquete 03D1 y paquete 03D3A.
- Metadata live 03D1: 19 tablas publicas con RLS, 49 policies publicas, grants efectivos, una secuencia y seis funciones propias.
- 03D3B: 14 constraints aplicadas y verificadas solo en Supabase test; 140 PASS posteriores y cero residuos conocidos.
- Consumidores: controllers con cliente de usuario, servicios de Biblioteca/Archivados/generacion, worker de examenes y `aiMetrics.service.js`.

El frontend usa Supabase directamente solo para Auth y Storage. Las tablas publicas de aplicacion se alcanzan mediante la API backend. Los controllers privados crean un cliente con el token del usuario; por ello las operaciones backend de usuario se ejecutan con rol `authenticated`. `anon` no tiene consumidor de tablas publicas identificado.

La evidencia catalogal confirma privilegios, no una via HTTP para cada privilegio. RLS protege filas para DML sujeto a policies; no protege `TRUNCATE`. `REFERENCES` y `TRIGGER` son capacidades DDL y no forman parte de los contratos PostgREST del producto. Su presencia viola minimo privilegio aunque no se haya demostrado explotabilidad por HTTP.

## Grants de tablas: necesidad real

Estado live observado: `anon` y `authenticated` tienen DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE y UPDATE sobre 17 tablas; `authenticated` tiene ademas SELECT sobre `ai_model_prices`; `service_role` tiene los siete privilegios sobre las 19 tablas.

| Familia | Consumidor real | Minimo candidato para `authenticated` | `anon` | `service_role` | Decision |
| --- | --- | --- | --- | --- | --- |
| `planeacion_batches`, `planeaciones` | Biblioteca, Quick Create, Detalle, Archivados y generacion | SELECT/INSERT/UPDATE/DELETE segun rutas vigentes | ninguno | conservar DML mientras existan helpers/admin internos | C2: retirar primero privilegios DDL; reducir DML solo con matriz de endpoints |
| `anexos`, `listas_cotejo`, `examenes` | Biblioteca/Detalle y servicios de generacion | SELECT/INSERT/UPDATE/DELETE mientras las rutas actuales los usen | ninguno | conservar DML para generacion/worker | C2: mismo criterio, con regresion de Biblioteca |
| `planteles`, `grados`, `materias`, `unidades`, `temas` | Quick Create, contratos internos y Archivados | DML vigente de las rutas heredadas; no ampliar | ninguno | conservar temporalmente por servicios existentes | C2: inventario de metodos antes de reducir; no crear harness CRUD exhaustivo |
| `examen_generation_jobs` | prepare/polling con usuario; worker admin | SELECT, INSERT y UPDATE; DELETE no aparece en el flujo funcional | ninguno | SELECT/INSERT/UPDATE y operaciones del worker | C2: validar cleanup/recovery alternativo antes de retirar DELETE |
| `examen_generation_items` | prepare inserta con usuario; worker admin | INSERT; no se demostro necesidad funcional de SELECT/UPDATE/DELETE para usuario | ninguno | SELECT/INSERT/UPDATE/DELETE mientras worker/cleanup lo necesiten | C2: nueva prueba de contrato antes de reducir |
| `ai_generation_jobs`, `ai_generation_calls` | solo `aiMetrics.service.js` con admin | ninguno segun codigo actual | ninguno | jobs: SELECT/INSERT/UPDATE; calls: INSERT; DELETE solo para ciclo operativo por decidir | C2: no cambiar hasta definir prueba admin reversible y rollback |
| `ai_model_prices` | lectura cacheada con admin | ninguno segun codigo actual; SELECT authenticated no tiene consumidor | ninguno | SELECT | C2: confirmar decision de producto/datos de referencia |
| `profiles`, `user_settings` | trigger de alta Auth; sin UI/servicio directo | acceso propio solo si se conserva como contrato futuro; hoy no hay consumidor | ninguno | aprovisionamiento/soporte | C2: requiere prueba de alta Auth y decision de perfil |
| `user_profiles` | ninguno demostrado | ninguno | ninguno | solo si se conserva para administracion | C3: decidir retiro o contrato antes de tocar datos |
| `ia_metrics_legacy` | ninguno; codigo escribe a la tabla ausente `ia_metrics` | ninguno | ninguno | ninguno salvo mantenimiento | C3: resolver drift y retiro por separado |

Correccion transversal candidata C1: revocar `TRUNCATE`, `REFERENCES` y `TRIGGER` a `anon` y `authenticated` en las 17 tablas. No son necesarios para SELECT/INSERT/UPDATE/DELETE. Revocar todo acceso de tablas publicas a `anon` tambien es candidato C1 porque no existe consumidor; debe tener preflight y postverify exactos y una prueba anon negativa. La reduccion del DML de `authenticated` y `service_role` queda C2 porque puede romper rutas o procesos internos si se agrupa sin cobertura.

## Secuencia `planeaciones_id_seq`

03D1 confirmo SELECT, USAGE y UPDATE efectivos para `anon`, `authenticated` y `service_role`. `planeaciones.id` es identity BY DEFAULT.

- `anon`: no necesita privilegios.
- `authenticated`: el INSERT normal que omite `id` necesita `nextval`; USAGE es el minimo candidato. No se encontro uso de `currval` ni `setval`, por lo que SELECT y UPDATE no tienen consumidor identificado.
- `service_role`: algunos servicios insertan planeaciones y pueden omitir `id`; USAGE debe conservarse hasta terminar la auditoria de payloads. No se encontro uso de `setval`.

Reducir la secuencia es C2. `has_sequence_privilege` permite verificar ACL sin consumir valores, pero no prueba un INSERT identity legitimo. `nextval` no se revierte con rollback. Antes del cambio debe acordarse una prueba segura que acepte un hueco sintetico o una alternativa de integracion; un INSERT con ID explicito no prueba USAGE.

## Seis funciones propias

Todas tienen firma `public.nombre()`, lenguaje PL/pgSQL, owner `postgres` y EXECUTE efectivo para PUBLIC/anon/authenticated/service_role. Cinco son SECURITY INVOKER. Solo `handle_new_user()` es SECURITY DEFINER y 03D1 confirmo `proconfig` vacio.

| Funcion | Tipo y consumidor | Objetos referidos | Acceso minimo | Riesgo / cambio candidato | Clase |
| --- | --- | --- | --- | --- | --- |
| `handle_new_user()` | trigger-only, AFTER INSERT en `auth.users`; definer | `public.profiles`, `public.user_settings`, campos de `NEW` | owner/trigger; no RPC publica | fijar `search_path` con `ALTER FUNCTION`, no reemplazar cuerpo; revocar EXECUTE PUBLIC/anon/authenticated/service_role | C1 |
| `set_updated_at()` | trigger-only, BEFORE UPDATE en nueve tablas; invoker | `NEW.updated_at`, `now()` | owner/trigger | revocar EXECUTE publico; search_path fijo es defensa uniforme aunque no resuelve tablas | C1 |
| `enforce_grado_ownership()` | trigger-only; invoker | `public.planteles` | owner/trigger | revocar EXECUTE publico; conservar cuerpo y owner | C1 |
| `enforce_materia_ownership()` | trigger-only; invoker | `public.grados` | owner/trigger | igual | C1 |
| `enforce_tema_ownership()` | trigger-only; invoker | `public.unidades` | owner/trigger | igual | C1 |
| `enforce_planeacion_tema_ownership()` | trigger-only; invoker | `public.temas` | owner/trigger | igual | C1 |

No existe RPC o llamada JS a estas funciones. Revocar EXECUTE directo no debe desactivar triggers ya creados, pero debe confirmarse offline y mediante INSERT/UPDATE legitimos acotados en test. Para `handle_new_user`, la prueba completa requiere alta controlada de una cuenta sintetica Auth; si no se autoriza, el cambio de `search_path` puede verificarse catalogalmente y la regresion funcional queda como criterio de parada antes de produccion.

No usar `CREATE OR REPLACE` por defecto: podria cambiar cuerpo, atributos o introducir drift. El candidato minimo es `ALTER FUNCTION public.nombre() SET search_path ...` y REVOKE/GRANT exactos. Preflight debe verificar owner, firma, `prosecdef`, ACL, `proconfig`, trigger consumidor y hash/definicion esperada sin exponer cuerpos en resultados compartidos. Rollback restaura ACL y `proconfig` exactos observados.

## Policies tecnicas y metricas

| Tabla | Policy actual | Uso real | Delimitacion |
| --- | --- | --- | --- |
| `examen_generation_jobs` | SELECT/INSERT/UPDATE/DELETE propias, `TO PUBLIC` | usuario crea, compensa y consulta; worker admin procesa | `TO authenticated` es semantica mas precisa. Retirar DELETE y otros permisos requiere adaptar cleanup/recovery de pruebas y comprobar que ninguna ruta funcional los usa. C2. |
| `examen_generation_items` | SELECT/INSERT/UPDATE/DELETE propias, `TO PUBLIC` | usuario inserta; worker admin lee/actualiza | candidato a dejar solo INSERT para authenticated; requiere regresion del prepare, worker simulado y estrategia de fixtures. C2. |
| `ai_generation_jobs` | SELECT/INSERT/UPDATE propias, sin DELETE, `TO PUBLIC` | exclusivamente admin | el acceso de usuario no es necesario y no tiene ciclo reversible. Policies y grants deben retirarse juntos tras una prueba de compatibilidad admin. C2. |
| `ai_generation_calls` | SELECT/INSERT propias, sin UPDATE/DELETE, `TO PUBLIC` | exclusivamente admin | igual; no crear fixtures de usuario. C2. |
| `ai_model_prices` | SELECT `TO authenticated` | lectura admin con cache | decidir si precio es dato publico autenticado o interno. Sin decision, conservar. C3/C5 temporal. |

Cambiar `TO PUBLIC` a `TO authenticated` elimina a `anon`, pero no reduce operaciones de usuarios autenticados. Grants y policies son controles acumulativos: un grant sin policy no da filas bajo RLS; una policy sin grant tampoco da acceso. Cada paquete futuro debe verificar ambos y no declarar hardening por cambiar solo uno.

Las relaciones nullable de `ai_generation_jobs` hacia batch, planeacion, examen, lista y anexo no tienen FK versionada; `ai_generation_calls.job_id` tiene FK de existencia, pero no propietario comun. Como las escrituras normales son admin, no deben copiar automaticamente el patron A/B de 03D3A. Su integridad, retencion y cleanup necesitan primero un contrato de metricas. C2 si se conservan; C3 si el producto decide retirar el sistema.

## Perfiles, legacy y auxiliares

| Objeto | Clasificacion | Decision |
| --- | --- | --- |
| `profiles` | dependencia tecnica activa de aprovisionamiento; contiene PII | C2: conservar; definir consumidor futuro y probar alta Auth antes de reducir authenticated |
| `user_settings` | dependencia tecnica activa de aprovisionamiento, sin UI actual | C2: conservar; mismo criterio |
| `user_profiles` | legacy expuesta, cero filas live en 03D1, sin consumidor ni trigger | C3: decision destructiva/producto; no crear fixtures ni retirar aun |
| `ia_metrics_legacy` | candidata a retiro; existe live pero no tiene consumidor | C3: resolver junto con el write a `ia_metrics` ausente; no crear alias incidental |
| `ai_model_prices` | tabla tecnica de referencia activa por admin | C5 temporal para SELECT admin; C2/C3 para retirar SELECT authenticated segun decision de producto |

## Atomicidad y reconciliacion

03C redujo riesgos de autoridad, cardinalidad, compensacion y revalidacion, pero conserva timers in-process, ventana no atomica, posible pending residual si falla tambien la compensacion, ausencia de reconciliacion tras reinicio e idempotencia limitada.

Esto es C4: arquitectura operativa, no hardening de ACL. Debe transferirse a una fase de jobs/operacion con diseño de transaccion o RPC, outbox/cola durable, lease/reconciliador, retries acotados, observabilidad e idempotencia. La futura idempotencia comercial puede usar la misma clave tecnica, pero cuotas/pagos no pertenecen a 03D3C. No mezclar este rediseño con REVOKE o cambios de policy.

## Matriz de decisiones

| Objeto | Estado actual | Riesgo confirmado / explotabilidad | Cambio candidato | Compatibilidad y prueba | Rollback | Destino |
| --- | --- | --- | --- | --- | --- | --- |
| Grants DDL en 17 tablas | anon/auth tienen TRUNCATE/REFERENCES/TRIGGER | minimo privilegio violado; TRUNCATE no protegido por RLS; HTTP no demostrado | revocar esos tres privilegios | postverify ACL; smoke de DML vigente | regrant exacto | C1 / 03D3C2 |
| Grants `anon` de tablas | siete privilegios, sin consumidor | superficie confirmada; explotabilidad variable | REVOKE ALL en tablas publicas de app | anon negativo; Auth/API siguen iguales | grants exactos previos | C1 / 03D3C2 |
| DML `authenticated` activo | CRUD amplio | operaciones sobrantes probables | matriz por tabla, reduccion puntual | Biblioteca, Archivados, Quick Create, recursos y jobs | regrant puntual | C2 / 03D3C2 |
| DML `service_role` | siete privilegios en 19 tablas | amplitud confirmada, backend depende de admin | reducir solo tras mapa completo | tests de worker, metricas y helpers admin | regrant | C2 / futura 03D3C2 |
| `planeaciones_id_seq` | S/U/UPDATE para tres roles | UPDATE permite setval; sin abuso demostrado | anon none; auth/service USAGE | ACL + insercion identity acordada | restaurar ACL | C2 / 03D3C2 |
| `handle_new_user()` | definer, search_path vacio, EXECUTE PUBLIC | riesgo alto de resolucion; llamada directa no demostrada | SET search_path fijo y revocar execute | metadata + alta Auth sintetica antes de produccion | RESET/SET config y ACL previas | C1 / 03D3C1 |
| cinco trigger functions invoker | EXECUTE PUBLIC | privilegio directo innecesario | revocar execute; config uniforme opcional | CRUD legitimo que dispare triggers | ACL/config previas | C1 / 03D3C1 |
| policies `TO PUBLIC` generales | auth.uid limita filas | rol demasiado amplio, anon normalmente ve cero | cambiar a authenticated por paquetes | A/B/anon y operaciones propias | recrear roles previos | C2 / 03D3C2 |
| jobs/items de examen | CRUD directo mas amplio que app | superficie demostrada en 03D2C, relaciones ya corregidas | minimo funcional por tabla | 03C offline, polling y harness adaptado sin generar | policies/grants previos | C2 / 03D3C2 |
| jobs/calls metricos | policies de usuario; uso admin exclusivo | superficie confirmada, explotacion funcional no probada | retirar acceso user y definir retencion | tests admin mock + verificacion test sin fixtures residuales | restaurar policies/grants | C2 / 03D3C3 |
| relaciones metricas | nullable/sin owner comun general | integridad potencial; no explotada | contrato y constraints posteriores | preflight agregado y compatibilidad servicios | constraints separadas | C2/C3 / 03D3C3 |
| `ai_model_prices` | SELECT auth y admin | lectura auth sin consumidor; sensibilidad baja | conservar hasta decision de producto | cache/admin y decision de datos | grant/policy previos | C5 temporal |
| profiles/settings | S/I/U propias; trigger crea | PII/config; sin UI | aprovisionamiento Auth ya validado; cualquier reduccion requiere decision de consumidor | conservar regresion Auth y probar ACL/policies candidatas | ACL/policies previas | C2 / 03D3C3 |
| `user_profiles` | expuesta, sin consumidor | legacy confirmada; abuso no probado | retirar o eliminar solo con decision | inventario y aprobacion destructiva | plan de datos | C3 |
| `ia_metrics_legacy` / `ia_metrics` | tabla live distinta del nombre escrito | metricas perdidas o error tolerado | decision de consolidacion/retiro | observabilidad y datos | migracion de datos separada | C3 |
| timers/retries/reconciliacion | in-process/no durable | riesgo operativo residual confirmado por diseño | arquitectura durable | pruebas de reinicio/idempotencia | feature flags/rollback app | C4 fuera de 03D3C |
| constraints 03D3A | 14/14 test, 140 PASS | remediado solo en test | conservar; promocion controlada | preflight/postverify y regresion | rollback 03D3A | C5 en scope; promocion separada |

## Division recomendada

### 03D3C1 - funciones trigger y `search_path`

- Objetos: seis funciones y 16 triggers consumidores.
- Preflight: firma, owner, lenguaje, `prosecdef`, `proconfig`, ACL, trigger y definicion esperada.
- Cambio: `ALTER FUNCTION` con search_path fijo donde se apruebe; REVOKE EXECUTE directo innecesario. Sin `CREATE OR REPLACE` salvo drift documentado.
- Postverify: atributos y ACL exactos; triggers intactos.
- Pruebas completadas en test: validador SQL, CRUD propio que activa triggers y alta Auth sintetica para `handle_new_user`. Deben repetirse de forma controlada antes de produccion.
- Rollback: restaurar `proconfig` y ACL observadas, sin tocar cuerpos/triggers.
- Stop: firma/owner/body inesperado, trigger adicional, fallo de aprovisionamiento o CRUD.
- Biblioteca: ningun cambio esperado; regresion de creacion/edicion de sus recursos.

Historia del paquete [03D3C1](ISOLATION_03D3C1.md): la primera ejecucion fallo con `42883` por `name[] = text[]`. Tras corregir el cast, las sentencias 2–4 y todos los predicados estructurales de la sentencia 1 pasaron, pero los seis hashes LF no coincidian con `prosrc`. El analisis offline reprodujo los seis hashes live mediante una unica transformacion representacional CRLF. En ese momento no se aplico la migracion y se exigio repetir el preflight completo.

Estado final: el preflight completo fue aprobado, la migracion se aplico y el postverify confirmo 6/6 funciones y 16/16 triggers. Las regresiones 03D2A/B/C sumaron 140 PASS; el [harness runtime](ISOLATION_03D3C1_VALIDATION.md) agrego 22 PASS de ownership y siete PASS Auth contabilizados, con todos los cleanups verificados y cero residuos conocidos. Los dos intentos Auth previos quedaron como diagnosticos sin `RUN`/login y tambien con cleanup agregado verificado. **03D3C1 esta completada en test.** Rollback no ejecutado; 03D3C2 y 03D3C3 siguen pendientes.

### 03D3C2 - grants base, secuencia y policies tecnicas

- Primera entrega: revocar privilegios DDL a anon/auth y acceso de tablas publicas a anon.
- Segunda entrega, condicionada: minimo DML authenticated por tabla, secuencia y jobs/items.
- Preflight/postverify: ACL explicitas y efectivas, policies/roles, default privileges y secuencia.
- Pruebas: anon negativo; A/B propio/cruzado; Biblioteca, Archivados, Quick Create y polling. Sin generacion/OpenAI. Para identity se necesita un procedimiento acordado que reconozca la no transaccionalidad de secuencias.
- Rollback: GRANT y roles de policy exactos por objeto.
- Stop: consumer no inventariado, denegacion propia, diferencia entre test/versionado o cleanup inseguro.

### 03D3C3 - metricas, perfiles y legacy

- Metricas modernas: decidir retencion/ciclo admin y despues retirar policies/grants de usuario.
- `ai_model_prices`: decidir visibilidad authenticated.
- profiles/settings: conservar hasta prueba Auth y contrato.
- user_profiles/legacy: producir decision de producto/datos; ninguna eliminacion implicita.
- Relaciones metricas y drift `ia_metrics`: paquetes separados.
- Stop: no existe ciclo reversible, datos no inventariados o cambio destructivo sin aprobacion.

Esta division evita que el hardening seguro de funciones quede bloqueado por decisiones destructivas y evita mezclar ACL con reconciliacion de workers.

## Test primero, produccion despues

Cada paquete futuro debe incluir preflight read-only, migracion transaccional, postverify estructural y rollback separado. Se aplica primero en Supabase test. Antes de produccion se exige:

1. metadata test sin drift respecto al paquete;
2. pruebas propias/cruzadas/anon y regresion de consumidores afectados;
3. cleanup completo y cero residuos;
4. revision del rollback sin ejecutarlo automaticamente;
5. paquete compatible con PostgreSQL 15.8 y 17.6 o variantes documentadas;
6. inicializador actualizado junto con la migracion, sin reejecutarlo sobre ambientes existentes;
7. registro explicito de que test esta adelantado respecto a produccion.

PostgreSQL 15.8/17.6 comparten ALTER FUNCTION SET, REVOKE/GRANT y ALTER POLICY relevantes, pero el SQL final debe validarse offline y luego en test. La metadata live prevalece sobre el inicializador si difieren; cualquier drift detiene la aplicacion.

## Limites

Durante la sesion de scope no se conecto Supabase/API ni se ejecuto SQL. Con posterioridad, 03D3C1 fue aplicada solo en test conforme al paquete revisado. Produccion sigue sin las 14 constraints de 03D3A y sin 03D3C1; 03D3C2/03D3C3 siguen sin implementar.
