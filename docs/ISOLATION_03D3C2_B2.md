# 03D3C2-B2: privilegios de `planeaciones_id_seq`

Estado: **COMPLETADO EN SUPABASE TEST; PREFLIGHT PRODUCTIVO PREPARADO, NO EJECUTADO**. B0-current esta aplicado y postverificado en produccion. B1-C2 se difirio a 03F con sus ocho grants intactos. B2 productivo no ha sido aplicado y F03 continua abierta.

## Contrato productivo confirmado

La decision productiva replica exactamente la semantica validada en test: anon permanece sin privilegios; authenticated y service_role conservan solo USAGE y pierden SELECT/UPDATE; postgres conserva USAGE/SELECT/UPDATE. El baseline previo posterior a B0 contiene nueve grants directos (0+3+3+3) y el objetivo B2 contiene cinco (0+1+1+3). La instruccion anterior de conservar los tres privilegios de service_role fue revocada por ser incompatible con migration, postverify, rollback y evidencia canonica.

El [preflight productivo](production/03d3c2_b2_sequence_prod_preflight.sql) es una unica sentencia read-only para PostgreSQL 15.8. Exige confirmacion visual de `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` / `us-east-2`; SQL no afirma verificar el Project ref. Comprueba objeto, owner, parametros, dependencia identity interna con `public.planeaciones.id`, ACL directas/efectivas, PUBLIC y membresias, el estado B0 de 335 grants de tabla, 49 policies y sus fingerprints, 88 defaults, 14 constraints 03D3A y seis funciones/16 triggers C1. Declara el objetivo de cinco grants sin aplicarlo. `apt_to_apply=true` requiere coincidencia total. No se prepararon migration, postverify ni rollback productivos B2.

## Diagnostico de `context_ok`

El primer preflight B2 live aprobo todos los predicados salvo `context_ok=false`; por tanto `apt_to_apply=false`. No autoriza baseline ni migracion. La definicion original era opaca: solo combinaba conteos de 19 tablas, 49 policies y 96 ACL default en PG17. Ademas, el conteo B2 expandia `pg_default_acl` en toda la base, mientras el contexto B0-current aprobado limita defaults globales o del schema `public` (`defaclnamespace=0 OR nspname='public'`). Ese desacople de alcance es un defecto demostrable de la consulta y permite que defaults ajenos a `public` produzcan un falso drift.

El preflight corregido no cambia conteos ni hashes: adopta el alcance aprobado de B0 y endurece `context_ok` en cinco predicados visibles: `tables_exact`, `policies_exact`, `rls_exact`, `defaults_exact` y `post_b0_grants_exact`. El [diagnostico de contexto](test-environment/03d3c2_b2_context_diagnostic.sql) devuelve para cada condición nombre constante, esperado, observado y booleano; incluye manifiesto exacto de 19 tablas, fingerprint de 49 policies, RLS en 19 tablas, distribución 96=48+48 de defaults PG17, ACL post-B0 y ausencia de PUBLIC, grant options, grantors o memberships inesperados. No devuelve filas de aplicación ni ACL raw.

El diagnostico live confirmo 24/24 comprobaciones coincidentes y demostro que el primer `context_ok=false` provenia exclusivamente del alcance incorrecto de default ACL fuera de `defaclnamespace=0 OR public`; no hubo drift relevante. La repeticion completa del preflight corregido aprobo 16/16 predicados, incluidos `context_ok=true`, `authority_ok=true` y `apt_to_apply=true`.

## Diagnostico local pre-RUN de actor

Una primera tentativa del launcher termino antes de `RUN` con `invalid_actor`. Ese codigo agrupaba UUID invalido, JWT ilegible, `sub`, rol y proyecto, por lo que el evento historico no permite identificar cual valor introducido fallo sin volver a inspeccionar credenciales, accion prohibida. La auditoria encontro ademas una expectativa incompleta: el validador exigia siempre el claim `ref`, aunque un access token Supabase puede identificar el proyecto mediante el issuer canonico `https://gwdtlbisykzzplgzczzq.supabase.co/auth/v1`. Los tests sinteticos solo usaban `ref` y no cubrian `iss`.

La validacion local ahora distingue razones allowlisted: `invalid_actor_uuid`, `invalid_access_token_shape`, `unreadable_access_token_jwt`, `missing_actor_subject`, `actor_subject_mismatch`, `invalid_actor_role`, `invalid_actor_project`, `invalid_access_token_expiry` y `access_token_expired`. Se acepta el proyecto solo si el token contiene `ref` exacto o `iss` exacto; si ambos existen, ambos deben coincidir. Se siguen exigiendo UUID valido, `sub` igual al actor, rol `authenticated` y expiracion futura. La configuracion se valida antes de crear el transporte, emitir `RUN`, abrir el prompt de comandos o invocar `fetch`; un fallo sale con codigo no cero y diagnostico sanitizado.

El intento historico no emitio `RUN`: tuvo cero `fetch`, escrituras o consumo de secuencia y no cuenta como evidencia runtime.

## Evidencia live definitiva

| Etapa | Evidencia |
|---|---|
| Baseline | Run `a87abc53-216d-4f10-ac82-1742f76656bd`, modo `pre_migration`: 2 PASS, identity asignado omitiendo `id`, cleanup y ausencia verificados; 0 FAIL/INCONCLUSIVE/commandErrors, ledgers vacios, `successful=true`, exit 0. |
| Migracion | Aplicada solo en `educativo-backend-test` como una transaccion sin errores. Revoco exclusivamente SELECT y UPDATE sobre `public.planeaciones_id_seq` de authenticated y service_role; USAGE se conservo. |
| Postverify | `public_empty=true`, `anon_empty=true`, `authenticated_exact=true`, `service_role_exact=true`, `postgres_unchanged=true`. |
| Runtime posterior | Run `a1c1ce47-0aea-4dcc-be38-28ff77fb8ef6`, modo `post_migration`: 2 PASS, identity asignado omitiendo `id`, cleanup y ausencia verificados; 0 FAIL/INCONCLUSIVE/commandErrors, ledgers vacios, `successful=true`, exit 0. |
| Biblioteca | Run `a788ef0f-179e-4045-8c18-335d1b457cda`, B0 `post_b0_current`: 42 PASS, 0 FAIL/INCONCLUSIVE/commandErrors; prepare, execute y cleanup completos, ledgers vacios, `successful=true`, exit 0. |

Los dos INSERT identity consumieron dos valores de secuencia. Son huecos legitimos y esperados; no se reparan con `setval`, no son residuos y sus valores concretos no forman parte de la evidencia. Rollback permanece disponible y no fue ejecutado.

## Inventario y consumidores

El inicializador versiona una sola secuencia publica: `public.planeaciones_id_seq`, ligada por dependencia identity interna a `public.planeaciones.id`. La columna es `bigint GENERATED BY DEFAULT AS IDENTITY`; owner `postgres`, START 1, INCREMENT 1, MINVALUE 1, MAXVALUE 9223372036854775807, CACHE 1 y NO CYCLE. B0-current dejo a `anon` y `PUBLIC` sin USAGE/SELECT/UPDATE; `authenticated`, `service_role` y `postgres` conservan los tres privilegios directos, concedidos por `postgres`, sin grant option.

| Consumidor | Cliente/rol | Operacion | ID | Minimo | Evidencia |
|---|---|---|---|---|---|
| generacion individual | `createUserClient`, authenticated | INSERT planeacion | omitido | USAGE | `generarPlaneacionIA` |
| generacion por unidad | cliente recibido, normalmente authenticated | INSERT pending/final | omitido | USAGE | `createPendingPlaneacion` |
| fallback interno | `supabaseAdmin`, service_role | mismos INSERT si falta cliente | omitido | USAGE | `getClient` de planeaciones |
| Biblioteca/Archivados | authenticated | SELECT/UPDATE/DELETE | no consume secuencia | ninguno | servicios de tabla |
| harness/recovery 03D2A | authenticated | INSERT/DELETE fixture | ID explicito | ninguno | ID derivado de runId |
| SQL administrativo | postgres | definicion/ACL | administrativo | KEEP | inicializador/B0/B2 |

La busqueda versionada no encontro llamadas runtime a `nextval`, `currval`, `setval`, `pg_get_serial_sequence` ni consultas directas a la secuencia. No se consulta ni registra su estado numerico.

## Semantica y decision

La documentacion oficial de privilegios de PostgreSQL [15](https://www.postgresql.org/docs/15/ddl-priv.html) y [17](https://www.postgresql.org/docs/17/ddl-priv.html), junto con [GRANT](https://www.postgresql.org/docs/17/sql-grant.html), establece: USAGE permite `currval`/`nextval`; SELECT permite `currval` y lectura; UPDATE permite `nextval`/`setval`. El identity que omite `id` requiere USAGE. `BY DEFAULT` con ID explicito no evalua la secuencia y no acredita USAGE.

| Rol | USAGE | SELECT | UPDATE |
|---|---|---|---|
| PUBLIC | NOT_GRANTED | NOT_GRANTED | NOT_GRANTED |
| anon | NOT_GRANTED | NOT_GRANTED | NOT_GRANTED |
| authenticated | KEEP productivo | REVOKED IN TEST | REVOKED IN TEST |
| service_role | KEEP por fallback admin | REVOKED IN TEST | REVOKED IN TEST |
| postgres | KEEP | KEEP | KEEP |

No se justifica harness admin separado: no existe un flujo exclusivamente admin distinto; USAGE se conserva y la regresion del servicio cubrira el fallback en 03F si continua alcanzable.

## Paquete y prueba identity

El paquete contiene preflight read-only, migracion transaccional que revoca solo SELECT/UPDATE a authenticated/service_role, postverify read-only y rollback que restaura exclusivamente esos cuatro grants. No usa ALL PRIVILEGES, SQL dinamico, DO, loops, ALTER SEQUENCE, valores de secuencia, owner ni defaults.

El harness `03d3c2-b2-identity.js` usa el adaptador PostgREST fijo `03d3c2-b2-postgrest.js`. Actor A inserta una planeacion omitiendo `id`, con `batch_id`/`tema_id` nulos y marcador `EIA-03D3C2-B2:<runId>:A:planeaciones:identity` en `custom_title`; exige owner, marcador y bigint canonico positivo conservado como string, luego DELETE `id + user_id` y relectura. Escritura/DELETE ambiguos son INCONCLUSIVE. Recovery acepta runId/actor y descubre solo por marcador.

Runner y recovery son interactivos, independientes y exclusivos de test. `EIA_B2_SEQUENCE_MODE` carece de default y acepta solo `pre_migration` o `post_migration`. La URL esta fijada al proyecto versionado; launcher exige confirmacion literal, clave publica, UUID y token A mediante entrada oculta. No hay service role, UPDATE, RPC, tabla configurable, secuencia directa ni I/O al importar.

Cada prueba consumio un valor: los huecos son esperados, nunca se corrigen con `setval`, el numero no es evidencia estable y no se asumen IDs consecutivos.

## Procedimiento ejecutado en test y promocion futura

1. Confirmar visualmente `educativo-backend-test`.
2. Ejecutar preflight; exigir `apt_to_apply=true`.
3. Ejecutar el harness con fixture nuevo en `pre_migration`; exigir PASS, cleanup completo y exit 0.
4. Si el baseline falla, no aplicar: ejecutar cleanup/recovery e investigar payload/RLS/harness.
5. Aplicar la migracion transaccional.
6. Ejecutar postverify y exigir todos los predicados verdaderos.
7. Ejecutar el mismo harness con fixture nuevo en `post_migration`; exigir PASS, cleanup completo y exit 0.
8. Repetir regresiones minimas de persistencia/Biblioteca.
9. Mantener rollback disponible, no automatico. Si post_migration falla con ACL correcta, conservar diagnostico sanitizado, verificar cleanup y evaluar rollback.
10. No ejecutar prueba admin separada ni reajustar la secuencia.

El consumidor admin productivo conserva USAGE, suficiente para el identity. SELECT/UPDATE no tienen consumidor; probar service_role introduciria autoridad sin una ruta semantica distinta. La regresion productiva completa queda en 03F.

El procedimiento se completo en test sin recovery. Para produccion debe repetirse como promocion controlada, no inferirse desde test. Stop ante drift, grant heredado, membership, owner/grantor inesperado, INSERT fallido, uncertain o cleanup incompleto. B1-C2 sigue diferida a 03F con ocho grants intactos; B3, B4, B0-defaults y las demas superficies siguen pendientes. 03D3C2, 03D3C y Fase 03 permanecen abiertas.
