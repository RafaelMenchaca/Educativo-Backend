# TEST_MATRIX.md — Matriz manual de pruebas para proteger comportamiento durante el refactor

> Estado: histórico. No describe el flujo visual vigente. El flujo actual es Biblioteca.
>
> La matriz canónica vive en `../../../../educativo_frontend/planeacion-docente-ia/docs/refactor/TEST_MATRIX.md`. Archivados se prueba como flujo separado; cualquier prueba del explorador antiguo es únicamente compatibilidad/no regresión temporal.

> Ejecutar esta matriz completa (o el subconjunto relevante a la etapa en curso, ver `REFACTOR_BACKLOG.md`) antes y después de cada cambio. Todas las casillas deben pasar antes de considerar una extracción terminada.

## Carga y navegación

| Caso | Pasos | Resultado esperado |
|---|---|---|
| Landing carga | Abrir `index.html` | Navbar/footer públicos inyectados, sin errores en consola |
| Login | Abrir `pages/login.html`, ingresar credenciales válidas | Redirige a `pages/dashboard.html` |
| Login credenciales inválidas | Ingresar credenciales incorrectas | Mensaje de error visible, sin redirect |
| Dashboard carga | Iniciar sesión y llegar a `pages/dashboard.html` | Vista de Biblioteca visible (sidebar + panel de detalle), sin error de consola, `window.BIBLIOTECA_MODE === true` |
| Biblioteca — apertura de bloque | Click en un item del sidebar | Panel de detalle cambia sin recargar toda la lista del sidebar (verificar en Network que no hay petición GET de conjuntos completa, solo el cambio de clase activa) |
| Biblioteca — cambio de tabs | Click en cada uno de los 4 tabs (Planeaciones, Anexos, Listas, Exámenes) | Contenido cambia, conteos correctos, sin perder la selección de bloque |
| Logout | Click en cerrar sesión | Redirige a login, sesión invalidada (`onAuthStateChange` SIGNED_OUT dispara toast) |

## Planeaciones

| Caso | Pasos | Resultado esperado |
|---|---|---|
| Lista | Abrir tab Planeaciones de un bloque con documentos | Todas las planeaciones del bloque listadas |
| Ver | Click en "Ver" de una planeación | Navega a `detalle.html?id=...` con los datos correctos |
| Edición | En detalle, editar contenido y guardar | Cambios persistidos, banner de estado de edición correcto |
| Descarga | Click en "Descargar" | Archivo `.doc` descargado con nombre sugerido correcto |
| Eliminación | Eliminar una planeación | Confirmación → desaparece de la lista → también desaparecen sus listas de cotejo/anexos asociados de la vista |

## Anexos

| Caso | Pasos | Resultado esperado |
|---|---|---|
| Lista | Abrir tab Anexos | Anexos existentes listados |
| Generación (modal, selección múltiple) | Abrir modal "Crear anexos", seleccionar 2+ planeaciones, confirmar | Cards "generando" aparecen inmediatamente, se actualizan una por una conforme terminan (feedback en tiempo real, no solo al final) |
| Generación (desde card individual) | Click en "Generar anexo" en una planeación sin anexo | Card de progreso individual, luego resultado final |
| Feedback | Durante generación en lote | Verificar en Network que las llamadas a `/api/anexos/generate` son secuenciales (una a la vez), no en paralelo |
| Preview | Click en "Ver" de un anexo | Modal con contenido correcto |
| Descarga desde card | Click en "Descargar" de una card de anexo | Archivo `.doc` descargado |
| Descarga desde modal | Abrir preview, click "Descargar Word" dentro del modal | Mismo archivo, sin volver a pedir el detalle a la API (verificar en Network que no hay GET adicional) |
| Eliminación | Eliminar un anexo | Confirmación → desaparece de la lista |
| Prevención de duplicados | Abrir modal de creación con una planeación que ya tiene anexo | Esa planeación no aparece como opción seleccionable |

## Listas de cotejo

| Caso | Pasos | Resultado esperado |
|---|---|---|
| Selección | Abrir modal "Generar lista de cotejo" | Planeaciones que ya tienen lista aparecen deshabilitadas (`is-disabled`) |
| Prevención de regeneración | Intentar seleccionar una planeación con lista existente | No se puede seleccionar |
| Generación | Confirmar generación con 1+ planeaciones válidas | Item pendiente aparece, tras ~1.5s+reload la lista se actualiza con el resultado |
| Preview | Click en "Ver" de una lista | Modal correcto (delegado a `dashboard.page.js` vía `window.renderListaCotejoPreviewModal`) |
| Descarga | Click en "Descargar" | Archivo `.doc` correcto |
| Eliminación | Eliminar una lista | Desaparece de la lista tras confirmación |
| Datos aún disponibles para desarrolladores | Inspeccionar `window.explorerState.listaCotejoPreview` tras abrir un preview | Objeto presente con los datos cargados (uso consciente de estado compartido) |

## Exámenes

| Caso | Pasos | Resultado esperado |
|---|---|---|
| Selección | Abrir modal "Generar examen", seleccionar tipos de pregunta, cantidades y planeaciones | Formulario válido antes de permitir enviar |
| Generación | Confirmar generación | Job creado (`job_id` recibido), card pendiente con mensaje "Iniciando..." |
| Polling | Durante generación | Cada ~3s el mensaje se actualiza con `current_step`; verificar en Network que las llamadas a `/api/examenes/generacion/{jobId}` ocurren cada ~3000ms, máximo 60 veces |
| Uso de temas correctos | Generar examen seleccionando planeaciones específicas | El backend debe usar los temas de esas planeaciones, no depender de `unidad_id` del batch (ver nota en `CURRENT_BEHAVIOR.md` sección 5) |
| Preview | Click en "Ver" de un examen completado | Modal correcto (delegado a `dashboard.page.js` vía `window.renderExamPreviewModal`) |
| Descarga | Click en "Descargar" | Archivo `.doc` correcto, con orden de respuestas barajado de forma determinista (mismo seed → mismo orden) |
| Eliminación | Eliminar un examen | Desaparece de la lista tras confirmación |
| Polling sin cancelación (caso de riesgo conocido) | Iniciar generación de examen y navegar fuera de Biblioteca antes de que termine | **Comportamiento actual conocido**: el polling puede seguir corriendo en background; documentar si esto cambia tras cualquier refactor de la Etapa 4 del backlog |

## Archivados

| Caso | Pasos | Resultado esperado |
|---|---|---|
| Acceso directo | Navegar manualmente a `pages/archivados.html` (no hay link en navbar) | Página carga correctamente pese a no estar enlazada |
| Árbol de ramas archivadas | Ver árbol jerárquico | Estructura plantel→grado→materia→unidad→planeación correcta |
| Restaurar | Restaurar un elemento archivado | Vuelve a aparecer en Biblioteca/dashboard |
| Eliminación permanente | Eliminar permanentemente | Confirmación con advertencia, elemento desaparece definitivamente |

## Consola y red

| Caso | Resultado esperado |
|---|---|
| Sin `ReferenceError` | Ninguna página muestra `ReferenceError`/`is not defined` en consola durante navegación normal |
| Sin funciones inexistentes | Ningún `TypeError: X is not a function` al usar cualquier flujo documentado en `CURRENT_BEHAVIOR.md` |
| Sin peticiones duplicadas | Al generar/eliminar cualquier recurso, verificar en Network que no hay dos peticiones idénticas simultáneas |
| Sin listeners duplicados | Click en cualquier acción dispara el efecto una sola vez (especial atención a `onBibliotecaClick`, que no tiene guard anti doble-init — ver `FRONTEND_AUDIT.md` sección 6) |
| Sin polling abandonado | Tras navegar fuera de Biblioteca durante una generación de examen, verificar en Network (tras cerrar y no reabrir DevTools) si siguen llegando peticiones a `/api/examenes/generacion/*` |
| Sin errores 4xx/5xx inesperados | Ningún flujo documentado como exitoso en `CURRENT_BEHAVIOR.md` debe producir errores HTTP inesperados |
| `pageshow` no dispara red innecesaria | Navegar con back/forward del navegador estando en `dashboard.html`; verificar en Network si `loadPlanteles()` se dispara igualmente en modo Biblioteca (hallazgo conocido, ver `FRONTEND_AUDIT.md` sección 6) |

## Suite automatizada existente

`npm test` ejecuta `tests/planeacion.test.js` (Jest + JSDOM) — correr siempre como parte de la validación, aunque cubre una porción pequeña (`validateForm` de `js/planeacion.js`, código marcado como posiblemente no utilizado fuera del test).
