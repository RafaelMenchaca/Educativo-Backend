# Inventario de entornos y evidencia de esquema — sesión 02A

Fecha: 2026-09-23. Estado: inspección local y propuesta documental. **Ambientes no declarados aislados; esquema desplegado no verificado.**

## Actualización 02C — 2026-09-24

Se recibieron y revisaron localmente los once CSV de `supabase_metadata/` (PostgreSQL de origen 15.8 comunicado). Sustituyen al snapshot histórico como evidencia de los objetos exportados: **19 tablas public con RLS habilitado**, 257 columnas, 76 constraints, 69 índices, seis funciones propias, 16 triggers, 49 policies public y ocho policies sobre storage.objects. Esto no certifica el estado remoto actual, la configuración de Auth/buckets, la completitud de todos los objetos ni el aislamiento de ambientes.

Preparados [script inicial de pruebas y guía](test-environment/README.md), fuera de migraciones/deploy automático, con precondiciones y ejecución transaccional, y [consulta adicional de secuencia](diagnostics/identity_sequence_metadata_readonly.sql). **No se ejecutó ninguno.** Los parámetros de la secuencia identity no están exportados: queda bloqueada la afirmación de reproducción exacta; el borrador exige resolver o aceptar expresamente esa diferencia antes de ejecutarse. Los CSV permanecen fuera de Git; el [manifiesto](test-environment/SOURCE_MANIFEST.md) identifica los archivos revisados.

Hallazgos contrastados: profiles y user_profiles son distintas; el único trigger personalizado de auth.users llama handle_new_user y crea profiles + user_settings. user_profiles es editable por su propietario y no acredita privilegios comerciales. Hay escrituras permitidas en métricas/jobs, grants amplios y relaciones sin comprobación general de propietario común. `ia_metrics_legacy` existe en el export, pero el consumidor guardarMetricasIa aún escribe en `ia_metrics`, ausente. Los cambios de seguridad y esa incompatibilidad quedan separados de la reproducción; no se crea un alias ni se endurecen policies silenciosamente. Ver evidencia y pendientes en la guía.

Se preserva el estado pendiente de 02B: frontend limpio en `work/features` / `c58a282249dd12b66dcf6ce3787fdda4d8e3722a`; backend `work/features` / `47b8ab7534452a910cdd4fe98422de0eef0b7d09` con este inventario modificado y `docs/diagnostics/` sin seguimiento al comenzar 02C. No se asume commit de esos cambios. Las reglas y dominios de 02B siguen vigentes; las verificaciones antiguas de policies pendientes quedan ahora parcialmente resueltas por los CSV, no por pruebas de autorización. **No se declara esquema ejecutable validado ni ambientes aislados. Prueba manual de 00.1 pendiente.**

## Actualización 02B — 2026-09-24

Hechos comunicados por el usuario (no consultados externamente por el agente):

| Servicio | Evidencia aportada |
| --- | --- |
| Supabase | Existe un único proyecto, `educativo-backend`, con los datos actuales. No hay un proyecto de pruebas separado confirmado. |
| Vercel producción | Rama `main`, commit mostrado `a5e2e16`; dominios `educativoia.com`, `www.educativoia.com` y `planeacion-docente-ia.vercel.app`. |
| Render | Servicio `Educativo-Backend`, rama `main`, commit mostrado `976fc5e`; accesible por `api.educativoia.com` y `educativo-backend.onrender.com`. |
| Previews | Hay previews de otras ramas; `work/features` no está acreditada como preview aislada ni como versión desplegada. |
| Esquema aportado | Sigue siendo un snapshot documental, no export reciente ni evidencia de policies actuales. |

Estos hechos resuelven la existencia de los servicios y las ramas/commits mostrados que en 02A estaban pendientes; no certifican correspondencia entre variables, proyecto o código servido. **El destino efectivo de variables locales/Render sigue sin contrastar**, así como el vínculo comprobado de los literales frontend con el proyecto identificado. No inferir el rol efectivo de claves por su nombre. Auth, buckets, grants, funciones y policies reales permanecen sin verificar.

Propuesta de trabajo actual, no provisionada: producción conserva sus servicios; primeras pruebas con frontend/backend **locales y un proyecto Supabase separado**. Un backend de pruebas publicado se resolverá después. Esta propuesta precisa la alternativa general de la sección C; no autoriza creación de recursos, costes, copia de datos ni cambios externos.

Línea base 02B: ambos repositorios en `work/features`, limpios al inicio. Frontend `c58a282249dd12b66dcf6ce3787fdda4d8e3722a`; backend `47b8ab7534452a910cdd4fe98422de0eef0b7d09`. Revisados los archivos reales `frontend/js/core/config.js`, `frontend/js/core/supabase.client.js`, `backend/supabaseClient.js` y `backend/src/app.js`, omitiendo valores secretos. No se leyeron `.env` ni se usó código pegado en chat como sustituto del repo.

Preparados [SQL diagnóstico de solo lectura](diagnostics/supabase_metadata_readonly.sql) y [guía por bloques](diagnostics/README.md), fuera de migraciones. **No ejecutados**. La ausencia de SQL versionado descrita en 02A correspondía a ese momento; ahora hay SQL de diagnóstico, no migraciones. Las secciones siguientes conservan el inventario y pendientes de 02A con esta actualización como referencia vigente. El contrato comercial no se modifica; **la prueba manual de 00.1 sigue pendiente**.

## Alcance y línea base

Se leyeron los AGENTS de ambos repositorios, README, arquitectura/mapa frontend, guía backend, [schema documental](DATABASE_SCHEMA.md) y [contrato de producto](PRODUCT_PLANS_CONSUMPTION.md). Este inventario no duplica ni cambia las reglas comerciales. Se preservan Biblioteca, scripts clásicos y su orden, `explorerState`, contratos de IDs, generación, Auth y RLS.

| Repositorio hermano | Rama | HEAD inspeccionado | Estado inicial |
| --- | --- | --- | --- |
| `frontend/` | `work/features` | `bf5468b4236be9159a9ac03a2ec4e96593ac1f67` | Limpio; documentación de sesión 01 y contención 00.1 presentes en HEAD. |
| `backend/` | `work/features` | `eab98a5caf122fca52ae9dcce9ec64a50a567616` | Limpio; contrato de sesión 01 presente en HEAD. |

No se asumió que la sesión 01 estuviera confirmada: se comprobó el estado de Git. No se modifica el contrato ni las páginas de 00.1. **La prueba manual de 00.1 sigue pendiente.** No se leyeron archivos `.env`, claves o cadenas de conexión en salida; no se consultaron servicios externos, datos de usuarios o SQL. La inspección del cliente público extrajo únicamente estructura de configuración y hostname, omitiendo el valor de la clave.

En este documento `SB-F` identifica el proyecto del literal `SUPABASE_URL` en `frontend/js/core/supabase.client.js`. Es un hostname remoto `*.supabase.co` identificable en ese archivo; se usa el alias para no repetir identificadores de infraestructura. No está comprobado si es producción o pruebas. `SB-B` designa el destino efectivo de `SUPABASE_URL` del backend, que no se leyó. No se ha demostrado que SB-F y SB-B coincidan.

## A. Selección de conexiones y evidencia

### Matriz de entornos

| Ejecución | Regla encontrada y destino | Riesgo de producción accidental | Dependencia externa no verificada |
| --- | --- | --- | --- |
| Frontend local en `localhost` o `127.0.0.1` | `API_BASE_URL` → `http://localhost:3000`. Supabase Auth/Storage → SB-F fijo, independiente de API. | Cambiar a API local no aísla Auth/Storage. Si SB-F es producción, incluso login/subida desde local llegan allí. | Clasificación de SB-F, claves públicas adecuadas y destino SB-B del proceso local. |
| Frontend servido en IP LAN, loopback IPv6 o abierto con `file:` | No coincide con las subcadenas previstas: API → `https://api.educativoia.com`; Supabase → SB-F. | Selección confirmada de la URL designada como productiva por el repo; no se comprobó conectividad o éxito de requests. | DNS/servicio efectivo y CORS. `file:` no es un entorno de prueba seguro para páginas privadas. |
| Backend local | `dotenv.config()` y `process.env.SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_KEY`; puerto `PORT` o 3000. `NODE_ENV` no cambia Supabase. | Un proceso local puede usar producción si su entorno así lo configura. No existe una comprobación local que prohíba esa combinación. | Entorno del proceso/archivo local y correspondencia real de proyecto/tipo de claves; no se inspeccionaron valores. |
| Preview frontend | Un hostname normal de preview no coincide con localhost: API → `https://api.educativoia.com`; Auth/Storage → SB-F. No hay rama preview en el selector. | Destino de API productiva por defecto confirmado. CORS podría bloquear algunas previews, pero no corrige el destino ni protege Auth/Storage directos. | Asignación real de dominios, build y variables de Vercel; no hay evidencia de una API preview separada. |
| Preview backend, si existe | Mismo código basado en variables que local/producción; sin selector de ambiente independiente. | Reutilizar valores de producción cruzaría ambientes. | Existencia del servicio, variables y grupos compartidos en Render u otro hosting. No asumir que existe. |
| Producción | Host público normal → API `https://api.educativoia.com` y SB-F. Backend desplegado → SB-B de sus variables. | No se puede certificar coherencia de frontend/backend/Auth/Storage únicamente por nombres o hostname público. | HEAD realmente desplegados, DNS/TLS, SB-B, pertenencia/tipo de claves, settings de Auth/Storage. |

### API y configuración pública

- [Frontend `config.js`](../../frontend/js/core/config.js), `API_BASE_URL`/`window.API_BASE_URL`: usa `hostname.includes('localhost') || hostname.includes('127.0.0.1')`, no igualdad exacta. Un hostname como `localhost.example.test` se clasifica local. `mostrarEntorno` utiliza la misma heurística; el pie de página no demuestra aislamiento.
- [Frontend `supabase.client.js`](../../frontend/js/core/supabase.client.js): `SUPABASE_URL` y `SUPABASE_KEY` son literales; `window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)` sin selección por ambiente ni opciones explícitas adicionales. No se imprimió ni decodificó la clave. Su nombre/comentario no acredita privilegios: comprobar su tipo de emisión en el proyecto correspondiente, sin compartir su valor.
- APIs en `frontend/js/api/` consumen `API_BASE_URL`; cambiar variables en el panel de Vercel por sí solo no reescribe estos literales del JS estático. No se encontró un paso versionado de inyección de configuración.
- `frontend/pages/dashboard.html`, `detalle.html`, `archivados.html` y `dashboard_tailwind.html` cargan config, SDK de Supabase, cliente y Auth en orden clásico. `login.html` carga SDK/cliente/Auth, **pero no `config.js`**: una futura configuración común debe cubrir también login sin alterar su función.
- Registro, recuperación y contacto siguen contenidos mediante HTML y no inicializan Supabase. No convertirlos incidentalmente en flujos activos.

### Backend: contexto de usuario y clientes de uso privilegiado

[supabaseClient.js](../supabaseClient.js) llama `dotenv.config()` y crea ambos tipos de cliente con el mismo `supabaseUrl` del proceso. Comprueba presencia de URL y clave destinada a admin al importar; comprueba la clave destinada a cliente público al llamar `createUserClient`. No valida explícitamente ambiente, correspondencia entre claves y URL o clasificación del proyecto. `NODE_ENV` no elige otro proyecto.

| Cliente / consumidor | Evidencia de código | Alcance comprobado y límite |
| --- | --- | --- |
| `createUserClient(accessToken)` | `supabaseClient.js`; `userClientFromReq` en los seis controllers de recursos/jerarquía. | Envía `Authorization: Bearer` del usuario y desactiva persistencia/refresh de sesión del cliente servidor. Diseñado para conservar contexto RLS; policies/grants reales no comprobados. |
| `supabaseAdmin` y alias `supabase` | `supabaseClient.js`. | Se configura con `SUPABASE_SERVICE_ROLE_KEY` sin Bearer de usuario. Es el cliente destinado a operaciones privilegiadas; el privilegio efectivo depende del material configurado y no se infiere del nombre de la variable. |
| `requireAuth` | [auth.middleware.js](../src/middleware/auth.middleware.js): `supabaseAdmin.auth.getUser(token)`. | Valida el token contra SB-B y fija `req.user`/`req.accessToken`; no acredita por sí solo que ese proyecto sea el esperado para el ambiente. |
| Métricas | `src/services/aiMetrics.service.js`: `createAiJob`, `logAiCall`, `finishAiJob`, `failAiJob`, `getModelPrice`. | Uso explícito de `supabaseAdmin` para tablas de métricas/precios. |
| Exámenes | `src/services/examenes.service.js`: `processExamGenerationJob` y actualizaciones de items/jobs en su procesamiento. | Worker interno usa `supabaseAdmin`, incluido guardado final del examen. |
| Batches | `src/services/planeaciones.service.js`: `crearPlaneacionBatch`, `getOrCreatePlaneacionBatch`. | También usan `supabaseAdmin`. Reuso explícito filtra por `user_id`; creación escribe referencias jerárquicas. Esta excepción existe en código además de métricas/worker. |
| Fallback de servicios | `getClient` en planeaciones, anexos, listas, exámenes y Biblioteca: `supabaseClient || supabaseAdmin`. | Los controllers entregan cliente de usuario, pero omitirlo en una llamada futura seleccionaría el cliente destinado a admin. No sustituirlo por conveniencia. Jerarquía recibe el cliente explícitamente. |

Variables relevantes, sin valores: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_KEY`, `NODE_ENV`, `CORS_ORIGIN`, `PORT`, `OPENAI_API_KEY`. La última también requiere separación antes de pruebas de generación; esta sesión no realiza llamadas IA. Correo y pagos aún no tienen configuración funcional identificada.

### Storage

**Confirmación visual comunicada por el usuario en 02C:** `planeacion-actividades` existe y es **PRIVADO** (`Public bucket` desactivado), con **10 MB por archivo** y MIME permitido **`image/*`**. Se utiliza actualmente para subir imágenes manualmente a las actividades de cada momento de una sesión y acceder mediante URLs firmadas. Queda resuelto el pendiente público/privado mediante esta evidencia aportada. Se preservan el flujo y sus consumidores; la generación de imágenes con IA está pausada y fuera de alcance. **`avatars` no existe**: sus policies exportadas no acreditan un bucket ni autorizan crearlo o implementar avatares. Estos hechos actualizan los pendientes históricos de Storage de 02A/02B, sin consulta o modificación de producción por el agente. La [preparación de pruebas](test-environment/README.md) requiere los mismos parámetros en el futuro proyecto separado, sin crear buckets en esta sesión.

[detalle.page.js](../../frontend/js/pages/detalle.page.js): `DETALLE_STORAGE_BUCKET='planeacion-actividades'`, `DETALLE_SIGNED_URL_TTL_SECONDS` (una hora), `crearSignedUrlActividad`, `subirImagenActividad`, `eliminarImagenesStorage`.

El navegador usa directamente `window.supabase.storage` del proyecto SB-F, sin pasar por Express. Las rutas de subida incluyen `userId/planeacionId/tiempoSesion/timestamp-nombre`; `upsert:false`. Genera URLs firmadas y elimina objetos mediante ese mismo cliente. Ni el prefijo por usuario ni la firma prueban que el bucket sea privado o que sus policies rechacen acceso cruzado. No se consultaron buckets, objetos, nombres de archivos ni URLs firmadas reales.

### CORS

[app.js](../src/app.js): `NODE_ENV` ausente cae a `development`; en ese modo `origin:true` admite cualquier origen. Fuera de ese modo:

- `CORS_DEFAULTS` siempre agrega `https://educativoia.com`, `https://www.educativoia.com` y `https://planeacion-docente-ia.vercel.app`.
- `CORS_ORIGIN` añade orígenes separados por coma; no sustituye la lista fija.
- También admite peticiones sin `Origin`, localhost/127.0.0.1 con cualquier puerto y hosts que coincidan con el patrón de GitHub Pages del código, incluso en producción.
- Otras previews no están permitidas automáticamente salvo que se incorporen a la variable.

CORS gobierna acceso desde navegadores a Express; no es autorización, aislamiento de DB ni control de las llamadas directas a Supabase. Un bloqueo CORS no debe tomarse como garantía de ausencia de efectos de todos los tipos de request.

### Auth, dominios y despliegue

- `initLoginPage` en [login.page.js](../../frontend/js/pages/login.page.js) llama `signInWithPassword` en SB-F y navega a `dashboard.html` relativo al origen actual.
- [auth.service.js](../../frontend/js/services/auth.service.js), `protegerRuta`, `requireSession`, listener `SIGNED_OUT`, y `handleProfileAction` en `components.private.js` redirigen a `login.html` relativo. No hay cambio explícito a un dominio productivo en esas redirecciones.
- No se encontraron `redirectTo`, `emailRedirectTo`, alta, recuperación o callback funcionales de correo en `frontend/js`. Site URL y allowlist de redirecciones de Supabase siguen siendo configuración externa pendiente.
- `pages/batch.html` y `planeacion.html` redirigen relativamente a Dashboard. `components.public.js` resuelve enlaces y fragmentos respecto de la ubicación del script; no selecciona proyecto Supabase.
- Referencias públicas: `educativoia.com`, `www.educativoia.com`, `api.educativoia.com` y `planeacion-docente-ia.vercel.app`. Contacto/footer muestran un correo bajo `educativo-ia.com`; confirmar la diferencia de dominio, sin asumir que el buzón funciona.
- No se encontraron manifiestos versionados `vercel.json`, `render.yaml`/`render.yml`, configuración `.vercel`, workflows de despliegue, Dockerfile o `supabase/config.toml` en los inventarios Git. No hay migraciones `.sql` versionadas encontradas. Una referencia Vercel en CORS no prueba alojamiento actual; Render requiere confirmación externa. Configuración exclusivamente en paneles puede existir.

## B. Riesgos confirmados e hipótesis

| Hallazgo confirmado localmente | Consecuencia posible, todavía no comprobada en servicios |
| --- | --- |
| Preview/IP LAN/IPv6/file seleccionan la URL de API designada como producción. | Requests podrían alcanzar el servicio productivo; no se probó DNS, CORS live ni autorización. |
| Supabase fijo en frontend y backend configurado por separado. | Login/Storage locales podrían usar producción, o frontend/backend podrían pertenecer a proyectos distintos. Falta identificar SB-F/SB-B por ambiente. |
| No hay validación explícita de identidad de ambiente/proyecto. | Un entorno con variables mezcladas podría arrancar y fallar después o actuar sobre el destino incorrecto. |
| CORS permite localhost/GitHub Pages en producción y es abierto si `NODE_ENV` falta. | Una configuración de hosting errónea ampliaría orígenes; no demuestra una fuga ni sustituye los controles Auth/RLS. |
| Existen clientes destinados a admin y fallbacks hacia ellos. | Su uso con credenciales efectivamente privilegiadas reduce la protección RLS de esas operaciones. Verificar roles y relaciones antes de certificar aislamiento. |
| Examen conserva `batchId` en configuración y el worker lo inserta con cliente admin; no se encontró comprobación explícita de propietario del batch en ese trayecto. | Posible asociación cruzada si el esquema real no la impide. Una FK simple solo acredita existencia del batch, no igualdad de propietarios. |
| Snapshot contiene nombres de triggers de ownership, no sus cuerpos ni policies/grants. | No se puede afirmar cobertura o eficacia de aislamiento por la existencia de esos nombres. |

## C. Propuesta mínima de aislamiento — no implementada

1. **Configuración explícita única por ambiente del frontend.** Mantener vanilla JS y scripts clásicos; alimentar los providers actuales de API/Supabase desde configuración pública explícita servida con el despliegue. No añadir bundler/framework. Cubrir login, que hoy no carga `config.js`, y conservar orden provider → cliente → Auth → consumers. La selección de ambiente no debe tener fallback a producción ni usar coincidencias parciales de hostname.
2. **Fallo cerrado antes de conectar.** Si falta o es inválida la configuración, mostrar un aviso claro sin valores de claves, no construir el cliente y no iniciar requests/páginas privadas. Validar esquema de URL, origen esperado, ambiente y pertenencia a una lista aprobada de API/proyectos. Local/preview deben rechazar explícitamente destinos clasificados como producción. Mientras no exista destino de prueba aprobado, bloquear pruebas conectadas; no sustituirlo silenciosamente por producción.
3. **Backend con identidad de entorno explícita.** Validar al inicio todos los nombres requeridos, URLs y la correspondencia aprobada ambiente–proyecto, incluyendo la clave de usuario que hoy se comprueba tarde. Mantener nombres existentes cuando sea posible. No inferir rol por el nombre de una variable: revisar tipo/emisión con el operador y mantener credenciales privilegiadas solo en servidor. `NODE_ENV` es modo de ejecución, no suficiente como identidad de proyecto.
4. **Una correspondencia coherente:** frontend → API de ese ambiente → Supabase de ese ambiente; Auth y Storage del frontend en el mismo proyecto aprobado que DB/Auth del backend. Configurar Site URL/redirect allowlist y bucket/policies para ese destino. Separar sesiones de navegador por origen/proyecto y probar que una sesión de otro ambiente no autoriza acceso. Los identificadores públicos pueden formar parte del manifiesto; los secretos nunca.
5. **CORS explícito por servicio.** Evitar que el backend de producción admita por defecto locales o previews de terceros; utilizar orígenes exactos aprobados para cada ambiente. Las previews sin origen autorizado permanecen sin acceso. No ampliar wildcards como sustituto de una API de pruebas. Conservar la decisión de requests sin Origin como tema explícito de operación, no como autenticación.
6. **Futuro correo y pagos:** configuración separada por ambiente; correo de pruebas a un destino controlado/sandbox y pagos en modo de prueba con credenciales, catálogo y firmas/webhooks separados. No copiar secretos ni identificadores operativos de producción a previews. OPENAI_API_KEY también debe revisarse antes de habilitar generación de prueba.

**Reutilizable:** repositorios, owners de configuración, clientes por usuario, rutas y bucket lógico, HTML y orden clásico, documentos y esquema revisado. Puede mantenerse el mismo nombre lógico de bucket en proyectos distintos. La contención pública de 00.1 permanece activa.

**Recursos externos por confirmar o crear en otra sesión:** proyecto Supabase no productivo (o infraestructura local expresamente elegida), API de pruebas, despliegue/origen de preview aprobado y posteriormente sandbox de correo/pagos. No hay evidencia de staging existente. Reutilizar un recurso solo si se acredita que es no productivo y compatible; un bucket separado dentro del proyecto productivo no aísla por sí solo Auth/DB. Crear proyectos/servicios puede tener coste. No clonar usuarios, objetos ni datos productivos; partir de esquema revisado y datos sintéticos cuando se autorice.

## D. Evidencia externa mínima, priorizada

### P0 — Identificar destinos antes de cualquier prueba conectada

Entregar una tabla breve por ambiente: origen frontend, servicio/API, alias o referencia pública de proyecto Supabase, ambiente declarado, HEAD desplegado y fecha de revisión. Para claves, solo indicar que el operador verificó tipo/emisión y proyecto; **no compartir valores, tokens, cadenas de conexión ni capturas con secretos**.

- **Supabase:** confirmar si SB-F es producción y qué proyectos no productivos existen. En Auth, revisar únicamente Site URL, redirecciones permitidas, disponibilidad del login por email y estado de confirmación de correo necesario para futuras cuentas sintéticas. No abrir/listar usuarios ni probar envío ahora. Storage de origen confirmado visualmente por el usuario en 02C: `planeacion-actividades` privado, 10 MB y `image/*`. Queda pendiente configurar y validar esos parámetros en el futuro destino de pruebas y contrastar policies/URLs firmadas con datos sintéticos. No pedir configuración ni creación de `avatars`: no existe y está fuera de alcance.
- **Vercel, si es el hosting real:** proyecto/repo conectado, Production Branch, HEAD y dominios de Production/Preview, Root Directory, build/output y mecanismo real de configuración. Consultar nombres y alcance Production/Preview/Development de variables, sin mostrar valores secretos. Determinar si hay inyección de configuración fuera del repo.
- **Render, si se usa:** servicio/repo/rama/HEAD y URL pública/custom domain, root/build/start, existencia de servicio preview separado. Confirmar presencia y ámbito de `NODE_ENV`, `CORS_ORIGIN`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `PORT`, y si se heredan grupos de entorno. Compartir solo clasificación de destino y validación de tipo de credencial; no valores secretos.
- **Dominio/DNS:** únicamente destinos de apex/www/API, redirects y TLS de `educativoia.com`, y relación con `educativo-ia.com`. No hace falta exportar toda la zona ni pedir configuración SMTP/pagos todavía.

### P1 — Paquete acotado de metadatos, sin filas

Solicitar el estado de los siguientes objetos; si faltan, registrar ausencia, sin crearlos. Para cada evidencia anotar proyecto/ambiente, fecha, fuente, cobertura y omisiones.

| Grupo permitido | Evidencia solicitada | Lo disponible localmente |
| --- | --- | --- |
| `public.planteles`, `grados`, `materias`, `unidades`, `temas` | Columnas/tipos, nulabilidad, defaults, PK/FK/unique/check e índices; funciones/triggers de propiedad alcanzables. | Snapshot de definiciones; algunos nombres de funciones ownership, sin cuerpos. |
| `public.planeacion_batches`, `planeaciones`, `examenes`, `anexos`, `listas_cotejo` | Mismos metadatos; relaciones de `user_id`, `batch_id`, `tema_id`, `unidad_id`, `planeacion_id`, cascadas y garantías de mismo propietario. Incluir índice parcial de `planeaciones.tema_id` y unicidad por planeación de anexos/listas. | Código de acceso y snapshot. No demuestran enforcement live. |
| `public.examen_generation_jobs`, `examen_generation_items` | Relación job/item/usuario/examen, unicidad por pregunta, constraints de estado e índices; relación inversa de `generation_job_id`. | Snapshot y código; verificar además qué impide ejecución/persistencia duplicada. |
| `public.user_profiles`, `user_settings` | PK/FK/defaults y acceso a campos editables; triggers de alta en Auth que las alimenten, si existen, sin filas de Auth. | Snapshot; no prueba aprovisionamiento real ni privilegios comerciales. |
| `public.ai_generation_jobs`, `ai_generation_calls`, `ai_model_prices`, `ia_metrics` | Estructura, referencias, tipos numéricos, defaults, índices/unicidad; permisos de escritura/lectura. No solicitar registros de llamadas ni valores de precios. | Primeras tres documentadas y consumidas; `ia_metrics` consumida sin definición en snapshot. Costes y completitud siguen pendientes según el contrato de producto. |
| RLS y grants de los objetos anteriores | RLS habilitada/forzada por tabla; policies completas por operación/rol, `USING` y `WITH CHECK`, permisivas/restrictivas; grants de schema/tabla/columna/secuencia y default privileges aplicables, propietarios y roles con bypass relevantes. Incluir acceso de `PUBLIC`, anon/autenticado y rol efectivo servidor. | No hay policies/grants versionados encontrados. No inferir RLS a partir de filtros en código. |
| Funciones/triggers dependientes | Definición y firma de `set_updated_at`, `enforce_grado_ownership`, `enforce_materia_ownership`, `enforce_tema_ownership`, `enforce_planeacion_tema_ownership` y solo otras funciones alcanzadas desde triggers/policies del alcance. Trigger: tabla, evento, timing, condición y estado habilitado. Función: propietario, invoker/definer, `search_path`, grants EXECUTE y dependencias. | Solo referencias a funciones en el snapshot; faltan cuerpos/privilegios. No ejecutar funciones para inspeccionarlas. |
| Storage | Configuración del bucket indicado; estructura pertinente y RLS/grants/policies de `storage.objects` y `storage.buckets`, incluidas policies amplias que puedan afectar ese bucket. Revisar `bucket_id`, identidad del usuario y prefijo de ruta en condiciones de lectura/insert/update/delete. | Bucket y rutas usados por frontend; ninguna policy verificada. No exportar nombres/rutas de objetos ni filas de Storage. |

No exportar todo `auth`: basta la definición de referencias a `auth.users(id)` y los triggers/funciones de aplicación vinculados a alta de perfiles, si existen. Una FK a un ID no garantiza que padre e hijo tengan el mismo `user_id`. Revisar especialmente batch → planeación y batch → examen, porque hay escrituras con cliente destinado a admin. Las comprobaciones dinámicas A/B quedarán para un ambiente aislado; metadatos por sí solos no sustituyen esas pruebas.

### Método mínimo propuesto y compatibilidad

Primera opción: el operador obtiene **solo definiciones y settings** de los objetos permitidos desde las vistas de estructura/policies/configuración del proyecto identificado, evitando las vistas de filas. Entregar texto revisado por objeto o un inventario manual con los campos anteriores; no un backup ni export CSV de tablas. Si la interfaz no expone grants, privilegios de funciones, RLS forzada u otra pieza, marcarla como faltante, no inferirla.

La inspección de PATH encontró `docker`, pero no `supabase`, `psql` ni `pg_dump`. No se verificaron daemon/imágenes de Docker, versiones de herramientas externas o PostgreSQL remoto. No se instaló ni arrancó nada. Por tanto, **no se entrega un comando CLI o consulta SQL como receta compatible lista para ejecutar**.

Si el acceso por interfaz resulta insuficiente, 02B debe preparar y revisar una extracción de catálogos limitada a la lista de objetos, o un export exclusivamente de esquema filtrado por objetos, con herramienta y versión compatibles comprobadas antes de usarlo. Excluir datos, blobs, dump de roles globales y valores de secretos. Un filtro de tablas puede omitir funciones/grants dependientes: registrar la cobertura y completar únicamente esas dependencias. No ejecutar la extracción ni SQL en 02A. El uso futuro de SQL/export exige definir ese alcance en 02B; no es una autorización implícita de este documento.

**Revisión antes de compartir incluso un esquema:** cuerpos de funciones, defaults, comentarios, opciones de objetos y expresiones de policies pueden contener credenciales, URLs privadas, destinatarios, identificadores de usuarios, SQL dinámico o referencias a Vault/webhooks/servicios. Revisar y redactar esos valores; conservar estructura lógica, tipos, roles y dependencias necesarios para evaluar aislamiento. Indicar cada redacción y cualquier cobertura perdida. No incluir cabeceras de conexión, passwords de roles, tokens, cookies, valores de entorno, contenido educativo ni información de usuarios. No subir un dump sin revisión a Git.

## E. Verificación local y limitaciones

- Estado Git y HEAD iniciales registrados; lectura de fuentes y búsquedas sobre archivos versionados, sin abrir `.env`.
- Evaluación en memoria de `config.js` con nueve hostnames sintéticos: localhost y 127.0.0.1 → API local; LAN, IPv6, preview, dominio público y hostname vacío → API productiva; `localhost.example.test` → API local por coincidencia parcial.
- Evaluación en memoria de la configuración CORS con Express/cors/dotenv simulados, sin importar SDK ni iniciar servidor: 12 combinaciones de modo ausente/development/production y origen ausente/local/GitHub Pages/preview. Confirma apertura con modo ausente y las excepciones locales/GitHub Pages en production; preview no listada se rechaza en ese modo.
- Estas comprobaciones prueban selección local, no conectividad, seguridad live ni comportamiento de navegador. No se enviaron requests, correos o cobros ni se consultaron usuarios, buckets o SQL. No hay nuevas pruebas manuales de 00.1.
- Cambios de esta sesión limitados a este inventario y referencias en ambos README; contrato de producto y código funcional preservados. Validar enlaces y `git diff --check` en ambos repositorios al cierre.

## F. Alcance recomendado para 02B

1. Recibir primero la tabla P0 sin secretos: identificar SB-F, SB-B y hosting/dominios efectivos, y comprobar si existe un destino no productivo utilizable.
2. Revisar el paquete P1 de metadatos disponible y registrar diferencias con `DATABASE_SCHEMA.md`, cobertura y piezas faltantes. No declarar verificado el esquema solo por recibir un export parcial.
3. Elegir con esa evidencia el aislamiento mínimo y sus recursos/costes; concretar configuración y validaciones por ambiente. Si falta infraestructura de pruebas, mantener deshabilitadas las pruebas conectadas y separar su creación como acción posterior expresamente autorizada.
4. Si faltan metadatos esenciales, preparar la extracción mínima compatible para revisión; definir expresamente si 02B incluirá su ejecución. No convertir esta propuesta en permiso para SQL, cambios de servicios o migraciones.
5. Preparar criterios de aceptación de aislamiento (sin destino productivo por defecto, error antes de requests con configuración inválida, coherencia API/Auth/Storage, pruebas A/B sintéticas). Implementación y pruebas externas requieren el alcance acordado de la siguiente sesión.

Salida esperada de 02B: mapa de ambientes respaldado por evidencia, informe de schema con limitaciones y plan concreto de aislamiento. No cerrar automáticamente aislamiento, verificación RLS o la prueba manual pendiente de 00.1.
