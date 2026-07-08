# SESSION_HANDOFF.md

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
