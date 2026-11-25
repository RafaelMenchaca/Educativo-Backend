# Guía del backend de Educativo IA

## Naturaleza de este documento

Este documento describe la arquitectura actual del backend.

No sustituye:

- las migraciones SQL;
- el código ejecutable;
- `docs/DATABASE_SCHEMA.md`;
- `docs/AI_GENERATION_CONTRACTS.md`;
- `AGENTS.md`.

No es una especificación alternativa de schema, prompts, payloads ni observabilidad. Cuando un detalle contractual importe, se debe consultar la fuente especializada y confirmar la implementación.

## Alcance del backend

Este repositorio implementa la API REST de Educativo IA. Autentica requests con Supabase, aplica acceso por usuario mediante clientes ligados al token, administra jerarquía académica y Biblioteca, persiste documentos y coordina generación con OpenAI.

Los recursos principales son planeaciones, anexos, listas de cotejo y exámenes. Biblioteca los agrupa por `batch_id`.

## Relación con el flujo visual

Biblioteca es el consumidor visual principal vigente del frontend. El backend no define la navegación de UI y puede conservar jerarquía técnica —tablas, relaciones, IDs y endpoints de planteles, grados, materias, unidades y temas— aunque el explorador visual jerárquico antiguo esté obsoleto.

Los endpoints jerárquicos no deben interpretarse como obligación de mantener o reactivar esa interfaz. Tampoco debe eliminarse `unidad_id`, `tema_id` ni una relación persistente por una decisión de frontend. Archivados es un consumidor separado que puede conservar esas dependencias.

Esta jerarquía es una capa relacional heredada y congelada. Sus consumidores internos no la convierten en flujo visual activo ni en owner de producto. No se amplían sus rutas o contratos, no se crean funcionalidades o herramientas alrededor de ella y no se refactoriza incidentalmente. Toda funcionalidad nueva parte de Biblioteca. Un cambio inevitable requiere autorización explícita, una necesidad concreta de Biblioteca o seguridad, alcance mínimo, preservación de contratos y regresión de Biblioteca. Las vulnerabilidades demostradas se documentan y corrigen en un alcance separado; las tablas, rutas y relaciones tampoco se retiran sin análisis.

Durante un refactor frontend se conservan los contratos backend, incluida la selección explícita por `planeacion_ids` cuando corresponde. No se modifican prompts, generación, jobs, polling ni métricas IA para acomodar código visual legacy.

## Tecnologías

- Node.js con ES Modules.
- Express 4.
- Supabase JavaScript SDK y PostgreSQL/RLS en Supabase.
- OpenAI SDK.
- `dotenv` y `cors`.
- ExcelJS como dependencia declarada.

La versión efectiva de cada dependencia está en `package.json`.

## Estructura de carpetas

```text
src/
├── server.js             arranque HTTP
├── app.js                Express, CORS, JSON, rutas y healthcheck
├── middleware/           autenticación
├── routes/               métodos, paths y middleware por recurso
├── controllers/          validación HTTP y serialización de respuestas
├── services/             dominio, Supabase, OpenAI y métricas
└── utils/                builders y utilidades especializadas
supabaseClient.js         cliente admin y fábrica de cliente por usuario
docs/                     documentación del backend
```

No hay archivos de migración SQL presentes en este árbol al 2026-07-20. La ausencia se debe reportar; no se deben reconstruir migraciones a partir de suposiciones.

## Flujo de una request

```text
route
  → requireAuth
  → controller
  → service
  → Supabase y, cuando aplica, OpenAI
  → respuesta JSON o SSE
```

1. La route monta `requireAuth` en endpoints privados.
2. El middleware valida el Bearer token con `supabaseAdmin.auth.getUser()` y adjunta `req.user` y `req.accessToken`.
3. El controller toma `user_id` de `req.user.id` y crea `createUserClient(req.accessToken)`.
4. El service ejecuta reglas de dominio y consultas sujetas a RLS con ese cliente.
5. Los flujos IA crean contenido, validan la salida, persisten el artefacto y registran métricas.
6. El controller responde JSON o SSE según el endpoint.

Las excepciones backend-only actuales, como el servicio de métricas y el worker interno de exámenes, usan el cliente admin de forma explícita. Esa excepción no autoriza a sustituir el cliente de usuario en otros flujos.

## Rutas principales

Todas las rutas privadas se montan bajo `/api` desde `src/routes/index.js`.

| Prefijo | Responsabilidad | Definición |
| --- | --- | --- |
| `/api/planeaciones` | CRUD, archivo, batches y generación | `src/routes/planeaciones.routes.js` |
| `/api/examenes` | creación de jobs, polling, consulta y eliminación | `src/routes/examenes.routes.js` |
| `/api/listas-cotejo` | generación, consulta y eliminación | `src/routes/listas_cotejo.routes.js` |
| `/api/anexos` | generación, regeneración, consulta y eliminación | `src/routes/anexos.routes.js` |
| `/api/biblioteca` | conjuntos y eliminación de bloques | `src/routes/biblioteca.routes.js` |
| `/api` | planteles, grados, materias, unidades y temas | `src/routes/jerarquia.routes.js` |

`GET /` y `GET /health` son endpoints públicos definidos en `src/app.js`. Los métodos y paths exactos se consultan en los archivos de routes; este resumen no los reemplaza.

## Servicios principales

| Servicio | Responsabilidad descriptiva |
| --- | --- |
| `planeaciones.service.js` | planeaciones, batches, archivado, generación y métricas legacy |
| `anexos.service.js` | generación/regeneración y persistencia de anexos por planeación |
| `domain/cuadernillos.js` | owner de IDs, metadata y blueprints de los tres cuadernillos v2 |
| `domain/cuadernillosV3.js` | blueprints v3 derivados, slots y políticas editoriales por modalidad |
| `domain/cuadernilloV3Representations.js` | representaciones y schemas declarativos no copiables para v3 |
| `validators/cuadernilloV2.validator.js` | validadores puros del contenido completo y de segmentos v2; reciben el tipo canónico como argumento externo |
| `services/cuadernilloV2.engine.js` | núcleo puro de prompts segmentados, retry limitado, ensamblado y métricas en memoria; Anexos le inyecta el adaptador de completions |
| `services/cuadernilloV3.engine.js` | motor editorial v3, retry por slot, linter acotado y agrupación determinista |
| `listas_cotejo.service.js` | listas por selección de planeaciones y flujo legacy por unidad |
| `examenes.service.js` | jobs, worker en proceso, validación y persistencia de exámenes |
| `biblioteca.service.js` | lectura agregada y eliminación de bloques |
| `jerarquia.service.js` | dominio de la jerarquía académica |
| `aiMetrics.service.js` | jobs/calls de métricas, tokens y costo estimado |

Los contratos IA detallados están en `AI_GENERATION_CONTRACTS.md`, no aquí.

### Motor segmentado de cuadernillos v2

`generarCuadernilloV2` recibe un tipo canónico, contexto confiable ya recuperado
de una planeación y una función `completar` inyectada. Construye
`datos_generales` localmente y deriva de esa raíz la primera sección, sin
enviarla a la IA. Deriva cuatro segmentos pedagógicos contiguos para las
secciones restantes. Cada componente se representa como un slot canónico
derivado del blueprint. La completion entrega solo `slot_id` y contenido
pedagógico sin cobertura ni IDs técnicos; el backend asigna sección, orden,
cobertura e IDs deterministas, valida cada respuesta, clasifica el truncamiento
por `finish_reason`, permite como máximo un retry correctivo por segmento y
ensambla la raíz v2 de forma determinista. La validación completa es obligatoria
antes de devolver el documento.

Si faltan slots o su contenido no valida, el motor conserva las respuestas
válidas y la segunda llamada solicita únicamente los pendientes con la misma
raíz `respuestas`. La fusión se realiza por `slot_id`, sin reemplazar contenido
válido. Slots desconocidos o duplicados fallan de forma segura. Nunca hay más de
dos llamadas por segmento ni se asigna cobertura sin una respuesta válida.

Antes de construir el prompt, el resolver de representaciones clasifica cada
slot por su nombre canónico y recomienda un bloque allowlisted, una modalidad
cuando corresponde y un schema mínimo. Así, términos pedagógicos como
reflexión, lista de cotejo, glosario o comparación no se confunden con
discriminadores técnicos. El validador continúa rechazando tipos y modalidades
desconocidos sin aliases ni normalización automática; el retry vigente sigue
siendo la red de seguridad para respuestas reales que aún no cumplan.

El motor no importa OpenAI ni Supabase y no persiste resultados parciales. El
servicio de Anexos acepta opcionalmente un tipo canónico, recupera el contexto
desde la planeación propia, inyecta un adaptador Chat Completions y realiza un
único insert o update tras la validación final. Sin tipo conserva el flujo v1.
La regeneración v2 toma el tipo almacenado y no admite cambiarlo desde el body.
El frontend tipado, el renderer web v2 y la exportación Word v2 están
implementados, conservando los consumidores v1. En test se completó una
generación real controlada de cada tipo; hubo retries reparados por slots y el
resolver de representaciones busca reducirlos, no garantizar cero retries.
La migración de `tipo_cuadernillo text NULL` está aplicada y postverificada en
Supabase test y producción; los históricos conservan `NULL`. El paquete
productivo y su evidencia se preservan en
`docs/production/anexos-cuadernillo-v2/`; su rollback nunca se ejecutó. Esta
actualización de schema no equivale a un despliegue: el código continúa en las
ramas `work/features` hasta completar push, PR, merge y deploy.

## SSE y jobs

### Contrato editorial v3

Las generaciones tipadas nuevas producen `schema_version: 3` y
`prompt_version: v3_cuadernillo_academico_tipado`. El owner deriva del
blueprint histórico las secciones pedagógicas sin Datos generales ni
Autoevaluación, conserva números semánticos y obtiene 28/38/28 slots. Los
prompts comparten escritura directa al estudiante y añaden políticas por
modalidad: práctica progresiva, continuidad de proyecto para Integradoras y
explicación gradual para Aprendizaje guiado.

El modelo aporta contenido por slot; el backend asigna sección, orden, cobertura
e IDs, agrupa solo bloques adyacentes compatibles y valida el documento. El
linter rechaza placeholders y metadiscurso inequívocos. Un fallo deja pendiente
ese slot y no habilita una tercera llamada. V1 y v2 conservan sus motores para
regenerar históricos sin actualización silenciosa.

El owner v3 asigna a cada slot una política procedimental no persistida:
demostrativa para enseñar un método con operaciones concretas, orientadora para
dejar trabajo auténtico al estudiante y operativa para proyectos, productos y
evidencias. Los pasos se mantienen breves y accionables; el validador rechaza
duplicados exactos y, en modo demostrativo, órdenes genéricas aisladas. Esta
regla no se aplica a documentos v1/v2 ni intenta verificar matemáticas mediante
expresiones regulares.

El adaptador v3 está aislado de v1/v2: usa `gpt-6-luna`, razonamiento `low`,
Structured Outputs estricto y no envía temperatura. El modelo solo puede
proceder de la allowlist backend mediante `OPENAI_CUADERNILLO_V3_MODEL`. Los
schemas dinámicos incluyen únicamente los slots y representaciones principales
de cada llamada. El verificador puro cubre racionales, determinantes 2×2 y
sistemas lineales 2×2. La IA solo propone entradas matemáticas sin texto libre;
el backend hidrata y deriva operaciones, determinantes, solución, comprobaciones,
interpretación canónica y representación visible,
y descarta toda metadata interna antes de persistir. Fuera de esas familias no se promete
validación matemática. V3 rechaza LaTeX; preview y Word consumen texto plano,
Unicode y tablas existentes.

La familia soportada observada en el primer intento queda fijada por el backend
durante el retry y restringe su JSON Schema. Para el grupo 15–17, el slot 15 es
el owner matemático y se persiste un único bloque hidratado con la cobertura de
los tres componentes, evitando fuentes o presentaciones duplicadas.

El motor transmite entre segmentos solo una continuidad estructural acotada de
las actividades ya aceptadas. Relaciones algebraicas idénticas aunque cambien de
orden, contratos de tarea iguales o el mismo escenario con las mismas variables
invalidan el slot posterior con `actividad_repetida`. Se conserva el segmento
anterior y se usa únicamente el segundo intento ya disponible. Los bloques
cuantitativos separan procedimiento, resultado y comprobación, y emplean un
formateador canónico sin coeficientes `1`, términos cero ni secuencias `+ -`.

El schema v3 se valida localmente antes del SDK. Los eventos
`cuadernillo_v3:completion_request` y `cuadernillo_v3:completion_error` permiten
distinguir configuración, schema, acceso, cuota, parámetros, rate limit,
timeout y conexión sin registrar prompts, completions o datos académicos. Los
fallos permanentes se detienen; no se convierten en retries pedagógicos.

Planeaciones admite SSE en `POST /api/planeaciones/generate?stream=1` y `POST /api/unidades/:unidadId/generar?stream=1`; también se detecta `Accept: text/event-stream`. Los eventos observados incluyen `item_started`, `item_completed`, `item_error`, `item_skipped`, `done` y un evento de error del stream según el flujo.

Exámenes usa un job persistido: el POST devuelve `202` con `job_id`, el worker se agenda dentro del proceso Node y el cliente consulta `GET /api/examenes/generacion/:jobId`. Los estados y reglas exactos están protegidos por `docs/AI_GENERATION_CONTRACTS.md`.

## Manejo de errores

Los controllers validan entradas básicas y convierten errores conocidos con `error.status` en respuestas HTTP. Los fallos inesperados se responden con mensajes genéricos. En SSE, el error se escribe como evento antes de cerrar cuando la conexión sigue abierta.

Agregar observabilidad no debe eliminar `throw`, cambiar status HTTP ni exponer detalles internos. Las reglas específicas están en los documentos de observabilidad.

## Autenticación y RLS

`requireAuth` valida el token y `createUserClient(req.accessToken)` crea el cliente de usuario que conserva el contexto de RLS. `user_id` procede de `req.user.id`, no del body.

La definición documental de tablas, relaciones y estado de verificación de RLS está en `DATABASE_SCHEMA.md`. Como no hay migraciones visibles en este árbol, cualquier afirmación sobre políticas debe tratarse con la limitación allí indicada.

## Métricas

`aiMetrics.service.js` registra jobs y llamadas IA en tablas dedicadas mediante operaciones backend-only. Planeaciones también conserva escritura en `ia_metrics` por compatibilidad. Un fallo al registrar una llamada no debe romper la generación principal.

Los campos, versiones de prompt, retries y diferencias por recurso se documentan en `AI_GENERATION_CONTRACTS.md`.

## Fuentes de verdad obligatorias

| Tema | Consultar | Cuándo |
| --- | --- | --- |
| Reglas de trabajo | [`../AGENTS.md`](../AGENTS.md) | antes de cualquier cambio |
| Schema y persistencia | [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) | antes de tocar tablas, IDs, relaciones, cascadas, índices o RLS |
| Generación IA | [`AI_GENERATION_CONTRACTS.md`](AI_GENERATION_CONTRACTS.md) | antes de tocar prompts, parsing, modelos, retries, jobs o métricas IA |
| Convenciones de logs | [`observability/LOG_CONVENTIONS.md`](observability/LOG_CONVENTIONS.md) | antes de agregar o modificar logs |
| Estado auditado de logs | [`observability/LOG_AUDIT.md`](observability/LOG_AUDIT.md) | para evitar duplicados y conocer riesgos existentes |
| Implementación real | código y migraciones SQL | para confirmar comportamiento ejecutable |

Si hay contradicción entre documentación e implementación, se debe detener el cambio y documentarla. No se elige ni se “corrige” un contrato silenciosamente.
