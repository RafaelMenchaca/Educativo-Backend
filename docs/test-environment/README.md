# Inicialización revisable de pruebas — sesión 02C

Cierre posterior 02E/02F (2026-10-06): implementación de aislamiento y validación conectada completadas en el alcance de la [evidencia canónica](../ENVIRONMENT_SCHEMA_READINESS.md#cierre-02e02f--evidencia-manual-y-alcance-aprobado). Frontend/backend locales operan contra test; login, aprovisionamiento, API, aislamiento visual básico y Storage funcional aprobados por el usuario. Las listas históricas de pendientes de este documento quedan actualizadas por ese cierre; no se certifica la matriz adversarial RLS de Fase 03 ni se autoriza repetir el inicializador.

**Esquema inicializado y postflight aprobado en pruebas**, según evidencia manual proporcionada por el usuario desde Supabase SQL Editor el **2026-09-28**: `educativo-backend-test` / `gwdtlbisykzzplgzczzq` / `us-east-2` / PostgreSQL 17.6. **No volver a ejecutar el inicializador sobre este proyecto.** Producción prohibida: `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` / `us-east-2`. No es una autorización de lanzamiento.

El usuario confirmó una sola ejecución de `initialize_application.sql` (`Success. No rows returned`) y el postflight manual por bloques, con todas las comparaciones en OK. El [manifiesto](SOURCE_MANIFEST.md) registra los resultados completos, RLS, triggers, secuencia y FK, incluida `planeaciones_user_id_fkey` con ON UPDATE/DELETE NO ACTION. No se copiaron datos, usuarios ni objetos productivos y producción no fue modificada. El agente no ejecutó SQL ni verificó remotamente esta evidencia. La aprobación se limita al esquema: no acredita funcionamiento con usuarios ni aislamiento A/B/anon.

El [postflight](verify_initialization_readonly.sql) permanece reutilizable. El [preflight](preflight_target_readonly.sql) ahora debe mostrar 20 relaciones/secuencias public, 6 funciones propias public, 1 trigger personalizado auth.users y 8 policies storage.objects, según la evidencia recibida: incumple las cuatro condiciones de cero de forma intencional. La consulta informa esos valores; las guardias del inicializador rechazan el destino no vacío. No repetir la inicialización para comprobarlas.

[initialize_application.sql](initialize_application.sql) reproduce los objetos de aplicación observados en los CSV `bloque_01.csv`–`bloque_11.csv` aportados por el usuario. Origen PostgreSQL 15.8 comunicado; no se conectó al origen. [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md) registra cantidades y hashes de los archivos locales; los CSV no se incorporan a Git. La evidencia es el export, no una comprobación remota del estado actual ni un backup completo.

## Alcance y correspondencia

| Bloque del script | Evidencia y alcance |
| --- | --- |
| Preflight | Transacción, destino aprobado manualmente, ejecutor `postgres`, PostgreSQL >=15 y objetos gestionados requeridos. Rechaza relaciones/secuencias y funciones propias preexistentes en public, triggers personalizados en auth.users y policies previas en storage.objects. `confirmed_new_test_project` está en `true` por la evidencia de 02C.1. PostgreSQL no ofrece una fuente confiable para comprobar el Project ID: nombre/ID/región siguen siendo una precondición visual obligatoria. |
| 1. Tablas | CSV01: 19 tablas, 257 columnas; tipos, orden, nulabilidad, defaults y collation. Todas pertenecen a postgres. `planeaciones.id`: bigint identity BY DEFAULT y secuencia explícita `public.planeaciones_id_seq` con los parámetros verificados descritos abajo. |
| 2. Constraints | CSV02: 76 constraints validados, no diferibles. Primero PK/UNIQUE/CHECK, después todas las FK. Así se resuelve `examenes.generation_job_id` ↔ `examen_generation_jobs.examen_id`, sin quitar ni cambiar esas FK. |
| 3. Índices | CSV03: 69 en total, todos válidos/listos. 26 corresponden a PK/UNIQUE; se crean con sus constraints. Los otros 43 se crean explícitamente, incluidos índices parciales. |
| 4. Funciones | CSV08: las seis funciones propias public, cuerpos observados y propietario postgres; se usa CREATE, no CREATE OR REPLACE. No se copian auth.uid ni storage.foldername. |
| 5. RLS/policies | CSV04: las 19 tablas public con RLS habilitado y no forzado; 49 policies public y 8 policies de aplicación sobre storage.objects. `ia_metrics_legacy` no tiene policy. Se mantiene ese estado. |
| 6. Triggers | CSV05: 15 triggers public y exactamente uno sobre auth.users, todos habilitados en modo normal. No se crea ni modifica la definición de auth.users. |
| 7. ACL de aplicación | CSV06: 517 filas de permisos sobre tablas public y su secuencia, más los grants de las seis funciones de CSV08. Se limpian ACL heredadas SOLO de los objetos recién creados y se restauran permisos observados. No se modifican roles, esquemas, ACL de objetos internos ni default privileges. |

Los bloques 09/10 no muestran tipos propios ni dependencias de extensiones para estos objetos: los tipos son de pg_catalog. `gen_random_uuid()` existe en PostgreSQL 15; se exige su existencia sin instalar pgcrypto. CSV11 enumera extensiones instaladas (`plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`), no demuestra que todas sean necesarias. No se recrean extensiones.

### Destino y preflight previo (historial 02C.1; estado actualizado en 02C.2)

| Ambiente | Proyecto | Project ID | Región | PostgreSQL | Uso |
| --- | --- | --- | --- | --- | --- |
| Producción | `educativo-backend` | `bfnkaqmhcsyxdxoqnahk` | `us-east-2` — East US (Ohio) | 15.8 | Contiene esquema/datos vigentes. **No ejecutar la inicialización.** |
| Pruebas | `educativo-backend-test` | `gwdtlbisykzzplgzczzq` | `us-east-2` — East US (Ohio) | 17.6 (`170006`) | Inicializado y postflight aprobado el 2026-09-28; ya no es un destino vacío. |

Antes de la inicialización, el usuario ejecutó manualmente el preflight en el SQL Editor de pruebas: `current_user=postgres`; los cuatro contadores `public_relations_or_sequences`, `non_extension_public_functions`, `custom_auth_user_triggers` y `storage_object_policies` devolvieron 0. `auth.users`, `storage.objects`, `auth.uid()`, `storage.foldername(text)` y `gen_random_uuid()` estaban disponibles; `storage.objects` tenía RLS habilitado. Es evidencia pegada por el usuario, no una consulta remota del agente. En 02C.1 el script aún no se había ejecutado; la ejecución posterior y su verificación están registradas en 02C.2.

El salto PostgreSQL 15.8 → 17.6 está confirmado. La revisión estática de 02C.1 no encontró incompatibilidad concreta. En 02C.2, el usuario aportó evidencia de ejecución satisfactoria y postflight aprobado en 17.6. Esto acredita ese resultado de inicialización y los metadatos comprobados, no equivalencia completa entre versiones ni validación funcional de la aplicación. No se adapta el esquema sin evidencia.

### Reproducción funcional y huecos

- **Parámetros de identity cerrados con evidencia aportada por el usuario:** el usuario ejecutó en el Supabase actual la [consulta adicional acotada](../diagnostics/identity_sequence_metadata_readonly.sql) y pegó el resultado en la sesión 02C. Para `public.planeaciones.id` confirmó identity kind `d` (BY DEFAULT), secuencia `public.planeaciones_id_seq`, propietario `postgres`, tipo `bigint`, START 1, INCREMENT 1, MINVALUE 1, MAXVALUE 9223372036854775807, CACHE 1, NO CYCLE y dependencia `i`. El SQL incorpora exactamente esos parámetros. No se recibió un archivo fuente nuevo y no se atribuye hash a este resultado; el agente no lo verificó remotamente.
- No se copia `last_value`, no se usa `nextval`/`setval` y no se añade `RESTART`: el destino previsto es nuevo y sin datos productivos. La consulta complementaria permanece como procedimiento reproducible de diagnóstico, pero ya no bloquea los parámetros del borrador.
- CSV07 contiene 132 filas de default privileges para postgres/supabase_admin en public/storage. No se aplican: afectarían objetos futuros o internos y exceden la inicialización acotada. Los permisos de los objetos de aplicación existentes sí se reproducen explícitamente. La equivalencia de privilegios futuros **no** está acreditada.
- ACL y propietarios de esquemas/tablas internas de Storage/Auth siguen siendo responsabilidad del proyecto gestionado. Verificar su compatibilidad antes de ejecutar; no restaurar indiscriminadamente CSV06/07. El script exige USAGE de public para roles de la app; las autorizaciones gestionadas de Auth/Storage requieren validación en destino.
- No se reconstruyen comentarios, ajustes físicos, historial de migraciones ni objetos no cubiertos por el export. La collation `default` depende de la configuración del destino; no acredita equivalencia de ordenamiento entre instancias.
- No falta una tabla referenciada por las FK del script: todas apuntan a las 19 tablas creadas o a `auth.users`, que debe proveer Supabase. Los cuerpos de las seis funciones fueron revisados; sus dependencias son tablas incluidas, `NEW` y funciones estándar. No se encontraron consumidores `.rpc(...)` en `backend/src` ni `frontend/js`.

## Consumidores y diferencias con el snapshot histórico

| Objeto | Evidencia y consecuencia |
| --- | --- |
| `profiles` | Tabla adicional respecto de DATABASE_SCHEMA.md: `id` UUID PK/FK auth.users, full_name, email, avatar_url, created_at, updated_at. `handle_new_user` la inserta y `trg_profiles_updated_at` mantiene updated_at. No hay consumidor directo en JS actual. |
| `user_profiles` | Es OTRA tabla, con PK user_id; mantiene role='tester', is_test_user=true y campos tester_group/notes. No se encontró consumidor directo en JS ni provisión mediante handle_new_user. INSERT/UPDATE propios permitidos por policies y grants de tabla: esos campos no son autoridad comercial. No se asignan planes ni excepciones. |
| `user_settings` | `handle_new_user` crea una fila con settings `{}`; tiene trigger updated_at. Sin consumidor directo JS actual. No añadir un segundo aprovisionamiento desde backend/frontend. |
| Navbar/perfil | `frontend/js/ui/components.private.js`, `hydrateNavbarUser`, obtiene el usuario vía Auth; `handleProfileAction` mantiene acciones de perfil/configuración pendientes. No prueba uso de las tablas anteriores. |
| `ia_metrics_legacy` | Tabla adicional: id UUID, created_at, nivel, materia, prompt_version, tokens_prompt/completion/total, json_ok, error_tipo. PK conserva nombre `ia_metrics_pkey`. RLS sin policies. No hay `ia_metrics` en CSV01. |
| Escritura incompatible | `src/services/planeaciones.service.js`, `guardarMetricasIa` (línea 710), sigue insertando en `ia_metrics`. Error registrado de forma no bloqueante. El esquema reproduce legacy; no crea alias ni cambia el consumidor. Pendiente decidir corrección en otra sesión. |
| Métricas vigentes | `src/services/aiMetrics.service.js`, `createAiJob`, `logAiCall`, `finishAiJob`, usan ai_generation_jobs/calls; `getModelPrice` consulta ai_model_prices. Las tablas están en el export. Precios no incluidos; `calculateAiCost` devuelve 0 sin precio, lo que no acredita coste real cero. |

El snapshot histórico no incluía los cuerpos de funciones, el trigger de alta ni el inventario RLS/ACL. El script y los CSV son la evidencia para esta preparación; el snapshot se conserva con una advertencia de diferencias, sin presentarlo como estado desplegado completo. No se cambia [el contrato comercial](../PRODUCT_PLANS_CONSUMPTION.md).

## Seguridad observada: trabajo separado pendiente

1. Revisar UPDATE/INSERT propios sobre user_profiles y separar atributos comerciales de campos editables. Los defaults no definen política beta.
2. Revisar escrituras de usuario en ai_generation_calls (INSERT), ai_generation_jobs (INSERT/UPDATE), examen_generation_jobs/items (CRUD). Las métricas exportadas no son por ello un ledger confiable de consumo.
3. Revisar propiedad común entre relaciones. Hay triggers para grado→plantel, materia→grado, tema→unidad y planeación→tema; no equivalen a validación universal. Por ejemplo, anexos.planeacion_id, batches→jerarquía y examen/job tienen FK de existencia sin constraint compuesto de propietario ni trigger correspondiente. Esto evidencia una protección ausente en DB; no demuestra explotación ni acceso cruzado ejecutado. También revisar validaciones y uso admin del backend.
4. Revisar grants amplios (incluyen TRUNCATE/REFERENCES/TRIGGER en múltiples tablas y UPDATE en secuencia), default privileges y EXECUTE PUBLIC de funciones. RLS no convierte todos esos permisos en seguros.
5. Revisar `handle_new_user` SECURITY DEFINER sin search_path fijado. Se reproduce sin endurecimiento silencioso. Su cuerpo inserta SOLO profiles y user_settings con ON CONFLICT DO NOTHING.
6. Probar denegación entre dos usuarios sintéticos, writes de métricas/jobs, relaciones cruzadas y Storage. No se ejecutaron estas pruebas. Reproducir policies no aprueba su seguridad.

## Secuencia manual histórica de 02C.1 — completada, no repetir en este destino

Se conserva como referencia del procedimiento y de cómo detenerse ante fallos. Los pasos de inicialización A–H ya se completaron según la evidencia de 02C.2. El bucket del paso I quedó creado/verificado estructuralmente por el usuario en 02D.2; sus pruebas funcionales y el paso J de conexión siguen pendientes. No autorizan otra ejecución en el proyecto ya inicializado. La frase «esta sesión» del procedimiento se refiere a 02C.1.

Esta sesión **no autoriza ejecutar** [initialize_application.sql](initialize_application.sql). El archivo está fuera de migraciones automáticas: `package.json` solo arranca `src/server.js` y no existe un runner versionado que lo aplique.

A. Verificar visualmente en el dashboard: `educativo-backend-test` / `gwdtlbisykzzplgzczzq` / `us-east-2`. Si aparece `educativo-backend` o `bfnkaqmhcsyxdxoqnahk`, detenerse.

B. Ejecutar nuevamente [preflight_target_readonly.sql](preflight_target_readonly.sql) antes de inicializar. Solo consulta catálogos y reproduce los campos comunicados en 02C.1.

C. Confirmar que `public_relations_or_sequences`, `non_extension_public_functions`, `custom_auth_user_triggers` y `storage_object_policies` siguen en 0. Si cualquiera difiere de cero, detenerse y revisar; no editar el script para ocultarlo.

D. Solo tras autorización posterior, ejecutar `initialize_application.sql` una vez y completo en pruebas, como `postgres`. No seleccionar fragmentos para saltarse el preflight. Los `INSERT` dentro de `handle_new_user` son parte de la definición y no se invocan durante la inicialización.

E. Si aparece un error, detenerse. No reintentar automáticamente el script completo.

F. Guardar el mensaje, SQLSTATE si aparece, sección/sentencia y objetos creados hasta ese punto. No incluir secretos ni datos personales. No ejecutar un rollback improvisado: `BEGIN` debe revertir la transacción si falla antes de `COMMIT`; confirmar el estado mediante catálogos antes de decidir cualquier recuperación.

G. Si termina correctamente, ejecutar [verify_initialization_readonly.sql](verify_initialization_readonly.sql), también de solo lectura.

H. Comparar sus resultados con [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md). Toda diferencia requiere revisión antes de configurar servicios.

I. Configurar Storage en una sesión separada.

J. Conectar backend/frontend al proyecto de pruebas únicamente después de aprobar el postflight. No cambiar todavía Render, Vercel ni variables locales.

Advertencias: no ejecutar en producción; no copiar usuarios, filas ni archivos productivos; no configurar Auth; no crear buckets en esta sesión; no crear `avatars`; no improvisar DDL o rollback ante un fallo parcial.

## Configuración y datos fuera del script

La [guía canónica Storage/Auth (estado 02D.2)](STORAGE_AUTH_READINESS.md) registra el bucket de pruebas ya creado y verificado, avatars ausente e inventarios Auth observados en ambos proyectos. Auth no se modificó. Distingue configuración aplicada, evidencia del usuario, propuestas y decisiones pendientes; las pruebas conectadas y funcionales siguen pendientes.

- **Auth:** inventariado según evidencia del usuario en 02D.2. Cambios de configuración, rutas/callbacks y validación funcional pendientes; consultar la matriz canónica sin duplicar valores aquí. No copiar credenciales ni usuarios.
- **Storage — confirmación visual comunicada por el usuario en 02C:** `planeacion-actividades` existe y es **PRIVADO** (`Public bucket` desactivado), con **10 MB por archivo** y MIME permitido **`image/*`**. Se usa para subir imágenes manualmente a las actividades de cada momento de una sesión y acceder mediante URLs firmadas. No hubo acceso externo del agente. Conservar el flujo y sus consumidores existentes (`detalle.page.js`: `subirImagenActividad`, `crearSignedUrlActividad`, `eliminarImagenesStorage`). La generación de imágenes con IA está pausada y fuera de alcance.
- **Storage de pruebas aplicado por el usuario en 02D.2:** `planeacion-actividades` único y privado, 10485760 bytes y `image/*`, consulta de metadatos OK, cuatro policies visibles y sin objetos subidos. No recrear el bucket. Siguen pendientes pruebas con imágenes sintéticas y dos usuarios: carga manual, URLs firmadas (TTL vigente una hora), expiración, upload/remove, límites tamaño/MIME y aislamiento cruzado. No se conectó la app en esta sesión.
- **`avatars` no existe**, según la aclaración del usuario. Las cuatro policies exportadas que lo mencionan se conservan en el borrador como reproducción del estado observado; no demuestran existencia del bucket ni autorizan crearlo o implementar avatares. No crear `avatars` en producción ni en pruebas.
- **Modelos/precios:** preparar posteriormente datos de referencia verificados para ai_model_prices (modelo, moneda, costes, activo, fecha de actualización según columnas). No extraer métricas para inventar precios ni asumir coste cero. Generación requiere configuración IA de pruebas y presupuesto explícito.
- **Entorno:** nuevo identificador Supabase y asignación coherente de SUPABASE_URL/SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY; API local, CORS y cliente frontend revisados antes de usar la app. No se han cambiado selectores ni leído secretos. Correo/pagos futuros de pruebas separados; no son parte de este esquema.

## Verificaciones históricas de preparación (02C / 02C.1)

Revisión estática de CSV, dependencias, orden de creación, cobertura de objetos y consumidores. Comprobaciones locales satisfactorias de las 257 definiciones de columna, 76 constraints, índices independientes y respaldados por constraints, seis cuerpos de función, nombres/expresiones de policies y cantidades de objetos. Comparación de los 17 conjuntos de columnas del snapshot histórico: no aparecen columnas agregadas/eliminadas en esas tablas; las dos tablas adicionales se describen arriba. Esto no sustituye un parser SQL ni prueba semántica de ejecución.

En 02C.1 se revisó estáticamente el paquete para PostgreSQL 15.8 → 17.6 y se añadió un postflight de catálogos. No se ejecutó SQL, no se instalaron herramientas ni se consultaron servicios externos. Esta revisión no sustituye validación contra PostgreSQL/Supabase 17.6. Las comprobaciones locales y el diff se reportan al cerrar la sesión. **Prueba manual de 00.1 sigue pendiente.**

## Pendientes históricos tras 02C.2, actualizados por 02D.2

La creación/configuración del bucket y recopilación de Auth que figuraban pendientes abajo ya se completaron según evidencia del usuario. Permanecen pendientes los cambios Auth que se decidan y todas las pruebas funcionales/conexiones. La lista siguiente se conserva como estado histórico del cierre 02C.2.

Siguen pendientes la configuración de Supabase Auth; creación/configuración en pruebas del bucket privado `planeacion-actividades` (10 MB, `image/*`, carga manual y URLs firmadas); pruebas de Storage con dos usuarios; pruebas RLS A/B/anon; datos de referencia, incluido `ai_model_prices`; resolución de `ia_metrics` frente a `ia_metrics_legacy`; configuración explícita por ambiente; conexión del backend local y frontend de pruebas; cambios en Render y Vercel; registro, recuperación, contacto, planes, cuotas y pagos. No crear `avatars`; generación de imágenes con IA fuera de alcance. La aprobación del postflight no resuelve ni autoriza por sí sola estos trabajos. La prueba manual de 00.1 continúa pendiente.
