# Educativo IA — 03D1 metadatos, policies/grants e integridad relacional

Fecha: 2026-10-18. Estado: **03D1 completada y validada mediante metadata read-only en Supabase test. Fase 03 continúa abierta.** 03C quedó completada en `fac93a2` (`fix(security): enforce exam generation authority`). La evidencia live fue aportada por el operador y se documenta solo mediante conclusiones sanitizadas; el archivo fuente no se copia ni versiona.

## Fuentes y límite de evidencia

Se revisaron `AGENTS.md` y README de ambos repositorios; arquitectura, esquema, ambientes y seguridad; documentos 03A–03C; inventario y matriz 03A; `initialize_application.sql`, verificadores y snapshots de `docs/test-environment`; consultas de diagnóstico; routes/controllers/services consumidores y pruebas actuales. No existen migraciones incrementales equivalentes: el inicializador reproduce un snapshot y no debe ejecutarse para esta auditoría.

El SQL esperado contiene 19 tablas públicas, RLS habilitada en las 19, 49 policies públicas, 76 constraints, 41 FKs, 15 triggers públicos más uno sobre `auth.users` y seis funciones propias. `ia_metrics_legacy` tiene RLS sin policy; `ai_model_prices` solo permite SELECT a `authenticated`. Las demás policies de usuario se basan principalmente en `auth.uid() = user_id` o `id`, y casi todas se declaran `TO PUBLIC`. Los grants versionados son más amplios que las operaciones que las policies dejan visibles; deben compararse con test antes de proponer revocaciones.

## Inventario versionado

Leyenda: `S/I/U/D` son SELECT/INSERT/UPDATE/DELETE; `ALL` cubre las cuatro. “Owner directo” significa una columna propia; “mixto” combina owner directo con padres relacionales. Todas las conclusiones de esta tabla son **esperadas según SQL versionado**.

| Tabla | PK | Propiedad | RLS / operaciones y policies | FKs salientes e incoming / ON DELETE | Triggers | Consumidor | Riesgo principal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `planteles` | `id uuid` | directa `user_id` | RLS; `ALL TO PUBLIC`, owner en USING/CHECK | user→Auth CASCADE; recibe grados CASCADE, batches/exámenes SET NULL | updated_at | jerarquía, exámenes | Policy no valida hijos; grants/rol efectivos pendientes |
| `grados` | `id uuid` | mixta: `user_id` + plantel | RLS; `ALL TO PUBLIC` | plantel/user CASCADE; recibe materias CASCADE, batches/exámenes SET NULL | ownership plantel + updated_at | jerarquía, exámenes | Trigger sí valida owner del plantel; confirmar función/search_path |
| `materias` | `id uuid` | mixta: `user_id` + grado | RLS; `ALL TO PUBLIC` | grado/user CASCADE; recibe unidades CASCADE, batches/exámenes SET NULL | ownership grado + updated_at | jerarquía, exámenes | Trigger sí valida owner del grado; confirmar ACL |
| `unidades` | `id uuid` | mixta: `user_id` + materia | RLS; `ALL TO PUBLIC` | materia/user CASCADE; recibe temas/exámenes CASCADE, listas/batches SET NULL | updated_at | jerarquía y generadores | No hay trigger de owner materia en snapshot |
| `temas` | `id uuid` | mixta: `user_id` + unidad | RLS; `ALL TO PUBLIC` | unidad/user CASCADE; recibe planeaciones/listas SET NULL | ownership unidad + updated_at | jerarquía y generación | Trigger valida unidad; updates relacionales siguen habilitados |
| `planeacion_batches` | `id uuid` | mixta: `user_id` + jerarquía | RLS; S/I/U/D `TO PUBLIC`, solo owner | user CASCADE; jerarquía SET NULL; recibe documentos SET NULL | ninguno | planeaciones/Biblioteca/exámenes | Ninguna relación padre se valida por policy/trigger |
| `planeaciones` | `id bigint identity` | mixta: `user_id` + tema/batch | RLS; policies redundantes ALL+S/I/U/D `TO PUBLIC` | tema/batch SET NULL; user NO ACTION; recibe anexo/lista CASCADE | owner tema + updated_at | planeaciones, Biblioteca, derivados | Trigger cubre tema, no batch; policy UPDATE histórica sin CHECK se solapa con ALL |
| `anexos` | `id uuid` | mixta: `user_id` + relaciones | RLS; S/I/U/D `TO PUBLIC`, solo owner | planeación/user CASCADE; tema/unidad/batch sin FK | ninguno | anexos/Biblioteca | Columnas relacionales sin FK ni validación común de owner |
| `listas_cotejo` | `id uuid` | mixta | RLS; S/I/U/D `TO PUBLIC`, solo owner | planeación/user CASCADE; tema/unidad/batch SET NULL | updated_at | listas/Biblioteca | FK asegura existencia, no propietario común |
| `examenes` | `id uuid` | mixta | RLS; S/I/U/D `TO PUBLIC`, solo owner | unidad CASCADE; user CASCADE; jerarquía/batch/job SET NULL | updated_at | exámenes/Biblioteca | Relaciones múltiples modificables sin policy relacional |
| `examen_generation_jobs` | `id uuid` | mixta/técnica | RLS; S/I/U/D `TO PUBLIC`, solo owner | user CASCADE; examen SET NULL; jerarquía sin FK | ninguno | HTTP polling + worker admin | Usuarios conservan CRUD directo; referencias jerárquicas no tienen FK |
| `examen_generation_items` | `id uuid` | mixta/técnica | RLS; S/I/U/D `TO PUBLIC`, solo owner | job/user CASCADE; tema sin FK | ninguno | worker admin | Owner de item puede diferir de job/tema |
| `ai_generation_jobs` | `id uuid` | técnica con owner | RLS; S/I/U `TO PUBLIC` | solo user CASCADE; IDs de artefactos sin FK | ninguno | `aiMetrics.service.js` admin | Métrica técnica escribible por usuario según policy/grants esperados |
| `ai_generation_calls` | `id uuid` | técnica con owner/job | RLS; S/I `TO PUBLIC` | job/user CASCADE | ninguno | `aiMetrics.service.js` admin | INSERT directo podría asociar job de otro owner si grants lo permiten |
| `ai_model_prices` | `id uuid` | técnica sin owner | RLS; S a `authenticated` | ninguna | ninguno | métricas | Lectura global intencional; escritura depende de ACL/admin |
| `ia_metrics_legacy` | `id uuid` | técnica sin owner | RLS; sin policies | ninguna | ninguno | referencia histórica | Tabla distinta de `ia_metrics`; no corregir aquí |
| `profiles` | `id uuid` | directa por `id` | RLS; S/I/U `TO PUBLIC` | id→Auth CASCADE | updated_at; alta Auth la crea | Auth/perfil | Contiene PII; 03D1 solo cuenta filas, nunca lee columnas |
| `user_profiles` | `user_id uuid` | directa | RLS; S/I/U `TO PUBLIC` | user→Auth CASCADE | ninguno | datos de tester, no autoridad | No la crea el trigger Auth; role/is_test_user no son autoridad |
| `user_settings` | `user_id uuid` | directa | RLS; S/I/U `TO PUBLIC` | user→Auth CASCADE | updated_at; alta Auth la crea | configuración | JSON privado; 03D1 solo cuenta filas |

Las policies versionadas no usan subqueries para tablas públicas ni comprueban padres. Los únicos controles relacionales de propietario están en triggers para grado→plantel, materia→grado, tema→unidad y planeación→tema. `handle_new_user` es `SECURITY DEFINER`; crea `profiles` y `user_settings`, no `user_profiles`. El paquete recupera firma exacta, tipo, owner, lenguaje, `prosecdef`, volatilidad, paralelismo, evidencia acotada de `search_path` y ACL sin devolver cuerpos ni ejecutar funciones.

## Paquete read-only

[03d1_metadata_audit.sql](test-environment/03d1_metadata_audit.sql) contiene exactamente 17 sentencias independientes. Cada una tiene un marcador `AUDIT_STATEMENT` validado contra el manifiesto ejecutable:

1. Identidad no sensible del servidor.
2. Tablas, columnas/defaults, owner y flags RLS.
3. Policies completas.
4. ACL explícitas y privilegios efectivos de tablas, secuencia y funciones para `PUBLIC`, `anon`, `authenticated` y `service_role`.
5. PK/UNIQUE/CHECK/FK, columnas, deferrability y acciones.
6. Triggers y funciones propias, incluido modo de seguridad/search_path/ACL.
7. Índices de propiedad y relaciones.
8. Conteos por tabla y status.
9. Jobs activos, jobs sin items, items sin job y exámenes sin job.
10. Agregados de mismatch/orphan para jerarquía, batches, planeaciones, derivados, exámenes, jobs/items y métricas.

No consulta filas Auth/Storage, IDs, títulos, nombres, emails, prompts, contenido o metadata. Las lecturas de aplicación devuelven únicamente `count`, status normalizado y etiquetas constantes.

### Corrección de seguridad y manifiesto final

La revisión offline inicial detectó dos bloqueos: la consulta de funciones devolvía `pg_get_functiondef(...)`, y el bloque de conteos referenciaba directamente la tabla histórica opcional `public.ia_metrics_legacy`. Se retiró el cuerpo completo sin sustituirlo por hash: para la decisión de seguridad bastan atributos estructurados, ACL explícito y privilegios efectivos. Las seis funciones se seleccionan por schema, nombre y firma de identidad exacta `()`; una sobrecarga no entra en el resultado.

`ia_metrics_legacy` aparece ahora en el inventario catalogal como objeto esperado con `exists`, tipo, owner y flags RLS. El conteo se omite porque PostgreSQL no permite contar condicionalmente una relación ausente sin SQL dinámico. Los triggers se limitan a las 19 tablas inventariadas y `auth.users`. Defaults, constraints, índices y predicados de índice usan `md5` sobre la representación normalizada que producen las funciones `pg_get_*`; el hash no revela el texto y es reproducible para la misma definición en PostgreSQL 17.6. No se calcula hash de cuerpos de funciones. Policies conserva `qual` y `with_check` porque son necesarios para revisar RLS; si contienen literales inesperados no deben copiarse al reporte. `proconfig` expone solo entradas `search_path` y el número total de entradas, no otros valores.

| Sentencia | Bloque | Fuente principal | Resultado | Máximo razonable |
| ---: | --- | --- | --- | ---: |
| 1 | 00 | identidad del servidor | metadata | 1 |
| 2 | 01 | `pg_class`, `pg_namespace` | existencia/RLS de 19 objetos | 19 |
| 3 | 01 | catálogos de columnas/defaults | metadata | 257 |
| 4 | 02 | `pg_policies`, solo 19 tablas public | metadata | 49 |
| 5 | 03 | ACL de tablas inventariadas | metadata | 532 |
| 6 | 03 | ACL de `planeaciones_id_seq` | metadata | 12 |
| 7 | 03 | ACL de seis firmas exactas | metadata | 24 |
| 8 | 03 | privilegios efectivos de tablas | metadata | 399 |
| 9 | 03 | privilegios efectivos de secuencia/funciones | metadata | 27 |
| 10 | 04 | constraints de 19 tablas | metadata/hash | 76 |
| 11 | 05 | triggers acotados | metadata estructurada | 16 |
| 12 | 05 | seis funciones exactas | metadata, sin cuerpo | 6 |
| 13 | 06 | índices de 14 tablas relacionales | metadata/hash | 69 |
| 14 | 07 | 18 tablas requeridas | conteos | 18 |
| 15 | 07 | tres tablas de jobs/items | status normalizado | 16 |
| 16 | 07 | jobs/items/exámenes | conteos residuales | 5 |
| 17 | 08 | relaciones de aplicación | 37 agregados | 37 |

El snapshot versionado contiene 49 policies sobre las 19 tablas `public` y ocho sobre `storage.objects`: cuatro de `planeacion-actividades` y cuatro históricas `avatars_*`. 03D1 no lee filas de `storage.objects` ni inventaría sus policies live; 03E es owner de Storage. El bucket `avatars` no existe y no debe crearse. Sus cuatro policies versionadas no prueban existencia del bucket ni presencia actual de esas policies en test; la metadata remota deberá confirmarlo antes de cualquier propuesta, sin corregirlas en 03D1.

El validador reconoce comentarios anidados, strings, identificadores entre comillas y dollar quotes; exige el manifiesto exacto, fuentes allowlisted por sentencia y funciones catalogales allowlisted. Rechaza DML aun dentro de CTE, `SELECT INTO`, DDL, control de sesión, locks, fuentes Auth/Storage/Vault y funciones de archivos, large objects, secuencias mutables, red, Vault, cancelación, sleep o locks. Sigue siendo un scanner conservador, no un parser PostgreSQL: la revisión humana del diff, del manifiesto y de cada resultado continúa siendo obligatoria.

## Evidencia live sanitizada

El operador confirmó visualmente `educativo-backend-test` / `gwdtlbisykzzplgzczzq` y ejecutó las 17 sentencias read-only. La sentencia 10 corregida con `AS k(attnum, position)` funcionó y devolvió 76 filas. No hubo SQL productivo, escrituras, DDL ni cambios de policies, grants o funciones.

Las cardinalidades observadas fueron: `1, 19, 257, 49, 372, 9, 24, 399, 27, 76, 16, 6, 63, 18, 1, 5, 37`. Todas coinciden con el valor exacto esperado o permanecen dentro del máximo del manifiesto. Los 19 objetos existen, los 19 tienen RLS, ninguno usa FORCE RLS e `ia_metrics_legacy` existe. Los 76 constraints se distribuyen en 19 PK, 41 FK, 7 UNIQUE y 9 CHECK. Los 63 índices corresponden al subconjunto relacional de la sentencia 13; no sustituyen el total global histórico de 69.

Las 37 comprobaciones agregadas evaluaron las relaciones presentes sin `mismatch_count` ni `orphan_count`. No había jobs de examen pending/processing, jobs de examen sin items, items sin job ni exámenes con generation job ausente. Estos valores describen únicamente el instante de consulta y no crean constraints permanentes.

Conteos de datos publicados de forma segura: dos `profiles`, dos `user_settings`, cero `user_profiles`; cero jobs/items/exámenes de examen. Existían fixtures sintéticos de jerarquía, batches, planeaciones y un anexo, además de una pareja técnica job/call de métricas, sin publicar IDs, nombres ni contenido.

### Policies, ACL y funciones

Se observaron 49 policies `public`: 48 dirigidas a `PUBLIC` y una a `authenticated`; 48 contienen `auth.uid()` y la restante es el SELECT global esperado de precios. Las tablas técnicas conservan 13 policies: dos para calls de IA, tres para jobs de IA y cuatro para cada tabla de jobs/items de examen. `planeaciones` conserva cinco policies solapadas: `ALL` más SELECT/INSERT/UPDATE/DELETE específicos.

Las ACL explícitas de tablas suman 372 filas. `anon` y `authenticated` reciben los siete privilegios de tabla sobre 17 tablas; `authenticated` añade SELECT de `ai_model_prices`. `service_role` recibe los siete privilegios sobre las 19. En consecuencia, `anon` y `authenticated` tienen efectivamente, entre otros, TRUNCATE, REFERENCES y TRIGGER sobre 17 tablas. RLS filtra operaciones por fila, pero no protege TRUNCATE. Esta superficie viola mínimo privilegio; no demuestra por sí sola una ruta explotable mediante PostgREST.

La secuencia `planeaciones_id_seq` concede SELECT, USAGE y UPDATE efectivos a `anon`, `authenticated` y `service_role`. Las seis funciones conceden EXECUTE a `PUBLIC`, y el permiso es efectivo para los tres roles revisados. Cinco funciones son invoker. `handle_new_user` es `SECURITY DEFINER`, con `search_path_settings=[]` y `config_entry_count=0`: ausencia confirmada de `search_path` fijo, hallazgo alto para 03D3. No se solicitaron ni expusieron cuerpos.

Las ocho policies Storage no formaron parte de esta evidencia. Permanecen en 03E; no se afirma que las policies históricas `avatars_*` existan live.

## Mapa de drift

| Objeto | Versión esperada | Valor test observado | Coincide | Impacto | Acción |
| --- | --- | --- | --- | --- | --- |
| Tablas/RLS | 19 tablas, RLS on, FORCE off | 19/19 existen; RLS 19/19; FORCE 0 | Sí en estas dimensiones | estructura base confirmada | 03D2 prueba comportamiento por actor |
| Policies | 49 public; mayoría owner-only `TO PUBLIC` | 49; 48 PUBLIC, una authenticated | Sí en conteo/roles revisados | superficie amplia confirmada | 03D2 prueba aislamiento; 03D3 mínimo privilegio |
| Grants tablas/secuencia | ACL reproducidas por inicializador | ACL amplias; secuencia S/U/UPDATE para tres roles | Sí en privilegios observados | TRUNCATE y otros no dependen de RLS | revisar necesidades y revocar en 03D3 |
| EXECUTE funciones | ACL versionadas de seis funciones | PUBLIC y efectivo para anon/auth/service_role | Sí | EXECUTE excesivo; explotabilidad no demostrada | reducir en 03D3 |
| Constraints/FKs | 76 constraints, 41 FK, acciones versionadas | 19 PK, 41 FK, 7 UNIQUE, 9 CHECK | Sí en conteo/metadata | FK no garantiza owner común | casos relacionales 03D2; garantías 03D3 |
| Triggers | 15 públicos + uno sobre Auth esperados | 16 | Sí en conteo | cobertura de ownership incompleta | validar comportamiento en 03D2 |
| Funciones | seis propias; `handle_new_user` definer | seis; definer sin search_path fijo | Drift de hardening confirmado | riesgo de resolución de nombres | alta prioridad 03D3 |
| Índices | 69 globales esperados; subconjunto auditado | 63 en subconjunto | No comparable con total global | no se confirmó drift | comparar por objeto solo si 03D3 lo requiere |
| Conteos/status | jobs/items de examen esperados en cero | cero; un job técnico de métricas completado | Estado puntual | no implica reconciliación permanente | mantener reconciliación en 03D3 |
| Integridad owner/orphan | ideal mismatch=0, orphan=0 | 37 checks, ambos conteos en cero | Sí en el instante consultado | no es constraint | intentar relaciones adversariales en 03D2 |

## Plan ejecutable agrupado para 03D2

No se implementa en 03D1. **Este bosquejo quedó sustituido por el alcance revisado de [03D2](ISOLATION_03D2_SCOPE.md):** la jerarquía es una dependencia congelada y no será objeto de un CRUD exhaustivo. Se reutilizarán dos identidades sintéticas A/B; cada fixture tendrá runId, ID reservado/confirmado y ledger privado, e INSERT incierto nunca se limpiará automáticamente.

| Grupo | Fixtures y orden | Casos mínimos agrupados | Capas | No efecto / limpieza | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Jerarquía | A/B: plantel→grado→materia→unidad→tema | lectura propia/ajena/anon; INSERT propio y owner B falsificado; grado/unidad con padre ajeno; UPDATE propio/ajeno; cambio owner/padre; DELETE propio/ajeno | API + REST directo | snapshots A/B y descendientes; limpiar hijo→raíz | cascadas; usar copias exclusivas |
| Batch/planeación | batch y planeación por actor sobre jerarquía propia | owner falsificado; batch con jerarquía B; planeación con tema/batch B; edición/owner/relación; delete cruzado/propio | REST; API para PUT/delete soportado | comparar filas y derivados; planeación→batch | bigint, NO ACTION user, SET NULL |
| Derivados | planeación exclusiva + anexo/lista; examen terminal sin generación | lectura; INSERT propio/falsificado/padre ajeno; UPDATE relación/owner; DELETE propio/ajeno | REST y GET/DELETE API donde existe | verificar padre y todos los derivados; hijo antes de padre | unique por planeación y cascadas |
| Jobs/items IA métricas | job métrico + call mínimos solo si ACL/policies 03D1 lo autorizan y cleanup está demostrado | S/I/U owner/ajeno; call con job ajeno; DELETE solo si contrato real lo permite | REST directo | conteos y snapshots exactos; call→job | tablas técnicas podrían no tener DELETE de usuario |
| Jobs/items/exámenes | jobs terminales A/B, items terminales mínimos solo si constraints lo exigen, examen sintético sin worker | polling propio/cruzado/anon; INSERT owner falsificado; item job/tema ajeno; UPDATE owner/relación; DELETE cruzado/propio | API polling + REST directo | cero worker/OpenAI; examen→items→job, romper ciclo si aplica | ciclo job↔examen y SET NULL |

La matriz cubre por familia: lectura propia/ajena/anónima, INSERT propio/falsificado/padre ajeno, UPDATE propio/ajeno/owner/relación y DELETE propio/ajeno. No se ejecutarán 310 procesos aislados: las aserciones comparten fixtures pero cada mutación destructiva usa una copia fresca y verifica before/after.

## Propuestas condicionadas para 03D3

Ninguna se implementa antes de completar el mapa de drift y 03D2.

### Integridad común de propietario

- Policies pueden exigir owner del padre mediante `EXISTS` tanto en `WITH CHECK` como en `USING`, pero duplican lógica y no protegen escrituras admin.
- `CHECK` no puede consultar otras tablas de forma segura; no es solución para owner común.
- Triggers pueden cubrir unidad→materia, batch→jerarquía, documentos→padres y items→job/tema, pero deben fijar `search_path`, manejar null y considerar backfill/mismatches existentes.
- Constraints compuestas `(id,user_id)` + FKs compuestas son más declarativas, pero requieren UNIQUE adicionales, migración de todas las referencias y compatibilidad con SET NULL/cascadas.
- RPC transaccional puede concentrar validación y mutación para flujos complejos. Su ACL y modo definer/invoker deben limitarse explícitamente.

### Atomicidad de exámenes

- Corto plazo: RPC transaccional para job+items, y otra operación atómica para segunda validación+INSERT examen+completed, solo si 03D1/03D2 confirman policies y datos compatibles.
- Reconciliación: job `pending` envejecido sin items/agenda debe identificarse por criterios estables y pasar a `failed` de forma idempotente; nunca reanudar generación automáticamente en esta fase.
- Idempotencia técnica: clave de ejecución/estado esperado y unicidad de `generation_job_id`; analizar duplicados existentes antes de constraint.
- Fase 13 conserva durabilidad completa de colas, reintentos distribuidos, recuperación de procesos y semántica comercial; 03D3 solo cerraría atomicidad e integridad inmediata.

### Policies, grants y funciones

- Cambiar `TO PUBLIC` a `authenticated` donde la operación es de usuario, tras verificar que anon no depende del grant/policy.
- Retirar UPDATE/DELETE directo de jobs/items y métricas si ningún consumidor legítimo lo necesita; el worker conservaría admin interno.
- Reducir grants de tabla/secuencia a las operaciones realmente cubiertas por API/RLS; RLS no sustituye mínimos privilegios.
- Revisar `handle_new_user` y cualquier función definer: owner controlado, `SET search_path` fijo y EXECUTE revocado de roles innecesarios.
- Eliminar policies redundantes de planeaciones solo después de comparar semántica efectiva; no asumir equivalencia por nombre.

## Procedimiento manual para Rafael

### Incidente corregido de compatibilidad

En el primer intento read-only, las sentencias 1–9 terminaron sin error y `AUDIT_STATEMENT 10` se detuvo antes de producir resultado con PostgreSQL `42703`, porque las dos expansiones `unnest(... WITH ORDINALITY) AS k` intentaban acceder a los nombres implícitos `k.unnest` y `k.ordinality`. No hubo escrituras y 11–17 no se ejecutaron en ese intento.

La corrección declara `AS k(attnum, position)` tanto para `con.conkey` como para `con.confkey`, conserva la correlación local con `c.oid`, la referenciada con `rc.oid` y ordena ambos arrays por `k.position`. La revisión del paquete encontró otro alias implícito de `unnest` en la lectura de `proconfig`; ahora declara `AS config(setting)` sin cambiar la columna pública `search_path_settings`. La repetición live de la sentencia 10 funcionó y produjo las 76 filas esperadas; después se completaron 11–17.

1. Abrir Supabase Dashboard y seleccionar visualmente **educativo-backend-test**, Project ID **gwdtlbisykzzplgzczzq**.
2. Confirmar que no aparece `bfnkaqmhcsyxdxoqnahk` ni un proyecto productivo.
3. Abrir SQL Editor y el archivo [03d1_metadata_audit.sql](test-environment/03d1_metadata_audit.sql).
4. Revisar el encabezado. Detenerse si cualquier sentencia no inicia con `SELECT` o `WITH`.
5. Para una revisión futura, ejecutar el paquete por secciones y detenerse ante el primer error. No ejecutar el inicializador ni texto devuelto como SQL.
6. Conservar los resultados en el orden de bloques. No editar valores para hacerlos coincidir.

Formato seguro a devolver: nombre del bloque, número de filas y export tabular únicamente de las columnas emitidas. Para 07/08 devolver etiquetas, status agrupado y conteos. Para policies, revisar localmente `qual`/`with_check` y no copiarlos si contienen literales inesperados; basta informar la diferencia. No devolver UUID, filas, emails, nombres, títulos, contenido, prompts, metadata de aplicación, claves, tokens, headers, cookies, URLs firmadas ni settings adicionales. Si una salida contiene algo fuera de este contrato, detenerse y reportar solo bloque y naturaleza del dato.

## Estado

**03D1 completada y validada mediante metadata read-only en Supabase test. Fase 03 continúa abierta.** Los resultados live se compararon con el manifiesto y el SQL versionado; no se versionó la evidencia fuente. Los 310 casos conservan sus niveles actuales y no se añadió PASS funcional. 03D2 debe comprobar comportamiento adversarial A/B/anon y 03D3 debe resolver hardening condicionado por esta evidencia. 03E y 03F permanecen pendientes.

La superficie funcional para esas pruebas se delimitó, sin conexiones remotas, en [ISOLATION_03D2_SCOPE.md](ISOLATION_03D2_SCOPE.md). El alcance reconoce Biblioteca como único flujo visual principal, congela la jerarquía como dependencia interna de Quick Create, generación o Archivados y mantiene el harness 03D2 sin implementar.
