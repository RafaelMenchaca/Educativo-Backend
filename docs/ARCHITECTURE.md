# ARCHITECTURE.md — Educativo IA Frontend

> Generado por auditoría de solo lectura. No se modificó código funcional. Ver metodología y limitaciones en `docs/refactor/SESSION_HANDOFF.md`.

Etiquetas usadas: `Hecho:` (evidencia directa en código), `Inferencia:` (deducción razonable no 100% confirmada), `Pendiente de confirmar:` (falta evidencia).

## 1. Arquitectura general actual

El frontend es HTML + JavaScript vanilla (scripts clásicos, sin `type="module"`, sin bundler) organizado por capas dentro de `js/`:

```
js/core/     → config global, cliente Supabase, utilidades (escapeHtml)
js/api/      → wrappers fetch por dominio de backend
js/services/ → orquestación de sesión + normalización de payloads
js/pages/    → controladores de página (uno por página o vista)
js/ui/       → renderizado, componentes, toasts, exportación Word
```

`Hecho:` No hay imports/exports ES6 — todo módulo expone sus funciones asignándolas a `window.<nombre>` al final del archivo, y el orden de carga de `<script>` en cada HTML es lo único que garantiza que una función exista cuando otro script la usa.

## 2. Páginas y su estado

| Página | Ruta HTML | Estado | Evidencia |
|---|---|---|---|
| Landing | `index.html` | ACTIVE | Carga solo `components.public.js` |
| Login | `pages/login.html` | ACTIVE | Stack completo de auth |
| Registro / Recuperar | `pages/registro.html`, `pages/recuperar.html` | ACTIVE (UI), sin lógica de submit conectada | `Hecho:` sin `<form>` con listener de submit — son maquetas |
| Beneficios / Cómo funciona / Precios / Contacto | `pages/*.html` | ACTIVE (marketing estático) | Solo `components.public.js` |
| Dashboard (contenedor de Biblioteca) | `pages/dashboard.html` | ACTIVE | Ver sección 6 |
| Archivados | `pages/archivados.html` | ACTIVE pero **inalcanzable desde la navegación** | `Hecho:` link comentado en `components/navbar.html:27-28` (`<!-- Archivados: temporalmente oculto -->`) |
| Detalle de planeación | `pages/detalle.html` | ACTIVE | Botón `#btn-export-excel` referenciado en JS no existe en este HTML (no-op silencioso, `detalle.page.js:552`) |
| Batch (legacy) | `pages/batch.html` | **MUERTA** | `Hecho:` solo `<meta http-equiv="refresh">` + `location.replace("dashboard.html")`, sin cargar ningún script |
| Planeación standalone (legacy) | `pages/planeacion.html` | **MUERTA** | Igual patrón de redirect |
| Dashboard Tailwind (alterno) | `pages/dashboard_tailwind.html` | **HUÉRFANA** | `Hecho:` no referenciada por ningún link ni por `main.js` |

## 3. Entry points y orquestación

`js/main.js` es un router mínimo: al cargar, detecta el nombre de archivo HTML actual y llama a la función `init*` correspondiente (`initLoginPage`, `initDashboardPage`, `initArchivadosPage`, `initDetallePage`, `initBatchPage`, `planeacionPage.init`), todas expuestas en `window`. `Hecho:` este mapeo referencia `initBatchPage`/`planeacionPage.init`, que nunca se ejecutan porque sus páginas HTML redirigen antes de cargar `main.js`.

## 4. Comunicación con backend

`Hecho:` Todas las llamadas API pasan por `js/api/*.js`, un archivo por dominio (`anexos`, `biblioteca`, `examenes`, `jerarquia`, `listas_cotejo`, `planeaciones`). Cada uno implementa su propio `buildXHeaders`/`parseXJson`/`createXApiError`/`requestXJson` — patrón duplicado 5-6 veces casi idéntico (ver `FRONTEND_AUDIT.md`). El token se obtiene siempre en la capa `js/services/*.js` vía `window.requireSession()` y se pasa como `Authorization: Bearer <token>`; la capa `api/*.js` nunca accede a Supabase directamente.

`js/core/config.js` define `API_BASE_URL` según hostname (`localhost`/`127.0.0.1` → `http://localhost:3000`; cualquier otro host → producción).

## 5. Autenticación

`Hecho:` `js/services/auth.service.js` expone `protegerRuta()` y `requireSession()` en `window`, y suscribe `onAuthStateChange` de Supabase (logout automático + toast + redirect en `SIGNED_OUT`). El cliente Supabase (`js/core/supabase.client.js`) usa la clave pública anon (no la service role).

## 6. Relación Dashboard ↔ Biblioteca (hallazgo estructural clave)

`Hecho:` `pages/dashboard.html` carga en este orden al final: `dashboard.page.js` → `biblioteca.page.js` → `main.js`. `main.js` llama `window.initDashboardPage()`.

Dentro de `initDashboardPage()` (`dashboard.page.js:6019-6023`):

```js
const hasBiblioteca = typeof window.initBiblioteca === "function";
if (hasBiblioteca) { window.BIBLIOTECA_MODE = true; }
```

Como `biblioteca.page.js` siempre se carga antes en el mismo HTML, `window.initBiblioteca` siempre existe, por lo que **`window.BIBLIOTECA_MODE` es siempre `true` en producción**, y `initDashboardPage` termina en `await window.initBiblioteca()` (línea 6044) sin llegar nunca a `hydrateExplorerData()` (rama alcanzable solo si `BIBLIOTECA_MODE` fuera `false`).

Consecuencia directa: dentro de `dashboard.page.js` coexisten dos sistemas:

1. **Un sistema de navegación jerárquica completo y autocontenido** (árbol planteles→grados→materias→unidades, breadcrumbs, render por nivel, modal CRUD de entidades) que, según esta bifurcación, **no se activa nunca en el flujo real de carga**. Ver clasificación detallada en `docs/refactor/LEGACY_HIERARCHY.md`.
2. **Un sub-estado (`explorerState`) y un conjunto de funciones que SÍ siguen activos** porque Biblioteca los consume vía `window`: `explorerState.progress`, `.examPreview`, `.listaCotejoPreview`, `.confirmDelete`; funciones como `ensureExamenes`, `ensureListasCotejo`, `ensureDefaultPlantel`, `generatePlaneacionesFromStaging`; y los wrappers `window.renderExamPreviewModal`, `window.closeExamPreviewModal`, `window.renderListaCotejoPreviewModal`, `window.closeListaCotejoPreview`, `window.downloadExamWord`.

`Inferencia:` esto significa que `explorerState` **no puede tratarse como un bloque monolítico legado** — cualquier extracción futura debe separar el sub-estado realmente compartido con Biblioteca del sub-estado exclusivo de la navegación jerárquica antigua.

`Pendiente de confirmar:` si existe algún otro punto de entrada (test, script de migración, bookmarklet) que cargue `dashboard.page.js` sin `biblioteca.page.js` y active la rama alternativa.

## 7. Flujo Biblioteca (resumen — detalle completo en CURRENT_BEHAVIOR.md)

`biblioteca.page.js` define `window.initBiblioteca`, invocado por `dashboard.page.js`. Internamente mantiene su propio estado (`bibliotecaState`, no exportado directo) y expone una API controlada en `window.biblioteca = {...}` (getters/setters específicos) para que `dashboard.page.js` pueda coordinar creación rápida de bloques. También lee/escribe `window.explorerState` (definido en `dashboard.page.js`) para exámenes y listas de cotejo — acoplamiento bidireccional confirmado en 11 puntos distintos de `dashboard.page.js`.

## 8. Dependencias globales importantes (`window`)

Ver inventario completo en `docs/refactor/FRONTEND_AUDIT.md`, sección "Uso de window". Resumen de los puentes más críticos entre archivos:

| Propiedad | Definida en | Consumida en |
|---|---|---|
| `window.explorerState` | `dashboard.page.js` | `biblioteca.page.js` |
| `window.biblioteca` | `biblioteca.page.js` | `dashboard.page.js` |
| `window.initBiblioteca` / `window.renderBibliotecaContent` | `biblioteca.page.js` | `dashboard.page.js` |
| `window.renderExamPreviewModal` / `window.closeExamPreviewModal` / `window.renderListaCotejoPreviewModal` / `window.closeListaCotejoPreview` / `window.downloadExamWord` | `dashboard.page.js` | `biblioteca.page.js` |
| `window.AppUI.*` (toasts, modal de nombre de descarga, progress pill) | `js/ui/shared.ui.js` | `dashboard.page.js`, `biblioteca.page.js` |
| `window.requireSession` / `window.protegerRuta` | `js/services/auth.service.js` | prácticamente todos los `js/pages/*.js` |
| `window.isArchivedHierarchyScopeHidden` / `window.registerArchivedHierarchyScope` | `js/services/planeaciones.service.js` (registro en `localStorage`) | `dashboard.page.js`, `archivados.page.js` |

## 9. Reglas para no romper la arquitectura durante el refactor

Heredadas de `AGENTS.md` de este repositorio — no se repiten aquí en detalle, solo se referencian: no mover responsabilidades entre capas sin permiso, no cambiar contratos de API, no eliminar código sin clasificarlo primero como `LEGACY_CONFIRMED`, no romper el orden de carga de `<script>`.
