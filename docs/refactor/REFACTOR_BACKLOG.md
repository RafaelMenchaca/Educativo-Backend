# REFACTOR_BACKLOG.md — Backlog propuesto de sesiones futuras

> Propuesta de orden de extracción. No se implementó nada de esto en esta sesión. Filosofía obligatoria (de `AGENTS.md`): documentar → crear pruebas/validaciones → extraer literalmente → mantener compatibilidad → validar → eliminar duplicados después → eliminar legado al final.

Cada etapa está pensada para caber en una sola sesión de refactor (regla 19 de `AGENTS.md`: alcance concreto, no "refactorizar todo").

---

## Etapa 1 — Confirmar en runtime los hallazgos de código muerto de menor riesgo

**Objetivo:** validar con DevTools (no solo lectura estática) los elementos ya identificados con confianza Alta en `FRONTEND_AUDIT.md` sección 9, antes de tocar nada.

**Archivos involucrados:** `biblioteca.page.js` (`isBibliotecaTechnicalUnidad`, `getFilteredConjuntos`, `expandedIds`/`toggle-expand`, `bibRegenerarAnexo`/`regenerar-anexo`), `pages/batch.html`, `pages/planeacion.html`, `pages/dashboard_tailwind.html`.

**Funciones candidatas:** ninguna función se toca en esta etapa — es solo verificación (abrir la app, buscar en consola/Network si algo referencia estos nombres, confirmar que `pages/batch.html`/`pages/planeacion.html` en efecto redirigen siempre).

**Riesgo:** Muy bajo (no se modifica código).

**Dependencias:** ninguna.

**Validaciones necesarias:** navegar la app real, confirmar en consola del navegador que no hay errores al no usar estas funciones; confirmar que ningún flujo de usuario visible dispara `toggle-expand` o `regenerar-anexo`.

**Criterio de finalización:** lista confirmada de "seguro eliminar" vs "requiere más evidencia", documentada como actualización de `FRONTEND_AUDIT.md`.

**Wrappers de compatibilidad:** no aplica (etapa de solo verificación).

---

## Etapa 2 — Eliminar páginas y archivos JS completamente muertos

**Objetivo:** remover del árbol activo los archivos que ya no cargan ningún HTML: `js/planeacion.js` (dejar solo si `tests/planeacion.test.js` sigue dependiendo de él — revisar primero), `js/pages/planeacion.page.js`, `js/pages/batch.page.js`, `js/ui/planeacion.ui.js`, `js/ui/batch.ui.js`, `js/ui/dashboard.ui.js`, `js/pages/dashboard-tailwind.page.js`, y las páginas `pages/batch.html`, `pages/planeacion.html`, `pages/dashboard_tailwind.html`.

**Archivos involucrados:** los listados arriba.

**Funciones candidatas:** archivos completos, no funciones individuales.

**Riesgo:** Bajo — confirmado por dos fuentes independientes (grep de referencias entrantes + lectura de los HTML) que no hay ningún `<script>` que los cargue.

**Dependencias:** Etapa 1 (confirmación en runtime), y confirmar que `tests/planeacion.test.js` no rompe si se toca `js/planeacion.js` (si depende de él, mantenerlo solo como fixture de test, documentando por qué).

**Validaciones necesarias:** `npm test` después del cambio; navegar manualmente `pages/batch.html` y `pages/planeacion.html` para confirmar que el redirect sigue funcionando; grep final de que ningún otro archivo referencia los nombres de función eliminados.

**Criterio de finalización:** `npm test` verde, navegación manual sin errores de consola, cero referencias residuales.

**Wrappers de compatibilidad:** no se requieren — son archivos sin consumidores.

---

## Etapa 3 — Extraer helper compartido de "eliminar recurso de Biblioteca"

**Objetivo:** unificar el patrón de 5 pasos repetido en `bibEliminarBloque`/`bibEliminarPlaneacion`/`bibEliminarExamen`/`bibEliminarLista`/`bibEliminarAnexo` (`biblioteca.page.js:2911-3094`) en una función parametrizada, sin cambiar ningún mensaje visible ni contrato de API.

**Archivos involucrados:** `js/pages/biblioteca.page.js` únicamente.

**Funciones candidatas:** las 5 funciones de eliminación listadas.

**Riesgo:** Bajo — mismo contrato de API confirmado en las 5, mismos pasos, sin lógica condicional divergente relevante encontrada en la auditoría.

**Dependencias:** ninguna (no toca `dashboard.page.js`).

**Validaciones necesarias:** eliminar un item de cada uno de los 5 tipos manualmente en la app y confirmar: mensaje de confirmación idéntico al actual, mismo comportamiento de error, mismo refresh de card/lista, sin peticiones duplicadas en Network.

**Criterio de finalización:** las 5 funciones delegan al helper compartido; comportamiento visible idéntico confirmado manualmente; `npm test` verde.

**Wrappers de compatibilidad:** no se requieren (funciones internas del archivo, no expuestas en `window` individualmente más que como parte del switch de `onBibliotecaClick`).

---

## Etapa 4 — Extraer polling de examen a función reutilizable con cancelación

**Objetivo:** sacar el bucle de polling de `submitBibliotecaExamModal` (`biblioteca.page.js:2327-2365`) a una función independiente que acepte un mecanismo de cancelación (flag o `AbortController`), preservando exactamente el intervalo (3000ms), el máximo de intentos (60) y los mensajes de error actuales. Aplicar el mismo tratamiento al polling equivalente de `dashboard.page.js` (`waitForExamGenerationCompletion:2009-2041`) si el diagnóstico de la Etapa 1 confirma que ese flujo sigue siendo alcanzable.

**Archivos involucrados:** `js/pages/biblioteca.page.js`, posiblemente `js/pages/dashboard.page.js` (evaluar por separado).

**Funciones candidatas:** `submitBibliotecaExamModal` (extraer su IIFE de polling), `waitForExamGenerationCompletion`.

**Riesgo:** Medio-Alto — es lógica de generación (regla 16 de `AGENTS.md`: "no cambiar la lógica de generación durante un refactor estructural"). Esta etapa debe limitarse estrictamente a *extraer* y *añadir cancelación*, sin tocar condiciones de finalización, intervalos ni mensajes.

**Dependencias:** Etapa 3 completada (para tener el archivo ya más ordenado).

**Validaciones necesarias:** generar un examen y confirmar que el polling funciona igual; cerrar el modal/navegar fuera a mitad de polling y confirmar que ya no sigue llamando a la API en Network; generar dos exámenes seguidos para el mismo bloque y confirmar que no hay condición de carrera visible.

**Criterio de finalización:** polling cancelable confirmado en Network tab, sin cambios en mensajes ni tiempos, `npm test` verde.

**Wrappers de compatibilidad:** ninguno necesario si se mantiene dentro del mismo archivo.

---

## Etapa 5 — Centralizar sanitización de nombre de archivo y descarga de blob (solo lectura de comportamiento, sin unificar aún)

**Objetivo:** documentar exhaustivamente las 3 implementaciones de sanitización de nombre (`shared.ui.js`, `wordExport.js`, `detalle.page.js`) con ejemplos de entrada/salida reales, como paso previo a decidir cuál es la canónica. **No modificar código en esta etapa** — es investigación dirigida a decidir la Etapa 6.

**Archivos involucrados:** `js/ui/shared.ui.js`, `js/ui/wordExport.js`, `js/pages/detalle.page.js` (solo lectura).

**Riesgo:** Ninguno (etapa de documentación).

**Dependencias:** ninguna.

**Validaciones necesarias:** ninguna (no hay cambio de código).

**Criterio de finalización:** tabla de comparación entrada→salida para casos reales (nombres con acentos, espacios, caracteres especiales) añadida a `FRONTEND_AUDIT.md`.

---

## Etapa 6 — Unificar descarga de blob (Word/Excel) tras validar Etapa 5

**Objetivo:** crear un único helper de "generar y descargar documento desde HTML/Blob", preservando MIME type, extensión y comportamiento de descarga exactos por tipo de documento. Mantener wrapper de compatibilidad si alguna función sigue expuesta en `window`.

**Archivos involucrados:** `js/ui/wordExport.js`, `js/pages/biblioteca.page.js` (`descargarAnexoWord`, `bibDescargarPlaneacion`), `js/pages/detalle.page.js` (`exportarExcelActual`).

**Funciones candidatas:** las funciones de descarga listadas en `FRONTEND_AUDIT.md` sección 7.

**Riesgo:** Medio — `wordExport.js` está marcada como "zona protegida" en `ai-context/07-known-bugs-and-decisions.md`; requiere autorización explícita antes de tocar.

**Dependencias:** Etapa 5, y autorización explícita para tocar `wordExport.js`.

**Validaciones necesarias:** descargar cada tipo de documento (planeación, anexo, lista de cotejo, examen, Excel) y comparar el archivo resultante byte a byte o al menos visualmente contra el comportamiento previo.

**Criterio de finalización:** un solo helper compartido, mismo nombre de archivo/extensión/contenido confirmado para los 5 tipos de descarga, wrapper de compatibilidad documentado si aplica.

**Wrappers de compatibilidad:** sí, si `descargarWord`/`descargarListaCotejoWord` siguen siendo llamadas desde `window` por otro archivo.

---

## Etapa 7 — Separar `explorerState` en sub-estados con propietario claro

**Objetivo:** dividir el objeto monolítico `explorerState` (`dashboard.page.js:1-53`) en un sub-estado exclusivo de navegación jerárquica legado y un sub-estado compartido con Biblioteca (`progress`, `examPreview`, `listaCotejoPreview`, `confirmDelete`), sin cambiar ninguna referencia externa (mantener `window.explorerState` funcionando igual mediante getters si es necesario).

**Archivos involucrados:** `js/pages/dashboard.page.js`, `js/pages/biblioteca.page.js` (solo lectura de las referencias, para no romperlas).

**Riesgo:** Alto — es el corazón del acoplamiento entre los dos archivos más grandes del proyecto.

**Dependencias:** Etapas 1-2 completadas (contexto más limpio), y debe hacerse en una sesión dedicada exclusivamente a esto, sin mezclar con otras extracciones (regla 19 de `AGENTS.md`).

**Validaciones necesarias:** matriz de pruebas completa (ver `TEST_MATRIX.md`), especialmente generación/preview de examen y lista de cotejo desde Biblioteca.

**Criterio de finalización:** `biblioteca.page.js` sigue funcionando sin cambios en su propio código; `window.explorerState` sigue existiendo con la misma forma observable desde fuera.

**Wrappers de compatibilidad:** obligatorio — `window.explorerState` debe seguir respondiendo igual mientras existan consumidores externos.

---

## Etapa 8 — Aislar (no eliminar) el árbol de navegación jerárquica legado en `dashboard.page.js`

**Objetivo:** mover las funciones clasificadas `LEGACY_CONFIRMED` en `LEGACY_HIERARCHY.md` sección A a un archivo separado (p. ej. `js/pages/dashboard-legacy-explorer.js`), cargado condicionalmente solo si `BIBLIOTECA_MODE` es `false`, sin eliminarlas todavía.

**Archivos involucrados:** `js/pages/dashboard.page.js`, `pages/dashboard.html` (para el nuevo `<script>` condicional, si aplica).

**Funciones candidatas:** todas las listadas como `LEGACY_CONFIRMED` en `LEGACY_HIERARCHY.md` sección A.

**Riesgo:** Alto — tocar el archivo más grande y crítico del proyecto.

**Dependencias:** Etapa 7 completada (estado ya separado).

**Validaciones necesarias:** matriz de pruebas completa; confirmar que `dashboard.html` sigue cargando y funcionando idéntico en modo Biblioteca (que es el único modo real de producción hoy).

**Criterio de finalización:** `dashboard.page.js` reducido significativamente en líneas; comportamiento de Biblioteca sin cambios confirmados.

**Wrappers de compatibilidad:** mantener durante al menos una sesión adicional antes de considerar eliminación real.

---

## Etapa 9 — Eliminar legado confirmado (solo tras Etapa 8 validada en producción)

**Objetivo:** eliminar definitivamente el código aislado en la Etapa 8, una vez confirmado que no tiene consumidores tras un periodo de observación.

**Riesgo:** Medio (ya aislado, pero es la eliminación final).

**Dependencias:** Etapa 8 validada en producción durante al menos un ciclo de uso real.

**Validaciones necesarias:** repetir matriz completa de pruebas.

**Criterio de finalización:** líneas eliminadas, `AGENTS.md`/`LEGACY_HIERARCHY.md` actualizados para reflejar la eliminación.

---

## Fuera de alcance de este backlog (requiere decisión de producto, no solo técnica)

- Recuperar el link a `pages/archivados.html` en `components/navbar.html` (está comentado) — es una decisión de producto, no de refactor.
- Decidir si `pages/registro.html`/`recuperar.html`/`contacto.html` deben tener lógica de submit real — están fuera del alcance de "refactor sin romper comportamiento" porque hoy no tienen comportamiento funcional que preservar.
- Unificar formato de fechas — requiere decidir un formato canónico único, es una decisión de UX no solo técnica.
