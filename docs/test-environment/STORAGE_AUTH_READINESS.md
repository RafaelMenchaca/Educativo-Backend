# Storage e inventario Auth — 02D.1

Fecha: 2026-09-28. Preparación local, sin configuración aplicada ni SQL ejecutado. Frontend `work/features` / `885b2b8`, backend `work/features` / `7e75f65`; ambos limpios al inicio. El merge frontend incorpora el `origin/main` disponible localmente (sin fetch). Se preservan vanilla JS, classic scripts, Biblioteca, explorerState y contratos de IDs.

| Ambiente | Identidad manual del dashboard | Evidencia / estado |
| --- | --- | --- |
| Producción | educativo-backend / bfnkaqmhcsyxdxoqnahk | Solo observación acotada de Auth en una recopilación posterior. Storage confirmado por el usuario: planeacion-actividades privado, 10 MB, image/*. No modificar producción. |
| Pruebas | educativo-backend-test / gwdtlbisykzzplgzczzq / us-east-2 / PostgreSQL 17.6 | Esquema y policies inicializados, postflight aprobado por evidencia del usuario en 02C.2. Bucket planeacion-actividades todavía NO creado al comenzar 02D.1. Sin usuarios/objetos de aplicación copiados desde producción. |

La [evidencia de esquema](SOURCE_MANIFEST.md) no aprueba aislamiento funcional A/B/anon. `avatars` no existe: sus policies históricas no prueban existencia ni autorizan crearlo. Imágenes con IA pausadas y fuera de alcance. No volver a ejecutar el inicializador. Esta guía es el punto de referencia para Storage/Auth de esta sesión; no modifica el contrato comercial.

## A. Contrato real de Storage

Referencias relativas al checkout hermano frontend. Los números de línea corresponden al HEAD inspeccionado; los símbolos identifican los owners estables.

| Evidencia | Contrato observado |
| --- | --- |
| [detalle.page.js](../../../frontend/js/pages/detalle.page.js), líneas 1–2, DETALLE_STORAGE_BUCKET / DETALLE_SIGNED_URL_TTL_SECONDS | Bucket fijo `planeacion-actividades`; TTL fijo `60 * 60` = 3600 segundos, sin variable de entorno. |
| Mismo archivo, líneas 148–178, sanitizeFileName / normalizarTiempoSesionStorage | Nombre base normalizado sin acentos, caracteres fuera de letras/dígitos/guion/underscore reemplazados por guion, minúsculas; extensión alfanumérica en minúsculas. Momento: conocimientos previos → conocimientos-previos; desarrollo → desarrollo; cierre → cierre; cualquier otro → actividades. |
| Mismo archivo, líneas 292–329, obtenerUsuarioAutenticado / subirImagenActividad | Usuario obtenido de `window.supabase.auth.getUser()`. Ruta exacta: `${userId}/${planeacionId}/${normalizarTiempoSesionStorage(tiempoSesion)}/${timestamp}-${safeFileName}`. Primer segmento: userId; segundo: planeacionId; tercero: momento. No contiene índice de sesión ni de fila. |
| Mismo archivo, líneas 373–412, construirTablaIaParaGuardar | planeacionId procede de `PLANEACION_ORIGINAL.id`; userId de `user.id`. Sube al guardar las imágenes pendientes, no al seleccionarlas. `.upload(path, file, options)` con contentType = file.type o undefined y `upsert:false`; no se encontró `.update()` de Storage ni upsert true. |
| Mismo archivo, líneas 195–233, crearSignedUrlActividad / hidratarTablaIaConImagenes | `.createSignedUrl(path, 3600)` para imágenes persistidas sin preview_url; devuelve vacío si falla. Las pendientes usan URL.createObjectURL. No hay renovación periódica de firmas en este flujo: una página abierta puede conservar una URL vencida. |
| Mismo archivo, líneas 332–369, serializeActividadImagen / eliminarImagenesStorage | Guarda metadatos y path en `tabla_ia[].actividades_imagenes`, sin serializar preview_url. `.remove(uniquePaths)` elimina rutas deduplicadas. |
| Mismo archivo, líneas 600–646, guardarCambios | Subida → `actualizarPlaneacion(id, {tabla_ia})` → remove de rutas retiradas. Cambiar imágenes usa nuevas subidas y eliminación de anteriores, no UPDATE del objeto. Fallo de borrado después de guardar: aviso y objeto potencialmente huérfano. Fallo de guardado: intenta limpiar uploadedPaths. |
| [detalle.ui.js](../../../frontend/js/ui/detalle.ui.js), línea 164; detalle.page.js, manejarSeleccionImagenes, líneas 430–460 | Input accept="image/*" y comprobación `file.type.startsWith("image/")`; si algún archivo no cumple, rechaza toda la selección. MIME vacío también se rechaza. No hay validación de tamaño: file.size solo se conserva como metadato. |

En esa ruta, `timestamp = Date.now()` y `safeFileName = sanitizeFileName(file.name || image.name || "imagen")`. Ejemplo exclusivamente sintético: `usuario-prueba/123/desarrollo/1700000000000-imagen.png`. El primer segmento real es el UUID de Auth; la planeación tiene ID bigint. Todas las operaciones Storage usan directamente el cliente Supabase del navegador, no un endpoint backend de imágenes. La actualización de `tabla_ia` pasa por `actualizarPlaneacion` en [planeaciones.service.js](../../../frontend/js/services/planeaciones.service.js), línea 438. El destino del cliente aún requiere aislamiento explícito antes de probar el flujo.

## B. Correspondencia con policies y límites

Evidencia: [initialize_application.sql](initialize_application.sql), líneas 925–939: ocho policies sobre storage.objects, sin creación de buckets. No se modifican aquí.

| Bucket / policies | Rol | Condición |
| --- | --- | --- |
| planeacion-actividades: Users can view their own activity images (SELECT) | authenticated | USING: bucket_id exacto y primer elemento de storage.foldername(name) igual a auth.uid()::text. Permite solicitar firma sobre rutas propias. |
| planeacion-actividades: Users can upload their own activity images (INSERT) | authenticated | WITH CHECK: mismo bucket y prefijo de usuario. Coincide con upload upsert:false. |
| planeacion-actividades: Users can update their own activity images (UPDATE) | authenticated | USING y WITH CHECK: mismo bucket/prefijo, tanto para objeto original como modificado. Existe aunque este flujo no usa Storage.update. |
| planeacion-actividades: Users can delete their own activity images (DELETE) | authenticated | USING: mismo bucket/prefijo. SELECT propio también está disponible para el flujo remove. |
| avatars_read_own / insert_own / update_own / delete_own | PUBLIC | bucket_id='avatars' y primer segmento = auth.uid()::text; USING para lectura/borrado, CHECK para insert, ambos para update. No afectan rutas de planeacion-actividades. Se conservan como estado histórico, sin crear avatars. |

La ruta producida coincide con los cuatro controles del bucket vigente. Esta conclusión es una comparación de código/policies, no una prueba de autorización en el servicio. Límites de 10 MB y MIME permitido dependen del bucket y límites efectivos del servicio; RLS controla permisos, no tamaño/MIME. `accept` y file.type son ayudas frontend, no barreras contra clientes manipulados. La privacidad, firma y caducidad efectiva también dependen de Storage.

Hallazgos para sesiones posteriores, sin corregirlos aquí:

- Las policies verifican el primer segmento; no verifican propietario/existencia del planeacionId, momento, cantidad de segmentos ni contenido del archivo. Una ruta con prefijo propio y segundo segmento arbitrario cumple esa condición. Esto no demuestra acceso a la DB o a archivos de otro usuario; requiere pruebas A/B y validación de referencias en la sesión de aislamiento.
- Una URL firmada compartida permite lectura a quien la posea durante su validez; no usarla como prueba de que el receptor inició sesión como propietario. No recopilar ni publicar URLs firmadas como evidencia.
- Falta validación frontend de tamaño; el rechazo y mensaje actual provienen del upload. Comprobar límites reales con archivos sintéticos cuando se autoricen pruebas.
- No hay transacción entre Storage y tabla_ia. Si una segunda subida falla dentro de construirTablaIaParaGuardar, la función no devuelve su uploadedPaths y guardarCambios aún tiene un array vacío: las subidas anteriores pueden quedar huérfanas. Si falla remove tras guardar, también pueden quedar objetos sin referencia. Riesgos deducidos del flujo, no fallos reproducidos.
- Date.now + nombre saneado puede colisionar para nombres iguales subidos en el mismo milisegundo, bajo la misma planeación/momento; upsert:false evita sobrescritura y produciría error. No se observó una colisión real.
- Persistir una URL vencida en memoria y las rutas recibidas en tabla_ia requieren pruebas; no hay firma periódica ni comprobación local del prefijo en crearSignedUrlActividad/remove. RLS es la barrera efectiva para rutas ajenas. No se tocaron consumidores ni logs.

## C. Creación manual futura, únicamente en pruebas

Estas instrucciones quedan preparadas; esta sesión no crea el bucket. Los rótulos del dashboard pueden variar: si no aparece una opción indicada, detenerse y registrar el rótulo visible, sin improvisar cambios.

1. Abrir el dashboard de `educativo-backend-test`. Verificar visualmente Project ID **gwdtlbisykzzplgzczzq**, región us-east-2. Si aparece producción educativo-backend / bfnkaqmhcsyxdxoqnahk, detenerse.
2. Entrar en Storage → Buckets. Comprobar si ya aparece `planeacion-actividades`, sin abrir objetos. Si existe con configuración distinta, detenerse y registrar diferencias; no editarlo. Si coincide, registrar que ya existe y no crear un duplicado.
3. Si no existe, usar New bucket/Create bucket. Nombre exacto `planeacion-actividades`; Public bucket **desactivado**; Restrict file size **activado**, límite **10 MB**; Restrict MIME types **activado**, único valor literal `image/*`. Si las restricciones se muestran en un paso de configuración distinto, completar y comprobarlas antes de cualquier uso; si no pueden establecerse, detenerse.
4. Antes de guardar, verificar nuevamente Project ID y los cuatro ajustes. Guardar únicamente ese bucket en pruebas, cuando se autorice la acción en una sesión posterior. No cambiar ninguna policy, Auth, variable local, Render ni Vercel.
5. Reabrir la configuración del bucket y recopilar evidencia visual acotada: identidad del proyecto, nombre/id del bucket, Public bucket apagado, restricción de tamaño encendida y 10 MB, restricción MIME encendida y image/*. Anotar fecha. Recortar claves, tokens, URLs firmadas y cualquier información personal; no abrir/listar objetos ni usuarios.
6. En una sesión posterior autorizada, contrastar con [verify_storage_bucket_readonly.sql](verify_storage_bucket_readonly.sql) en el SQL Editor de pruebas. Exportar los dos resultados por separado. No ejecutar el inicializador de schema de nuevo.

No crear avatars, no subir imágenes reales o sintéticas todavía, no copiar objetos de producción. Mantener carga manual y URLs firmadas; imágenes con IA fuera de alcance. Después de creación y configuración se requerirá otra sesión de pruebas con dos usuarios autorizados y ambiente aislado.

## D. Consulta de metadatos preparada

Dos SELECT de solo lectura sobre **storage.buckets**, sin storage.objects, usuarios ni campos de propietarios. La primera consulta busca coincidencias por id o name, devuelve ambos, public, file_size_limit, allowed_mime_types, número de coincidencias y comparaciones. MISSING si no existe; DIFF ante duplicidad por nombre/ID, parámetros diferentes o restricciones NULL; OK solo con coincidencia única y exacta. La segunda informa por separado si avatars existe, sin requerirlo ni crearlo; si aparece, revisar sin cambios automáticos.

La comparación de tamaño explicita **10 × 1024 × 1024 = 10485760 bytes** como interpretación de 10 MB para la preparación. El usuario confirmó el rótulo 10 MB, no el número almacenado en origen. Verificar la conversión del dashboard con el resultado del destino; si devuelve 10000000 u otra cifra, conservar DIFF y resolver la unidad, no afirmar igualdad ni modificar producción. MIME debe ser exactamente el array con `image/*`; no aceptar NULL (sin restricción) como equivalente. El SQL usa columnas de metadatos de Supabase Storage que deben comprobarse en destino: no se ejecutó ni se validó contra un servidor. Si falla por columna/permisos, registrar SQLSTATE/mensaje y detenerse; no ampliar a un dump de objetos.

No contiene secretos ni Project URLs. El Project ID en comentario es una precondición visual, no una comprobación de identidad de PostgreSQL. La consulta no prueba RLS ni comportamiento de cargas.

## E. Inventario manual Auth — observar sin guardar cambios

Recopilar separadamente en producción **educativo-backend / bfnkaqmhcsyxdxoqnahk** y pruebas **educativo-backend-test / gwdtlbisykzzplgzczzq**. Anotar proyecto, fecha y sección/rótulo visible. No abrir usuarios ni probar registro/correo. Si un campo no aparece, escribir «no visible», no inferir el default. En la tabla, P = pendiente de observar; D = pendiente de decidir. Ningún valor deseado queda aprobado por esta guía.

| Campo exacto / sección orientativa Auth | Producción observado | Pruebas observado | Deseado | Decisión necesaria para registro/confirmación/recuperación |
| --- | --- | --- | --- | --- |
| Allow new users to sign up / configuración de usuarios | P | P | D | Apertura de registro y condiciones de prueba. |
| Confirm email / proveedor Email | P | P | D | Confirmación obligatoria y experiencia antes de confirmar. |
| Secure email change / Email | P | P | D | Confirmación del cambio de correo. |
| Minimum password length / seguridad de contraseñas | P | P | D | Regla y validación de formularios. |
| Password requirements disponibles / seguridad | P | P | D | Copiar nombres de requisitos y estado, sin contraseñas; política a adoptar. |
| Site URL / URL Configuration | P | P | D | Origen base por ambiente. |
| Redirect URLs / URL Configuration | P | P | D | Inventariar patrones actuales; rutas finales pendientes de sesión Auth. |
| Email provider habilitado / Sign In & Providers | P | P | D | Habilitación del flujo email/password. |
| SMTP propio o proveedor predeterminado / Email | P | P | D | Canal de correo de pruebas separado y capacidad; solo modo, sin host/usuario/password. |
| Rate limits relevantes signup/recovery / Rate Limits | P | P | D | Copiar nombre, valor, unidad y ventana de límites de email, signup y reset/recovery que aparezcan; condicionan pruebas y reenvíos. |
| Duración JWT / Sessions o configuración JWT, si aparece | P | P | D | Caducidad de sesión; no copiar tokens ni claves de firma. |
| Refresh token rotation, si aparece | P | P | D | Comportamiento de sesión y renovación. |
| Refresh token reuse interval, si aparece | P | P | D | Ventana con unidad para pruebas de concurrencia de sesión. |
| CAPTCHA, si aparece / protección | P | P | D | Estado y nombre del proveedor, sin claves; integración futura. |
| Plantillas habilitadas / Email Templates | P | P | D | Solo nombres/tipos visibles (confirmación, recuperación, cambio email, etc.); no contenido ni enlaces/tokens de ejemplo. |
| Hooks Auth personalizados / Hooks | P | P | D | Existencia, tipo de evento y estado; sin endpoint/URL, secretos o código. Evaluar efectos antes de signup. |
| Proveedores externos habilitados / Providers | P | P | D | Solo nombres; decidir cuáles tienen alcance, sin client IDs/secrets. |

Para Site URL y Redirect URLs, copiar únicamente orígenes/patrones de configuración sin tokens, credenciales ni parámetros sensibles. No pedir Project URLs de Supabase/API. No definir aún redirects finales ni crear callbacks: confirmación y recuperación se implementarán en la sesión Auth. El trigger de DB on_auth_user_created ya documentado no acredita que haya Hooks configurados en el dashboard.

Entregar preferentemente la tabla en texto; no capturas de pantallas completas con credenciales. No se solicitan todos los ajustes del proyecto. Tras recibir los valores se compararán observación, propuesta y decisión aprobada; hoy el inventario de ambos proyectos sigue pendiente y no hay configuración Auth aplicada por esta sesión.

## Verificación local y límites

Comparación estática de consumers/policies, revisión del SQL de metadatos y enlaces, git diff --check en ambos repositorios. No se cambió JS ni se requiere node --check. SQL no ejecutado; sin conexión externa, creación de bucket, configuración Auth, usuarios sintéticos, cambios de variables o integración de frontend/backend. Siguen pendientes pruebas A/B/anon, conexión aislada por ambiente y prueba manual de 00.1.
