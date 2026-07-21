# CURRENT_BEHAVIOR.md — Comportamiento actual (no ideal) del frontend

> Estado: histórico. No describe el flujo visual vigente. El flujo actual es Biblioteca.
>
> Se conserva como snapshot técnico. El explorador visual antiguo no es una segunda experiencia soportada; las referencias a Dashboard documentan compatibilidad consumida por Biblioteca.

> Describe lo que el código actual **intenta hacer**, con evidencia de archivo:línea. No es una especificación de comportamiento deseado.

## 1. Flujo Biblioteca — árbol de llamadas reconstruido

```
initBiblioteca() [biblioteca.page.js:3228]  (invocado desde dashboard.page.js:6044)
 ├─ injectBibliotecaModals() [3098] → crea 6 shells de modal en <body>
 ├─ document.addEventListener("click", onBibliotecaClick) [3231]
 ├─ oculta path-bar/sidebar del dashboard legado, muestra layout de Biblioteca [3234-3239]
 └─ loadAndRenderBiblioteca() [3241]
      ├─ requireSession() [1066]
      ├─ apiBibliotecaConjuntos(token) [1069] → GET /api/biblioteca/conjuntos
      ├─ reconciliación tempId → id real [1073-1093]
      ├─ bibliotecaState.conjuntos = newList [1095]
      └─ renderBibliotecaContent() [1110]
           ├─ renderBibliotecaSidebar(filtered) [1022] → renderConjuntoSidebarItem() por bloque [835]
           └─ renderBibliotecaDetail(selected) [1023]
                ├─ renderBibliotecaTabs(conjunto) [794] → 4 botones data-bib-action="switch-tab"
                └─ renderBibliotecaTabContent(conjunto) [823]
                     ├─ renderPlaneacionesTab() [468]  (tab activo por defecto)
                     ├─ renderExamenesTab() [539]
                     ├─ renderListasCotejoTab() [706]
                     └─ renderAnexosTab() [615]
```

### Selección de bloque / cambio de tab

- Click en item del sidebar → `onBibliotecaClick` acción `"select-conjunto"` [1139] → `setSelectedConjunto(id)` [237] → `updateBibliotecaSidebarActive()` [952] (solo toggla clases, no re-renderiza la lista completa) → `renderBibliotecaDetailInPlace()` [964] (reemplaza solo `#biblioteca-detail-panel`).
- Click en tab → acción `"switch-tab"` [1153] → `setSelectedConjunto(id, {tab})` [237] → `renderBibliotecaDetailInPlace()` [964].

### Patrón general post-acción (válido para generar/eliminar en los 4 tipos de documento)

1. Mutación optimista local del estado en memoria + render inmediato (feedback rápido al usuario).
2. `loadAndRenderBiblioteca({silent:true, targetBatchId, activeTab})` — vuelve a pedir **toda la lista de conjuntos** al backend para confirmar con datos reales, no solo el conjunto/card afectado.

Este patrón se repite en las 5 funciones de eliminación (`bibEliminarBloque/Planeacion/Examen/Lista/Anexo`, líneas 2911-3094) y en las 3 rutas de generación (anexos, examen, lista).

## 2. Planeaciones

| Acción | Función | Línea | Llamada API | Comportamiento actual |
|---|---|---|---|---|
| Agregar tema / generar | `submitBibliotecaAgregarModal` | `biblioteca.page.js:2806` | `generarPlaneacionesUnidadConProgreso` (definida fuera de este archivo, probablemente en `dashboard.page.js` o servicio de generación — no confirmado el archivo exacto) | Cierra el modal, crea card temporal, actualiza progreso vía callback, reconcilia con `applyGenerationResultToPendingItems`/`applyOptimisticPlaneacionesToConjunto`, y finalmente `loadAndRenderBiblioteca(silent)` |
| Ver | link directo | `biblioteca.page.js:521` | ninguna | `<a href="detalle.html?id=...">` — navega a otra página, no hay modal de preview de planeación dentro de Biblioteca |
| Descarga | `bibDescargarPlaneacion` | `biblioteca.page.js:1915` | `window.obtenerPlaneacionDetalle` | Construye una tabla HTML manualmente y genera un Word vía Blob (implementación propia, no comparte código con `wordExport.js`) |
| Eliminación | `bibEliminarPlaneacion` | `biblioteca.page.js:2950` | DELETE `/api/planeaciones/{id}/directo` | Confirma → elimina → mutación local en cascada (también quita listas de cotejo y anexos asociados de la memoria local) → `renderBibliotecaDetailInPlace` → `loadAndRenderBiblioteca(silent)` |

## 3. Anexos

| Acción | Función | Línea | Llamada API | Comportamiento actual |
|---|---|---|---|---|
| Generación (modal, selección múltiple) | `submitBibliotecaAnexoCreateModal` | `biblioteca.page.js:1414` | POST `/api/anexos/generate` (loop secuencial, una llamada por planeación seleccionada) | Crea cards "generando" por cada planeación seleccionada, cierra el modal, y genera **secuencialmente uno por uno**, re-renderizando después de cada item completado (feedback en tiempo real card por card, línea 1514). Al final, si al menos uno tuvo éxito, hace `loadAndRenderBiblioteca(silent)` |
| Generación (desde card individual, sin modal) | `bibGenerarAnexo` | `biblioteca.page.js:1541` | mismo endpoint | Misma mecánica optimista, un solo item |
| Regeneración | `bibRegenerarAnexo` | `biblioteca.page.js:1608` | POST `/api/anexos/{id}/regenerate` | Existe la función y el `case` del switch de eventos, pero **no se encontró ningún botón en el render actual** que dispare esta acción (ver `FRONTEND_AUDIT.md` sección 9) |
| Preview | `openBibliotecaAnexoPreview` | `biblioteca.page.js:1766` | GET `/api/anexos/{id}` | Abre `renderBibliotecaAnexoModal` con el contenido del anexo |
| Descarga desde card | `bibDescargarAnexo` | `biblioteca.page.js:1650` | GET `/api/anexos/{id}` (obtiene detalle de nuevo) | Genera nombre sugerido y descarga vía `descargarAnexoWord` |
| Descarga desde modal | botón dentro de `renderBibliotecaAnexoModal` | `biblioteca.page.js:1904-1910` | ninguna (ya tiene el anexo en memoria) | Misma función `descargarAnexoWord`, pero sin volver a pedir el detalle |
| Eliminación | `bibEliminarAnexo` | `biblioteca.page.js:3061` | DELETE `/api/anexos/{id}` | Patrón estándar (confirmar → API → mutación local → render → reload) |

**Prevención de duplicados**: `anexosByPlanId`/`anexosPlaneacionIds` (líneas 634-636, 1300-1303) excluyen del modal de creación tanto las planeaciones que ya tienen anexo como las que están en `generatingMap`, evitando doble generación mientras el modal está abierto.

## 4. Listas de cotejo

| Acción | Función | Línea | Llamada API | Comportamiento actual |
|---|---|---|---|---|
| Selección | `renderBibliotecaListaModal` | `biblioteca.page.js:2400` | — | Filtra `listaPlaneacionIds` (línea 2407) y marca como `is-disabled` los checkboxes de planeaciones que ya tienen lista generada (2422-2428) |
| Generación | `submitBibliotecaListaModal` | `biblioteca.page.js:2505` | POST `/api/listas-cotejo/generate` | Cierra el modal, crea `pendingListaByBatchId`, espera **1500ms fijos** ("grace period" hardcoded) y luego `loadAndRenderBiblioteca(silent, tab:"listas")` |
| Preview | `openBibliotecaListaPreview` | `biblioteca.page.js:2079` | `window.obtenerListaCoTejoDetalle` (externa) | Delega el render a `window.renderListaCotejoPreviewModal`, función definida en `dashboard.page.js` — Biblioteca solo prepara `window.explorerState.listaCotejoPreview` y llama a la función externa |
| Descarga | `bibDescargarLista` | `biblioteca.page.js:2036` | `window.obtenerListaCoTejoDetalle` + `window.descargarListaCotejoWord` | Ambas funciones externas (definidas en `wordExport.js`/servicios) |
| Eliminación | `bibEliminarLista` | `biblioteca.page.js:3026` | DELETE `/api/listas-cotejo/{id}` | Patrón estándar |

`Pendiente de confirmar:` no se encontró en `biblioteca.page.js` lógica explícita de "ocultar actividad evaluada para el usuario" — solo una nota textual en el modal (línea 2467: "Si una planeación no tiene actividad de cierre, se omitirá"). Esa validación podría residir en el backend o en otro módulo no cubierto por esta auditoría.

## 5. Exámenes

| Acción | Función | Línea | Llamada API | Comportamiento actual |
|---|---|---|---|---|
| Selección de temas/planeaciones | `renderBibliotecaExamModal` | `biblioteca.page.js:2128` | — | Checkboxes de tipo de pregunta + cantidad, checkboxes de planeaciones usadas como contexto |
| Construcción de payload | `submitBibliotecaExamModal` | `biblioteca.page.js:2300-2306` | — | `{unidad_id, batch_id, tipos_pregunta, cantidades_pregunta, planeacion_ids}`. Comentario textual en el código (2296-2299) documenta que se envía `planeacion_ids` en vez de `tema_ids` porque el backend resuelve los temas reales, "así el examen siempre usa los temas seleccionados aunque el `unidad_id` del batch esté desactualizado" |
| Creación de job | `submitBibliotecaExamModal` | `biblioteca.page.js:2315` | POST `/api/examenes/generate` → retorna `job_id` | Cierra el modal, crea `pendingExamenByBatchId` con mensaje inicial "Iniciando..." |
| Polling | IIFE dentro de `submitBibliotecaExamModal` | `biblioteca.page.js:2327-2365` | GET `/api/examenes/generacion/{jobId}` cada 3000ms, máximo 60 intentos (~3 minutos) | En cada tick actualiza `pendingExamenByBatchId.message` y re-renderiza; termina en `"completed"` o `"failed"`, o expira con mensaje de error tras 60 intentos. **No hay cancelación** si el usuario navega fuera de Biblioteca mientras el polling corre |
| Preview | `openBibliotecaExamenPreview` | `biblioteca.page.js:2057` | `window.obtenerExamenDetalle` (externa) | Delega render a `window.renderExamPreviewModal` (definida en `dashboard.page.js`) |
| Descarga | `bibDescargarExamen` | `biblioteca.page.js:2015` | `window.downloadExamWord` (externa) | — |
| Eliminación | `bibEliminarExamen` | `biblioteca.page.js:2991` | DELETE `/api/examenes/{id}` | Patrón estándar |

Existe también un flujo de examen "por unidad" dentro de `dashboard.page.js` (`submitUnitExamModal:2043`, `waitForExamGenerationCompletion:2009-2041`), con su propio polling independiente (1500/4000ms, sin límite máximo de intentos documentado). `Pendiente de confirmar:` si este flujo de `dashboard.page.js` sigue siendo alcanzable desde la UI actual de Biblioteca o es un remanente — ver `LEGACY_HIERARCHY.md`.

## 6. Generación — feedback visual

- Anexos: feedback card-por-card en tiempo real durante la generación en lote (re-render tras cada item, no solo al final).
- Listas de cotejo: sin feedback incremental — un solo mensaje pendiente + espera fija de 1500ms antes de recargar todo.
- Exámenes: feedback incremental vía `current_step` del backend, actualizado cada 3 segundos durante el polling.
- Planeaciones: feedback vía callback de progreso de `generarPlaneacionesUnidadConProgreso` (mecanismo SSE según `ai-context/05-ai-generation-flow.md`, no confirmado directamente dentro de `biblioteca.page.js`).

## 7. Preview

- Planeaciones: no hay preview modal — el botón "Ver" navega a `detalle.html?id=...`.
- Anexos: preview modal propio dentro de `biblioteca.page.js` (`renderBibliotecaAnexoModal`).
- Exámenes y listas de cotejo: Biblioteca delega el render del modal de preview a funciones definidas en `dashboard.page.js` (`window.renderExamPreviewModal`, `window.renderListaCotejoPreviewModal`), usando `window.explorerState` como almacenamiento intermedio del contenido a mostrar.

## 8. Descarga

Todos los tipos de documento generan un archivo `.doc`/`.xlsx` client-side vía Blob HTML (no hay descarga de archivo real desde el backend, salvo que el backend devuelva el contenido a insertar en la plantilla). Cada tipo de documento tiene su propia función de construcción de HTML/Word — no hay una función compartida única (ver duplicados en `FRONTEND_AUDIT.md` sección 7).

## 9. Eliminación

Todas las eliminaciones (bloque, planeación, examen, lista, anexo) siguen el mismo patrón de 5 pasos: confirmar (modal `showBibConfirm`) → llamada DELETE → mutación local optimista → `setSelectedConjunto`/render → `loadAndRenderBiblioteca(silent)`. La eliminación de planeación además limpia en cascada, en memoria local, las listas de cotejo y anexos asociados a esa planeación dentro del conjunto.

## 10. Estado conservado entre cambios de tab

`bibliotecaState.activeTab` es un mapa por `conjuntoId` (línea 15) — cambiar de tab dentro de un bloque y volver a otro bloque preserva el último tab visto de cada uno independientemente. El resto del estado por conjunto (planeaciones, anexos, listas, exámenes) vive en el objeto `conjunto` dentro de `bibliotecaState.conjuntos`, recargado completo en cada `loadAndRenderBiblioteca`.
