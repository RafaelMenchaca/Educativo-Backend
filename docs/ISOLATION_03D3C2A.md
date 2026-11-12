# 03D3C2A — auditoría de grants, secuencia y policies técnicas

Fecha: 2026-10-25. Estado: **auditoria base 03D3C2A conservada; B0-current completado en Supabase test; superficies C2/C3 y defaults continuan abiertas**. [03D3C1](ISOLATION_03D3C1.md) esta completada unicamente en Supabase test. Produccion sigue pendiente. Biblioteca continua como unico flujo visual principal; Archivados es independiente y la jerarquia relacional permanece congelada.

Esta sesión no conectó Supabase/API, no ejecutó SQL ni harnesses reales y no cambió grants, policies, ACL, secuencias, datos o código funcional. El CSV 03A permanece sin cambios (310 filas y 310 IDs únicos).

## Fuentes y método

La auditoría cruza el inicializador versionado `docs/test-environment/initialize_application.sql`, la metadata read-only de [03D1](ISOLATION_03D1.md), los contratos de [03D2A](ISOLATION_03D2A.md), [03D2B](ISOLATION_03D2B.md), [03D2C](ISOLATION_03D2C.md), [03D3A](ISOLATION_03D3A.md), [03D3B](ISOLATION_03D3B.md), [03D3C1](ISOLATION_03D3C1.md), routes/controllers/services, creación de clientes y consumidores frontend. La metadata live de 03D1 confirmó 372 ACL explícitas y 399 privilegios efectivos: `anon` y `authenticated` tenían siete privilegios sobre 17 tablas, `authenticated` además `SELECT` sobre precios, y `service_role` siete privilegios sobre las 19 tablas.

## Evidencia live del primer preflight

La ejecución read-only devolvió 665 filas exactas (19 × 5 × 7). `PUBLIC` tuvo cero privilegios; no hubo efectos heredados o de PUBLIC. `anon` tuvo 119 privilegios efectivos (siete en 17 tablas); `authenticated`, 120 (los mismos 119 más SELECT en `ai_model_prices`); `service_role` y `postgres`, 133 cada uno. Todos fueron grants directos de `postgres`, sin grant option. Las 49 policies fueron únicas y coincidieron con el inicializador: 48 para `[public]` y una SELECT de precios para `[authenticated]`. Solo apareció `planeaciones_id_seq`, identity `d`, con USAGE/SELECT/UPDATE directos para anon, authenticated, service_role y postgres.

La cuarta sentencia devolvió 96 default privileges para dos grantors, `postgres` y `supabase_admin`: EXECUTE de funciones; DELETE/INSERT/MAINTAIN/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE de tablas; y SELECT/UPDATE/USAGE de secuencias, en cada caso para anon, authenticated, service_role y postgres. Esto confirmó PostgreSQL 17.6 en test y reveló que la matriz original omitía MAINTAIN. No se ejecutó ninguna revocación. La lectura de `pg_default_acl` no demuestra que la sesión pueda modificar defaults de `supabase_admin`.

Leyenda portable: `S` SELECT, `I` INSERT, `U` UPDATE, `D` DELETE, `T` TRUNCATE, `R` REFERENCES y `G` TRIGGER. PostgreSQL 17 añade `M` MAINTAIN; PostgreSQL 15 no reconoce ese privilegio. “7” en la tabla versionada significa `S/I/U/D/T/R/G`; el preflight ampliado añade una matriz separada de `M`. Los grants son directos y efectivos; `PUBLIC` no tiene grant de tabla. RLS no protege TRUNCATE ni MAINTAIN y no convierte REFERENCES/TRIGGER en capacidades legítimas de producto.

## Inventario exacto de las 19 tablas

| Tabla | PUBLIC | anon | authenticated | service_role | postgres/owner | Policy/ausencia |
|---|---:|---:|---:|---:|---:|---|
| `ai_generation_calls` | — | 7 | 7 | 7 | 7 | INSERT, SELECT own; `TO PUBLIC` |
| `ai_generation_jobs` | — | 7 | 7 | 7 | 7 | INSERT, SELECT, UPDATE own; `TO PUBLIC` |
| `ai_model_prices` | — | — | S | 7 | 7 | SELECT true; `TO authenticated` |
| `anexos` | — | 7 | 7 | 7 | 7 | D/I/S/U own; `TO PUBLIC` |
| `examen_generation_items` | — | 7 | 7 | 7 | 7 | D/I/S/U own; `TO PUBLIC` |
| `examen_generation_jobs` | — | 7 | 7 | 7 | 7 | D/I/S/U own; `TO PUBLIC` |
| `examenes` | — | 7 | 7 | 7 | 7 | D/I/U/S own; `TO PUBLIC` |
| `grados` | — | 7 | 7 | 7 | 7 | ALL own; `TO PUBLIC` |
| `ia_metrics_legacy` | — | — | — | 7 | 7 | sin policy |
| `listas_cotejo` | — | 7 | 7 | 7 | 7 | D/I/S/U own; `TO PUBLIC` |
| `materias` | — | 7 | 7 | 7 | 7 | ALL own; `TO PUBLIC` |
| `planeacion_batches` | — | 7 | 7 | 7 | 7 | D/I/S/U own; `TO PUBLIC` |
| `planeaciones` | — | 7 | 7 | 7 | 7 | D/I/S/U own más ALL own redundante; `TO PUBLIC` |
| `planteles` | — | 7 | 7 | 7 | 7 | ALL own; `TO PUBLIC` |
| `profiles` | — | 7 | 7 | 7 | 7 | I/S/U por `id=auth.uid()`; `TO PUBLIC` |
| `temas` | — | 7 | 7 | 7 | 7 | ALL own; `TO PUBLIC` |
| `unidades` | — | 7 | 7 | 7 | 7 | ALL own; `TO PUBLIC` |
| `user_profiles` | — | 7 | 7 | 7 | 7 | I/S/U own; `TO PUBLIC` |
| `user_settings` | — | 7 | 7 | 7 | 7 | I/S/U own; `TO PUBLIC` |

Así, para cada tabla con “7”, cada uno de SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES y TRIGGER está concedido. Una operación de fila por PostgREST todavía necesita grant y una policy aplicable. `TO PUBLIC` incluye anon y authenticated; las expresiones `auth.uid()=owner` normalmente hacen que anon no vea filas, pero mantienen una superficie innecesaria. TRUNCATE/REFERENCES/TRIGGER no son operaciones de la API de producto y su presencia catalogal sigue siendo un incumplimiento de mínimo privilegio aunque no se haya demostrado una ruta HTTP explotable.

## Inventario exacto de policies

Hay 49 policies públicas: 48 `TO PUBLIC` y una `TO authenticated`. No hay policy para `ia_metrics_legacy`.

| Tabla | Policies exactas | Comando / condición | Consumidor y decisión preliminar |
|---|---|---|---|
| `ai_generation_calls` | `Users can insert own AI calls`; `Users can read own AI calls` | INSERT CHECK own; SELECT USING own | uso normal solo `supabaseAdmin` en `aiMetrics.service.js`; C2/B4, no conservar acceso de usuario sin prueba |
| `ai_generation_jobs` | `Users can insert own AI jobs`; `Users can read own AI jobs`; `Users can update own AI jobs` | I/S/U own | uso normal solo admin; sin DELETE reversible de usuario; C2/B4 |
| `ai_model_prices` | `Authenticated users can read AI model prices` | SELECT, USING true, `TO authenticated` | backend lee con admin; ningún consumidor usuario directo; C2/B4 |
| `anexos` | `Users can delete their own anexos`; `...insert...`; `...select...`; `...update...` | D/I/S/U own | cliente autenticado por controller; KEEP D/I/S/U, cambiar rol a authenticated en B3 |
| `examen_generation_items` | `Users can delete their own exam generation items`; `...insert...`; `...read...`; `...update...` | D/I/S/U own | app usuario INSERT; worker admin S/U; D/S/U de usuario sostienen harness/recovery, no necesariamente producto; C2/B1/B3 |
| `examen_generation_jobs` | `Users can delete their own exam generation jobs`; `...insert...`; `...read...`; `...update...` | D/I/S/U own | prepare/polling/compensación autenticados necesitan I/S/U; DELETE requerido por harness/recovery; C2/B1/B3 |
| `examenes` | `Users can delete their own examenes`; `...insert...`; `...update...`; `...view...` | D/I/U/S own | recursos/Biblioteca usan CRUD; KEEP D/I/S y U mientras worker/edición lo exijan; B1/B3 |
| `grados` | `grados_owner` | ALL own | dependencia jerárquica congelada y harness 03D3C1; D/I/S/U existen en service; B1/B3 sin ampliar UX |
| `listas_cotejo` | cuatro `Users can ... listas de cotejo` | D/I/S/U own | controller autenticado; KEEP D/I/S/U; B3 cambia rol |
| `materias` | `materias_owner` | ALL own | dependencia congelada; D/I/S/U del service; B1/B3 |
| `planeacion_batches` | cuatro `Users can ... planeacion batches` | D/I/S/U own | Biblioteca/generación/Archivados; KEEP D/I/S/U; B3 cambia rol |
| `planeaciones` | `delete own planeaciones`; `insert own planeaciones`; `planeaciones_owner`; `select own planeaciones`; `update own planeaciones` | D/I/ALL/S/U own | Biblioteca/Quick Create/Archivados; `planeaciones_owner` duplica permisos específicos; C2, consolidación solo con equivalencia probada |
| `planteles` | `planteles_owner` | ALL own | dependencia congelada; D/I/S/U del service; B1/B3 |
| `profiles` | `profiles_insert_own`; `profiles_select_own`; `profiles_update_own` | I/S/U con `id=auth.uid()` | trigger definer aprovisiona; verificador 03D3C1 usa S/U; contrato de producto futuro por decidir; C2/B4 |
| `temas` | `temas_owner` | ALL own | dependencia congelada y relaciones activas; D/I/S/U; B1/B3 |
| `unidades` | `unidades_owner` | ALL own | dependencia congelada y examen; D/I/S/U; B1/B3 |
| `user_profiles` | `Users can insert own profile`; `Users can read own profile`; `Users can update own profile` | I/S/U own | sin consumidor versionado; legacy expuesta; C3/B4 |
| `user_settings` | `user_settings_insert_own`; `...select...`; `...update...` | I/S/U own | trigger aprovisiona; verificador 03D3C1 usa S/U; C2/B4 |

Cada nombre agrupado representa una policy distinta; el [preflight](test-environment/03d3c2a_acl_policy_preflight.sql) devuelve las 49 filas, roles, `USING` y `WITH CHECK` para impedir que la agrupación documental oculte drift. Cambiar `TO PUBLIC` a `TO authenticated` elimina la aplicabilidad a anon, pero no revoca el grant; para cerrar una operación sobrada deben coordinarse ambas capas.

## Secuencias públicas

El inicializador contiene una sola secuencia pública: `planeaciones_id_seq`, propiedad de `planeaciones.id`, `bigint GENERATED BY DEFAULT AS IDENTITY`. No hay secuencias públicas versionadas para UUID; sus defaults usan `gen_random_uuid()`.

| Rol | USAGE | SELECT | UPDATE | Necesidad observada | Candidato |
|---|---:|---:|---:|---|---|
| PUBLIC | no | no | no | ninguna | KEEP ausencia |
| anon | sí | sí | sí | ningún consumidor; harnesses reservan ID explícito | C1 revocar los tres |
| authenticated | sí | sí | sí | INSERT normal que omite `id` necesita USAGE; no hay consumidor de `currval`/lectura ni `setval` | KEEP USAGE; C2 revocar SELECT/UPDATE tras prueba identity |
| service_role | sí | sí | sí | helpers admin pueden insertar planeaciones sin ID; no hay `setval` | KEEP USAGE; C2 revocar SELECT/UPDATE tras regresión admin |
| postgres/owner | sí | sí | sí | administración/migraciones | KEEP como contexto administrativo |

Revocar UPDATE impide `setval`; revocar SELECT impide leer el estado de secuencia; USAGE autoriza `nextval`/`currval` según PostgreSQL y es necesario para el INSERT identity normal. La futura prueba B2 hará un INSERT propio reversible sin ID, comprobará `RETURNING`/relectura y eliminará la fila. Consumirá inevitablemente un valor; el hueco de secuencia no se revierte ni debe “repararse” con `setval`.

## Mapa de consumidores y autoridad

| Consumidor | Operaciones/tablas | Cliente/rol real | RLS/RETURNING/cleanup | Decisión |
|---|---|---|---|---|
| Biblioteca y Archivados | S/D batches, planeaciones, anexos, listas, examenes | `createUserClient`, authenticated | RLS obligatorio; relectura/listados; deletes funcionales | KEEP S/D; I/U vienen de creación/edición |
| Quick Create/generación de planeación | I/S/U batches y planeaciones; S jerarquía | cliente autenticado; helpers puntuales admin | necesita RETURNING/relectura; identity puede usar secuencia | B1/B2 con regresión Biblioteca |
| jerarquía congelada | D/I/S/U planteles, grados, materias, unidades, temas; S/U/D planeaciones | authenticated | RLS y triggers de owner; no reactiva Explorer | KEEP solo contrato existente; B3 roles |
| anexos | S/I/U/D anexos; S planeaciones/temas | authenticated | owner RLS y cleanup | KEEP CRUD |
| listas | S/I/U/D listas; S planeaciones/temas | authenticated | upsert necesita I/U y RETURNING | KEEP CRUD |
| exámenes | S/I/D examenes; S jerarquía/batches/planeaciones | authenticated | creación/relectura/delete | B1 determina U de usuario frente a worker |
| prepare/polling examen | I/S/U jobs; I items; S examenes | authenticated | polling 03C y compensación; cleanup de harness usa DELETE | KEEP I/S/U jobs e I items; C2 para resto |
| worker examen | S/U jobs/items; I examen y relecturas | `supabaseAdmin`, service_role | omite RLS deliberadamente; autoridad técnica | KEEP privilegios DML demostrados; reducir D/T/R/G por separado |
| métricas modernas | S prices; I/S/U jobs; I calls | `supabaseAdmin`, service_role | sin RLS funcional de usuario; no ciclo reversible A/B | B4/03D3C3 |
| profiles/settings | trigger `handle_new_user`; S/U solo verificador 03D3C1 | trigger definer/postgres; verificador authenticated | Auth runtime ya probado; producto no consume directamente | C2/C3 B4 |
| harness 03D2A | CRUD batches/planeaciones | authenticated A/B/anon | DELETE requerido para cleanup/recovery | una reducción rompe el harness; adaptar solo tras mantener recovery sin admin |
| harness 03D2B | CRUD derivados y precondiciones | authenticated A/B/anon | DELETE requerido | mismo criterio |
| harness 03D2C | CRUD jobs/items/examenes | authenticated A/B/anon | DELETE requerido para fixtures | grants de prueba no deben dictar producto; requiere estrategia reversible antes de revocar |
| ownership 03D3C1 | CRUD jerarquía/planeación | authenticated A/B | cleanup hijos→padres | mantener hasta completar promoción/regresión o adaptar con autoridad legítima |
| recovery 03D2/03D3C1 | SELECT/DELETE de fixtures exactos | authenticated owner | no usa admin | cualquier revocación DELETE exige reemplazo seguro previo |

Todos los routes funcionales están tras `requireAuth`; los controllers crean `createUserClient(accessToken)`. `supabaseAdmin` aparece en auth middleware, métricas, worker y helpers técnicos identificados. El frontend no hace `.from()` contra tablas públicas: usa módulos API/backend. Sus únicos `.from()` directos son buckets de Storage en Detalle, fuera de 03D3C2 y reservado a 03E. Auth directo tampoco cuenta como acceso a tablas públicas.

## Matriz de decisión ejecutable

| Objeto/cambio | Estado y riesgo | Evidencia/consumidor | Mínimo candidato | Clase | Paquete/prueba/rollback |
|---|---|---|---|---|---|
| anon en 17 tablas | siete grants revocados por B0-current; MAINTAIN confirmado ausente | routes requieren auth; frontend sin acceso directo | estado minimo verificado en test | C1 completado en test | postverify + 140 PASS; rollback exacto disponible |
| anon en prices/legacy | ya sin grants | inicializador/03D1 | conservar ausencia | KEEP | B0 verifica drift |
| T/R/G/M authenticated en 17 | T/R/G revocados por B0-current; MAINTAIN confirmado ausente | ningun servicio/harness usa estas operaciones | DML conservado y verificado | C1 completado en test | postverify + 140 PASS; rollback exacto disponible |
| T/R/G service_role | app no los usa en runtime, pero migración/owner puede requerirlos bajo otra autoridad | admin runtime solo DML | revocar del runtime service_role, preservar postgres | C2 | B0 separado; verificar tooling de despliegue y worker; regrant |
| DML authenticated de recursos activos | full CRUD, contratos distintos | tabla de consumidores | grant por operación real, tabla por tabla | C2/KEEP | B1; A/B/anon, Biblioteca/Archivados/Quick Create; regrant puntual |
| DELETE técnico usado solo por harness | necesario para reversibilidad actual, no necesariamente producto | 03D2C/recovery | no revocar hasta diseñar cleanup legítimo sin admin | C2 | B1; criterio de parada si queda fixture |
| policies `TO PUBLIC` | anon aplicable aunque `auth.uid()` normalmente sea null | 48 policies | recrear como `TO authenticated` donde el usuario sea consumidor | C2 | B3 coordinado con grants; restaurar definición exacta |
| policy redundante de planeaciones | ALL y cuatro específicas se solapan | inicializador | consolidar solo tras equivalencia exacta | C2 | B3; pruebas CRUD y rollback de cinco definiciones |
| secuencia anon | S/U/UPDATE sin consumidor | ninguna inserción anon autorizada | revocar todo | C1 | B2, ACL read-only; regrant |
| secuencia authenticated | S/U/UPDATE; identity necesita U(SAGE) | creación normal planeación | conservar USAGE; revocar SELECT/UPDATE | C2 | B2, INSERT reversible; hueco aceptado; regrant sin setval |
| secuencia service_role | igual | helpers admin/worker potenciales | conservar USAGE; revocar SELECT/UPDATE | C2 | B2, regresión técnica; regrant |
| jobs/items de examen | user + worker comparten superficie | 03C/03D2C y service | mínimo por rol; polling intacto | C2 | B1+B3, no duplicar 03C salvo brecha ACL |
| ai metrics jobs/calls | policies de usuario sin consumidor; admin-only real | `aiMetrics.service.js` | invisibles/inmutables a anon/auth | C2 | B4/03D3C3; metadata + regresión métricas admin; rollback |
| ai_model_prices | auth SELECT pero backend usa admin | no frontend directo | retirar auth tras decisión de acceso futuro | C2/C3 | B4/03D3C3 |
| `profiles`/`user_settings` | trigger + policies usuario; Auth probado | 03D3C1 | conservar hasta decisión de contrato de cuenta | KEEP/C3 | B4/03D3C3 |
| `user_profiles` | legacy expuesta sin consumidor | búsqueda versionada | retirar acceso o tabla exige decisión de retención | C3 | B4/03D3C3 |
| `ia_metrics_legacy` | admin grants, sin policy/consumidor | schema; app intenta `ia_metrics` ausente | decisión de drift/retención | C3 | B4/03D3C3 |
| default privileges `postgres` | 48 filas observadas, incluidos MAINTAIN y EXECUTE futuro | owner de sus propios defaults; autoridad de sesión por reconfirmar | paquete separado por tablas/secuencias/funciones | C2 | B0-defaults; rollback exacto por grantor/schema |
| default privileges `supabase_admin` | 48 filas observadas; lectura no demuestra autoridad ni seguridad del cambio | rol administrado por Supabase | no cambiar hasta comprobar membership y contrato de plataforma | C2 bloqueado | B0-defaults; detener ante autoridad insuficiente |
| EXECUTE futuro | defaults conceden a cuatro roles | RPC futuro podría necesitar concesión explícita | retirar defaults amplios; GRANT explícito por RPC | C2 | B0-functions-default; decisión previa |
| service_role estructural | siete privilegios y defaults amplios | workers/admin reales | no revocar en bloque | C2 | B0-service-role después de pruebas |
| workers durables/reconciliación | timers, reinicio, atomicidad | 03C | sin cambio ACL aquí | C4 | fase operativa posterior |
| Storage | fuera de tablas public auditadas | frontend Storage directo | sin cambio | C4 | 03E |

## División B0–B4

### 03D3C2-B0-current — objetos existentes

Completado en Supabase test: se revocaron los siete privilegios portables de anon sobre 17 tablas, TRUNCATE/REFERENCES/TRIGGER de authenticated y USAGE/SELECT/UPDATE de anon sobre `planeaciones_id_seq`. MAINTAIN ya estaba ausente y no formo parte de la migracion. Postverify 15/15 y regresiones 140 PASS; rollback exacto disponible y no ejecutado.

### 03D3C2-B0-defaults — objetos futuros

Separa los defaults de `postgres` y `supabase_admin`, y dentro de cada grantor separa tablas, secuencias y funciones. PostgreSQL permite cambiar los defaults propios o de roles de los que el ejecutor es miembro; que el catálogo sea legible no acredita esa membership. La sesión de SQL Editor todavía no ha demostrado autoridad sobre `supabase_admin`, por lo que ese cambio es C2 bloqueado. Tampoco se asume que modificar sus defaults sea compatible con la plataforma administrada.

### 03D3C2-B0-functions-default — EXECUTE futuro

Evalúa retirar EXECUTE futuro a anon/authenticated/service_role. Una RPC pública futura que lo necesite deberá recibir un GRANT explícito revisable. No se modifica en esta fase de auditoría y no se mezcla con las ACL de las seis funciones ya endurecidas por 03D3C1.

### 03D3C2-B0-service-role — autoridad técnica

Mantiene service_role fuera de C1. Workers, métricas y helpers admin tienen consumidores demostrados; cualquier reducción necesita pruebas por operación y no puede hacerse mediante una revocación administrativa en bloque.

### 03D3C2-B1 — DML authenticated por tabla

Una decisión por tabla. Mantener primero los grants que sostienen Biblioteca, Archivados, Quick Create y cleanup. Reducir únicamente después de una prueba que cubra operación propia, cruzada y anónima y conserve reversibilidad. Los harnesses no justifican privilegios de producto, pero tampoco pueden perder cleanup antes de una alternativa autorizada. No agrupar jobs/items, recursos derivados, jerarquía congelada y cuenta.

### 03D3C2-B2 — secuencias

Revocar todo a anon; conservar USAGE y retirar SELECT/UPDATE a authenticated/service_role solo después de una prueba identity en test. La prueba crea una planeación sintética propia sin ID, confirma owner y respuesta, y la elimina; el valor consumido queda como hueco legítimo. No usar `nextval`, `setval`, SQL manual ni prometer rollback del contador.

### 03D3C2-B3 — policies técnicas

Cambiar roles `TO PUBLIC` a `TO authenticated` por tabla, coordinado con grants. Primero recursos activos y jobs de examen con A/B/anon y sus APIs; no repetir polling 03C salvo verificar que el cambio de rol no alteró su contrato. Un error de grant no demuestra RLS y viceversa. Rollback recrea nombre, comando, permissiveness, rol, USING y WITH CHECK exactos.

### 03D3C2-B4 — superficies admin, métricas y legacy

`ai_generation_jobs`, `ai_generation_calls`, `ai_model_prices`, `user_profiles` e `ia_metrics_legacy` requieren decisión de ciclo de vida/retención; `profiles` y `user_settings` requieren conservar aprovisionamiento Auth. No crear fixtures métricos. Las decisiones destructivas o de producto pasan a 03D3C3; las revocaciones admin-only no se mezclan con worker durability.

## Preflight read-only y criterios de parada

El paquete [03D3C2A](test-environment/03d3c2a_acl_policy_preflight.sql) contiene siete sentencias independientes:

1. `server_version_num`, current_user, session_user y gate PG15/PG17.
2. 19 tablas × cinco roles × siete privilegios portables.
3. 19 × 5 filas de MAINTAIN: `supported` en PG17 o `not_supported` en PG15, sin pasar el token desconocido a `has_table_privilege`.
4. Todas las policies públicas, roles y expresiones estructurales.
5. Todas las secuencias públicas, ownership/dependencia y ACL S/U/UPDATE.
6. Default privileges y autoridad de la sesión sobre `postgres`/`supabase_admin`.
7. Membership directa o transitiva de anon/authenticated, incluida `pg_maintain`.

Solo devuelve metadata catalogal. No devuelve datos, emails, UUID, cuerpos de funciones, tokens o secretos. Los nombres catalogales se convierten elemento por elemento a `text` antes de agregarse. Debe detener B0 ante versión distinta de 15.x/17.x, tablas/policies/secuencias faltantes o adicionales, privilegios heredados, membership de anon/authenticated en `pg_maintain`, grantor/default inesperado, autoridad insuficiente, o MAINTAIN soportado pero no inventariado. En PG17 el contrato es 19 × 5 × 8; en PG15 es 19 × 5 × 7 más 95 estados `not_supported`.

## Estrategia PostgreSQL 15/17

| Opción | Ventajas | Riesgos | Decisión |
|---|---|---|---|
| SQL separado por versión | muy explícito | duplica siete privilegios comunes y favorece drift | descartada |
| bloque condicional | una transacción | exige DDL dinámico o ramas difíciles de auditar; mayor riesgo fail-open | no recomendado |
| paquete común + complemento PG17 MAINTAIN | SQL común legible; complemento constante; postverify/rollback separados | dos artefactos en PG17 y coordinación de orden | **recomendado** |

La decision final de B0-current fue un paquete comun de privilegios portables, sin sintaxis MAINTAIN: el preflight live confirmo que MAINTAIN ya estaba ausente para los roles runtime en PG17. El postverify conserva esa ausencia como invariante. Produccion 15.8 no ha recibido el paquete y requerira su propio preflight antes de preparar una promocion controlada.

## Autoridad sobre default privileges

La documentación oficial de [PostgreSQL 15](https://www.postgresql.org/docs/15/sql-alterdefaultprivileges.html) y [PostgreSQL 17](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) establece que un rol puede cambiar sus propios default privileges o los de un rol del que sea miembro; los defaults no se heredan al crear objetos. El grantor registrado en `pg_default_acl` es el rol cuyos objetos futuros reciben esos defaults. Los roles no tienen un “owner” independiente equivalente al owner de una tabla: aquí `postgres` o `supabase_admin` son el owner lógico de cada conjunto de defaults. PostgreSQL 17 incorpora [MAINTAIN y el rol predefinido `pg_maintain`](https://www.postgresql.org/docs/17/release-17.html); PostgreSQL 15 no acepta MAINTAIN en la sintaxis de grants/default privileges.

El preflight ampliado confirmo `current_user=session_user=postgres`: la sesion puede alterar defaults de `postgres`, pero `current_user_can_alter_defaults=false` para `supabase_admin`. Leer sus 48 filas no autoriza alterarlas ni demuestra compatibilidad con la plataforma. B0-defaults/postgres sigue separado; B0-defaults/supabase_admin permanece C2 bloqueado.

## Promoción y límites

La futura secuencia es preflight en Supabase test, paquete pequeño, postverify, pruebas dirigidas, rollback disponible y evidencia limpia; solo después puede prepararse una promoción equivalente para producción. El inicializador, migración y estados test/producción deben actualizarse juntos para evitar drift. Test está adelantado: contiene 03D3A/B y 03D3C1; producción no.

03D3C2-B0-current esta completado en test; 03D3C2 en conjunto sigue abierta por defaults, B1-B4 y superficies C2/C3. 03D3C3, 03E y 03F siguen pendientes; Fase 03 continua abierta. Esta auditoria no certifica produccion, workers durables, Storage ni E2E completo.


## Continuidad B0-current

El preflight ampliado confirmo PG17.6, MAINTAIN ausente para los cuatro roles runtime, cero memberships, 49 policies, una secuencia y 96 defaults. B0-current fue aplicado en Supabase test. El defecto public-only del primer postverify fue corregido sin cambiar la migracion: el diagnostico confirmo 6/6 funciones y 16/16 triggers, y el postverify corregido devolvio sus 15 predicados verdaderos. Las regresiones post-B0 sumaron 140 PASS y cleanups completos. B0-defaults, B0-functions-default, B0-service-role y B1-B4 siguen pendientes; produccion permanece intacta.
