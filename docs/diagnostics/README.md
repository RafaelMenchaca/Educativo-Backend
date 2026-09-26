# Diagnóstico de metadatos Supabase — sesión 02B

El archivo [supabase_metadata_readonly.sql](supabase_metadata_readonly.sql) contiene consultas de inspección. **No es una migración, backup ni script completo de reconstrucción. No se ejecutó en esta sesión.** No colocarlo en una carpeta de migraciones ni ejecutar las definiciones que devuelva.

## Ejecución manual por el usuario

1. Entrar al SQL Editor del único proyecto confirmado, `educativo-backend`. Verificar el nombre/referencia del proyecto en el panel. No abrir usuarios, filas de tablas u objetos de Storage para esta tarea. No hacen falta CLI, psql ni pg_dump.
2. Copiar únicamente el bloque 00 del archivo SQL a una consulta nueva y ejecutarlo. Anotar la versión: la revisión estática utiliza catálogos/columnas disponibles en PostgreSQL 12 o posterior. Si aparece una versión anterior o un error, detenerse y reportarlo; no adaptar el SQL improvisando cambios de esquema.
3. Ejecutar por separado cada bloque 01–11 completo, desde su comentario `BLOQUE` hasta su punto y coma final. Cada bloque es independiente, sin tablas temporales ni sesión compartida. No pegar el snapshot `DATABASE_SCHEMA.md` ni las definiciones que salgan como resultados.
4. Exportar cada resultado por separado como CSV desde el resultado del editor, si está disponible. Alternativa: copiar la tabla completa como texto, preservando columnas y contenido multilínea. Usar nombres `02B-00-version`, `02B-01-columnas`, etc. No es necesario exportar el proyecto entero.
5. Registrar por bloque: proyecto/alias, fecha/hora de ejecución, versión reportada, nombre de bloque, número de filas y si hubo truncamiento/paginación. Una salida vacía se reporta como «0 filas», no se omite. Verificar que la exportación incluye todos los resultados; no considerar completa una tabla truncada por el editor.
6. Si falla: compartir número de bloque, SQLSTATE si aparece y mensaje exacto **revisado/redactado**. No compartir URL de conexión, tokens o paneles completos. No conceder permisos, cambiar de rol, desactivar RLS ni crear objetos para resolver el fallo. El permiso del SQL Editor es externo y no está acreditado por esta preparación.
7. Revisar y redactar la salida antes de compartirla. No incorporar automáticamente los CSV/resultados a Git. La sesión siguiente contrastará el inventario con código y snapshot; recibir resultados no acredita por sí solo aislamiento.

La ejecución de bloques separados no proporciona una instantánea transaccional única. Evitar cambios de esquema durante la recogida y registrar si los hubo; resolver inconsistencias mediante evidencia adicional limitada, no suponiendo equivalencias. Ningún bloque consulta filas de `public`, `auth.users`, `storage.objects` o `storage.buckets`.

## Alcance por bloque

| Bloque | Resultado | Límites / revisión previa a compartir |
| --- | --- | --- |
| 00 | Versión PostgreSQL del servidor. | Sin datos de conexión ni valores de configuración de aplicación. |
| 01 | Relaciones de `public`, columnas, tipos, defaults, nulabilidad de columna/dominio, identidad, generación y collation. Incluye vistas/materializadas/tablas foráneas como metadatos. | No ejecuta defaults ni lee vistas. Revisar literales de defaults. No extrae definición de vistas ni opciones de servidores externos. |
| 02 | Constraints de relaciones `public`: PK, unique, check, FK, validación y acciones referenciales. | FK salientes pueden nombrar `auth`/otros schemas sin leerlos. Revisar expresiones check. Constraints de dominios están en 09. |
| 03 | Índices de `public`, unicidad, validez, definición y predicado parcial. | Expresiones solo se convierten a texto; revisar sus literales. |
| 04 | Estado RLS habilitada/forzada y policies de todas las tablas `public`/`storage`, roles, operación, modo y condiciones. | Incluye tablas sin policies. Comandos de policy: `*` todos, `r` lectura, `a` inserción, `w` actualización, `d` borrado. Revisar condiciones que contengan IDs, emails o secretos. No confundir ausencia de policy con acceso seguro. |
| 05 | Triggers no internos de `public` y `auth.users`: definición, habilitación y firma de función. | `tgenabled`: O normal, D deshabilitado, R réplica, A siempre. Los no internos de Auth pueden ser administrados por la plataforma: no implica que deban copiarse al proyecto futuro. Revisar argumentos del trigger. |
| 06 | ACL de tablas/vistas/secuencias y schemas `public`/`storage`, grants específicos de columnas, grantor/grantee y flags de roles destinatarios. | Expande defaults incorporados cuando ACL es NULL; no calcula toda la herencia de membresías, derechos implícitos del propietario ni acceso efectivo combinado con RLS. No lee `last_value` de secuencias. |
| 07 | Default privileges globales y de `public`/`storage`, por rol creador y tipo. | Describe entradas existentes, no altera grants; no equivale a permisos efectivos de objetos ya creados. Vacío no elimina los defaults incorporados, por ejemplo EXECUTE a PUBLIC de funciones cuando proceda. |
| 08 | Funciones referenciadas por triggers/policies, dependencias catalogadas transitivas de funciones propias, firmas/atributos/ACL y cuerpos permitidos. | Cuerpos solo de funciones/procedimientos `public` no miembros de extensiones. `function_settings` incluye `search_path` si fue fijado; NULL no significa configuración segura. Revisar cuerpos, defaults de argumentos y settings antes de compartir. |
| 09 | Tipos usados por columnas de `public` y tipos dependientes: arrays, dominios, compuestos, rangos; enum labels, constraints de dominios y extensión propietaria si existe. | No es un dump de todos los tipos. Revisar etiquetas/defaults/constraints. No reproduce funciones de entrada/salida, collations, multirangos o todos los detalles de reconstrucción de tipos complejos. |
| 10 | Dependencias directas registradas de relaciones/defaults/constraints/policies/triggers del alcance, con identidades y extensión referenciada si se identifica. | Incluye policies Storage y triggers `auth.users`; no invoca funciones ni extrae cuerpos internos. No es el grafo completo del proyecto. Detecta dependencias de defaults/índices/checks no necesariamente cubiertas en 08. |
| 11 | Nombres/versiones/schemas de extensiones instaladas. | No extrae cuerpos, tablas de configuración ni datos de extensiones. Instalación no prueba uso: contrastar con 08–10. |

## Delimitación de funciones y dependencias

Se revisaron consumidores `.rpc(...)`, rutas `/rpc/` y referencias RPC en `frontend/js`, `backend/src` y `backend/supabaseClient.js`: no se encontraron. Por ello `rpc_roots` en 08 está vacío. Si una revisión posterior identifica un RPC, incorporar únicamente su firma/OID resuelto desde catálogos, nunca invocarlo para averiguar qué hace.

El bloque 08 parte de `tgfoid` de los triggers del alcance y referencias a `pg_proc` en dependencias de policies. Recorre dependencias función → función solo desde funciones propias de `public` no pertenecientes a extensiones; `UNION` elimina ciclos. Las firmas de dependencias externas se muestran, pero `body_in_scope=false` y `definition=NULL` impiden extraer indiscriminadamente cuerpos internos de Supabase, Auth, Storage o extensiones. Para un schema de aplicación distinto de `public`, revisar primero sus objetos/propiedad y ampliar `app_schemas` explícitamente en una revisión posterior; no añadir todos los schemas.

Importante: estar en `public` y no pertenecer a una extensión es un filtro conservador, **no prueba autoría**. Revisar también funciones administradas que puedan estar allí. `pg_depend` no registra necesariamente referencias dentro de cuerpos SQL/PL/pgSQL en texto o SQL dinámico; operadores pueden introducir dependencias indirectas. Revisar las definiciones obtenidas y el bloque 10, registrar referencias faltantes y preparar un suplemento por firmas concretas si hace falta. No invocar funciones de aplicación ni ampliar a un dump de todas las funciones. Tipos usados solo por firmas de funciones, privilegios heredados por membresías, vistas, particiones y otras dependencias podrían requerir ese suplemento antes de reconstruir un ambiente.

Una FK por ID no garantiza igualdad de `user_id`. Revisar especialmente `planeacion_batches`, `planeaciones`, `examenes`, sus funciones de ownership, RLS/grants y el worker que guarda con cliente destinado a admin. El inventario tampoco prueba el tipo efectivo de las claves locales o Render.

## Qué revisar antes de compartir

Además de nombres de roles/objetos potencialmente privados, revisar sobre todo 01–05 y 08–10: defaults, checks, predicados, condiciones de policies, argumentos de triggers, enum labels y cuerpos/settings de funciones pueden contener IDs de personas, emails, credenciales literales, URLs privadas, SQL dinámico o referencias a Vault/webhooks. No ejecutar esos textos. Sustituir únicamente valores sensibles por marcadores explícitos y explicar la redacción; conservar firmas, lógica de propiedad, tipos y grants necesarios para evaluar aislamiento. Si una redacción impide concluir algo, marcarlo como evidencia incompleta.

No enviar filas reales, contenido docente, logs de usuarios, tokens, cookies, connection strings, claves API, contraseñas, dump de roles ni capturas completas de paneles. El SQL solo lee catálogos, pero eso no garantiza que todas sus definiciones sean aptas para compartir sin revisión.

## Auth y bucket: recoger aparte desde los paneles

- Proyecto: nombre/alias, referencia pública para contrastar destinos y fecha. No credenciales.
- Auth: Site URL, allowlist de redirecciones, login por email habilitado, altas habilitadas o deshabilitadas, confirmación de email, política visible de contraseña y expiración de enlaces de confirmación/recuperación. Para correo, basta indicar si usa proveedor por defecto o SMTP personalizado y si hay sandbox confirmado; no copiar host privado, usuario o password SMTP ni enviar correos.
- Storage: los campos solicitados quedaron confirmados visualmente por el usuario en 02C: `planeacion-actividades` existe, es privado (`Public bucket` desactivado), límite de 10 MB por archivo y MIME `image/*`. Ver [preparación del destino de pruebas](../test-environment/README.md); no volver a solicitar esta evidencia del origen. Conservar carga manual y URLs firmadas. `avatars` no existe y no se debe crear. No listar ni descargar objetos. Las policies y grants se recogen con 04/06, no inferirlos del nombre del bucket ni confundir esta confirmación con una prueba de aislamiento.

No se pide un volcado completo de configuración. El alcance futuro seguirá usando frontend/backend locales y un Supabase separado como propuesta, sin provisionar ahora y sin afirmar que será gratuito.

## Verificación realizada y límites

Preparado con catálogos PostgreSQL 12+ (`pg_class`, `pg_attribute`, `pg_constraint`, `pg_index`, `pg_policy`, `pg_trigger`, `pg_proc`, `pg_depend`, ACL, tipos/extensiones) y funciones integradas calificadas con `pg_catalog`. No depende de tablas internas particulares de una versión de Supabase. Usa `auth.users` únicamente como nombre para filtrar metadatos.

No se ejecutó ningún bloque ni se conectó a una base local o remota. No hay `psql`, `pg_dump` o CLI Supabase disponible en PATH; no se instaló ni arrancó una base. La revisión es estática: sentencias SELECT/WITH, referencias a catálogos, delimitación de cuerpos, enlaces y whitespace. No equivale a validación del parser/planificador o de permisos contra la base. Comprobar 00 y reportar cualquier incompatibilidad antes de continuar. El contrato comercial no cambia y la prueba manual de 00.1 continúa pendiente.
