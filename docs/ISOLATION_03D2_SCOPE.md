# Fase 03D2 — superficie funcional para pruebas de aislamiento

Estado: **alcance revisado; harness 03D2 todavía no implementado ni ejecutado**. La Fase 03 continúa abierta.

Esta revisión parte del cierre 03D1 `dd2b34b` (`test(security): validate database isolation metadata`). 03D1 confirmó en Supabase test el inventario catalogal, RLS, grants e integridad agregada; no sustituyó pruebas funcionales A/B/anónimo. Esta sesión inspeccionó únicamente código y documentación versionados, sin conexiones remotas.

## Decisión arquitectónica

Biblioteca, dentro de `pages/dashboard.html`, es el único flujo visual principal vigente de Educativo IA. No existe una pantalla activa de Explorer. El nombre `window.explorerState` y las relaciones de plantel → grado → materia → unidad → tema permanecen como infraestructura técnica con consumidores reales. Archivados continúa como flujo independiente.

Planteles, grados, materias, unidades y temas constituyen una capa relacional heredada y congelada. Quick Create puede leer o crear referencias indispensables, generación puede persistir temas y Archivados puede recorrer scopes, pero estos consumers no reviven la jerarquía como experiencia de usuario. Debe preservarse su compatibilidad sin ampliar rutas, rediseñar contratos, añadir funciones o herramientas, recuperar navegación ni tratarla como owner del producto. Toda funcionalidad nueva se diseña desde Biblioteca.

Un cambio inevitable sobre esa capa requiere autorización explícita, debe responder a una necesidad concreta de Biblioteca o seguridad, mantener alcance mínimo, preservar contratos y demostrar mediante regresión que Biblioteca no se rompe. No se modifica su comportamiento, no se reconstruye su UI, no se refactoriza incidentalmente y no se retiran tablas o rutas sin análisis. Una vulnerabilidad demostrada se documenta y se prepara como corrección mínima separada; no se ignora ni se aplica automáticamente.

## Método y criterios

Se buscaron primero los 19 nombres de tabla y después sus rutas, símbolos, clientes y consumidores. La clasificación principal significa:

- **A — producto activo y prioritario:** tabla directamente owned por Biblioteca o por uno de sus recursos vigentes.
- **B — dependencia interna congelada:** relación o persistencia necesaria sin flujo visual propio; se preserva, pero no se amplía.
- **C — legacy todavía expuesta:** API/policy/grant accesible sin consumidor activo demostrado.
- **D — técnica interna:** worker, job, métricas o aprovisionamiento técnico.
- **E — inerte/candidata a retiro:** sin consumidor ni dependencia operativa demostrada.

Una tabla puede tener clasificación principal A o D y conservar operaciones C: esto identifica rutas adicionales expuestas, sin negar su uso activo.

## Clasificación completa

| Tabla | Clase | Owner y cliente | Consumidores y operaciones comprobadas | Dependencias activas / exposición | Evidencia principal |
| --- | --- | --- | --- | --- | --- |
| `planteles` | B | `jerarquia.routes/controller/service`; cliente de usuario | Quick Create: SELECT y creación de fallback; Archivados: navegación y DELETE. Backend registra SELECT/INSERT/PATCH/archive/DELETE. | Dependencia congelada y padre de grado; no es owner visual. PATCH/archive quedan como superficie legacy expuesta. | `frontend/js/pages/dashboard.page.js:319`; `frontend/js/features/dashboard/quick-create.js:1111`; `frontend/js/pages/archivados.page.js:378`; `src/routes/jerarquia.routes.js:32` |
| `grados` | B | jerarquía; cliente de usuario | Quick Create: SELECT/INSERT; Archivados: SELECT/DELETE. Backend añade PATCH/archive. | Dependencia congelada plantel→grado; no es feature visual. PATCH/archive son exposición adicional. | `quick-create.js:985`; `quick-create.js:999`; `archivados.page.js:378`; `jerarquia.routes.js:38` |
| `materias` | B | jerarquía; cliente de usuario | Quick Create: SELECT/INSERT; Archivados: SELECT/DELETE. Backend añade archive. | Dependencia congelada grado→materia; aporta contexto interno, no ownership de producto. | `quick-create.js:1009`; `quick-create.js:1019`; `archivados.page.js:362`; `jerarquia.routes.js:44` |
| `unidades` | B | jerarquía y generación; cliente de usuario | Quick Create: SELECT/INSERT y POST generación; Archivados: SELECT/DELETE. Backend añade PATCH/archive. | Dependencia congelada; `unidad_id` sigue en contratos de planeaciones, listas y exámenes. | `quick-create.js:1029`; `quick-create.js:1054`; `quick-create.js:875`; `jerarquia.routes.js:49` |
| `temas` | B | jerarquía, planeaciones, listas y exámenes; cliente de usuario; worker admin revalida | Dashboard carga temas; generación crea/resuelve temas y planeaciones; exámenes validan `tema_ids`. Backend expone SELECT/INSERT/DELETE y lectura de planeación por tema. | Dependencia congelada y snapshot interno; no hay CRUD visual independiente. | `dashboard.page.js:408`; `quick-create.js:893`; `planeaciones.service.js:1493`; `examenes.service.js:2830`; `jerarquia.routes.js:55` |
| `planeacion_batches` | A | planeaciones/Biblioteca/exámenes; usuario en lecturas y validación; generación histórica contiene usos admin; worker admin revalida | Biblioteca lista/borrar bloques; generación crea/reutiliza batch; Archivados archiva/restaura/elimina; exámenes validan `batch_id`. | Agrupador visual vigente y relación central. Requiere API y PostgREST adversarial. | `biblioteca.routes.js:7`; `planeaciones.routes.js:25`; `planeaciones.service.js:1245`; `examenes.service.js:1567` |
| `planeaciones` | A | planeaciones/Biblioteca/jerarquía; cliente de usuario en CRUD; generación persiste resultados | Biblioteca/Detalle/Archivados/exportación; SELECT/INSERT/UPDATE `tabla_ia`/archive/restore/DELETE. | `tema_id`, `unidad_id` indirecta y `batch_id` activos; owner ya endurecido en 03B para PUT. | `planeaciones.routes.js:23`; `planeaciones.service.js:738`; `planeaciones.service.js:943`; `frontend/js/pages/detalle.page.js` |
| `anexos` | A | anexos service; controller crea cliente de usuario; el service conserva fallback admin que debe evaluarse | Biblioteca: generar, regenerar, consultar, preview/download y DELETE; SELECT/INSERT/UPDATE/DELETE. | Derivado de planeación y batch; exposición directa vigente. | `anexos.routes.js:14`; `anexos.service.js:239`; `anexos.service.js:415`; `anexos.service.js:539` |
| `listas_cotejo` | A | listas service/controller; controller aporta cliente de usuario, pero el service conserva fallback admin | Biblioteca: generar por selección, consultar, preview/download y DELETE; SELECT/INSERT/DELETE. Hay flujo legacy por unidad. | Relación activa con planeación/unidad; la ruta por unidad debe distinguirse del flujo por `planeacion_ids`. | `listas_cotejo.routes.js:13`; `listas_cotejo.service.js:27`; `listas_cotejo.service.js:272`; `listas_cotejo.service.js:583` |
| `examenes` | A | exámenes; usuario para lectura/delete, worker admin para persistencia validada | Biblioteca: solicitud, polling, preview/download y DELETE; SELECT/INSERT(worker)/DELETE. | Depende de unidad, temas, planeaciones, batch y generation job. | `examenes.routes.js:13`; `examenes.service.js:2405`; `examenes.service.js:3101`; `examenes.service.js:3159` |
| `examen_generation_jobs` | D | petición/polling con cliente de usuario; worker con admin después de validar autoridad | INSERT de preparación, GET polling, UPDATE de estados/resultado, fixture terminal de harness, cleanup acotado. | Superficie HTTP activa de polling; no es CRUD pedagógico. 03C validó polling real, pero CRUD directo RLS sigue pendiente. | `examenes.routes.js:15`; `examenes.service.js:1472`; `examenes.service.js:2859`; `examenes.service.js:3073` |
| `examen_generation_items` | D | creación con cliente de usuario; worker admin acotado por autoridad | INSERT al preparar; SELECT/UPDATE por worker. Sin consumidor HTTP directo ni UI. | Hijo técnico de job/tema; probar relaciones y privilegios directos sin generar. | `examenes.service.js:1492`; `examenes.service.js:1556`; `examenes.service.js:3026` |
| `ai_generation_jobs` | D | `aiMetrics.service.js`; admin backend | INSERT/SELECT/UPDATE para observabilidad de generación. Sin ruta ni consumidor frontend. | Grants/policies permiten superficie directa más amplia que el owner interno; prueba técnica dirigida, sin IA. | `aiMetrics.service.js:87`; `aiMetrics.service.js:138`; `aiMetrics.service.js:175` |
| `ai_generation_calls` | D | `aiMetrics.service.js`; admin backend | INSERT y lectura del job para acumulación; sin ruta/frontend. | Debe probarse asociación cruzada job/user y acceso directo, no un flujo de generación. | `aiMetrics.service.js:201`; `aiMetrics.service.js:236` |
| `ai_model_prices` | D | `aiMetrics.service.js`; admin backend | SELECT con caché; no UI ni escritura de aplicación. | Dato técnico global; 03D2 solo verifica lectura esperada y denegación de mutación directa si se incluye. | `aiMetrics.service.js:52`; `aiMetrics.service.js:61` |
| `profiles` | D | trigger `handle_new_user`; sin consumidor JS directo | Aprovisionamiento Auth; policies permiten SELECT/INSERT/UPDATE propios. | Contiene perfil/PII y queda fuera de los fixtures pedagógicos. Probar exposición mínima separada o transferir endurecimiento a 03D3. | `docs/test-environment/README.md:52`; `docs/ISOLATION_03D1.md:33` |
| `user_profiles` | C | sin owner de aplicación; sin trigger ni consumidor JS | Solo policies/grants directos S/I/U propios. | Legacy expuesta y candidata a retiro o restricción; campos tester no son autoridad. Una prueba mínima de exposición puede preceder 03D3, sin construir flujo de perfil. | `docs/test-environment/README.md:53`; `docs/ISOLATION_03D1.md:34` |
| `user_settings` | D | trigger `handle_new_user`; sin consumidor JS directo | Aprovisionamiento técnico; policies S/I/U propios. | Persistencia creada por Auth, actualmente sin UI. No pertenece al harness de Biblioteca. | `docs/test-environment/README.md:54`; `docs/ISOLATION_03D1.md:35` |
| `ia_metrics_legacy` | E | ningún consumidor; solo referencia histórica | Ninguna operación de aplicación. RLS sin policy; service escribe por separado a la tabla ausente `ia_metrics`. | No crear fixtures. Resolver nombre/retirada en una sesión específica, no en 03D2. | `planeaciones.service.js:731`; `docs/test-environment/README.md:56` |

### Clientes y acceso directo

Todas las rutas enumeradas están montadas bajo `/api` y usan `requireAuth`. Los controllers de usuario crean `createUserClient(req.accessToken)`. Las excepciones internas observadas son `aiMetrics.service.js` y el worker de exámenes. Además, `planeaciones.service.js` conserva usos admin en creación/reutilización de batches, y Planeaciones, Anexos y Listas conservan helpers `supabaseClient || supabaseAdmin`; son límites a probar o endurecer en 03D3, no una razón para ampliar 03D2 a generación real.

El frontend no hace PostgREST directo contra las 19 tablas públicas. Sus requests de aplicación pasan por `js/api/*.api.js`; el cliente Supabase del navegador se usa para Auth y Storage. Esto no elimina la superficie PostgREST: los grants y policies live de 03D1 hacen necesarias pruebas directas A/B/anónimo separadas de las pruebas de API.

## Jerarquía: respuestas verificadas

- **Pantalla propia:** no existe una pantalla activa de planteles/grados/materias/unidades/temas ni Explorer visual.
- **Biblioteca:** carga conjuntos mediante `/api/biblioteca/conjuntos`; no consulta directamente las tablas jerárquicas. El Dashboard carga jerarquía para Quick Create en el mismo entrypoint.
- **Quick Create:** lista toda la jerarquía, crea plantel de fallback y crea/resuelve grado, materia y unidad. Los temas se mantienen inicialmente en staging y se persisten al generar planeaciones por unidad.
- **Generación:** requiere una `unidad_id` real; recibe temas y conserva `tema_id`/`tema_ids`. No son nombres decorativos.
- **Batches:** conservan IDs de plantel, grado, materia y unidad, además del contexto textual.
- **Exámenes:** validan unidad, temas, planeaciones y, si existe, batch; el worker vuelve a recorrer la jerarquía con admin.
- **Rutas legacy:** las rutas de actualización, archive y delete jerárquicos siguen registradas y autenticadas. Algunas tienen consumidor en Archivados; las demás pueden llamarse directamente aunque la UI no las exponga.
- **Grants:** no es seguro revocarlos en bloque. Quick Create y generación acceden mediante clientes de usuario sujetos a RLS. Primero deben identificarse los privilegios exactos usados por API/REST; 03D3 puede retirar operaciones sobrantes sin romper SELECT/INSERT activos.

## Revisión de la matriz de 310 casos

La matriz conserva 310 filas y no cambia en esta sesión. Su distribución es:

| Familia de recurso | Filas | Decisión de alcance |
| --- | ---: | --- |
| Planteles | 24 | No ejecutar como CRUD funcional. Usar solo como precondición mínima; transferir rutas sobrantes y hardening a 03D3. |
| Grados | 28 | Reducir a la relación plantel→grado necesaria para fixtures; rutas legacy quedan trazadas para 03D3. |
| Materias | 24 | Reducir a la relación grado→materia necesaria; no recrear CRUD visual. |
| Unidades | 28 | Usar `unidad_id` como precondición de batches/planeaciones/derivados; no probar navegación jerárquica. |
| Temas | 24 | Usar `tema_id`/`tema_ids` como relaciones de recursos activos; no montar CRUD independiente. |
| Batches | 27 | Conservar como núcleo de Biblioteca; agrupar operaciones por fixture. |
| Planeaciones | 28 | Conservar núcleo API + PostgREST; reutilizar evidencia automática/manual 03B sin presentarla como RLS directa. |
| Anexos | 27 | Conservar CRUD/relaciones activas y fallback de cliente como riesgo. |
| Listas | 27 | Conservar flujo por selección; reducir repetición del camino legacy por unidad. |
| Exámenes | 31 | Conservar acceso/relaciones; evitar cualquier generación real. |
| Jobs de examen | 26 | Conservar polling y mutaciones directas mínimas; 03C ya cubre autoridad simulada y polling real. |
| Items de examen | 16 | Convertir a aserciones relacionales dentro de un job terminal; sin CRUD independiente. |

Las 128 filas de plantel/grado/materia/unidad/tema conservan trazabilidad, pero no representan 128 pruebas funcionales que deban ejecutarse. Se separan en: relaciones mínimas todavía necesarias para fixtures de Biblioteca; rutas legacy sin consumidor visual; comprobaciones agrupadas que acrediten que un padre ajeno no puede contaminar un recurso activo; y operaciones sobrantes que deben evaluarse para hardening en 03D3. La capa solo aparece como precondición, ID relacional, riesgo o requisito de cleanup. No se presenta como feature activa ni se construye un harness CRUD dedicado.

La matriz no incluye perfiles/settings ni las tres tablas de métricas modernas. No se deben añadir al harness principal solo para perseguir el total catalogal: requieren un grupo técnico pequeño, condicionado por el plan de grants de 03D3. `ia_metrics_legacy` queda fuera de fixtures.

## División mínima propuesta para 03D2

### 03D2A — Biblioteca, batches y planeaciones

- **Tablas objetivo:** `planeacion_batches` y `planeaciones`; la jerarquía congelada solo aporta IDs mínimos.
- **Operaciones:** listados de Biblioteca; batch propio/cruzado/anónimo; planeación propia/cruzada/anónima; planeación con batch ajeno; UPDATE/DELETE de contratos vigentes; ausencia de efectos.
- **Fixtures:** reutilizar fixtures sintéticos controlados cuando sea seguro o crear solo las referencias indispensables. Registrar en ledger cada ID creado sin convertir padres jerárquicos en objeto de prueba.
- **Transporte:** API local para contratos vigentes y PostgREST directo para RLS/grants.
- **Sin IA:** insertar fixtures mínimos compatibles; no llamar `/generar` ni OpenAI.
- **Cleanup:** planeaciones y batches antes de las referencias mínimas creadas; solo IDs confirmados.
- **Riesgo:** batches todavía tienen usos admin en el flujo de generación; el harness debe evitar esa ruta y medir RLS directamente.

### 03D2B — Recursos vigentes de Biblioteca

- **Tablas:** `anexos`, `listas_cotejo`, `examenes` sobre las planeaciones/unidades/batches de 03D2A.
- **Operaciones:** lectura/listado propio y cruzado, creación directa sintética, owner falsificado, padre ajeno, update solo donde existe contrato, delete propio/cruzado.
- **Transporte:** API local para GET/DELETE y PostgREST para INSERT/UPDATE relacional que no deba disparar IA.
- **Sin IA:** nunca llamar endpoints de generación/regeneración.
- **Cleanup:** derivados antes de planeaciones y jerarquía.
- **Riesgo:** confirmar columnas obligatorias y estados terminales desde esquema antes de crear fixtures.

### 03D2C — Superficie técnica y legacy expuesta

- **Tablas:** `examen_generation_jobs/items`; después, un bloque separado y opcional para `ai_generation_jobs/calls` y `ai_model_prices`.
- **Operaciones:** polling propio/cruzado/anónimo ya reproducible, INSERT/UPDATE/DELETE directo controlado, job→item/tema/owner cruzado, y verificación de que el cliente no puede usar privilegios técnicos indebidos.
- **Fixtures:** job terminal sin worker y, solo si el caso lo exige, item terminal mínimo. Para métricas, no crear fixture hasta confirmar cleanup de usuario y constraints.
- **Transporte:** API GET de polling y PostgREST directo. No usar service role.
- **Sin IA:** no POST `/api/examenes/generate` o `/generar`; ningún timer/worker.
- **Cleanup:** item→job; incertidumbre separada y reintento seguro como en los harnesses 03A/03C.
- **Riesgo:** limitarse a la evidencia mínima para diseñar 03D3. `user_profiles`, routes legacy, profiles/settings y grants globales no justifican nuevas experiencias ni CRUD exhaustivo.

## Primer harness recomendado

Implementar primero **03D2A** alrededor de Biblioteca. El runner debe separar `prepare`, `execute` y `cleanup`; validar test/local antes de cada request; usar solo tokens A/B y clave pública; reservar y registrar todos los IDs; comparar snapshots para rechazos; y emitir evidencia distinta para API y PostgREST. Las referencias jerárquicas se reutilizan o se crean únicamente como precondición mínima y nunca se presentan como objetivo del harness.

El primer corte debe priorizar:

1. listados de Biblioteca sin recursos ajenos;
2. batch y planeación propios/ajenos/anónimos;
3. owner falsificado;
4. asociación de una planeación propia con batch ajeno y, solo donde el fixture activo lo exija, una comprobación agrupada de relación jerárquica ajena;
5. actualización y delete con ausencia de efecto;
6. cleanup inverso verificable.

No debe probar generación, SSE, worker, OpenAI, Storage ni recrear una navegación Explorer.

## Continuidad de fases

- Fases 00–02 cerraron auditoría, contratos y separación de ambientes sin reintroducir la jerarquía visual.
- 03A auditó y preparó harnesses; no cambió comportamiento funcional.
- 03B endureció el guardado de planeaciones usado desde Detalle/Biblioteca.
- 03C endureció exámenes y jobs consumidos desde Biblioteca.
- 03D1 verificó metadata mediante consultas read-only.
- La regresión completa de Biblioteca permanece para 03F.

Esta continuidad no constituye certificación E2E. 03D2 conserva pruebas funcionales pendientes y la Fase 03 sigue abierta.

## Pendientes para 03D3

- Determinar qué routes jerárquicas de PATCH/archive/DELETE carecen de consumidor y pueden retirarse o limitarse.
- Reemplazar fallbacks admin de cadenas directas de usuario, especialmente Anexos y usos de batch, cuando la evidencia funcional lo permita.
- Reducir grants amplios, roles `PUBLIC`, `TRUNCATE` y privilegios técnicos según operaciones realmente necesarias.
- Endurecer relaciones de propietario común mediante policy/trigger/RPC según los resultados adversariales.
- Resolver atomicidad/reconciliación de jobs heredada de 03C.
- Decidir destino de `user_profiles` e `ia_metrics_legacy` y la discrepancia `ia_metrics`.

03D1 permanece completada y validada por metadata read-only. 03D2 queda diseñada, no implementada. Ningún caso nuevo de la matriz se marca PASS.
