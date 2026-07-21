# FRONTEND_MAP.md — Inventario de archivos

> Estado: histórico. No describe el flujo visual vigente. El flujo actual es Biblioteca.
>
> Este inventario conserva evidencia técnica de una auditoría anterior. No presenta Biblioteca y el explorador jerárquico como modos equivalentes. Para arquitectura vigente consultar `../../educativo_frontend/planeacion-docente-ia/docs/ARCHITECTURE.md`.

> Generado por auditoría de solo lectura. Líneas aproximadas contadas con `wc -l` el día de la auditoría (ver `SESSION_HANDOFF.md` para fecha exacta).

## Criterio de riesgo

- **Bajo**: archivo pequeño, responsabilidad única, sin acoplamiento por `window` relevante.
- **Medio**: responsabilidad razonablemente acotada pero con algún acoplamiento `window` o patrón duplicado.
- **Alto**: mezcla varias responsabilidades (API+estado+render+eventos) y/o es consumido por otros archivos vía `window` en múltiples puntos.
- **Crítico**: archivo grande (>1500 líneas), con lógica de negocio central, acoplamiento bidireccional confirmado y funciones con complejidad ciclomática alta (ver `FRONTEND_AUDIT.md`).

## Inventario de scripts (`js/`)

| Archivo | Líneas | Tipo | Responsabilidad aparente | Página(s) que lo usa(n) | Riesgo |
|---|---:|---|---|---|---|
| `js/pages/dashboard.page.js` | 6066 | Controlador de página | Orquestador del dashboard; contiene sistema de navegación jerárquica (mayormente inactivo, ver LEGACY_HIERARCHY.md) + sub-estado compartido con Biblioteca (examen, lista de cotejo, progreso, confirmación de borrado) + creación rápida de bloques | `pages/dashboard.html` | Crítico |
| `js/pages/biblioteca.page.js` | 3244 | Controlador de página/feature | Flujo vigente completo de Biblioteca: sidebar de bloques, 4 tabs, generación/preview/descarga/eliminación de los 4 tipos de documento | `pages/dashboard.html` (cargado junto a dashboard.page.js) | Crítico |
| `js/pages/archivados.page.js` | 1353 | Controlador de página | Árbol de ramas archivadas (plantel→grado→materia→unidad→planeación), restaurar/eliminar permanente | `pages/archivados.html` | Alto |
| `js/pages/detalle.page.js` | 679 | Controlador de página | Carga/edición/guardado de planeación, subida de imágenes a Supabase Storage, export Excel | `pages/detalle.html` | Medio |
| `js/services/planeaciones.service.js` | 472 | Servicio | CRUD de planeaciones + registro de jerarquía archivada en `localStorage` | dashboard, archivados, detalle | Medio |
| `js/api/jerarquia.api.js` | 473 | API | CRUD completo de planteles/grados/materias/unidades/temas | dashboard, archivados | Medio |
| `js/api/planeaciones.api.js` | 335 | API | Generación/consulta/actualización/export de planeaciones. **Inconsistencia**: algunas funciones usan el helper `requestPlaneacionesJson`, otras hacen `fetch` directo con manejo de error distinto | dashboard, biblioteca, detalle | Medio |
| `js/ui/detalle.ui.js` | 336 | UI | Render de tabla editable de planeación + toast propio (`mostrarToast`, duplicado #3 de toast) | detalle | Medio |
| `js/services/jerarquia.service.js` | 221 | Servicio | CRUD jerarquía + generación de planeaciones con progreso SSE | dashboard | Medio |
| `js/ui/wordExport.js` | 292 | UI | `descargarWord`, `descargarListaCotejoWord` — generación de `.doc` vía Blob HTML. Marcado como "zona protegida" en `ai-context/07-known-bugs-and-decisions.md` | dashboard, biblioteca, detalle | Alto (zona protegida, no tocar sin permiso explícito) |
| `js/pages/dashboard-tailwind.page.js` | 195 | Controlador de página | Dashboard alterno standalone, no referenciado por navegación | `pages/dashboard_tailwind.html` (huérfana) | Bajo (código muerto, sin consumidores) |
| `js/ui/components.public.js` | 171 | UI | Inyecta navbar/footer públicos, menú responsive | todas las páginas públicas | Bajo |
| `js/ui/shared.ui.js` | 187 | UI | `AppUI.showToast`, `AppUI.renderProgressPill`, sanitización de nombre de descarga, modal de nombre de archivo | dashboard, biblioteca | Alto (muy compartido, cualquier cambio afecta 2 archivos críticos) |
| `js/ui/components.private.js` | 244 | UI | Navbar/footer privados, menú perfil, logout, toast propio (`showProfileNotice`, duplicado #2) | dashboard, archivados, detalle | Medio |
| `js/ui/planeacion.ui.js` | 248 | UI | Render de progreso/resultados de generación legacy, con `onclick` inline | ninguna (huérfano, ver abajo) | Bajo (código muerto) |
| `js/pages/planeacion.page.js` | 143 | Controlador de página | Init + generación de planeación standalone | ninguna (`pages/planeacion.html` redirige) | Bajo (código muerto) |
| `js/services/examenes.service.js` | 63 | Servicio | Normalización de payload de examen | dashboard, biblioteca | Bajo |
| `js/pages/batch.page.js` | 61 | Controlador de página | Init de vista legacy de batch | ninguna (`pages/batch.html` redirige) | Bajo (código muerto) |
| `js/ui/batch.ui.js` | 74 | UI | Render de tabla de batch legacy, con `onclick` inline | ninguna (huérfano) | Bajo (código muerto) |
| `js/api/anexos.api.js` | 97 | API | Generar/consultar/regenerar anexos | biblioteca | Bajo |
| `js/api/biblioteca.api.js` | 105 | API | Conjuntos/bloques de Biblioteca | biblioteca | Bajo |
| `js/api/examenes.api.js` | 92 | API | Generar/consultar exámenes + polling de estado | dashboard, biblioteca | Bajo |
| `js/api/listas_cotejo.api.js` | 73 | API | Generar/consultar listas de cotejo | dashboard, biblioteca | Bajo |
| `js/services/listas_cotejo.service.js` | 32 | Servicio | Wrap de sesión para listas de cotejo | dashboard, biblioteca | Bajo |
| `js/services/auth.service.js` | 38 | Servicio | `protegerRuta`, `requireSession`, listener de logout | todas las páginas privadas | Alto (punto único de fallo de auth, aunque pequeño) |
| `js/ui/dashboard.ui.js` | 46 | UI | Render de tabla de batches legacy (estilo Bootstrap, inconsistente con Tailwind del resto) | ninguna (huérfano, no cargado por ningún HTML) | Bajo (código muerto) |
| `js/pages/login.page.js` | 25 | Controlador de página | Login vía Supabase | `pages/login.html` | Bajo |
| `js/main.js` | 30 | Core | Router por nombre de archivo HTML | todas | Medio (punto único de arranque, referencias a páginas muertas) |
| `js/core/config.js` | 23 | Core | `API_BASE_URL` según hostname | todas | Bajo |
| `js/planeacion.js` | 22 | Legacy | `validateForm()`, solo usado por `tests/planeacion.test.js` | ninguna (no cargado por ningún HTML) | Bajo (código muerto, solo test) |
| `js/core/utils.js` | 12 | Core | `escapeHtml()` | todas | Bajo |
| `js/core/supabase.client.js` | 6 | Core | Cliente Supabase (`window.supabase`), anon key pública | todas las páginas privadas + login | Bajo |

## Páginas HTML (`pages/` + `index.html`)

| Archivo | Scripts cargados (orden) | Módulo/clásico | Riesgo |
|---|---|---|---|
| `index.html` | `components.public.js` | clásico, defer | Bajo |
| `pages/login.html` | `components.public.js` → CDN Supabase → `supabase.client.js` → `shared.ui.js` → `auth.service.js` → `login.page.js` → `main.js` | clásico | Bajo |
| `pages/registro.html`, `recuperar.html`, `beneficios.html`, `como_funciona.html`, `contacto.html`, `precios.html` | `components.public.js` | clásico, defer | Bajo |
| `pages/dashboard.html` | `config.js` → CDN Supabase → `supabase.client.js` → `auth.service.js` → `utils.js` → `planeaciones.api.js` → `planeaciones.service.js` → `jerarquia.api.js` → `jerarquia.service.js` → `examenes.api.js` → `examenes.service.js` → `listas_cotejo.api.js` → `listas_cotejo.service.js` → `wordExport.js` → `components.private.js` → `shared.ui.js` → `biblioteca.api.js` → `anexos.api.js` → `dashboard.page.js` → `biblioteca.page.js` → `main.js` | clásico | Crítico (18 scripts en cadena, orden estricto) |
| `pages/archivados.html` | `config.js` → CDN Supabase → `supabase.client.js` → `auth.service.js` → `utils.js` → `jerarquia.api.js` → `jerarquia.service.js` → `planeaciones.api.js` → `planeaciones.service.js` → `components.private.js` → `archivados.page.js` → `main.js` | clásico | Medio |
| `pages/detalle.html` | CDN `xlsx.full.min.js` → `config.js` → CDN Supabase → `supabase.client.js` → `auth.service.js` → `utils.js` → `biblioteca.api.js` → `planeaciones.api.js` → `planeaciones.service.js` → `components.private.js` → `shared.ui.js` → `wordExport.js` → `detalle.ui.js` → `detalle.page.js` → `main.js` | clásico | Medio |
| `pages/batch.html` | ninguno (redirect) | — | Bajo (muerta) |
| `pages/planeacion.html` | ninguno (redirect) | — | Bajo (muerta) |
| `pages/dashboard_tailwind.html` | stack propio, self-contained, sin `main.js` | clásico | Bajo (huérfana) |

## Componentes (`components/*.html`)

| Archivo | Consumido por | Nota |
|---|---|---|
| `navbar.html` | `components.private.js` | Link a Archivados comentado (oculto de la navegación) |
| `navbar_public.html`, `footer_public.html` | `components.public.js` | — |
| `footer.html`, `header.html` | dashboard/archivados | Fragmentos triviales |
| `sidebar.html` | `dashboard.page.js` / `biblioteca.page.js` | Fragmento del árbol de jerarquía (`#explorer-tree`) |
| `layout.html` | `dashboard.page.js` | Shell del explorador: breadcrumbs, modales de creación rápida, examen, lista de cotejo, confirmación de borrado. Contiene un `#delete-confirm-modal` con los mismos ids que el de `archivados.page.js` (HTML duplicado, ver `FRONTEND_AUDIT.md`) |

## Entry points confirmados

`index.html`, `pages/login.html`, `pages/dashboard.html`, `pages/archivados.html`, `pages/detalle.html` son los entry points reales de la aplicación. `pages/batch.html` y `pages/planeacion.html` son redirects puros. `pages/dashboard_tailwind.html` es un entry point huérfano sin enlaces entrantes.

## Responsabilidad objetivo sugerida (dirección, no orden de ejecución)

Ver la arquitectura objetivo ya definida en `AGENTS.md` sección 8 de este mismo repositorio — este mapa no repite esa propuesta, solo confirma que hoy `js/api/`, `js/core/`, `js/services/`, `js/ui/` ya existen como carpetas pero **dentro de ellas persisten violaciones de la separación** (ver `FRONTEND_AUDIT.md`, secciones de funciones con responsabilidades mezcladas).
