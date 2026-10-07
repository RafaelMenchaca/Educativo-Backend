# Storage e inventario Auth — estado vigente 02D.2

Actualización de cierre 02E/02F (2026-10-06): el usuario aprobó la conexión local a test, login, aprovisionamiento, aislamiento visual básico y Storage funcional (subida, URL firmada, persistencia y eliminación). La [evidencia canónica de cierre](../ENVIRONMENT_SCHEMA_READINESS.md#cierre-02e02f--evidencia-manual-y-alcance-aprobado) sustituye los pendientes de esas pruebas en el historial siguiente. Matriz adversarial RLS A/B/anon, acceso cruzado directo y pruebas Storage de aislamiento/límites/expiración siguen pendientes para Fase 03. No se atribuyen cambios externos al agente.

Actualización documental: 2026-09-29. Evidencia proporcionada por el usuario desde Supabase, sin consulta remota del agente. Frontend `work/features` / `d01c5de` y backend `work/features` / `6f44a1d`, ambos limpios al inicio. Storage fue aplicado manualmente por el usuario; Auth fue observado, no modificado. Las propuestas de este documento NO están aprobadas ni aplicadas. La validación funcional permanece pendiente. Se conserva el contrato inspeccionado en 02D.1 (frontend `885b2b8`, backend `7e75f65`) sin cambios funcionales.

| Ambiente | Identidad manual del dashboard | Evidencia / estado |
| --- | --- | --- |
| Producción | educativo-backend / bfnkaqmhcsyxdxoqnahk / us-east-2 | Auth inventariado por el usuario. Storage confirmado: planeacion-actividades privado, 10 MB, image/*. Producción no modificada. |
| Pruebas | educativo-backend-test / gwdtlbisykzzplgzczzq / us-east-2 / PostgreSQL 17.6 | Esquema/policies validados en 02C.2. Bucket creado manualmente y metadatos verificados en 02D.2; Auth inventariado. No se subieron objetos ni se copiaron usuarios/objetos de producción. |

## Evidencia Storage aplicada — 02D.2

El usuario ejecutó [verify_storage_bucket_readonly.sql](verify_storage_bucket_readonly.sql) en pruebas y comunicó:

| Campo | Resultado observado |
| --- | --- |
| id / name | planeacion-actividades / planeacion-actividades |
| public | false |
| file_size_limit | 10485760 bytes (10 × 1024 × 1024) |
| allowed_mime_types | ["image/*"] |
| matching_bucket_count / exists_uniquely | 1 / true |
| id_name_match / private_match / size_match / mime_match | true / true / true / true |
| status | OK |
| Policies visibles para el bucket | 4 |
| Objetos subidos | Ninguno, confirmado por el usuario; no se consultaron objetos para esta documentación |
| avatars: matching_bucket_count / exists / status | 0 / false / ABSENT_DO_NOT_CREATE |

Storage queda **configurado estructuralmente**, no validado con usuarios A/B, URLs firmadas, upload/remove ni acceso cruzado. No recrear el bucket ni crear avatars. No se añaden capturas, hashes inventados ni URLs del dashboard. El agente no ejecutó la consulta ni cambió servicios.

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

## C. Procedimiento histórico 02D.1 — creación completada por el usuario en 02D.2

Se conservan los pasos como historial de preparación. El bucket ya existe: no repetir su creación. Las referencias a autorización futura en esta sección describen 02D.1, no una acción pendiente actual. Los rótulos del dashboard pueden variar: detenerse ante diferencias, sin improvisar cambios.

1. Abrir el dashboard de `educativo-backend-test`. Verificar visualmente Project ID **gwdtlbisykzzplgzczzq**, región us-east-2. Si aparece producción educativo-backend / bfnkaqmhcsyxdxoqnahk, detenerse.
2. Entrar en Storage → Buckets. Comprobar si ya aparece `planeacion-actividades`, sin abrir objetos. Si existe con configuración distinta, detenerse y registrar diferencias; no editarlo. Si coincide, registrar que ya existe y no crear un duplicado.
3. Si no existe, usar New bucket/Create bucket. Nombre exacto `planeacion-actividades`; Public bucket **desactivado**; Restrict file size **activado**, límite **10 MB**; Restrict MIME types **activado**, único valor literal `image/*`. Si las restricciones se muestran en un paso de configuración distinto, completar y comprobarlas antes de cualquier uso; si no pueden establecerse, detenerse.
4. Antes de guardar, verificar nuevamente Project ID y los cuatro ajustes. Guardar únicamente ese bucket en pruebas, cuando se autorice la acción en una sesión posterior. No cambiar ninguna policy, Auth, variable local, Render ni Vercel.
5. Reabrir la configuración del bucket y recopilar evidencia visual acotada: identidad del proyecto, nombre/id del bucket, Public bucket apagado, restricción de tamaño encendida y 10 MB, restricción MIME encendida y image/*. Anotar fecha. Recortar claves, tokens, URLs firmadas y cualquier información personal; no abrir/listar objetos ni usuarios.
6. En una sesión posterior autorizada, contrastar con [verify_storage_bucket_readonly.sql](verify_storage_bucket_readonly.sql) en el SQL Editor de pruebas. Exportar los dos resultados por separado. No ejecutar el inicializador de schema de nuevo.

No crear avatars, no subir imágenes reales o sintéticas todavía, no copiar objetos de producción. Mantener carga manual y URLs firmadas; imágenes con IA fuera de alcance. Después de creación y configuración se requerirá otra sesión de pruebas con dos usuarios autorizados y ambiente aislado.

## D. Consulta de metadatos preparada

Dos SELECT de solo lectura sobre **storage.buckets**, sin storage.objects, usuarios ni campos de propietarios. La primera consulta busca coincidencias por id o name, devuelve ambos, public, file_size_limit, allowed_mime_types, número de coincidencias y comparaciones. MISSING si no existe; DIFF ante duplicidad por nombre/ID, parámetros diferentes o restricciones NULL; OK solo con coincidencia única y exacta. La segunda informa por separado si avatars existe, sin requerirlo ni crearlo; si aparece, revisar sin cambios automáticos.

La comparación **10 × 1024 × 1024 = 10485760 bytes** quedó confirmada en el destino por el resultado manual de 02D.2. MIME coincidió exactamente con el array `image/*`; NULL no sería equivalente. La consulta fue ejecutada satisfactoriamente por el usuario en pruebas y permanece reutilizable; el agente no la ejecutó. Ante diferencias posteriores o errores de columnas/permisos, registrar resultados/SQLSTATE sin ampliar el alcance a objetos ni modificar producción.

No contiene secretos ni Project URLs. El Project ID en comentario es una precondición visual, no una comprobación de identidad de PostgreSQL. La consulta no prueba RLS ni comportamiento de cargas.

## E. Inventario Auth observado — producción / pruebas (02D.2)

Valores proporcionados por el usuario, sin cambios Auth aplicados en esta sesión. Esta matriz sustituye los campos pendientes de recopilar de 02D.1; no son valores deseados aprobados.

| Campo | Producción observado | Pruebas observado |
| --- | --- | --- |
| Site URL | `https://educativoia.com` | `http://localhost:3000` |
| Redirect URLs | Seis entradas, transcritas abajo | Ninguna |
| Allow new users to sign up | true | true |
| Allow manual linking / Allow anonymous sign-ins | false / false | false / false |
| Confirm email | true | true |
| Providers | Solo Email enabled; Phone, SAML, Web3 y sociales/OIDC disabled | Igual |
| Secure email change | true | true |
| Secure password change / Require current password when updating | false / false | false / false |
| Prevent leaked passwords / protección de contraseñas filtradas | false; no disponible en el plan observado | Igual |
| Minimum password length / Password requirements | 6 / ninguno | 6 / ninguno seleccionado |
| Email OTP expiration | 86400 s; aviso «OTP expiry exceeds recommended threshold» | 3600 s |
| Email OTP length | 6 | 8 |
| Rate limit: sending emails | 2/h | 2/h |
| Rate limit: SMS | 30/h | 30/h |
| Rate limit: token refreshes | 150 requests/5 min/IP | Igual |
| Rate limit: token verifications | 30 requests/5 min/IP | Igual |
| Rate limit: anonymous users | 30 requests/h/IP | Igual |
| Rate limit: signups/sign-ins | 30 requests/5 min/IP | Igual |
| Rate limit: Web3 signups/sign-ins | 30 requests/5 min/IP | Igual |
| Single session | disabled | disabled |
| Time-box / Inactivity timeout | 0/never / 0/never | Igual |
| Access token expiry | 3600 s | 3600 s |
| Detect/revoke compromised refresh tokens | enabled | enabled |
| Refresh token reuse interval | 10 s | 10 s |
| CAPTCHA | disabled | disabled |
| Custom SMTP / entrega | disabled / servicio integrado Supabase | Igual |
| Advertencia de entrega observada | Servicio integrado no destinado a aplicaciones en producción | Límite observado 2 emails/h |
| Plantillas | Predeterminadas equivalentes a la lista siguiente | Predeterminadas, lista siguiente |
| Hooks Auth | Ninguno | Ninguno |

Los límites de proveedores deshabilitados se registran tal como aparecen; no implican que esos proveedores estén habilitados. El ajuste observado de detección/revocación de refresh tokens se conserva con su rótulo, sin inferir opciones adicionales no proporcionadas.

Redirect URLs de producción, con los patrones literales observados:

- `http://127.0.0.1:5500`
- `https://educativoia.com/**`
- `https://www.educativoia.com/**`
- `https://educativo-ia.vercel.app/**`
- `https://planeacion-docente-ia.vercel.app/**`
- `http://localhost:5500`

Plantillas observadas (nombres/tipos, sin contenido ni inferir el estado individual de notificaciones): Authentication: Confirm sign up; Invite user; Magic link or OTP; Change email address; Reset password; Reauthentication. Security: Password changed; Email address changed; Phone number changed; Sign-in method linked; Sign-in method removed; MFA method added; MFA method removed. Producción muestra plantillas predeterminadas equivalentes. Su presencia no demuestra entrega de correo.

## F. Rutas reales y precondiciones para la sesión Auth

| Necesidad | Evidencia local en frontend | Existente / faltante |
| --- | --- | --- |
| Registro | [pages/registro.html](../../../frontend/pages/registro.html), aviso y botón deshabilitado de contención 00.1 | Pantalla existe, sin form/name ni integración signUp. Mantener contención hasta integrar. |
| Confirmación / callback | Inventario pages/ y búsqueda en js/ de exchangeCodeForSession, verifyOtp, emailRedirectTo y redirectTo | No hay página/handler propio de callback de confirmación ni ruta final definida. La posible gestión automática del SDK no sustituye este flujo ni está validada. |
| Solicitud de recuperación | [pages/recuperar.html](../../../frontend/pages/recuperar.html), aviso/botón deshabilitado | Pantalla existe, sin integración resetPasswordForEmail. No equivale a una página para cambiar contraseña. |
| Establecer nueva contraseña | [auth.service.js](../../../frontend/js/services/auth.service.js), listener onAuthStateChange; búsqueda de updateUser/PASSWORD_RECOVERY | Sin página ni handler de nueva contraseña; listener solo trata SIGNED_OUT. Manejo de recovery, token/enlace inválido, expiración y confirmación de cambio faltantes. |
| Login y destino posterior | [login.page.js](../../../frontend/js/pages/login.page.js), initLoginPage, líneas 11–20 | signInWithPassword funcional en código; éxito navega tras 1 s a dashboard.html relativo desde pages/login.html, es decir pages/dashboard.html. No se encontró conservación del destino previo mediante returnTo. |
| Acceso sin sesión / logout | auth.service.js, protegerRuta / requireSession / SIGNED_OUT | Navegación relativa a login.html. La vuelta después de confirmar correo o restablecer contraseña todavía debe diseñarse. |
| Hosts locales | [config.js](../../../frontend/js/core/config.js), API_BASE_URL; [README backend](../../README.md), ejemplo CORS_ORIGIN/PORT; [inventario](../ENVIRONMENT_SCHEMA_READINESS.md) | El puerto 3000 es la API local en config.js. El ejemplo CORS_ORIGIN documenta el frontend local en 5500 (localhost y 127.0.0.1); no asumir que Site URL de pruebas en 3000 sirve páginas Auth. |

No implementar ni inventar nombres de nuevas páginas/URLs en esta sesión. Antes de implementar y probar los flujos hay que identificar los orígenes de frontend por ambiente, acordar rutas/handlers y retorno, y después registrar URLs exactas correspondientes a las páginas implementadas. No aprobar Redirect URLs finales antes de esa definición. Identificar un proyecto de pruebas en la documentación no cambia el cliente Supabase fijo del frontend ni aísla las variables del backend.

## G. Riesgos observados y decisiones pendientes

| Evidencia / riesgo | Propuesta no aplicada | Decisión o precondición |
| --- | --- | --- |
| Site URL pruebas en 3000; frontend local documentado en 5500 | Configuración local explícita para 127.0.0.1:5500 y/o localhost:5500 | Elegir origen/orígenes locales y configuración por ambiente. Son hosts distintos; no mezclarlos sin probar sesiones. |
| Pruebas sin Redirect URLs y sin callbacks propios | Definir URLs exactas después de implementar las páginas/callbacks | Contrato de registro, confirmación, recuperación, nuevo password y retorno antes de integrar correo. |
| Producción admite cuatro patrones /** amplios | Evitar wildcards más amplios de lo necesario | Revisar destinos necesarios; no se reduce la allowlist en esta sesión. |
| educativo-ia.vercel.app figura en allowlist | Verificar si sigue siendo dominio legítimo y controlado | Comprobar propiedad/uso antes de conservarlo. Su legitimidad no fue contrastada externamente. |
| Producción admite 127.0.0.1:5500 y localhost:5500 | Separar callbacks de pruebas/producción | Decidir si conservar redirects locales en producción; no retirarlos incidentalmente. |
| OTP producción 86400 s y advertencia del dashboard | Reducir expiración de producción | Acordar duración; 3600 s en pruebas es observación, no un nuevo valor aprobado para producción. |
| OTP length 6 producción / 8 pruebas | Unificar longitud si el flujo utiliza códigos OTP | Decidir enlaces/códigos y su UX; no confundir Email OTP expiration con Access token expiry. |
| Password mínimo 6 sin requisitos adicionales; protecciones de cambio desactivadas | Elevar mínimo al menos a 8, sujeto a decisión; revisar política de cambios | Acordar requisitos y compatibilidad con usuarios existentes antes de cambiar Auth/formularios. No inferir privilegios comerciales. |
| CAPTCHA desactivado | Evaluarlo antes de abrir el flujo público de registro | Seleccionar si se adopta e integración necesaria; altas están permitidas en Auth aunque la UI de registro esté contenida. |
| Servicio integrado, 2 emails/h, advertencia de producción y sin SMTP transaccional configurado | Elegir SMTP transaccional antes del lanzamiento | Bloquea un lanzamiento fiable y limita pruebas repetidas. Elegir proveedor/configuración de prueba separada y validar entrega; no se ha elegido proveedor. |
| Confirm email true, anónimos/manual linking false | Conservar confirmación obligatoria y mantener anónimos/manual linking deshabilitados salvo decisión explícita | Propuesta de continuidad, no nueva aprobación de políticas. Definir experiencia de usuario no confirmado. |
| Sin validación funcional de correo, callbacks o recuperación | Pruebas controladas después de aislar y conectar ambientes | Validar enlaces válidos, expirados/usados, recuperación, sesión y redirecciones; actualmente todo pendiente. |
| No hay Hooks Auth | Ningún cambio propuesto por defecto | Es evidencia, no defecto por sí mismo. No confundir Hooks con el trigger DB handle_new_user existente. |

Continúan pendientes pruebas Storage con usuarios A/B, firma/expiración de URLs, upload/remove y aislamiento cruzado; RLS A/B/anon; conexión frontend/backend a pruebas; variables explícitas por ambiente; datos de referencia y discrepancia ia_metrics/ia_metrics_legacy. Esquema y bucket estructuralmente correctos no acreditan esas pruebas. Registro, recuperación, contacto, planes, cuotas y pagos no se implementan aquí. Prueba manual de 00.1 pendiente.

## Verificación local y límites

02D.1 preparó la guía y SQL sin ejecutarlo. 02D.2 registra evidencia externa proporcionada por el usuario y contrasta rutas/hosts con código local. El agente no ejecutó SQL, no modificó JS/HTML/CSS/SQL, Auth, Storage, variables, Render o Vercel; no añadió capturas ni URLs del dashboard. Se revisan enlaces, diff completo y git diff --check en ambos repositorios. No hay pruebas de navegador o funcionales acreditadas por esta sesión.
