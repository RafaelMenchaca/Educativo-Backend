# Educativo IA — allowlist de edición de planeaciones 03B

Estado al 2026-10-12: **03B completada y validada mediante pruebas automáticas offline y validación manual local/test**. 03A quedó cerrada en el commit real `4b8de11` (`test(security): add adversarial isolation baseline`). Fase 03 sigue abierta; 03C–03F permanecen pendientes.

## Contrato afectado

`PUT /api/planeaciones/:id` → `requireAuth` → `updatePlaneacion` → `actualizarPlaneacion`.

El contrato anterior copiaba todas las propiedades del body, eliminaba únicamente `user_id`, aceptaba cualquier columna restante en el UPDATE, usaba `supabaseClient || supabaseAdmin` y aplicaba el filtro `user_id` solo cuando el caller lo proporcionaba. El frontend vigente de Detalle envía exclusivamente `{ tabla_ia }`.

## Allowlist y errores

Allowlist exacta:

- `tabla_ia`: arreglo válido de exactamente tres momentos — Conocimientos previos, Desarrollo y Cierre — con la validación de contenido y metadata de imágenes ya existente.

No hay múltiples campos editables ni un campo editable que acepte `null`. `tabla_ia: null` es inválido.

Se rechaza cualquier otra clave, incluida una mezcla de `tabla_ia` con una clave no permitida:

- identidad/propiedad: `id`, `user_id`;
- sistema/auditoría: `fecha_creacion`, `created_at`, `updated_at`, `status`, `is_archived`, `archived_at`;
- docentes generados o de presentación: `materia`, `nivel`, `tema`, `duracion`, `subtema`, `sesiones`, `unidad`, `custom_title`, `actividad_cierre`, `actividades_momentos`;
- relaciones y contratos ajenos a esta edición: `batch_id`, `tema_id`, `unidad_id`, `planeacion_ids`, `tema_ids`, `force_new_batch`;
- cualquier clave desconocida, símbolo, propiedad no enumerable o body con prototipo personalizado.

Las filas internas de `tabla_ia` se reconstruyen con una allowlist propia: `tiempo_sesion`, `actividades`, `tiempo_min`, `producto`, `instrumento`, `formativa`, `sumativa` y `actividades_imagenes`. La metadata de cada imagen admite únicamente `id`, `name`, `path`, `mime_type`, `size`, `uploaded_at`, `source` y `query`. `source` y `query` son opcionales; cuando están presentes deben ser strings y se conservan exactamente, sin trim ni otra normalización. `preview_url`, `is_pending`, `file` y cualquier otra clave se rechazan y nunca se persisten.

`size` admite números finitos no negativos y strings numéricos no vacíos que representen valores finitos no negativos. `undefined`, `null` y el string exactamente vacío se normalizan a `0` por compatibilidad. Booleanos, arrays, objetos, strings no numéricos (incluidos los compuestos solo por espacios), `NaN`, infinitos y valores negativos se rechazan antes de mutar.

Contratos HTTP:

| Condición | Resultado |
| --- | --- |
| ID no numérico, no entero, no seguro o menor que 1 | 400 `ID invalido` |
| Body ausente, array o estructura no plana | 400 `Body invalido` |
| Body vacío | 400 `Debes enviar al menos un campo editable` |
| Campo desconocido, prohibido o mezcla permitida/prohibida | 400 `La actualizacion contiene campos no permitidos` |
| `tabla_ia` inválida, incluida `null` | 400 mediante las validaciones existentes |
| ID válido inexistente o no accesible para el usuario | 404 `Planeacion no encontrada` |
| Error de Supabase | 500 `Error al actualizar planeacion` |
| Sin cliente de usuario o identidad autenticada en la llamada interna | fallo cerrado; el controller responde 500 genérico |

El 404 común evita distinguir una planeación inexistente de una perteneciente a otro usuario.

## Propiedad, cliente y relaciones

El controller deriva `userId` de `req.user.id` y crea el cliente con el Bearer validado en `req.accessToken`. El servicio exige ambos valores; no usa `supabaseAdmin` como fallback en esta operación. La mutación usa el mismo cliente de usuario y filtra simultáneamente por `id` y `user_id`. Una respuesta sin fila produce 404; no se declara éxito vacío.

Ningún ID relacional es editable por este PUT. `batch_id` y `tema_id` se asignan durante generación; `unidad_id`, `planeacion_ids`, `tema_ids` y `force_new_batch` pertenecen a endpoints de generación/selección. Se rechazan aquí antes de consultar Supabase, por lo que 03B no añade validaciones relacionales innecesarias.

El trigger versionado `trg_planeaciones_updated_at` conserva la actualización de `updated_at`; el cliente no puede enviarlo. No hubo cambios de schema, RLS, policies, grants, funciones o triggers.

## Pruebas automáticas

`node --experimental-vm-modules --test tests/planeaciones-update.test.js`: **46/46 PASS**. Los módulos reales se enlazan con Supabase/OpenAI/configuración falsos en memoria; no cargan `.env`, no realizan red y no invocan OpenAI.

La prueba positiva usa las tres filas completas producidas por Detalle, incluidos strings vacíos válidos, `actividades_imagenes: []`, una imagen base, una imagen con `source="ai_suggested"` y `query` sintético, `size` numérico/string numérico y las variantes ausente/null/string vacío normalizadas a cero. Comprueba que `source` y `query` llegan intactos al payload de Supabase. Esto cubre la forma editable de una planeación producida por los generadores versionados después de que Detalle convierta los valores visibles del DOM a strings; clientes directos deben cumplir ese mismo contrato y no enviar números en `tiempo_min` o `sumativa`.

La suite también cubre allowlist superior, body vacío/no plano, claves desconocidas superiores y anidadas, metadata local prohibida, tipos inválidos de `source`, `query` y `size`, propiedad, ID, timestamps, estado, relaciones, mezcla de claves, `null`, herencia por prototipo, IDs malformados, cliente/usuario ausentes, fila ajena o inexistente, cero filas, error sanitizado de Supabase y derivación del cliente/propietario desde la sesión. Las pruebas de rechazo confirman cero llamadas a `from/update`.

La matriz conserva evidencia automática con transporte simulado para cinco casos. Tres de ellos — edición propia, propietario prohibido y edición cruzada — cuentan además con evidencia manual real; el caso anónimo de actualización aporta una cuarta evidencia manual real. Los dos casos relacionales (`batch_id` y `tema_id`) permanecen únicamente como **PRUEBA AUTOMÁTICA PASS (transporte simulado)**. Una prueba simulada no se presenta como evidencia real de API/RLS.

## Validación manual aprobada

La validación se realizó con frontend y API locales, cuentas sintéticas A/B y una planeación de prueba. Se conservaron los valores originales antes de editar y se restauraron exactamente al terminar.

| Evidencia manual | caseId de matriz | Resultado real |
| --- | --- | --- |
| `03B-MANUAL-OWN-A` | `03A-API-PE-EDIT-OWN-A` | PASS: A actualizó una planeación propia; la API aceptó el cambio, persistió tras recargar y el contenido original fue restaurado exactamente. |
| `03B-MANUAL-FORBIDDEN-OWNER-A` | `03A-API-PE-EDIT-OWNER-A` | PASS: `user_id` produjo HTTP 400 y la planeación permaneció sin cambios. |
| `03B-MANUAL-CROSS-B-TO-A` | `03A-API-PE-EDIT-CROSS-A` | PASS: la operación cruzada equivalente se ejecutó B→A con `tabla_ia` válida; produjo HTTP 404 y la planeación propietaria permaneció sin cambios. |
| `03B-MANUAL-ANON` | `03A-API-PE-ANON-anon` | PASS: el PUT sin Bearer produjo HTTP 401 y la planeación permaneció sin cambios. |

Los destinos observados fueron únicamente `127.0.0.1:3000`, `127.0.0.1:5500`, `cdn.jsdelivr.net` y el host del proyecto Supabase test. No se observó tráfico hacia el proyecto Supabase productivo ni hacia los dominios productivos de la API o frontend. No hubo generación ni OpenAI. La restauración fue exacta y no quedaron datos residuales conocidos. No se registran IDs de planeaciones, UUID de usuarios, credenciales, headers ni contenido pedagógico.

## Pendientes

- 03C: propiedad de batch en exámenes, jobs, workers y excepciones admin restantes.
- 03D: evidencia real de la matriz, relaciones y garantías que requieran cambios atómicos o SQL.
- 03E: Storage.
- 03F: estado del navegador y Archivados.

No se identificó una relación editable en este endpoint ni una necesidad de SQL para esta allowlist. 03B queda completada y validada en su alcance; la Fase 03 continúa abierta.
