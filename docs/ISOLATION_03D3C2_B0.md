# 03D3C2-B0-current - grants de objetos existentes

Fecha: 2026-11-09. Estado: **03D3C2-B0-current COMPLETADO EN SUPABASE TEST; PREFLIGHT PRODUCTIVO READ-ONLY PREPARADO, NO EJECUTADO.** Produccion conserva el baseline previo a B0-current. 03D3C2, 03D3C y Fase 03 continuan abiertas.

## Evidencia de entrada

El preflight 03D3C2A ampliado pasó en PostgreSQL test 17.6 (`170006`) como `postgres`: 665 filas portables sin drift, 95 filas MAINTAIN, 49 policies, una secuencia, 96 default privileges y cero memberships de anon/authenticated. MAINTAIN ya está ausente para PUBLIC, anon, authenticated y service_role en las 19 tablas; no requiere una revocación. `postgres` puede alterar sus defaults, pero `supabase_admin` no: ambos quedan fuera de B0-current.

## Manifiesto exacto

Las 17 tablas target son: `ai_generation_calls`, `ai_generation_jobs`, `anexos`, `examen_generation_items`, `examen_generation_jobs`, `examenes`, `grados`, `listas_cotejo`, `materias`, `planeacion_batches`, `planeaciones`, `planteles`, `profiles`, `temas`, `unidades`, `user_profiles` y `user_settings`.

| Rol | Objeto | Revocación exacta |
|---|---|---|
| anon | 17 tablas target | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| authenticated | 17 tablas target | TRUNCATE, REFERENCES, TRIGGER |
| anon | `public.planeaciones_id_seq` | USAGE, SELECT, UPDATE |

Quedan excluidos `ai_model_prices`, `ia_metrics_legacy`, DML authenticated, service_role, postgres, policies, defaults, funciones y MAINTAIN. No se usa `ALL PRIVILEGES`: en PG17 concedería MAINTAIN durante rollback.

## Paquete SQL

El [preflight productivo](production/03d3c2_b0_current_prod_preflight.sql) es un SELECT unico separado del preflight test-only. Exige confirmacion visual de `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` / `us-east-2`; SQL no verifica el Project ref. Para PostgreSQL 15.8 exige 19 tablas publicas y 17 targets B0 exactos, owners/RLS/ACL previas, grants directos y efectivos sin herencia ni PUBLIC, 49 policies sin aplicar B3, una secuencia y sus 12 grants previos sin aplicar B2, 88 default privileges PG15 sin modificarlos, 14 constraints 03D3A y el estado posterior exacto de seis funciones/16 triggers C1. `apt_to_apply=true` requiere coincidencia total. Su preparacion no autoriza migration, postverify o rollback B0.

- [Preflight](test-environment/03d3c2_b0_current_preflight.sql): una sentencia read-only y fail-closed. Exige PG17 test, autoridad postgres, 19/17 tablas exactas, ACL previas exactas, ausencia MAINTAIN runtime, cero memberships directas/transitivas, 49 policies, una secuencia y 96 defaults.
- [Migración](test-environment/03d3c2_b0_current_migration.sql): transacción con tres REVOKE explícitos.
- [Postverify](test-environment/03d3c2_b0_current_postverify.sql): demuestra anon sin grants de tablas/secuencia, authenticated con DML conservado, y contextos service_role/postgres/PUBLIC, MAINTAIN, policies y defaults invariantes. La comprobacion de 03D3C1 usa las seis funciones endurecidas y las 16 vinculaciones exactas.
- [Diagnostico de funciones y triggers](test-environment/03d3c2_b0_current_trigger_diagnostic.sql): tres sentencias read-only que separan predicados por funcion, por trigger y resumen, sin devolver cuerpos ni datos de aplicacion.
- [Rollback](test-environment/03d3c2_b0_current_rollback.sql): restaura exclusivamente siete privilegios portables, tres privilegios estructurales authenticated y tres de secuencia anon. No concede MAINTAIN.

La allowlist estática impide DDL/DML ajeno, SQL dinámico, loops, policies, funciones, triggers, defaults o tablas excluidas. La ausencia de cambios de datos/RLS/constraints se acredita por esa allowlist; el postverify vuelve a contar policies y triggers como contexto.

## Compatibilidad de harnesses

Los harnesses 03D2A/B/C conservan por defecto `EIA_B0_CURRENT_MODE=pre_b0`, que acepta su semántica histórica. Tras aplicar B0-current, el operador debe fijar exactamente `post_b0_current`.

Existe una allowlist inmutable de 26 caseIds PostgREST anon: diez de 03D2A, doce de 03D2B y cuatro de 03D2C. API anon queda fuera porque `requireAuth` debe seguir devolviendo 401 antes de DB. 03D3C1 ownership no tiene casos anon; Auth no es un caso anónimo de tablas.

En modo posterior, 42501 produce PASS únicamente cuando coinciden caseId, actor anon, tabla y operación revocada; la relectura del owner demuestra snapshot intacto y no hay escritura incierta. Otro actor/caso/operación, respuesta exitosa, código ausente, snapshot alterado o `uncertainPending` produce INCONCLUSIVE. No se serializan message/details/hint. Casos authenticated y cross-user mantienen su semántica.

## Evidencia estructural live

El preflight inmediato devolvio `true` para `version_ok`, `authority_ok`, `tables_ok`, `targets_ok`, `anon_grants_ok`, `authenticated_grants_ok`, `technical_roles_ok`, `no_public_or_inherited_ok`, `maintain_absent_ok`, `policies_ok`, `sequence_ok`, `defaults_context_ok` y `apt_to_apply`. La migracion transaccional termino con `Success. No rows returned`.

El primer postverify aprobo todos sus controles salvo `trigger_context_unchanged=false`. La causa fue exclusivamente diagnostica: contaba triggers no internos sobre tablas `public` y esperaba 16, aunque el manifiesto aprobado contiene 15 en `public` y `auth.users.on_auth_user_created`. No fue evidencia de drift. El diagnostico corregido confirmo 6/6 funciones y 16/16 triggers exactos, con `six_functions_exact=true`, `sixteen_triggers_exact=true` y `trigger_context_matches_expected=true`.

El postverify corregido devolvio `true` para sus 15 predicados: `version_ok`, `tables_ok`, `anon_zero_on_all_tables`, `authenticated_exact`, `service_role_unchanged`, `postgres_unchanged`, `public_unchanged`, `sequence_exact`, `maintain_absent`, `policies_unchanged`, `defaults_unchanged`, `rls_objects_unchanged`, `six_functions_exact`, `sixteen_triggers_exact` y `trigger_context_matches_expected`.

B0-current no modifico policies, RLS, defaults, funciones, triggers, constraints, `service_role` ni `postgres`. MAINTAIN permanece fuera del paquete. Rollback no ejecutado; produccion intacta.

## Regresiones runtime definitivas

Los tres runs se ejecutaron con `EIA_B0_CURRENT_MODE=post_b0_current`:

| Fase | Run sanitizado | Resultado | Evidencia anon | Cleanup |
|---|---|---:|---|---|
| 03D2A | `f295f626-5893-4c0d-bbf5-1be8fbfc2094` | 42 PASS; 0 FAIL/INCONCLUSIVE/errores; exit 0 | diez casos PostgREST: SQLSTATE 42501, HTTP 401, `b0_grant_revoked`; API anon con 401 de `requireAuth` | completo; ledgers vacios |
| 03D2B | `06483a15-388e-467d-aebc-999eb29f297a` | 72 PASS; 0 FAIL/INCONCLUSIVE/errores; exit 0 | doce casos PostgREST con HTTP 401; tres API anon conservaron 401 | completo; ledgers vacios |
| 03D2C | `0c7f89d2-4cdc-4b0c-94e5-75b819b4e58f` | 26 PASS; 0 FAIL/INCONCLUSIVE/errores; exit 0 | cuatro casos PostgREST con HTTP 401 | completo; ledgers vacios |

En los tres runs `prepare`, `execute` y `cleanup` terminaron, `fixturesPending=[]`, `uncertainPending=[]` y `successful=true`. Total posterior a B0-current: **140 PASS, 0 FAIL, 0 INCONCLUSIVE y cero residuos conocidos**. DML authenticated, aislamiento A/B, RLS y las constraints relacionales/tecnicas conservaron su comportamiento esperado.

## Intentos diagnosticos abortados

Los runs `a0d3c7f9-143f-49dc-b30b-049cc3f19f79` y `68fcbc88-f7f9-428c-9567-727f3fb8f990` iniciaron 03D2A sin definir `EIA_B0_CURRENT_MODE`; por ello conservaron el modo historico `pre_b0`. El primer rechazo anon real posterior a B0 devolvio HTTP 401 y el contrato historico detuvo correctamente `execute` con `invalid_state`.

Ambos tuvieron `executeCompleted=false`, un `commandError`, `successful=false` y exit 1. En ambos, cleanup termino, los dos ledgers quedaron vacios y no hay residuos conocidos. Son diagnosticos de configuracion local, no FAIL funcional ni evidencia contra Supabase, la migracion, el clasificador o cleanup. El valor predeterminado `pre_b0` se conserva para no reescribir evidencia historica. Antes de lanzar una regresion post-B0, el operador debe definir y verificar `EIA_B0_CURRENT_MODE=post_b0_current` en la misma consola.

## Estado y pendientes separados

**03D3C2-B0-current esta completado en test y pendiente de preflight productivo manual.** Siguen abiertos B0-defaults de `postgres`, B0-defaults de `supabase_admin`, B0-functions-default, B0-service-role, B1 DML authenticated por tabla, B2 secuencia authenticated/service_role, B3 policies tecnicas y B4 metricas/precios/perfiles/legacy. 03D3C2, 03D3C y Fase 03 siguen abiertas. No se preparo ni ejecuto migration/postverify/rollback productivo B0.
