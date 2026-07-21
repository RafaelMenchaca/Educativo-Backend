# FRONTEND_AUDIT.md — Reporte técnico principal

> Estado: histórico. No describe el flujo visual vigente. El flujo actual es Biblioteca.
>
> Esta auditoría conserva evidencia de dependencias. No autoriza funciones nuevas para el explorador antiguo; la arquitectura vigente está en el repositorio frontend.

> Auditoría de solo lectura. No se modificó código funcional. Fuentes: lectura completa de `dashboard.page.js` (6066 líneas), `biblioteca.page.js` (3244 líneas), y del resto de `js/`, `pages/*.html`, `components/*.html`. Ver `SESSION_HANDOFF.md` para metodología y limitaciones.

Etiquetas: `Hecho:` evidencia directa · `Inferencia:` deducción razonable · `Pendiente de confirmar:` falta evidencia · `Riesgo:` impacto si se toca sin cuidado.

---

## 1. Hallazgo estructural previo (contexto obligatorio)

`Hecho:` `window.BIBLIOTECA_MODE` es siempre `true` en producción porque `pages/dashboard.html` carga `biblioteca.page.js` antes de invocar `initDashboardPage()`, y esa función activa el modo Biblioteca apenas detecta `window.initBiblioteca` como función. Ver detalle en `docs/ARCHITECTURE.md` sección 6 y clasificación completa en `LEGACY_HIERARCHY.md`.

Esto implica que gran parte de `dashboard.page.js` (render de árbol, breadcrumbs, niveles root/plantel/grado/materia) es código cuya rama de invocación normal es inalcanzable, mientras que otra parte del mismo archivo (`explorerState` parcial, modales de examen/lista de cotejo, creación rápida) sigue activa porque Biblioteca la consume por `window`.

---

## 2. Archivos grandes — resumen de responsabilidades

### `js/pages/dashboard.page.js` (6066 líneas)

| Responsabilidad | Rango de líneas |
|---|---|
| Estado global (`explorerState`, combos, constantes) | 1–146 |
| Catálogo de actividades didácticas | 147–425 (parcialmente comentado/pausado) |
| Utilidades genéricas, scroll lock, inyección de componentes | 427–485 |
| **Navegación jerárquica legado** (fetch por nivel, árbol, breadcrumbs, niveles) | 487–1069, 3509–3863, 4525-4545, 5407-5480, 5995-6017 |
| Modal de confirmación de eliminación/archivado (compartido con Biblioteca) | 1239–1293, 2187–2764 |
| Generación de examen de unidad (modal, polling, envío) | 1295–1552, 1929–2185, 3924–4148 |
| Generación de lista de cotejo (modal, envío) | 1553–1929 |
| Preview/descarga de examen a Word | 4049–4297 |
| Combobox genérico reutilizable | 2766–3013 |
| Panel de creación rápida (quick create) | 3015–3507, 4933–5128 |
| Progreso de generación de planeaciones | 4608–4931 |
| Modal genérico de entidad (CRUD plantel/grado/materia/unidad) | 5130–5363 |
| Delegación de eventos de click | 5365–5535 |
| Binder central de eventos (`bindDashboardEvents`, idempotente) | 5692–5993 |

No se encontró lógica de autenticación en este archivo (delegada a `auth.service.js`). Validación de formularios dispersa y ad-hoc por sección (3466–3507, 4933–4961, 5244–5262).

### `js/pages/biblioteca.page.js` (3244 líneas)

| Responsabilidad | Rango de líneas |
|---|---|
| Estado global (`bibliotecaState`) | 8-67 |
| Superficie pública `window.biblioteca` | 70-117 |
| Helpers de formato de texto/fecha | 132-223 |
| Selección/normalización de conjunto activo | 237-322 |
| Reconciliación de resultados de generación optimista | 324-396 |
| Renderizado de 4 tabs (Planeaciones/Anexos/Listas/Exámenes) | 400-947 |
| Renderizado parcial in-place (preserva scroll/focus) | 949-1042 |
| Carga de datos + reconciliación | 1046-1117 |
| Router central de eventos (`onBibliotecaClick`, 20+ acciones) | 1121-1265 |
| Modal "Crear anexos" | 1269-1537 |
| Acciones puntuales de Anexos + construcción de Word | 1541-1911 |
| Descargas (planeación, examen, lista) | 1915-2053 |
| Preview de examen / lista (delega a `dashboard.page.js`) | 2057-2098 |
| Modal "Crear examen" (+ polling) | 2102-2373 |
| Modal "Crear lista de cotejo" | 2377-2584 |
| Modal "Agregar temas/planeaciones" | 2588-2907 |
| Eliminación (bloque/planeación/examen/lista/anexo) | 2911-3094 |
| Inyección de modales en el DOM | 3098-3186 |
| Modal de confirmación genérico | 3188-3224 |
| `initBiblioteca` | 3228-3244 |

---

## 3. Estado global y variables clave

### `dashboard.page.js`

| Variable | Línea | Uso | ¿En `window`? |
|---|---|---|---|
| `explorerState` | 1 | Objeto raíz (jerarquía, modales, examen, lista de cotejo, quickCreate, progreso, confirmDelete) | Sí, `window.explorerState` (6061) — consumido por `biblioteca.page.js` |
| `isDashboardBound` | 63 | Flag anti doble-bind de eventos | No |
| `plantelCombobox`, `tituloConjuntoCombobox`, `gradoCombobox`, `materiaCombobox`, `unidadCombobox` | 65–69 | Instancias mutables de widget combobox | No |
| `DASHBOARD_LOCATION_STORAGE_KEY` | 70 | Clave de `sessionStorage` para el explorador legado | No |
| catálogos estáticos (`GRADO_NIVEL_OPTIONS`, `EXAM_TIPOS_PREGUNTA`, etc.) | 71–146 | Inmutables | No |

No se detectaron `setInterval` verdaderos ni `MutationObserver` en este archivo; el único "polling" es recursión con `setTimeout`.

### `biblioteca.page.js`

| Variable | Línea | Uso | ¿En `window`? |
|---|---|---|---|
| `bibliotecaState` (raíz) | 8 | Estado único del módulo, no expuesto directo | Selectivamente vía `window.biblioteca` |
| `.expandedIds` (Set) | 14 | **Declarado pero nunca leído** para condicionar render | No — ver sección 9 (código posiblemente no utilizado) |
| `.pendingBatchId` | 16 | Id de batch en creación rápida | Sí, `window.biblioteca.pendingBatchId` — leído/escrito por `dashboard.page.js` (4878, 4900, 5105) |
| `.pendingConjunto` | 19 | Card temporal en creación | Sí, `window.biblioteca.setPendingConjunto()` — llamado desde `dashboard.page.js:5112` |
| `.anexosGenerating`, `.pendingPlaneacionesByBatchId`, `.pendingExamenByBatchId`, `.pendingListaByBatchId` | 20–24 | Estados de progreso por tipo de documento | No directo |
| `.anexoModal` / `.examModal` / `.listaModal` / `.agregarModal` | 26–66 | Estado de cada modal | No |

`window.explorerState` (definido en `dashboard.page.js`) es leído/escrito desde `biblioteca.page.js` en las líneas 367-369, 479, 2058-2098 — acoplamiento bidireccional confirmado.

---

## 4. Uso de `window` (inventario consolidado)

| Propiedad | Definida en | Consumida en | Tipo | Motivo aparente |
|---|---|---|---|---|
| `window.BIBLIOTECA_MODE` | `dashboard.page.js:6022` | `dashboard.page.js` (55 puntos internos) | Flag | Activa/desactiva rama legado — siempre `true` en producción |
| `window.initDashboardPage` | `dashboard.page.js:6060` | `main.js` | Función | Entry point de página |
| `window.explorerState` | `dashboard.page.js:6061` | `biblioteca.page.js` (367-369, 479, 2058-2098) | Estado | Puente de examen/lista/progreso/confirmDelete |
| `window.renderExamPreviewModal` / `closeExamPreviewModal` | `dashboard.page.js:6062-6063` | `biblioteca.page.js:2061-2073` | Función wrapper | Preview de examen renderizado desde dashboard, invocado desde biblioteca |
| `window.renderListaCotejoPreviewModal` / `closeListaCotejoPreview` | `dashboard.page.js:6064-6065` | `biblioteca.page.js:2083-2096` | Función wrapper | Idem para lista de cotejo |
| `window.downloadExamWord` | `dashboard.page.js:6066` | `biblioteca.page.js:2028-2029` | Función | Descarga de examen desde Biblioteca |
| `window.biblioteca` (objeto API) | `biblioteca.page.js:70-117` | `dashboard.page.js` (11 puntos: 3135, 4878, 4898, 4900-4901, 4926, 5105, 5107, 5109, 5112, 6044) | API pública | Coordinación de creación rápida de bloques |
| `window.renderBibliotecaContent` | `biblioteca.page.js:1042` | `dashboard.page.js:4526-4527, 5119` | Función | Fuerza re-render de Biblioteca desde dashboard |
| `window.initBiblioteca` | `biblioteca.page.js:3244` | `dashboard.page.js:6044` | Función | Entry point de la vista Biblioteca |
| `window.AppUI.*` (showToast, renderProgressPill, buildDownloadSuggestedName, openDownloadNameModal) | `js/ui/shared.ui.js` | `dashboard.page.js`, `biblioteca.page.js` | Módulo compartido | Toasts y modal de nombre de descarga |
| `window.isArchivedHierarchyScopeHidden` / `window.registerArchivedHierarchyScope` | `js/services/planeaciones.service.js` | `dashboard.page.js` (480, 484, 2723-2737), `archivados.page.js` | Estado en `localStorage` | Ocultar ramas archivadas |
| `window.requireSession` / `window.protegerRuta` | `js/services/auth.service.js` | prácticamente todos los `js/pages/*.js` | Función | Guardia de sesión |
| `window.obtenerPlaneacionDetalle`, `window.obtenerExamenDetalle`, `window.obtenerListaCoTejoDetalle`, `window.descargarListaCotejoWord` | `js/services/*` / `js/ui/wordExport.js` | `biblioteca.page.js` | Función | Detalle y descarga por tipo de documento |
| `window.initX` (`initLoginPage`, `initArchivadosPage`, `initDetallePage`, `initBatchPage`, `planeacionPage.init`) | cada `js/pages/*.page.js` | `js/main.js:18-23` | Función | Router por nombre de archivo HTML |

No se detectó ningún atributo `onclick=`/`onchange=`/`onsubmit=` inline en archivos `.html` reales del proyecto. Los únicos `onclick` inline detectados están en JavaScript generado por código ya muerto (`js/ui/batch.ui.js`, `js/ui/planeacion.ui.js`, que construyen HTML con `onclick="archivarPlaneacionBatch(...)"` / `onclick="resetearFormulario()"`).

---

## 5. Llamadas API

Ambos archivos grandes llaman exclusivamente a wrappers de `js/api/*.js`/`js/services/*.js` — no hay `fetch` directo salvo `injectComponent` (carga de fragmentos HTML, no de datos de negocio). Ninguna llamada API se ejecuta dentro del cuerpo de una función `render*` en ninguno de los dos archivos (buena separación en ese punto específico).

### Endpoints usados por `biblioteca.page.js`

| Método | Endpoint | Función | ¿Dentro de render? |
|---|---|---|---|
| GET | `/api/biblioteca/conjuntos` | `apiBibliotecaConjuntos` | No |
| POST | `/api/anexos/generate` | `apiGenerarAnexo` | No |
| POST | `/api/anexos/{id}/regenerate` | `apiRegenerarAnexo` | No (función posiblemente no utilizada, ver sección 9) |
| GET | `/api/anexos/{id}` | `apiObtenerAnexoDetalle` | No |
| POST | `/api/examenes/generate` | `apiExamenesGenerate` | No |
| GET | `/api/examenes/generacion/{jobId}` | `apiExamenGenerationStatus` | No (dentro de IIFE de polling) |
| POST | `/api/listas-cotejo/generate` | `apiListasCoTejoGenerate` | No |
| DELETE | `/api/biblioteca/bloques/{id}` | `apiBibliotecaDeleteBloque` | No |
| DELETE | `/api/planeaciones/{id}/directo` | `apiDeletePlaneacionDirecta` | No |
| DELETE | `/api/examenes/{id}` | `apiDeleteExamen` | No |
| DELETE | `/api/listas-cotejo/{id}` | `apiDeleteListaCotejo` | No |
| DELETE | `/api/anexos/{id}` | `apiDeleteAnexo` | No |

### Endpoints usados por `dashboard.page.js` (subset relevante — jerarquía completa)

`obtenerPlanteles`, `obtenerGradosPorPlantel`, `obtenerMateriasPorGrado`, `obtenerUnidadesPorMateria`, `obtenerTemasPorUnidad`, `obtenerPlaneacionTema`, `obtenerExamenesPorUnidad`, `obtenerListasCotejoPorUnidad`, `generarListasCotejoUnidad`, `obtenerEstadoGeneracionExamen`, `generarExamenUnidad`, `obtenerExamenDetalle`, `eliminarPlantel/Grado/Materia/Unidad/Tema/PlaneacionApi`, `archivarPlantel/Grado/Materia/Unidad/PlaneacionApi/RutaBatchApi`, `generarPlaneacionesUnidadConProgreso`, `crearPlantel/Grado/Materia/Unidad`, `actualizarPlantel/Grado/Unidad`.

`Inferencia:` Muchas de estas (los niveles plantel→unidad) corresponden a la rama de navegación jerárquica inalcanzable descrita en la sección 1; otras (`ensureExamenes`, `ensureListasCotejo`, `ensureDefaultPlantel`) siguen activas porque alimentan estado que Biblioteca sí consume. Ver clasificación función por función en `LEGACY_HIERARCHY.md`.

### Patrón repetido en la capa `js/api/*.js`

`Hecho:` Los 6 archivos de `js/api/` implementan un esqueleto casi idéntico `buildXHeaders` / `parseXJson` / `createXApiError` / `requestXJson`, con solo el prefijo cambiado. `js/api/planeaciones.api.js` tiene además una inconsistencia interna: algunas funciones (`apiPlaneacionesDelete`, `apiPlaneacionesGet`, `apiPlaneacionesUpdate`, `apiPlaneacionesExportExcel`) usan `fetch` directo con manejo de error distinto al del resto del archivo (`throw new Error(...)` simple, sin `.status`/`.payload`).

---

## 6. Eventos, timers y polling

| Archivo:línea | Tipo | Detalle | Cleanup | Riesgo |
|---|---|---|---|---|
| `dashboard.page.js:1995-2041` | Polling recursivo (`while`+`setTimeout`, 1500/4000ms) | `waitForExamGenerationCompletion` | **No hay cancelación** si el usuario cierra el modal a mitad de polling | **Alto** |
| `dashboard.page.js:2963` | `document.addEventListener("click", ...)` sin cleanup, uno por cada combobox creado | Cierre de dropdown por click fuera | Ninguno explícito | **Alto** si `initQuickComboboxes()` llegara a ejecutarse más de una vez (hoy mitigado por el guard de `bindDashboardEvents`, pero es frágil) |
| `dashboard.page.js:5692-5993` (`bindDashboardEvents`) | ~40 `addEventListener` | Delegación sobre contenedores fijos | Protegido por flag `isDashboardBound` | Bajo — guard cubre toda la función |
| `dashboard.page.js:5982` | `window.addEventListener("pageshow", ...)` | Rehidrata explorador legado en back/forward | Sin cleanup (intencional) | Medio — dispara `loadPlanteles()` sin verificar `BIBLIOTECA_MODE`, posible llamada de red innecesaria en cada `pageshow` |
| `biblioteca.page.js:3231` | `document.addEventListener("click", onBibliotecaClick)` en `initBiblioteca()` | Router central de clicks de Biblioteca | **No hay `removeEventListener`** ni guard visible contra doble-init | **Alto** — si `initBiblioteca()` se invocara dos veces sin recargar la página, se duplicaría el listener global y cada acción se ejecutaría dos veces |
| `biblioteca.page.js:2327-2365` | Polling manual (`while`+`await sleep(3000)`, máx 60 intentos ≈ 3 min) | `submitBibliotecaExamModal` — estado de generación de examen | **Sin cancelación** si el usuario navega fuera de Biblioteca o dispara dos generaciones para el mismo bloque | **Alto** (mayor riesgo operativo detectado en todo el audit: dos bucles concurrentes pueden mutar la misma clave `pendingExamenByBatchId[conjuntoId]`) |
| `biblioteca.page.js:2559` | `setTimeout` fijo 1500ms | Espera "grace period" tras generar lista de cotejo, antes de reload | N/A (una ejecución) | Bajo |
| `js/core/config.js:11` | `DOMContentLoaded` + `setTimeout(300ms)` | Escribe en `#entorno` | — | Bajo, pero **`#entorno` no existe en ningún HTML leído** — código muerto silencioso |

No se detectó `MutationObserver` en ningún archivo auditado.

---

## 7. Duplicaciones detectadas (por área, no por nombre de función)

| Área | Implementaciones encontradas | Riesgo al unificar |
|---|---|---|
| **Toast/notificación** | `AppUI.showToast` (`shared.ui.js:8-23`), `showProfileNotice` (`components.private.js:56-69`), `mostrarToast` (`detalle.ui.js:307-327`) — mismo patrón, distinto `setTimeout` (3000/2600/3200ms) | Bajo-Medio: comportamiento visual muy similar, pero hay que confirmar que ningún consumidor dependa del tiempo exacto |
| **Sanitización de nombre de archivo** | `AppUI.buildDownloadSuggestedName`/`sanitizeDownloadFilename` (`shared.ui.js:53-79`), slugify distinto en `wordExport.js:271-277` (normaliza acentos/minúsculas/guiones), `sanitizeFileName` en `detalle.page.js:149-166` (separa extensión) | Medio: las 3 producen nombres de archivo distintos para el mismo input — unificar cambiaría nombres de descarga visibles al usuario, prohibido sin autorización explícita (regla 17 de `AGENTS.md`) |
| **Descarga de blob** | Patrón `Blob→createObjectURL→<a>→click→revokeObjectURL` repetido en `wordExport.js:174-181` (Word planeación), `wordExport.js:279-287` (Word lista de cotejo), `detalle.page.js:660-669` (Excel), y de nuevo independientemente en `biblioteca.page.js` (`descargarAnexoWord:1672-1762`, `bibDescargarPlaneacion:1915-2013`) | Bajo: mismo contrato técnico (Blob + descarga), buen candidato a helper compartido, siempre preservando nombre/extensión/MIME exactos |
| **Manejo de fetch/error API** | 5-6 copias casi idénticas de `buildXHeaders`/`parseXJson`/`createXApiError`/`requestXJson` en `js/api/*.js` | Bajo-Medio: mismo contrato observable, pero `planeaciones.api.js` tiene funciones que no siguen el patrón (ver sección 5) — requiere confirmar equivalencia antes de unificar |
| **Confirmación/modal de eliminar** | `#delete-confirm-modal` en `pages/archivados.html:49-80` + lógica en `archivados.page.js:921-1015`, y el mismo id/estructura HTML duplicado en `components/layout.html:362-393` (dashboard) | Medio: son dos DOMs distintos con el mismo id — no coexisten en la misma página, pero cualquier extracción a componente compartido debe verificar que ambos consumidores usan exactamente los mismos ids internos |
| **Formateo de fechas** | `new Date(x).toLocaleDateString("es-MX")` en 3 archivos legacy (`dashboard.ui.js:13`, `batch.ui.js:6,40`, `dashboard-tailwind.page.js:66,135`); `formatArchivedDate` en `archivados.page.js:57-69` (try/catch, opciones `{year, month:"short", day:"numeric"}`); `formatDetalleDateTime` en `detalle.ui.js:20-36` (arreglo de meses en español hardcodeado); `bibFormatDate`/`bibFormatDateTime`/`bibFormatShortDateTime` en `biblioteca.page.js:132-154` | Bajo: los 3 formatos activos (archivados/detalle/biblioteca) producen salidas visualmente distintas — no unificar sin decidir cuál es el formato "canónico" |
| **Patrón de eliminación de recurso en Biblioteca** | `bibEliminarBloque`/`bibEliminarPlaneacion`/`bibEliminarExamen`/`bibEliminarLista`/`bibEliminarAnexo` (`biblioteca.page.js:2911-3094`) repiten casi textualmente 5 veces: confirmar → API delete → mutación local optimista → `setSelectedConjunto` → render → reload silencioso | Bajo — mismo contrato, buen primer candidato de extracción (ver `REFACTOR_BACKLOG.md`) |
| **Resolver-o-crear entidad por nombre** | Patrón `existing = list.find(...); if (existing) usar; else crear()` repetido 4 veces (plantel/grado/materia/unidad) en `submitQuickCreateForm` (`dashboard.page.js:4970-5076`) y otra vez en `submitEntityModal` (`dashboard.page.js:5301-5356`) | Medio — ligado a la rama de creación rápida, que sí está activa |
| **Apertura/cierre/render de modal** | Trío `open*Modal`/`close*Modal`/`render*Modal` repetido 4 veces en `biblioteca.page.js` (Anexo create, Exam, Lista, Agregar) con estructura casi idéntica | Bajo — buen candidato a helper genérico de modal |
| **Render de niveles jerárquicos** | `renderRootLevel`/`renderPlantelLevel`/`renderGradoLevel`/`renderMateriaLevel` (`dashboard.page.js:3635-3863`) — estructura casi idéntica 4 veces | Bajo, pero forma parte de código posiblemente no utilizado (ver sección 9) — evaluar si vale la pena unificar antes de confirmar si se elimina |
| **Lógica de barajado de examen** | `shuffleArrayDeterministic`/`getStringSeed` duplicada entre preview HTML (`dashboard.page.js:4060-4092`) y exportación a Word (`4150-4212`) | Bajo — mismo algoritmo copiado dos veces en vez de una función compartida de "modelo de pregunta renderizable" |

---

## 8. Funciones con demasiadas responsabilidades mezcladas

| Función | Archivo:línea | Responsabilidades mezcladas | Riesgo |
|---|---|---|---|
| `submitDeleteConfirm` | `dashboard.page.js:2687-2764` | DOM + estado + hasta 12 ramas de llamada API (eliminar/archivar 6 tipos de entidad) + registro de scope archivado + 3 funciones de refresco distintas | Alto |
| `submitQuickCreateForm` | `dashboard.page.js:4933-5128` | Validación DOM + hasta 4 llamadas API secuenciales (plantel→grado→materia→unidad) + mutación de estado + arranque de generación + interoperación con `window.biblioteca.*` | Crítico — fallos parciales pueden dejar entidades huérfanas (p. ej. grado creado sin materia) |
| `generatePlaneacionesFromStaging` | `dashboard.page.js:4848-4931` | Construcción de payload + llamada con callback de progreso + reconciliación de estado + interoperación con Biblioteca | Alto |
| `waitForExamGenerationCompletion` | `dashboard.page.js:2009-2041` | Polling + render + scroll, sin límite máximo de reintentos | Alto |
| `submitBibliotecaAnexoCreateModal` | `biblioteca.page.js:1414-1537` | Validación + cierre de modal + mutación de estado + llamada API en loop secuencial + mutación optimista + render por iteración + reload final | Crítico |
| `submitBibliotecaExamModal` | `biblioteca.page.js:2264-2373` | Validación + payload + llamada API + cierre de modal + polling manual completo (debería extraerse a función independiente) | Crítico |
| `submitBibliotecaAgregarModal` | `biblioteca.page.js:2806-2907` | Acceso directo a DOM (`querySelectorAll`) fuera del propio modal state + snapshot + llamada a generación con callback + reconciliación | Alto |
| `onBibliotecaClick` | `biblioteca.page.js:1121-1265` | Router de 20+ acciones en un solo `switch` — punto único de fallo de toda la interacción de Biblioteca | Alto (complejidad, no bug conocido) |
| `loadAndRenderBiblioteca` | `biblioteca.page.js:1046-1117` | Llamada API + reconciliación de selección/tab + render completo | Alto |

---

## 9. Código posiblemente no utilizado

`Riesgo:` estas conclusiones son de auditoría estática (sin ejecución en runtime); se recomienda verificación funcional antes de eliminar cualquiera de estos elementos, tal como exige `AGENTS.md`.

| Elemento | Archivo:línea | Por qué parece no utilizado | Búsquedas realizadas | Confianza |
|---|---|---|---|---|
| Páginas completas: `js/planeacion.js`, `js/pages/planeacion.page.js`, `js/pages/batch.page.js`, `js/ui/planeacion.ui.js`, `js/ui/batch.ui.js`, `js/ui/dashboard.ui.js`, `js/pages/dashboard-tailwind.page.js` | — | `pages/batch.html` y `pages/planeacion.html` son solo redirects (`<meta refresh>`) sin cargar ningún script; `pages/dashboard_tailwind.html` no tiene links entrantes | Lectura de los 3 HTML completos, grep de referencias entrantes en `main.js` y en el resto de HTML | Alta |
| `isBibliotecaTechnicalUnidad` | `biblioteca.page.js:177-184` | Sin llamadas en el archivo ni en el resto del proyecto | Grep global `isBibliotecaTechnicalUnidad` en `**/*.js` | Alta |
| `getFilteredConjuntos` | `biblioteca.page.js:186-195` | Sin llamadas; reemplazada de facto por `getFilteredConjuntosForSidebar` (225-235), que sí se usa en el render (1014) | Grep global `getFilteredConjuntos\(` en todo el proyecto | Alta |
| `bibliotecaState.expandedIds` + `case "toggle-expand"` | `biblioteca.page.js:14, 1146-1151` | `expandedIds` solo se declara y se limpia (306), nunca se lee para condicionar render; no existe markup con `data-bib-action="toggle-expand"` | Grep de `expandedIds` y de `toggle-expand` en todo el proyecto | Alta |
| `bibRegenerarAnexo` + `case "regenerar-anexo"` | `biblioteca.page.js:1608-1648, 1235-1236` | No existe botón/markup que emita `data-bib-action="regenerar-anexo"` en `renderAnexosTab` ni en el modal de preview de anexo (solo hay Ver/Descargar/Eliminar) | Grep de `regenerar-anexo` en el archivo completo | Alta |
| Bloques comentados (`IMAGENES_AUTO_MOMENTOS`, `renderImagenesAutomaticasControl`, `toggleQuickTemaImagenMomento`, `toggleStagingTemaImagenMomento`) | `dashboard.page.js:362-367, 394-425, 3454-3464, 4672-4682, 5719-5727, 5811-5819` | Comentados explícitamente por el autor con nota `// PAUSED: ... preserved for future re-enable` | Lectura directa, el propio comentario es la evidencia | Alta |
| Rama completa de navegación jerárquica (`selectRoot/Plantel/Grado/Materia/Unidad`, `renderSidebarTree`, `renderRootLevel/PlantelLevel/GradoLevel/MateriaLevel`, `renderBreadcrumbs`, `handleBreadcrumbClick`, `handleTreeClick`, `hydrateExplorerData`, `restorePersistedExplorerLocation`) | `dashboard.page.js` (ver `LEGACY_HIERARCHY.md` para líneas exactas) | La rama de `initDashboardPage` que las invoca es inalcanzable mientras `biblioteca.page.js` esté cargado (siempre) | Lectura de `initDashboardPage`, `pages/dashboard.html` completo, grep de invocaciones | Media-Alta (no se descartó un entry point alternativo no encontrado) |
| Ramas explícitas `if (!window.BIBLIOTECA_MODE) {...}` | `dashboard.page.js:3282-3292, 3375-3386, 3486-3498, 4941-4950, 5653-5682, 5771` | Mismo argumento — `BIBLIOTECA_MODE` es siempre `true` | Igual que el punto anterior | Media-Alta |
| `QUICK_CREATE_NEW_VALUE` | `dashboard.page.js:64` | Sin referencia posterior encontrada en los tramos leídos | Grep no exhaustivo (no se hizo búsqueda dedicada del identificador completo) | Media |
| `#entorno` / `setTimeout` en `config.js:11` | `js/core/config.js:11` | El elemento `#entorno` no aparece en ningún HTML leído | Grep de `id="entorno"` en `pages/*.html` e `index.html` | Media |
| `getEditActionForLevel` y edición de plantel/grado/unidad vía `data-content-action="edit-*"` | `dashboard.page.js:1156-1170, 5375-5398` | Depende de si Biblioteca reutiliza estos botones — no se confirmó | Grep limitado al propio archivo, no se cruzó contra el marcado de Biblioteca | Baja-Media |

---

## 10. Dependencias implícitas / circulares

```
Origen: dashboard.page.js define window.explorerState, window.renderExamPreviewModal,
        window.closeExamPreviewModal, window.renderListaCotejoPreviewModal,
        window.closeListaCotejoPreview, window.downloadExamWord
  -> dependencia: biblioteca.page.js lee/escribe explorerState y llama a los wrappers
  -> consumidor: usuario abre preview de examen/lista desde Biblioteca
  Riesgo: Alto. dashboard.page.js debe cargarse y ejecutarse ANTES de que
  biblioteca.page.js necesite estas funciones — hoy se cumple por orden de <script>
  en dashboard.html, pero no hay ninguna verificación en tiempo de ejecución
  más allá de `typeof window.X === "function"` puntual.
  Recomendación futura: mantener wrappers de compatibilidad explícitos si se
  extraen estas funciones a otro archivo (regla de AGENTS.md sección Etapa C).

Origen: biblioteca.page.js define window.biblioteca, window.initBiblioteca,
        window.renderBibliotecaContent
  -> dependencia: dashboard.page.js llama window.initBiblioteca() en initDashboardPage
     y window.biblioteca.* en submitQuickCreateForm/generatePlaneacionesFromStaging
  -> consumidor: flujo de creación rápida de bloques desde dashboard
  Riesgo: Alto. Acoplamiento bidireccional confirmado (11 puntos de uso cruzado
  documentados en la sección 4). Cualquier refactor de un archivo debe revisar
  el otro.

Origen: js/services/planeaciones.service.js registra window.isArchivedHierarchyScopeHidden
        / window.registerArchivedHierarchyScope (persistidos en localStorage)
  -> dependencia: dashboard.page.js y archivados.page.js consultan/mutan ese registro
  -> consumidor: lógica de "ocultar rama archivada" en ambas vistas
  Riesgo: Medio. Es estado compartido sin interfaz explícita más allá de estas
  dos funciones; un cambio en el formato del registro de localStorage rompería
  ambos consumidores simultáneamente.

Origen: orden de carga de <script> en pages/dashboard.html (18 scripts en cadena)
  -> dependencia: cada archivo asume que los anteriores ya definieron sus
     funciones/objetos en window antes de ejecutarse
  -> consumidor: toda la página
  Riesgo: Alto. No hay ningún mecanismo de verificación de dependencias —
  reordenar o eliminar un <script> sin validar el resto puede romper la carga
  silenciosamente (ReferenceError en consola, no error visible al usuario).
```

---

## 11. Registro de riesgos del refactor

| Riesgo | Área | Probabilidad | Impacto | Evidencia | Mitigación sugerida |
|---|---|---|---|---|---|
| Reordenar/eliminar un `<script>` de `dashboard.html` rompe funciones globales esperadas | Orden de scripts | Media | Alto | 18 scripts en cadena, sin verificación en runtime (sección 10) | Documentar el orden exacto (ya hecho en `FRONTEND_MAP.md`) antes de tocarlo; no renombrar/mover archivos sin actualizar el `<script src>` correspondiente |
| Eliminar o renombrar una propiedad `window.X` sin buscar todos los consumidores | Uso de `window` | Media | Alto | 11+ puentes confirmados entre dashboard/biblioteca (sección 4) | Mantener wrapper de compatibilidad temporal (regla Etapa C de `AGENTS.md`) |
| Nadie invoca `initBiblioteca()` dos veces hoy, pero no hay guard explícito | Listeners duplicados | Baja (hoy) | Alto (si ocurre) | `biblioteca.page.js:3231`, sin `removeEventListener` ni flag anti doble-init | Antes de cualquier cambio en el flujo de inicialización, agregar guard explícito tipo `isBibliotecaBound` |
| Polling de examen (dashboard y biblioteca) sin cancelación al navegar fuera | Polling | Media | Medio | `dashboard.page.js:1995-2041`, `biblioteca.page.js:2327-2365` | No cambiar la lógica de polling en este refactor (regla 16 de `AGENTS.md`); documentar como deuda para sesión dedicada |
| Estado global disperso (`explorerState` mixto ACTIVE/LEGACY) | Estado global | Alta | Alto | Sección 1 y `LEGACY_HIERARCHY.md` | No tratar `explorerState` como bloque único; clasificar cada subcampo antes de mover nada |
| HTML del modal de confirmación duplicado con mismos ids (`archivados.html` vs `components/layout.html`) | Modales | Baja (no coexisten en la misma página) | Medio | Sección 7 | Confirmar que nunca se cargan ambos en el mismo DOM antes de unificar |
| Descargas con 3 implementaciones distintas de sanitización de nombre | Descargas | Media | Medio (nombre de archivo visible al usuario) | Sección 7 | No unificar sin decidir cuál es la implementación canónica y validar visualmente cada resultado |
| Código de jerarquías activo (`archivados.page.js`, `jerarquia.api.js/service.js`) coexiste con código de jerarquías inactivo (`dashboard.page.js`) usando el mismo vocabulario | Código de jerarquías | Alta | Alto (confusión al clasificar) | Secciones 1, 9 y `LEGACY_HIERARCHY.md` | Nunca clasificar por nombre de término aislado — siempre verificar el archivo y el flujo real |
| Payloads de generación (examen/lista/planeación) construidos inline en funciones grandes | Payloads de generación | Baja | Alto (si se rompe, afecta backend) | Sección 5, `submitBibliotecaExamModal:2300-2306` | No tocar construcción de payload sin revisar consumidores en `educativo_backend` |
| Actualización de cards tras acción usa dos mecanismos distintos (`renderBibliotecaDetailInPlace` vs `loadAndRenderBiblioteca` completo) | Actualización de cards | Media | Medio | Sección "Patrón general post-acción" en `CURRENT_BEHAVIOR.md` | Preservar ambos mecanismos tal cual hasta entender por qué difieren caso por caso |
| Autenticación pequeña pero es punto único de fallo (`auth.service.js`, 38 líneas) usada por todas las páginas privadas | Autenticación | Baja | Crítico | `FRONTEND_MAP.md` | No tocar sin pruebas manuales de login/logout en cada página privada |
| Dependencia entre dashboard y Biblioteca no documentada previamente en ningún archivo del repo | Dependencias dashboard↔Biblioteca | — (ya materializada) | Alto | Todo este documento | Este documento y `ARCHITECTURE.md` son ahora la referencia — mantenerlos actualizados en cada sesión de refactor futura |

---

## 12. Hallazgos prioritarios (resumen)

1. `window.BIBLIOTECA_MODE` siempre `true` en producción — gran parte de la navegación jerárquica de `dashboard.page.js` es inalcanzable por el flujo estándar de carga.
2. Acoplamiento bidireccional fuerte y no documentado previamente entre `dashboard.page.js` y `biblioteca.page.js`, mediado enteramente por `window`.
3. Polling de examen sin cancelación en dos lugares distintos (dashboard y biblioteca) — mayor riesgo operativo detectado.
4. 4 fragmentos de código confirmados sin consumidores en `biblioteca.page.js` (alta confianza).
5. Al menos 3 páginas/flujos completos muertos (`batch.html`, `planeacion.html`, `dashboard_tailwind.html`) con sus JS asociados.
6. `pages/archivados.html` funcional pero inalcanzable desde la navegación (link comentado).
7. Al menos 4 patrones con 3+ implementaciones redundantes (toast, sanitización de nombre de archivo, descarga de blob, formateo de fecha).
8. `explorerState` no es un bloque monolítico legado — mezcla subcampos activos y muertos, requiere separación cuidadosa antes de cualquier eliminación.
9. Inconsistencia de manejo de errores dentro de `planeaciones.api.js` (mismo archivo, dos patrones distintos).
10. `detalle.page.js` referencia `#btn-export-excel`, id inexistente en `detalle.html` (no-op silencioso).
