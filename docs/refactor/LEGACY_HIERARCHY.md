# LEGACY_HIERARCHY.md — Inventario de código relacionado con jerarquías

> Clasificación según `AGENTS.md`: `ACTIVE` (participa del flujo vigente), `COMPATIBILITY` (puente temporal necesario), `LEGACY_CONFIRMED` (evidencia clara de que no tiene consumidores actuales), `UNKNOWN` (evidencia insuficiente). No se elimina nada en esta sesión, incluso lo marcado `LEGACY_CONFIRMED`.

## Advertencia importante encontrada durante la auditoría

`Hecho:` El vocabulario "jerarquía" (plantel/grado/materia/unidad/tema, árbol, explorador) aparece en **dos contextos completamente distintos** que no deben confundirse:

1. **Dentro de `dashboard.page.js`**: un sistema de navegación jerárquica que, por la bifurcación de `initDashboardPage()` (ver `ARCHITECTURE.md` sección 6), es mayormente inalcanzable en producción porque `window.BIBLIOTECA_MODE` es siempre `true`.
2. **Dentro de `js/api/jerarquia.api.js`, `js/services/jerarquia.service.js` y `js/pages/archivados.page.js`**: el mismo vocabulario de jerarquía, pero **activo y consumido en runtime** — es el sistema que sostiene el árbol de restauración/eliminación de `pages/archivados.html`.

No se debe clasificar código como legado solo por usar las palabras "plantel/grado/materia/unidad". Cada bloque se evalúa por evidencia de alcanzabilidad real.

---

## A. Código en `dashboard.page.js`

| Elemento | Líneas | Clasificación | Evidencia | Consumidores | Acción futura sugerida |
|---|---|---|---|---|---|
| `explorerState` (estructura completa del objeto) | 1–53 | **COMPATIBILITY** | Subcampos `progress`, `examPreview`, `listaCotejoPreview`, `confirmDelete` son leídos/escritos desde `biblioteca.page.js` (confirmado). Subcampos de navegación pura (`planteles`, `gradosByPlantel`, `current.level`, `expandedPlanteles`) no aparecen referenciados en `biblioteca.page.js` | `biblioteca.page.js` (parcial) | No eliminar el objeto completo. Requiere sesión dedicada para separar sub-estado compartido de sub-estado exclusivo de navegación legado (ver `REFACTOR_BACKLOG.md`) |
| `loadPlanteles`, `ensureGrados/Materias/Unidades/Temas` | 647-767 | **LEGACY_CONFIRMED (parcial) / ACTIVE (parcial)** | `ensureTemas` alimenta `explorerState.temasByUnidad`, consumido por modales de examen/lista que sí se disparan desde acciones accesibles en modo Biblioteca. `loadPlanteles`/`ensureGrados/Materias/Unidades` (nivel plantel→unidad) solo se usan en flujos de navegación del árbol legado o en `submitQuickCreateForm`/`ensureDefaultPlantel`, que sí siguen activos porque Biblioteca reutiliza un "plantel por defecto" como contenedor técnico | `submitQuickCreateForm`, `ensureDefaultPlantel` (activos); árbol legado (inactivo) | UNKNOWN hasta separar ambos usos función por función |
| `ensureExamenes`, `ensureListasCotejo` | 787-813 | **ACTIVE** | Alimentan `explorerState.examenesByUnidad`/`listasCotejoByUnidad`, consumidos por `renderUnitExamModal`/`submitUnitExamModal`, accesibles vía `data-content-action` | Modal de examen por unidad (dashboard) | Mantener |
| `selectRoot/Plantel/Grado/Materia/Unidad` | 846-890 | **LEGACY_CONFIRMED (mayoría)** | Invocadas desde `handleTreeClick`/`handleBreadcrumbClick`/`handleContentClick`, atadas a contenedores DOM (`#explorer-tree`, `#explorer-breadcrumbs`) que `initDashboardPage` **no inyecta** cuando `hasBiblioteca` es true (omite `injectComponent("dashboard-sidebar-slot", ...)`, líneas 6028-6030) | Ninguno confirmado en modo Biblioteca | Candidato a extracción/aislamiento en sesión dedicada tras validar en runtime |
| `renderSidebarTree`, `renderGradoNodes`, `renderMateriaNodes`, `renderUnidadNodes` | 3509-3634 | **LEGACY_CONFIRMED** | Solo escriben sobre `#explorer-tree`; `renderWorkspaceVisibility()` hace `return` inmediato si `BIBLIOTECA_MODE` (línea 971); la función igual se llama desde `renderAll()` (línea 4554) pero corta en su guard `if (!count || !tree) return` (línea 3594) porque el contenedor no existe — probablemente no-op | Ninguno | Aislar y validar antes de eliminar |
| `renderRootLevel/PlantelLevel/GradoLevel/MateriaLevel` | 3635-3863 | **LEGACY_CONFIRMED** | Solo alcanzables vía `renderExplorerContent()`, que hace `return` temprano si `BIBLIOTECA_MODE && typeof window.renderBibliotecaContent === "function"` (línea 4526) | Ninguno | Aislar y validar antes de eliminar |
| `renderUnidadLevel` | 4389-4523 | **ACTIVE (mixto)** | Aunque forma parte de la rama "else" de `renderExplorerContent`, reutiliza internamente `renderExamSection`/`renderListaCotejoSection`/staging, piezas que sí parecen reutilizadas por Biblioteca a través de otros ganchos — no confirmado al 100% sin leer el HTML completo de Biblioteca | UNKNOWN — requiere validación en runtime | No tocar sin validación funcional |
| `renderBreadcrumbs`, `handleBreadcrumbClick` | 1010-1037, 5453-5467 | **LEGACY_CONFIRMED** | Atado a `#explorer-breadcrumbs`, mismo argumento que el árbol | Ninguno | Aislar y validar |
| `hydrateExplorerData`, `restorePersistedExplorerLocation`, `getPersistedExplorerLocation`/`persistExplorerLocation` | 892-969, 5995-6017 | **LEGACY_CONFIRMED** | `hydrateExplorerData` solo se llama desde la rama de `initDashboardPage` inalcanzable (línea 6052, después del `return` en 6048) | Ninguno directo | Candidato de eliminación tras confirmar en runtime |
| `refreshExplorerAfterReturn` | referenciada en listener `pageshow` (5987) | **ACTIVE (efecto colateral no deseado aparente)** | **Sí se ejecuta siempre**, sin guard de `BIBLIOTECA_MODE`, y dispara `loadPlanteles()` en cada evento `pageshow` de tipo back/forward — posible llamada de red innecesaria incluso en modo Biblioteca | Listener global de `window` | `Riesgo:` no es legado inactivo, es una llamada de red superflua activa. Documentar como hallazgo operativo, no confundir con limpieza de legado |
| Combobox en ramas `!window.BIBLIOTECA_MODE` (`plantelCombobox`, `unidadCombobox` con `requireQuickComboboxValue`) | 3477-3507, 4941-4950, 5583-5690 | **LEGACY_CONFIRMED** | Ramas explícitas `if (!window.BIBLIOTECA_MODE)` — código muerto en producción actual dado el hallazgo estructural | Ninguno | Eliminar en sesión dedicada tras validación |
| `openEntityModal`/`submitEntityModal`/`configureEntityModalFields` (CRUD plantel/grado/materia/unidad vía modal genérico) | 5130-5363 | **UNKNOWN** | Alcanzables vía `data-content-action="create-plantel"` etc.; no se confirmó si el marcado de Biblioteca expone botones con esos atributos | No confirmado | Requiere lectura cruzada del HTML/JS completo de Biblioteca en sesión futura |
| `getDeleteDialogConfig`/`getArchiveDialogConfig` para tipos `plantel/grado/materia/unidad` | 2329-2567 | **UNKNOWN, probablemente COMPATIBILITY** | Alcanzables solo si `handleContentClick` recibe `data-content-action="delete-plantel"` etc. (línea 5520), generado por render legado. Los tipos `archive-planeacion`/`archive-batch`/`delete-planeacion` sí pueden originarse desde Biblioteca (comparten el mismo modal genérico) | Parcial — depende del tipo de entidad | No separar sin verificar cada tipo individualmente |

## B. Código en `js/api/jerarquia.api.js` + `js/services/jerarquia.service.js`

| Elemento | Archivo | Clasificación | Evidencia | Consumidores | Acción futura sugerida |
|---|---|---|---|---|---|
| CRUD completo planteles→grados→materias→unidades→temas | `jerarquia.api.js` (todo el archivo), `jerarquia.service.js` (todo) | **ACTIVE** | Consumido en runtime por `archivados.page.js` (líneas 350-414: `obtenerUnidadesPorMateria`, `obtenerMateriasPorGrado`, `obtenerGradosPorPlantel`, `eliminarPlantel/Grado/Materia/Unidad`) y por las partes activas de `dashboard.page.js` descritas en la sección A | `archivados.page.js`, `dashboard.page.js` (parcial) | Mantener — es el sistema de jerarquía vigente, no debe tocarse como si fuera legado |

## C. Código en `js/pages/archivados.page.js`

| Elemento | Líneas | Clasificación | Evidencia | Consumidores | Acción futura sugerida |
|---|---|---|---|---|---|
| `ARCHIVED_SCOPE_ORDER`, `ARCHIVED_HIDDEN_COLLECTIONS`, `ARCHIVED_LEVEL_LABELS` | 28-49 | **ACTIVE** | Árbol de restauración/eliminación por rama jerárquica con anidamiento real (`ensureBranchStructure`, 393-437) | `pages/archivados.html` | Mantener |
| `treeRoot`, `createTreeNode`, `renderTreeNode` | 257-336, 709-745 | **ACTIVE** | Construye y renderiza árbol real de ramas archivadas (plantel→grado→materia→unidad→planeación) | `pages/archivados.html` | Mantener |

## D. Otros usos del vocabulario de jerarquía

| Término | Archivo:línea | Clasificación | Evidencia |
|---|---|---|---|
| `grado`/`materia`/`unidad` en formulario de registro | `pages/registro.html:62-70, 75-77` | **ACTIVE (contexto distinto)** | Es "nivel educativo"/"materia principal" del perfil de usuario, no jerarquía de contenidos. El formulario no tiene submit handler conectado (ver `FRONTEND_MAP.md`) — activo como maqueta de UI, no como lógica funcional |
| `explorer` (clases CSS `explorer-sidebar`, `explorer-tree`, `explorer-hero`) | `components/sidebar.html`, `components/layout.html`, `pages/archivados.html` | **ACTIVE** | Es el nombre de la feature "explorador" tal cual existe hoy — no es un residuo de un sistema anterior, es el sistema de navegación jerárquica vigente para Archivados y (parcialmente) Dashboard |
| `breadcrumb` (`#explorer-breadcrumbs`) | `components/layout.html:41` | **LEGACY_CONFIRMED (probable)** | Contenedor poblado por las funciones de breadcrumb de `dashboard.page.js` clasificadas como legado en la sección A | Ver sección A |

## Resumen cuantitativo

| Clasificación | Elementos identificados |
|---|---|
| `ACTIVE` | 9 (jerarquía en `archivados.page.js` + `jerarquia.api/service.js` + subcampos compartidos de `explorerState` + `ensureExamenes`/`ensureListasCotejo` + `renderUnidadLevel` mixto) |
| `COMPATIBILITY` | 1 (`explorerState` como estructura completa, hasta que se separe) |
| `LEGACY_CONFIRMED` | 9 bloques de funciones/ramas en `dashboard.page.js` (navegación jerárquica, render de árbol/niveles/breadcrumbs, hidratación, ramas `!BIBLIOTECA_MODE`) |
| `UNKNOWN` | 2 (modal genérico de entidad CRUD, diálogos de eliminación/archivado por tipo) |

## Riesgos de eliminación

- Ningún elemento debe eliminarse sin verificación funcional en navegador (no solo estática), dado que esta auditoría es de solo lectura.
- `explorerState` no puede tratarse como bloque único — separar antes de tocar.
- `refreshExplorerAfterReturn` (listener `pageshow`) es un hallazgo operativo activo, no legado — no debe eliminarse junto con el resto del árbol, requiere su propia decisión (¿guardar con `BIBLIOTECA_MODE` o eliminar la llamada a `loadPlanteles()`?).
- El vocabulario compartido entre sistema activo (`archivados.page.js`, `jerarquia.api.js`) y sistema legado (`dashboard.page.js`) hace que cualquier búsqueda-y-reemplazo global sea peligrosa — prohibido por `AGENTS.md` regla 18.

## Orden futuro de limpieza sugerido (no ejecutar en esta sesión)

1. Validar en navegador (con DevTools) que los contenedores `#explorer-tree`/`#explorer-breadcrumbs`/niveles legado efectivamente no existen en el DOM cuando se navega a `dashboard.html` en producción.
2. Separar `explorerState` en sub-estados con propietario claro (compartido con Biblioteca vs. exclusivo de navegación legado).
3. Aislar (no eliminar) las funciones `LEGACY_CONFIRMED` detrás de un flag explícito, en vez de depender implícitamente de `BIBLIOTECA_MODE`.
4. Solo entonces, en una sesión dedicada y autorizada explícitamente, eliminar el código aislado sin consumidores confirmados.
