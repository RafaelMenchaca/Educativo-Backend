# 03D3C1 - funciones trigger y search_path

Fecha: 2026-11-08.

Estado: **03D3C1 completada en Supabase test. Preflight productivo aprobado el 2026-11-08; migracion, postverify y rollback productivos preparados pero no ejecutados. Fase 03 continua abierta.** 03D3A ya esta instalado y postverificado en produccion; 03D3C1 permanece pendiente de autorizacion y aplicacion.

## Objetivo y limites

El paquete propone un unico cambio de configuracion y seis revocaciones acotadas:

```sql
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;
```

y `REVOKE EXECUTE` sobre las seis funciones trigger para PUBLIC, anon, authenticated y service_role. No reemplaza cuerpos, no cambia owner, lenguaje, volatilidad, modo definer/invoker o triggers, y no toca tablas, datos, RLS, policies o grants de tablas.

Antes de aplicar, el preflight debia confirmar que el schema `public` no concedia CREATE a PUBLIC, anon o authenticated. Esa condicion fue aprobada en test. La regla de parada se conserva para cualquier promocion: si un destino difiere, no aplicar parcialmente y transferir la revocacion de CREATE a su paquete autorizado.

## Primera ejecucion del preflight y correccion de tipo

La primera ejecucion live de la sentencia de funciones/ACL termino antes de devolver filas con PostgreSQL `42883` (`name[] = text[]`). `pg_get_userbyid` devuelve `name`; el `CASE` que conserva `PUBLIC` adopto ese tipo y el `array_agg` produjo `name[]`, incompatible con el manifiesto `text[]` de cinco grantees.

El paquete versionado convierte ahora cada resultado del `CASE` a `text` dentro de `array_agg`, tanto en el elemento como en su ordenacion. Conserva `DISTINCT`, orden determinista, `PUBLIC` canonico y los cinco valores esperados. La auditoria de los cuatro SQL encontro una sola agregacion catalogal de nombres: `acl.execute_grantees`. `p.proconfig` ya es `text[]`; los restantes `proname`, `nspname`, `relname`, `tgname` y nombres asociados se usan como escalares y no forman arrays.

En esa primera ejecucion, el error pertenecio exclusivamente al preflight: no produjo evidencia live y no se ejecutaron migracion, postverify o rollback. La repeticion posterior con las correcciones queda registrada en el estado vigente al inicio y en la seccion de cierre live.

## Forense de fingerprints de cuerpos

Tras corregir el array ACL, la ejecucion estructural confirmo las seis firmas, atributos, ACL, 16 triggers, permisos CREATE del schema y dependencias de `handle_new_user`. Las sentencias 2–4 pasaron. En la sentencia 1, todos los predicados salvo `body_hash_matches` fueron verdaderos para las seis funciones; por ello el preflight siguio bloqueado y no se aplico la migracion.

Las definiciones fuente estan en [initialize_application.sql](test-environment/initialize_application.sql), usan `$function$` y contienen un newline inmediatamente despues del delimitador inicial y otro inmediatamente antes del final. El extractor excluye ambos delimitadores y conserva todo el contenido intermedio, incluidos esos dos newlines, whitespace interno, comentarios, strings, quoted identifiers y mayusculas/minusculas. No aplica `trim`. El texto se codifica como UTF-8 sin BOM y se calcula MD5.

Los hashes anteriores se obtuvieron con el cuerpo representado en LF. Los seis valores observados live se reproducen con una unica regla: convertir exclusivamente los line endings del mismo cuerpo a CRLF, conservar ambos newlines exteriores y calcular MD5 sobre sus bytes UTF-8. La herramienta prueba tambien contenido exacto, LF, CRLF, eliminacion aislada o conjunta de newlines exteriores y `trim`; ninguna variante de bordes explica los valores live. Esto clasifica el resultado como diferencia representacional, no como drift semantico demostrado.

| Funcion | Hash LF anterior | Hash CRLF observado y derivado |
| --- | --- | --- |
| `enforce_grado_ownership` | `dc407b2dbc927916b368e2b02acba144` | `f97d9b07b705d78bd7dbaf5c960c543c` |
| `enforce_materia_ownership` | `44b09477000b2ee89c8e3b97a8aab620` | `b50a030da78990d83a0d3549a12092b0` |
| `enforce_planeacion_tema_ownership` | `d014080b06560a18c188016a791a9366` | `0905147358485175b60fa446011e1e88` |
| `enforce_tema_ownership` | `06f919d570088e3f3153e48be9f9eafe` | `65fd6a9c4bc24803bf097347782c5cef` |
| `handle_new_user` | `58697aab06b589875e96c5b4333bb8c5` | `db4596f1ea835acc5d79e921e94c803a` |
| `set_updated_at` | `9b1889f56258bf9d6554213c05019c76` | `204b9b9355e61b7541bc0633bbc9294c` |

El validador deriva ahora los seis valores desde el SQL versionado y exige que preflight y postverify coincidan. Una constante editada sin que el cuerpo versionado produzca ese hash falla offline. La sentencia 1 devuelve `security_matches`, `kind_matches`, `signature_matches`, `expected_body_md5`, `observed_body_md5` y `body_hash_matches`, sin devolver `prosrc` ni definiciones.

En ese punto forense la evidencia estructural todavia no equivalia a un preflight aprobado. Posteriormente se repitieron las cuatro sentencias, se aprobo el preflight y se aplico la migracion; rollback permanece no ejecutado.

## Aplicacion y regresion live

La migracion fue aplicada manualmente en Supabase test y el postverify confirmo 6/6 funciones y 16/16 triggers coincidentes. Las regresiones posteriores fueron: 03D2A `359da931-5bb4-47ab-bfca-f365c548816b`, 42 PASS; 03D2B `e7905730-e8d6-4eab-9d7f-a37025b56c41`, 72 PASS; 03D2C `63347d26-133c-47f6-8f53-3f81059fa331`, 26 PASS. Los tres cleanups terminaron, los tres exit codes fueron cero y no quedan residuos conocidos.

Esta evidencia confirma continuidad de Biblioteca, derivados y jobs en el alcance ya cubierto. La [validacion runtime](ISOLATION_03D3C1_VALIDATION.md) registro ademas 22 PASS reales del harness de ownership, con los ocho cruces rechazados por `P0001`, cleanup completo y exit 0. Ownership queda completado. La ejecucion Auth definitiva aprobo `handle_new_user`, provision 1:1 de `profiles`/`user_settings`, sus dos triggers `updated_at`, signout y ausencia final agregada.

## Inventario exacto

El OID identifica el objeto dentro de una base concreta, pero no es evidencia estable entre ambientes. El paquete une por OID internamente y valida mediante schema, nombre y argumentos de identidad vacios.

Las seis funciones tienen owner versionado `postgres`, lenguaje `plpgsql`, retorno `trigger`, volatilidad VOLATILE y paralelismo UNSAFE. La metadata live 03D1 confirmo seis funciones con EXECUTE efectivo para anon, authenticated y service_role. El SQL versionado contiene ACL explicita para PUBLIC, postgres, anon, authenticated y service_role. El preflight bloquea ACL NULL/default o cualquier forma distinta.

| Firma | Seguridad | Config actual esperada | Objetos referidos | Consumidores exactos | Escritor normal | Riesgo y regresion |
| --- | --- | --- | --- | --- | --- | --- |
| `public.handle_new_user()` | SECURITY DEFINER | `proconfig IS NULL` | `public.profiles`, `public.user_settings`; `NEW`; COALESCE/jsonb de pg_catalog | `auth.users.on_auth_user_created`, AFTER INSERT, ROW | infraestructura Auth (`supabase_auth_admin` en el flujo gestionado), funcion ejecutada con owner | search_path no fijo es riesgo alto; probar alta Auth y ambas filas provisionadas |
| `public.set_updated_at()` | SECURITY INVOKER | `proconfig IS NULL` | `NEW.updated_at`, `now()` | BEFORE UPDATE ROW en anexos, examenes, grados, listas_cotejo, materias, planeaciones, planteles, profiles, temas, unidades y user_settings | authenticated en CRUD de usuario; service_role en procesos internos | revocar llamada directa no debe alterar 11 triggers; probar timestamps y escrituras legitimas |
| `public.enforce_grado_ownership()` | SECURITY INVOKER | `proconfig IS NULL` | `public.planteles` | `public.grados.trg_grado_ownership`, BEFORE INSERT OR UPDATE, ROW | authenticated mediante Quick Create/ruta heredada | probar padre propio y rechazo ajeno sin ampliar jerarquia |
| `public.enforce_materia_ownership()` | SECURITY INVOKER | `proconfig IS NULL` | `public.grados` | `public.materias.trg_materia_ownership`, BEFORE INSERT OR UPDATE, ROW | authenticated | misma regresion dirigida |
| `public.enforce_tema_ownership()` | SECURITY INVOKER | `proconfig IS NULL` | `public.unidades` | `public.temas.trg_tema_ownership`, BEFORE INSERT OR UPDATE, ROW | authenticated/generacion vigente | probar dependencia minima propia/ajena |
| `public.enforce_planeacion_tema_ownership()` | SECURITY INVOKER | `proconfig IS NULL` | `public.temas`; admite tema null | `public.planeaciones.trg_planeacion_tema_ownership`, BEFORE INSERT OR UPDATE, ROW | authenticated y helpers admin de generacion | probar tema propio, ajeno y null; regresion Biblioteca |

No se encontro consumidor RPC, JavaScript, servicio o SQL directo de ninguna funcion. El inicializador crea los triggers como `postgres`. Las migraciones futuras que creen o reemplacen triggers deben ejecutarse con un rol que tenga EXECUTE (el owner conserva su privilegio inherente); no se concedera EXECUTE a roles runtime por comodidad.

## Resolucion de nombres y search_path

El cuerpo versionado de `handle_new_user` califica las dos relaciones como `public.profiles` y `public.user_settings`. `COALESCE` es sintaxis SQL; operadores y el tipo `jsonb` se resuelven desde `pg_catalog`. No se identifico dependencia en extensions ni en otro schema de aplicacion.

`pg_catalog` aparece antes de `public`. No se permiten `$user`, `pg_temp`, schemas temporales ni otros schemas. El preflight verifica:

- firma no sobrecargada, owner, lenguaje, retorno, modo SECURITY, volatilidad y paralelismo;
- hash MD5 del `prosrc` esperado sin devolver el cuerpo;
- `proconfig` actual nulo;
- relaciones y tipo esperados;
- ACL CREATE efectiva del schema `public`;
- grafo exacto de 16 triggers.

El hash sirve solo para comparar igualdad con el cuerpo versionado dentro de estos ambientes; no acredita equivalencia semantica entre cuerpos diferentes ni se usa como control criptografico.

PostgreSQL advierte que incluir un schema writable en `search_path` confia en quienes pueden crear objetos alli. `ALTER FUNCTION ... SET search_path` esta soportado en PostgreSQL 15 y 17. Fuentes oficiales: [Schemas 15](https://www.postgresql.org/docs/15/ddl-schemas.html), [ALTER FUNCTION 17](https://www.postgresql.org/docs/17/sql-alterfunction.html) y [Function Security 15](https://www.postgresql.org/docs/15/perm-functions.html).

## EXECUTE y triggers existentes

La documentacion de [CREATE TRIGGER 15](https://www.postgresql.org/docs/15/sql-createtrigger.html) exige TRIGGER sobre la tabla y EXECUTE sobre la funcion al crear el trigger. El grant por defecto de EXECUTE a PUBLIC para funciones esta documentado en [Privileges 15](https://www.postgresql.org/docs/15/ddl-priv.html).

La documentacion consultada expresa el control de EXECUTE como requisito de `CREATE TRIGGER`; no documenta una nueva comprobacion del privilegio del escritor en cada disparo. El paquete conserva los triggers y el privilegio del owner. La continuidad runtime despues del REVOKE fue confirmada en test por 140 regresiones, 22 casos de ownership y la prueba Auth definitiva. Antes de produccion debe repetirse el preflight del destino y conservarse la regla de parada; no conceder EXECUTE ampliamente como arreglo improvisado.

Efectos esperados:

- authenticated/service_role siguen pudiendo escribir si sus privilegios de tabla y RLS lo permiten; el trigger existente invoca la misma funcion.
- `supabase_auth_admin` no recibe EXECUTE directo; el trigger Auth existente debe seguir ligado a la funcion SECURITY DEFINER propiedad de postgres.
- un rol runtime sin EXECUTE no podra crear/recrear el trigger en una migracion futura.
- postgres, como owner, conserva capacidad efectiva aunque no se agregue un GRANT nuevo.

## ACL y rollback honesto

Estado esperado antes de migrar: `proacl` explicita con EXECUTE para PUBLIC, postgres, anon, authenticated y service_role. La migracion revoca PUBLIC/anon/authenticated/service_role y deja al owner.

El rollback:

1. ejecuta `ALTER FUNCTION public.handle_new_user() RESET search_path`;
2. restaura EXECUTE efectivo para PUBLIC, anon, authenticated y service_role;
3. no modifica el grant del owner, cuerpos ni triggers.

GRANT/REVOKE soportan restauracion de privilegios efectivos. No se promete identidad byte a byte de `proacl`: orden de items, grantor o representacion catalogal pueden diferir aunque los permisos efectivos coincidan. No se escriben catalogos del sistema.

## Manifiesto SQL

El [preflight productivo](production/03d3c1_function_hardening_prod_preflight.sql) es un SELECT unico y read-only separado del preflight test-only. Exige confirmacion visual de `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` / `us-east-2`; SQL no acredita el Project ref. Resume seis funciones, 16 triggers, ACL/config/hash baseline, seguridad del schema, resolucion de `handle_new_user`, actor/version y las 14 constraints 03D3A. `apt_to_apply=true` requiere coincidencia exacta y ausencia de estado parcial. Su preparacion no autoriza migracion, postverify o rollback C1.

El operador ejecuto manualmente ese preflight en produccion el 2026-11-08, tras confirmar visualmente el proyecto y Project ref. La evidencia entregada fue: `apt_to_apply=true`; contexto de catalogo, servidor, autoridad, schema y resolucion en `true`; funciones 6/6; triggers 16/16, cero inesperados; constraints 03D3A 14/14, cero cambiadas y cero inesperadas; PostgreSQL `150008`; `current_user=session_user=postgres`. Este resultado aprueba exclusivamente el baseline previo. No se ha ejecutado 03D3C1 migration, postverify ni rollback en produccion.

Los equivalentes productivos son [migration](production/03d3c1_function_hardening_prod_migration.sql), [postverify](production/03d3c1_function_hardening_prod_postverify.sql) y [rollback](production/03d3c1_function_hardening_prod_rollback.sql). La migracion vuelve a comprobar dentro de su transaccion las seis funciones y fingerprints, ACL/config/atributos, 16 bindings de triggers, 14 constraints 03D3A, actor, version y permisos CREATE antes de la primera mutacion. El postverify exige coincidencia total y una unica salida JSON con `postverify_ok=true`. El rollback solo admite el estado posterior exacto, restaura `search_path` y privilegios efectivos previos, y falla cerrado ante drift. Los tres requieren revision y autorizacion separadas.

El cambio productivo por funcion es exacto: `handle_new_user()` conserva SECURITY DEFINER, owner, firma, retorno, lenguaje, volatilidad, parallel safety y cuerpo; fija `search_path=pg_catalog, public` y revoca EXECUTE a PUBLIC, anon, authenticated y service_role. Las otras cinco funciones conservan SECURITY INVOKER, `proconfig` nulo y todos sus atributos/cuerpos; solo reciben esas cuatro revocaciones. No se recrea ni altera ningun trigger o constraint.

La transaccion toma `ACCESS SHARE` sobre las tablas del grafo C1/03D3A: impide DDL concurrente y permite INSERT/UPDATE/DELETE normales. Los `ALTER FUNCTION`/`REVOKE` adquieren sus locks catalogales al ejecutarse. Un alta concurrente en `auth.users` no queda bloqueada por el lock de tabla; puede esperar brevemente por el lock de funcion y observar el estado completo anterior o posterior, nunca una instalacion parcial. Un timeout, error o gate distinto de uno aborta la transaccion completa. Se recomienda una ventana breve de baja actividad para reducir espera, no por riesgo de estado parcial.

## Primer intento productivo C1 abortado

El primer intento de migracion productiva termino con PostgreSQL `42704: role "PUBLIC" does not exist`. La causa fue la comprobacion de schema de la puerta inmediata: `has_schema_privilege('PUBLIC',...)` interpreta el argumento textual como un rol real, pero `PUBLIC` es un grantee especial y no existe como rol catalogal. Las sentencias ACL ya usaban correctamente `FROM PUBLIC`; no llegaron a ejecutarse. El correctivo consulta el privilegio de PUBLIC mediante `aclexplode(...).grantee=0`, manteniendo `'PUBLIC'` exclusivamente como representacion textual en arrays y comparaciones.

Como todo ocurrio dentro de `BEGIN` y antes de la primera mutacion, la transaccion fue abortada y C1 no quedo aplicado. No se ejecuto postverify ni rollback. Antes de cualquier reintento debe repetirse exclusivamente el preflight productivo read-only y confirmar que el baseline anterior permanece intacto.

| Archivo | Sentencias | Contrato |
| --- | ---: | --- |
| [preflight](test-environment/03d3c1_function_hardening_preflight.sql) | 4 | SELECT/CTE read-only: funciones/ACL/hashes, 16 triggers, CREATE sobre public y resolucion de objetos |
| [migration](test-environment/03d3c1_function_hardening_migration.sql) | 9 | BEGIN, un ALTER FUNCTION, seis REVOKE, COMMIT |
| [postverify](test-environment/03d3c1_function_hardening_postverify.sql) | 3 | seis funciones exactas, 16 triggers exactos y ausencia de sobrecargas |
| [rollback](test-environment/03d3c1_function_hardening_rollback.sql) | 9 | BEGIN, RESET search_path, seis GRANT efectivos, COMMIT |

Los SELECT no devuelven cuerpos ni datos de usuario. La migracion es one-shot: una firma ausente hace fallar `ALTER/REVOKE`; no usa IF EXISTS, SQL dinamico, DO, CREATE OR REPLACE ni tolerancia silenciosa.

## Procedimiento aplicado y validacion restante

Los pasos de preflight, migracion, postverify, regresiones 03D2A/B/C, ownership runtime y Auth definitivo ya se completaron en test. Los dos intentos Auth previos se conservan solo como diagnostico: ambos terminaron antes de `RUN`/login, sus identidades se eliminaron y sus cleanups agregados quedaron verificados. La ejecucion definitiva termino con siete PASS contabilizados, cero FAIL/INCONCLUSIVE, exit 0 y ausencia final confirmada. Vease la [validacion runtime](ISOLATION_03D3C1_VALIDATION.md). No se autoriza promocion a produccion en este cierre.

## Validacion offline y limites

El validador usa un scanner conservador, no un parser PostgreSQL completo. Maneja comentarios de linea, comentarios de bloque anidados, strings y dollar quotes para separar sentencias y aplicar una allowlist exacta a migration/rollback. Puede rechazar sintaxis valida no contemplada; esa es una propiedad fail-closed. No prueba ejecucion, resolucion live, locks, permisos del SQL Editor ni comportamiento runtime de triggers.

En este cierre documental no se ejecuto SQL remoto, Supabase, API, Auth, generacion, workers, Storage u OpenAI. La evidencia live fue aportada por el operador y la matriz CSV no cambio. 03D3C permanece abierta por 03D3C2/03D3C3; Storage sigue en 03E, la regresion E2E completa en 03F y la operacion durable de workers permanece transferida fuera de 03D3C.

