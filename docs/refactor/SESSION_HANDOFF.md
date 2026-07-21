# SESSION_HANDOFF.md

> Registro cronológico. El estado vigente se encuentra en la sesión más reciente al final del documento; los hallazgos anteriores no convierten al explorador visual jerárquico en un flujo soportado.

## Fecha

2026-07-07

## Objetivo

Auditoría técnica completa de solo lectura del frontend de Educativo IA, previa a un refactor gradual del flujo Biblioteca. Sin modificar código funcional, HTML, CSS, backend ni SQL. Producir documentación confiable en `docs/` y `docs/refactor/` para planificar el refactor.

## Metodología

- Lectura directa de `AGENTS.md`, `README.md` y `ai-context/*.md` existentes en el repositorio del frontend.
- Tres agentes de investigación en paralelo (solo lectura, sin herramientas de edición), cada uno con instrucciones detalladas:
  1. Auditoría completa de `js/pages/dashboard.page.js` (6066 líneas), leído íntegro en 6 tramos.
  2. Auditoría completa de `js/pages/biblioteca.page.js` (3244 líneas), leído íntegro en 3 tramos.
  3. Auditoría de todos los demás archivos JS, todas las páginas HTML (orden de scripts, entry points), búsqueda global de vocabulario de jerarquías fuera de los dos archivos grandes, y duplicados semánticos cruzados.
- Cada agente guardó su reporte completo sin truncar en archivos de scratchpad, que fueron leídos íntegros para sintetizar los documentos finales.
- Verificación de `git status` antes y después para confirmar que solo se tocaron archivos de documentación.

## Archivos creados

- `docs/ARCHITECTURE.md`
- `docs/FRONTEND_MAP.md`
- `docs/refactor/FRONTEND_AUDIT.md`
- `docs/refactor/CURRENT_BEHAVIOR.md`
- `docs/refactor/LEGACY_HIERARCHY.md`
- `docs/refactor/REFACTOR_BACKLOG.md`
- `docs/refactor/TEST_MATRIX.md`
- `docs/refactor/SESSION_HANDOFF.md` (este archivo)

No se creó `docs/refactor/REFACTOR_RULES.md` ni `docs/refactor/DECISIONS.md` mencionados en la lista de lectura obligatoria de `AGENTS.md` sección 21 — no fueron solicitados en el encargo de esta sesión y no se inventó su contenido. Quedan pendientes si una sesión futura los necesita.

## Hallazgos principales

1. **Hallazgo estructural clave**: `window.BIBLIOTECA_MODE` es siempre `true` en producción porque `pages/dashboard.html` carga `biblioteca.page.js` antes de que `dashboard.page.js` decida el modo. Esto vuelve inalcanzable, por el flujo normal de carga, a un sistema completo de navegación jerárquica dentro de `dashboard.page.js` (árbol, breadcrumbs, niveles root/plantel/grado/materia).
2. **`explorerState` no es un bloque monolítico legado**: mezcla subcampos activos (compartidos con Biblioteca: `progress`, `examPreview`, `listaCotejoPreview`, `confirmDelete`) con subcampos exclusivos de la navegación jerárquica inalcanzable. Cualquier limpieza requiere separarlos primero.
3. **Acoplamiento bidireccional fuerte y no documentado previamente** entre `dashboard.page.js` y `biblioteca.page.js`, mediado enteramente por `window` (11+ puntos de uso cruzado confirmados).
4. **El vocabulario "jerarquía" existe en dos sistemas distintos que no deben confundirse**: uno inactivo dentro de `dashboard.page.js`, y uno activo y vigente en `js/api/jerarquia.api.js`, `js/services/jerarquia.service.js` y `js/pages/archivados.page.js` (sostiene el árbol de restauración de Archivados).
5. **Polling de examen sin cancelación** en dos lugares (`dashboard.page.js:1995-2041` y `biblioteca.page.js:2327-2365`) — mayor riesgo operativo identificado; no se detiene si el usuario navega fuera o dispara dos generaciones seguidas para el mismo bloque.
6. **4 fragmentos de código en `biblioteca.page.js` confirmados sin consumidores** (confianza alta): `isBibliotecaTechnicalUnidad`, `getFilteredConjuntos`, `bibliotecaState.expandedIds`/`case "toggle-expand"`, `bibRegenerarAnexo`/`case "regenerar-anexo"`.
7. **Al menos 3 páginas/flujos completos muertos**: `pages/batch.html`, `pages/planeacion.html` (ambas solo redirigen) y `pages/dashboard_tailwind.html` (huérfana), con sus JS asociados (`js/planeacion.js`, `js/pages/planeacion.page.js`, `js/pages/batch.page.js`, `js/ui/planeacion.ui.js`, `js/ui/batch.ui.js`, `js/ui/dashboard.ui.js`, `js/pages/dashboard-tailwind.page.js`).
8. **`pages/archivados.html` es funcional pero inalcanzable** desde la navegación (link comentado en `components/navbar.html:27-28`).
9. **4 patrones con 3+ implementaciones redundantes**: toast/notificación, sanitización de nombre de archivo, descarga de blob, formateo de fechas.
10. **Inconsistencia de manejo de errores** dentro del mismo archivo `js/api/planeaciones.api.js` (algunas funciones usan el helper `requestPlaneacionesJson`, otras `fetch` directo con manejo distinto).
11. **`detalle.page.js` referencia `#btn-export-excel`**, id inexistente en `detalle.html` — no-op silencioso, botón de exportar Excel inalcanzable desde la UI real.
12. **`refreshExplorerAfterReturn`** (listener `pageshow` en `dashboard.page.js:5982`) dispara `loadPlanteles()` en cada navegación back/forward sin verificar `BIBLIOTECA_MODE` — posible llamada de red innecesaria activa, no legado inactivo.
13. **`onBibliotecaClick`** (router central de clicks de Biblioteca) no tiene guard contra doble-inicialización — riesgo si `initBiblioteca()` llegara a invocarse dos veces.
14. **`submitQuickCreateForm`** (creación rápida de bloque) encadena hasta 4 llamadas API secuenciales sin atomicidad — un fallo parcial puede dejar entidades huérfanas (p. ej. grado creado sin materia).
15. **Patrón de eliminación duplicado 5 veces** en `biblioteca.page.js` (bloque/planeación/examen/lista/anexo) — buen primer candidato de extracción de bajo riesgo.

## Riesgos

Ver registro completo en `docs/refactor/FRONTEND_AUDIT.md` sección 11. Los de mayor impacto potencial: reordenar/eliminar un `<script>` de `dashboard.html` (18 scripts en cadena sin verificación en runtime), eliminar una propiedad `window.X` sin buscar todos los consumidores, y tocar la lógica de polling de generación.

## Preguntas abiertas

- ¿Existe algún entry point alternativo (test, script de migración) que cargue `dashboard.page.js` sin `biblioteca.page.js` y active la rama de navegación jerárquica legado? No se encontró evidencia, pero tampoco se descartó al 100%.
- ¿El modal genérico de entidad (`openEntityModal`/`submitEntityModal`, `dashboard.page.js:5130-5363`) tiene botones equivalentes en el marcado que renderiza `biblioteca.page.js`? Requiere lectura cruzada más profunda del HTML inyectado por Biblioteca.
- ¿Dónde está definida exactamente `generarPlaneacionesUnidadConProgreso`, invocada desde `biblioteca.page.js:2866` pero no encontrada dentro de ese archivo? Los agentes no confirmaron el archivo exacto (probablemente `dashboard.page.js` o un servicio de generación).
- ¿La validación de "ocultar actividad evaluada" en Listas de cotejo (mencionada en `AGENTS.md`/instrucciones del encargo) vive en el frontend o solo en el backend? No se encontró en `biblioteca.page.js`.
- ¿`QUICK_CREATE_NEW_VALUE` (`dashboard.page.js:64`) tiene algún uso no detectado por el grep no exhaustivo realizado?

## Qué NO se modificó

Ningún archivo JavaScript, HTML, CSS, backend, SQL ni de configuración funcional. Confirmado por `git status --porcelain` antes y después de la sesión: los únicos cambios nuevos están dentro de `docs/`. Los archivos `AGENTS.md`, `AI_CONTEXT.md`, `ai-context/`, `ai-rules/` y la modificación a `.gitignore` ya existían como cambios sin commitear **antes** de iniciar esta sesión (no fueron tocados por este trabajo).

## Próxima sesión recomendada

**Etapa 1 del backlog** (`docs/refactor/REFACTOR_BACKLOG.md`): confirmar en navegador real (DevTools, no solo lectura estática) los 4 fragmentos de código sin consumidores detectados en `biblioteca.page.js` y las 3 páginas/flujos muertos, antes de tocar cualquier línea de código. Es la validación de menor riesgo posible y desbloquea con evidencia sólida las etapas 2 en adelante.

---

# Sesión 3 (backend) — Auditoría y refuerzo de observabilidad (logs)

## Fecha

2026-07-10

## Objetivo

Esta copia del `SESSION_HANDOFF.md` es idéntica a la del frontend (ver nota de la Sesión 2 en "Riesgos que siguen abiertos"). Esta sesión sí modificó archivos de `src/` de este repositorio backend — auditoría y refuerzo de logs (`console.*`) en controllers y services, sin cambiar lógica, endpoints, payloads ni SQL. El reporte completo de esta sesión (metodología, inventario, matriz de cobertura, clasificación KEEP/IMPROVE/SENSITIVE/MISSING) vive en `docs/observability/LOG_AUDIT.md` y `docs/observability/LOG_CONVENTIONS.md` en la raíz del proyecto (`educativo_ia/docs/observability/`, no dentro de este repo backend, porque el encargo cubría frontend y backend a la vez). Ver también la entrada equivalente en el `SESSION_HANDOFF.md` del frontend.

## Archivos modificados en este repositorio

`src/services/anexos.service.js`, `src/services/listas_cotejo.service.js`, `src/services/examenes.service.js`, `src/services/biblioteca.service.js`, `src/services/planeaciones.service.js`, `src/services/aiMetrics.service.js`, `src/controllers/planeaciones.controller.js`, `src/controllers/jerarquia.controller.js`. Todos los cambios son adiciones o correcciones de sentencias `console.*`; ningún `throw`, `return`, condición ni payload fue alterado (confirmado con `node --check` en los 8 archivos y revisión manual del `git diff`).

## Hallazgo relevante

`generarTablaIa` (`src/services/planeaciones.service.js`) y el helper `logPlaneacionDebug` en `planeaciones.controller.js`/`jerarquia.controller.js` imprimían el prompt completo enviado a OpenAI y la respuesta completa generada en cada llamada. Corregido: ahora se loguean solo resúmenes (materia/nivel/tema/conteos). También se recortaron 4 sitios en `examenes.service.js` que logueaban la respuesta cruda completa de IA ante fallos de parseo (`rawResponse` → `rawLength`).

## Pendientes / riesgos

No existe manejador global de errores en Express (`app.js`) — documentado como hueco abierto, no implementado porque agregarlo cambiaría el comportamiento de respuesta ante errores no capturados (fuera del alcance de una sesión de solo-logs). `generateExamWithIa`/`generateMissingQuestionsWithIa` en `examenes.service.js` parecen no tener consumidores (posible código legado); no se tocó su lógica. Ver detalle completo en `docs/observability/LOG_AUDIT.md` sección 8.

---

# Sesión 4 (backend) — Consolidación de reglas y fuentes de verdad

## Fecha

2026-07-20

## Objetivo

Consolidar la autoridad documental del backend sin modificar código funcional, SQL, rutas, controllers, services, workers, prompts, schemas JSON, modelos, parámetros, payloads, base de datos, RLS ni logs funcionales.

## Auditoría previa

Se leyeron completamente `AGENTS.md` y todos los Markdown del repositorio. Se revisaron de forma solo lectora `package.json`, rutas, middleware, controllers, services, utilities de prompts y `supabaseClient.js` para confirmar nombres y contratos. No hay archivos `.sql` en este repositorio ni en el workspace `educativo_ia` al momento de la revisión.

Las contradicciones iniciales y su resolución están en `docs/DOCUMENTATION_AUDIT.md`. Los puntos principales fueron rutas inexistentes de migraciones/logs, afirmaciones de RLS no verificables, reglas IA dispersas, confusión entre `planeacion_ids` y `tema_ids`, y reglas frontend copiadas dentro de `AGENTS.md` del backend.

## Cambios documentales

- `AGENTS.md`: tabla de autoridad, lecturas obligatorias y reglas de DB, IA, observabilidad, auth/RLS y contratos públicos.
- `docs/03-backend-guide.md`: nueva guía canónica, exclusivamente descriptiva.
- `docs/AI_GENERATION_CONTRACTS.md`: contratos de planeaciones, anexos, listas y exámenes, más zona protegida.
- `docs/DATABASE_SCHEMA.md`: encabezado de autoridad, reglas para agentes y limitación explícita sobre RLS/migraciones.
- `docs/observability/LOG_CONVENTIONS.md` y `LOG_AUDIT.md`: convenciones e inventario local para eliminar referencias rotas.
- `docs/DOCUMENTATION_AUDIT.md`: contradicciones encontradas antes de corregir documentación.
- Archivos históricos de `docs/ai-context/` y `docs/ai_rules/anexos.md`: convertidos o alineados como referencias de compatibilidad sin duplicar contratos.
- `AI_CONTEXT.md`, `README.md` y `docs/ai-context/01-architecture.md`: enlaces y afirmaciones alineados.

## Estado previo relevante

Antes de esta sesión, `docs/DATABASE_SCHEMA.md` ya existía en el filesystem como archivo no rastreado (`??`). Se conservó todo su snapshot de tablas y solo se agregó contexto documental al encabezado.

## Compatibilidad

Se conservó `docs/ai-context/03-backend-guide.md` como enlace a la ruta canónica para no romper el índice histórico. Lo mismo aplica a las guías históricas de base de datos, generación IA y reglas Codex. No se cambiaron rutas de API ni archivos ejecutables.

## Riesgos y pendientes

- Las políticas RLS no pueden verificarse hasta disponer de migraciones o un export de schema que incluya policies.
- El reason legacy `missing_closing_activity` no describe exactamente el fallback vigente de listas; no se renombró porque sería un cambio de contrato.
- El worker de exámenes usa service role de forma explícita y los flujos de usuario usan clientes ligados al token; no generalizar la excepción.
- Los prefijos de logs siguen mezclados y algunos controllers imprimen objetos de error completos; se documentó, no se cambió.

## Validaciones

- `git status --short`: solo Markdown modificado/creado; `docs/DATABASE_SCHEMA.md` permanece no rastreado como ya estaba al inicio.
- `git diff --stat`: 10 archivos Markdown rastreados cambiados; los archivos nuevos aparecen por separado como no rastreados.
- `git diff --check`: sin errores; Git solo advierte la conversión futura LF→CRLF configurada en el entorno.
- Verificador de enlaces: 28 archivos Markdown propios revisados, sin enlaces relativos rotos.
- Escaneo documental: sin rutas absolutas de Windows, secretos, emails, UUID de datos ni connection strings.
- Alcance: ninguna extensión distinta de `.md` aparece modificada o creada.

## Próximo paso recomendado

Localizar o exportar las migraciones SQL y policies RLS reales en una sesión autorizada de documentación/schema, y contrastarlas con `docs/DATABASE_SCHEMA.md` antes de proponer cualquier cambio de base de datos.

---

# Sesión 5 — Alineación Biblioteca como único flujo visual

## Fecha

2026-07-21

## Estado funcional actual

**Biblioteca es el flujo principal vigente y el único objetivo de nuevas implementaciones frontend.**

- Explorador visual jerárquico: legacy/obsoleto para funciones nuevas.
- Jerarquía técnica: puede seguir activa en datos, APIs, selectores, creación y persistencia; no eliminar sin auditoría.
- Archivados: flujo separado con posibles dependencias jerárquicas.
- `explorerState`: mixto; contiene consumidores activos de Biblioteca y partes visuales legacy.
- Wrappers `window.*`: compatibilidad mientras existan consumidores.

## Objetivo del refactor

Modularizar Biblioteca y separar dependencias activas del código visual legacy sin cambiar comportamiento, payloads, IDs, generación, polling, schema ni contratos backend.

## Cambios documentales

- Se actualizó `docs/DOCUMENTATION_AUDIT.md` con el inventario completo de ambos repositorios, contradicciones y matriz funcional.
- Las fuentes canónicas frontend declaran un único flujo visual y una dirección de refactor hacia Biblioteca modular.
- La documentación backend separa UI, jerarquía técnica y Archivados.
- Los snapshots y planes anteriores se conservaron con avisos históricos o de compatibilidad.

## Zonas protegidas

- `unidad_id`, `tema_id`, `tema_ids`, `planeacion_ids` y `batch_id`;
- schema, relaciones, cascadas y RLS;
- prompts, modelos, retries, métricas, jobs y polling;
- autenticación y clientes Supabase;
- wrappers y estado compartido con consumidores activos.

## Validaciones pendientes

- Línea base manual completa de la matriz frontend antes del primer refactor.
- Clasificación función por función antes de separar `explorerState`.
- Confirmación en navegador de cualquier candidato a eliminación legacy.

## Próxima sesión recomendada

Elegir una función inequívocamente clasificada como Biblioteca activa y ejecutar una extracción literal de bajo riesgo siguiendo el playbook frontend.
