# Inicialización revisable de pruebas — sesión 02C

**Borrador no ejecutado. Exclusivo para un proyecto Supabase NUEVO, vacío y separado de producción. No es una migración ni una autorización de lanzamiento.**

[initialize_application.sql](initialize_application.sql) reproduce los objetos de aplicación observados en los CSV `bloque_01.csv`–`bloque_11.csv` aportados por el usuario. Origen PostgreSQL 15.8 comunicado; no se conectó al origen. [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md) registra cantidades y hashes de los archivos locales; los CSV no se incorporan a Git. La evidencia es el export, no una comprobación remota del estado actual ni un backup completo.

## Alcance y correspondencia

| Bloque del script | Evidencia y alcance |
| --- | --- |
| Preflight | Transacción, bloqueo explícito de confirmación del destino, ejecutor `postgres`, PostgreSQL >=15 y objetos gestionados requeridos. Rechaza relaciones/secuencias y funciones propias preexistentes en public, triggers personalizados en auth.users y policies previas en storage.objects. `confirmed_new_test_project` permanece en `false`; el script no comprueba la identidad del proyecto por sí mismo. |
| 1. Tablas | CSV01: 19 tablas, 257 columnas; tipos, orden, nulabilidad, defaults y collation. Todas pertenecen a postgres. `planeaciones.id`: bigint identity BY DEFAULT y secuencia explícita `public.planeaciones_id_seq` con los parámetros verificados descritos abajo. |
| 2. Constraints | CSV02: 76 constraints validados, no diferibles. Primero PK/UNIQUE/CHECK, después todas las FK. Así se resuelve `examenes.generation_job_id` ↔ `examen_generation_jobs.examen_id`, sin quitar ni cambiar esas FK. |
| 3. Índices | CSV03: 69 en total, todos válidos/listos. 26 corresponden a PK/UNIQUE; se crean con sus constraints. Los otros 43 se crean explícitamente, incluidos índices parciales. |
| 4. Funciones | CSV08: las seis funciones propias public, cuerpos observados y propietario postgres; se usa CREATE, no CREATE OR REPLACE. No se copian auth.uid ni storage.foldername. |
| 5. RLS/policies | CSV04: las 19 tablas public con RLS habilitado y no forzado; 49 policies public y 8 policies de aplicación sobre storage.objects. `ia_metrics_legacy` no tiene policy. Se mantiene ese estado. |
| 6. Triggers | CSV05: 15 triggers public y exactamente uno sobre auth.users, todos habilitados en modo normal. No se crea ni modifica la definición de auth.users. |
| 7. ACL de aplicación | CSV06: 517 filas de permisos sobre tablas public y su secuencia, más los grants de las seis funciones de CSV08. Se limpian ACL heredadas SOLO de los objetos recién creados y se restauran permisos observados. No se modifican roles, esquemas, ACL de objetos internos ni default privileges. |

Los bloques 09/10 no muestran tipos propios ni dependencias de extensiones para estos objetos: los tipos son de pg_catalog. `gen_random_uuid()` existe en PostgreSQL 15; se exige su existencia sin instalar pgcrypto. CSV11 enumera extensiones instaladas (`plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`), no demuestra que todas sean necesarias. No se recrean extensiones.

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

## Preparación y ejecución futura manual

**No ejecutar ahora ni en el único proyecto actual educativo-backend.** Este directorio está fuera de migraciones automáticas. `package.json` arranca `src/server.js`; no referencia este SQL, y no se encontró un runner de despliegue que lo aplique.

1. En una sesión posterior, disponer de un proyecto Supabase de pruebas nuevo. Confirmar su identificador de proyecto en el panel, distinto de producción; no basta su nombre visible. No introducir sus credenciales en Git ni pegar cadenas de conexión.
2. Confirmar destino vacío, sin usuarios creados por la app, tablas public propias, triggers de alta personalizados ni policies de Storage. Los objetos gestionados auth.users, storage.objects, auth.uid(), storage.foldername(text), roles y PL/pgSQL deben existir. No crearlos con este script.
3. Revisar SQL/ACL y la versión real del destino (>=15 no garantiza compatibilidad Supabase). Los parámetros de secuencia ya están incorporados con evidencia pegada por el usuario. Mantener `confirmed_new_test_project = false` hasta confirmar de forma independiente un proyecto Supabase nuevo, vacío y separado; ese es el único bloqueo de reconocimiento manual restante.
4. En SQL Editor del NUEVO destino, como postgres, ejecutar TODO el script revisado de una vez, con BEGIN/COMMIT. No seleccionar fragmentos para saltarse preflight. Los INSERT presentes en el cuerpo de handle_new_user son definición de la función, no una carga de datos; al ejecutar este SQL no se invoca la función de aplicación.
5. Ante un error, detenerse y registrar bloque, SQLSTATE y mensaje revisado sin secretos. Si la conexión sigue en transacción abortada, ejecutar ROLLBACK en esa misma sesión. No solucionar conflictos borrando objetos desconocidos ni usando IF NOT EXISTS. El script es de una sola ejecución; una repetición debe fallar por destino no vacío.
6. Después de una ejecución autorizada exitosa, repetir allí los bloques de inventario de 02B y comparar columnas/defaults, 76 constraints, 69 índices, funciones/ACL, 16 triggers y policies por nombre/expresión. Verificar secuencia con el suplemento. Excluir objetos internos variables entre versiones. Solo entonces crear usuarios sintéticos por Auth y probar que el trigger crea una fila profiles + settings y no duplica aprovisionamiento. No insertar directamente en auth.users.
7. Antes de conectar la app, aislar los selectores frontend/backend/Auth/Storage; hoy siguen sin estar aislados. Probar RLS y flujos únicamente con datos sintéticos. Reversión de un fallo antes de COMMIT: transacción. Después de COMMIT, preferir descartar/recrear exclusivamente el proyecto desechable en otra acción autorizada, no un DROP genérico ni reparación de producción.

## Configuración y datos fuera del script

- **Auth:** habilitación de proveedores/email, confirmación, Site URL y allowlist de redirecciones de pruebas, límites de envío y SMTP de pruebas si se necesita. No copiar credenciales ni usuarios. Recopilar solo nombres/estado/configuración no secreta necesaria.
- **Storage — confirmación visual comunicada por el usuario en 02C:** `planeacion-actividades` existe y es **PRIVADO** (`Public bucket` desactivado), con **10 MB por archivo** y MIME permitido **`image/*`**. Se usa para subir imágenes manualmente a las actividades de cada momento de una sesión y acceder mediante URLs firmadas. No hubo acceso externo del agente. Conservar el flujo y sus consumidores existentes (`detalle.page.js`: `subirImagenActividad`, `crearSignedUrlActividad`, `eliminarImagenesStorage`). La generación de imágenes con IA está pausada y fuera de alcance.
- **Preparación de Storage de pruebas:** en una sesión posterior autorizada, configurar exclusivamente en el proyecto separado el bucket `planeacion-actividades` con esos mismos parámetros: privado, 10 MB y `image/*`. Esta configuración queda fuera del SQL de esquema; no se crea el bucket ahora ni se copian objetos productivos. Antes de conectar la app, comprobar destino y policies; después probar con imágenes sintéticas la carga manual, lectura por URL firmada, rechazo del acceso público sin firma, límites de tamaño/MIME y aislamiento entre dos usuarios. Conservar la caducidad vigente de las URLs firmadas (una hora). Estas pruebas siguen pendientes.
- **`avatars` no existe**, según la aclaración del usuario. Las cuatro policies exportadas que lo mencionan se conservan en el borrador como reproducción del estado observado; no demuestran existencia del bucket ni autorizan crearlo o implementar avatares. No crear `avatars` en producción ni en pruebas.
- **Modelos/precios:** preparar posteriormente datos de referencia verificados para ai_model_prices (modelo, moneda, costes, activo, fecha de actualización según columnas). No extraer métricas para inventar precios ni asumir coste cero. Generación requiere configuración IA de pruebas y presupuesto explícito.
- **Entorno:** nuevo identificador Supabase y asignación coherente de SUPABASE_URL/SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY; API local, CORS y cliente frontend revisados antes de usar la app. No se han cambiado selectores ni leído secretos. Correo/pagos futuros de pruebas separados; no son parte de este esquema.

## Verificación de esta sesión

Revisión estática de CSV, dependencias, orden de creación, cobertura de objetos y consumidores. Comprobaciones locales satisfactorias de las 257 definiciones de columna, 76 constraints, índices independientes y respaldados por constraints, seis cuerpos de función, nombres/expresiones de policies y cantidades de objetos. Comparación de los 17 conjuntos de columnas del snapshot histórico: no aparecen columnas agregadas/eliminadas en esas tablas; las dos tablas adicionales se describen arriba. Esto no sustituye un parser SQL ni prueba semántica de ejecución.

No se ejecutó SQL, no se instaló nada ni se consultaron servicios externos. `psql`/`postgres` no encontrados en PATH; Docker CLI existe pero el daemon local no está disponible. No se acredita compatibilidad ejecutada. `git diff --check` pasó en ambos repositorios; también se revisaron los archivos nuevos fuera del índice con `git diff --no-index --check` y una comprobación local de whitespace. Solo hubo avisos de conversión LF/CRLF. Se preservaron los archivos pendientes de 02B; frontend permanece sin cambios. **Prueba manual de 00.1 sigue pendiente.**
