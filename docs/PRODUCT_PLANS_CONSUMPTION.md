# Planea: contrato de producto para planes y consumo

Fecha: 2026-09-23. Sesión 01. Estado: decisiones de producto documentadas; planes y cuotas **no implementados**.

## Autoridad, alcance y línea base

Este es el documento canónico de reglas comerciales confirmadas en la sesión 01. Los README de ambos repositorios remiten aquí; no mantener otra matriz comercial. Las propuestas y preguntas de este documento no son decisiones aprobadas. El código determina el comportamiento técnico actual, no demuestra que las reglas comerciales ya estén aplicadas ni que producción esté validada.

Fuentes técnicas: [contratos IA](AI_GENERATION_CONTRACTS.md), [schema documental](DATABASE_SCHEMA.md), [arquitectura backend](03-backend-guide.md), [arquitectura frontend](../../frontend/docs/ARCHITECTURE.md) y [mapa frontend](../../frontend/docs/FRONTEND_MAP.md). Los enlaces entre repositorios suponen el checkout hermano `frontend/` y `backend/`; en otros layouts localizar esos mismos archivos, sin copiar este contrato.

Línea base inspeccionada, ambos en `work/features`, con árboles limpios al inicio:

- Frontend: `b4314ce5e69ceecfa11f19e719848d329906d684`. Ya contiene la contención de 00.1 en registro, recuperación y contacto y su nota en README. Se conserva sin cambios de comportamiento. **La prueba manual de 00.1 sigue pendiente**; el commit no constituye evidencia de aprobación manual.
- Backend: `976fc5e35ca8a0280050f68480399404c0424ec6`.

Esta sesión solo modifica documentación. No asigna planes, modifica cuentas, implementa cuotas, crea migraciones o integra pagos. Se preservan Biblioteca como UI principal, `explorerState`, orden de scripts clásicos, Auth/RLS y contratos `unidad_id`, `planeacion_ids`, `tema_ids`, `batch_id`, `force_new_batch`, SSE, jobs y polling. Bloque, batch y unidad técnica no son unidades comerciales intercambiables.

## 1. Decisiones confirmadas

### Plan Inicio

| Concepto | Regla confirmada |
| --- | --- |
| Precio | Gratuito. |
| Planeaciones | 3 por mes y por usuario, sumadas entre todos sus bloques. Cada planeación generada para un tema es una unidad. |
| Anexos | 1 por mes. La correspondencia exacta con el recurso compuesto del código queda propuesta en la sección 3. |
| Listas de cotejo | 1 por mes. Correspondencia propuesta en la sección 3. |
| Exámenes | 1 por mes. Correspondencia propuesta en la sección 3. |
| Periodo | Las cuatro cuotas se renuevan el día 1 de cada mes según `America/Mexico_City`; no usar la zona del navegador o del servidor como sustituto. |
| Acumulación | Las unidades no utilizadas no se acumulan. |
| Solicitud de planeaciones superior al saldo | Generar únicamente las disponibles, respetando el orden de selección. Antes de ejecutar, mostrar qué temas se generarán y cuáles quedarán pendientes. |
| Consumo | Solo resultados generados y guardados correctamente. Fallos no consumen. |
| Reintento técnico | No duplica el consumo de un resultado ya contabilizado. |
| Nueva regeneración solicitada | Consume si termina correctamente, aunque técnicamente actualice una fila existente. |
| Eliminación | No devuelve cuota. |
| Edición manual, consulta y descarga | No consumen generación. |

Las cuotas de recursos son independientes: usar una no descuenta las otras. La regla de recortar una selección y avisar está confirmada para planeaciones; no extenderla automáticamente a lotes de anexos o listas sin resolver la pregunta correspondiente.

### Plan Pro

- Precio confirmado: **150 MXN al mes**.
- Límites pendientes del análisis de costes. **No asumir uso ilimitado.**
- Tratamiento de impuestos, proveedor de pagos y ciclo de cuota Pro pendientes. No trasladar automáticamente el calendario de Inicio a Pro.
- Los textos actuales de landing/precios no son una implementación de planes y no se cambian en esta sesión. Las capacidades no confirmadas allí, incluido el alcance institucional, no añaden decisiones a este contrato.

### Usuarios existentes

Hay cuentas registradas, pero no existe una política aprobada de beta testers. No se ha aprobado asignación automática de plan ni excepciones. Los defaults documentales `user_profiles.role='tester'` e `is_test_user=true` no conceden privilegios comerciales. No se modifican cuentas ni datos; queda pendiente su política de incorporación.

## 2. Correspondencia técnica observada

En esta sección, `F/` significa raíz frontend y `B/` raíz backend. Los tipos de ID y constraints se describen según el snapshot, no como schema live verificado. Las rutas están montadas bajo `/api` y usan `requireAuth`. Un HTTP satisfactorio, una card optimista, una fila pending o un job de métricas no prueban por sí solos un nuevo resultado comercial guardado.

### Planeaciones

- **Entrada vigente:** `F/js/features/planeaciones/planeacion-generation.js`, `PlaneacionGeneration.generateFromBiblioteca`, y Quick Create en `F/js/features/dashboard/quick-create.js` → `generarPlaneacionesUnidadConProgreso` en `F/js/services/jerarquia.service.js` → `apiUnidadGenerarConProgreso` en `F/js/api/jerarquia.api.js` → `POST /api/unidades/:unidadId/generar` → `generarPlaneacionesPorUnidad` en `B/src/controllers/jerarquia.controller.js` → `generarPlaneacionesIAPorUnidad` en [planeaciones.service.js](../src/services/planeaciones.service.js).
- **Unidad solicitada:** arreglo ordenado `temas` dentro de una unidad técnica, con contexto de batch. El servicio recorre `normalizedTemas` por índice. No hay recorte comercial ni aviso de saldo implementados.
- **Cardinalidad:** para N temas, de 0 a N resultados terminados. También pueden persistir temas y filas de planeación incompletas: `createPendingPlaneacion` inserta antes de la llamada IA y después se actualiza a `generating`, `ready` o `error`. Contar filas creadas o `planeaciones.length` no equivale a contar éxitos.
- **Identidad:** `planeaciones.id` bigint; `tema_id` UUID; `batch_id` agrupa, no identifica una unidad consumida.
- **Persistencia/éxito:** actualización con `tabla_ia` y `status='ready'`, sin error de DB; `resultados`/`results` contienen `planeacion_id` y `status='ready'`; SSE `item_completed`; resumen `success_count`, `error_count`, `skipped_count`. La lectura final puede incluir filas fallidas y puede fallar después de escrituras previas. `done` significa fin del stream, no éxito de todos los temas.
- **Parciales/reintentos:** cada tema puede fallar y el lote continúa; duplicados detectados al crear tema producen `skipped`/`item_skipped`. `generarTablaIa` contempla dos intentos de parsing y después una tabla fallback, que puede guardarse como `ready`. Su clasificación comercial requiere decisión: no equiparar automáticamente `ready` con contenido IA válido.
- **Regeneración:** no hay endpoint dedicado para regenerar una planeación existente. El flujo por unidad crea una fila pending y la actualiza como parte de la misma generación; esa actualización no es una segunda generación. Repetir la solicitud puede crear nuevos temas/filas o encontrar duplicados; no constituye un protocolo idempotente de regeneración.
- **Otra entrada aún expuesta:** `POST /api/planeaciones/generate` → `generarPlaneaciones` en `B/src/controllers/planeaciones.controller.js` → `generarPlaneacionesIA`/`generarPlaneacionesIAConProgreso`. Inserta una fila por tema generado, con posibles fallos parciales; no actualiza por defecto una planeación previa. Las futuras cuotas deben cubrir también esta entrada, sin reinterpretar su `unidad` numérica como `unidad_id` UUID.

### Anexos

- **Entrada vigente:** `F/js/features/anexos/anexo-generation.js`, `AnexoGeneration.generateFromBiblioteca` itera `selectedIds` → `apiGenerarAnexo` en `F/js/api/anexos.api.js` → `POST /api/anexos/generate` → `postGenerarAnexo` en `B/src/controllers/anexos.controller.js` → `generarAnexo` en [anexos.service.js](../src/services/anexos.service.js).
- **Unidad solicitada:** un `planeacion_id` por request HTTP. Una acción visual con N planeaciones realiza N requests.
- **Cardinalidad e identidad:** 0 o 1 fila nueva por request en `anexos`, con `id` UUID y vínculo a la planeación. Una fila contiene `contenido.anexos` con 3–5 materiales; no son 3–5 filas. La acción visual puede producir de 0 a N filas.
- **Persistencia/éxito:** insert confirmado con `.select(...).single()` → `{ok:true, anexo_id, status:'generated'}` y HTTP 201. Si ya existe, devuelve `already_exists` y HTTP 200: no prueba generación nueva. La UI incrementa su `successCount` también con respuestas satisfactorias de reuso, por lo que ese contador no es consumo.
- **Parciales/reintentos:** el owner captura errores por planeación y continúa. La generación valida el conjunto completo; no guarda deliberadamente un recurso con solo parte de sus materiales. La carrera de unicidad `23505` se resuelve como `already_exists`, aunque otra llamada IA pudo haber ocurrido antes del conflicto. No hay contador comercial idempotente.
- **Regeneración real:** `POST /api/anexos/:id/regenerate` → `postRegenerarAnexo` → `regenerarAnexo`; existe el adaptador `apiRegenerarAnexo`. Actualiza la misma fila/UUID tras generar y guardar el nuevo contenido, devuelve `{ok:true, anexo:updated}`. No se debe deduplicar toda la vida por `anexo_id`: una nueva regeneración exitosa sí consume según la regla confirmada. La existencia del endpoint no implica que Biblioteca ofrezca hoy ese botón.

### Listas de cotejo

- **Entrada vigente:** `F/js/features/listas-cotejo/lista-cotejo-generation.js`, `ListaCotejoGeneration.generateFromBiblioteca` → `apiListasCoTejoGenerate` en `F/js/api/listas_cotejo.api.js` → `POST /api/listas-cotejo/generate` → `postGenerateListasCotejo` en `B/src/controllers/listas_cotejo.controller.js` → `generarListasCotejoPorIds` en [listas_cotejo.service.js](../src/services/listas_cotejo.service.js).
- **Unidad solicitada:** `planeacion_ids[]`; un request puede abarcar varias planeaciones. El servicio consulta con `.in(...)` y recorre las filas devueltas, sin reconstruir explícitamente el orden de selección. No asumir orden de entrada para un eventual recorte.
- **Cardinalidad e identidad:** 0 a N filas para N planeaciones válidas distintas. Cada fila tiene `listas_cotejo.id` UUID y `planeacion_id`; sus cinco criterios y actividades evaluadas forman una lista, no cinco recursos.
- **Persistencia/éxito:** insert/select confirmado por item; respuesta `{created, skipped, listas}` envuelta en `{ok:true,...}` con HTTP 201. Puede haber `created=0`: el status HTTP no basta. `listas[].id` identifica los resultados guardados.
- **Parciales/skipped:** `already_exists`, `missing_closing_activity` (sin actividades evaluables, no solo cierre) e `invalid_ai_response`. Este último también puede representar errores capturados después de generar, incluidos errores de persistencia. Un lote puede guardar unas listas y omitir otras; la unicidad se maneja después de una posible llamada IA. No se encontraron retries propios equivalentes al worker de exámenes; los del SDK/proveedor requieren comprobación separada.
- **Regeneración/compatibilidad:** selección por IDs omite listas existentes; no ofrece endpoint dedicado de regeneración. El mismo controller acepta el flujo técnico por `unidad_id` sin `planeacion_ids`: `generarListasCotejoUnidad` usa upsert por `planeacion_id`, puede insertar o actualizar y devuelve `created_or_updated`, `skipped`, `listas`. Por ello el conteo de nuevas filas no captura todas las generaciones. Determinar intención nueva frente a retry exige identidad de operación, no solo inspeccionar el upsert.

### Exámenes

- **Entrada vigente:** `F/js/features/examenes/exam-generation.js`, `ExamGeneration.generateFromBiblioteca` → `apiExamenesGenerate` en `F/js/api/examenes.api.js` → `POST /api/examenes/generate` (alias `/generar`) → `postGenerateExamen` en `B/src/controllers/examenes.controller.js` → `generarExamenUnidad` en [examenes.service.js](../src/services/examenes.service.js).
- **Unidad solicitada:** un examen, con `unidad_id`, selección `planeacion_ids`/`tema_ids`, tipos y `cantidades_pregunta`; no un examen por cada planeación seleccionada. La unidad efectiva se resuelve con los temas seleccionados.
- **Cardinalidad e identidad:** en una ejecución normal, 0 o 1 fila final `examenes.id` UUID. Antes se crean un `examen_generation_jobs.id` UUID y múltiples `examen_generation_items` por pregunta. Esas filas intermedias no son exámenes completos. `generation_job_id` relaciona el resultado con el job; no confundirlo con el job de métricas `ai_generation_jobs`.
- **Persistencia/éxito:** HTTP 202 solo confirma aceptación del job. `processExamGenerationJob` valida el examen completo, inserta `examenes` con `status='generado'` y después actualiza el job a `completed` con `examen_id`. `obtenerEstadoGeneracionExamen`, mediante `GET /api/examenes/generacion/:jobId`, comunica ese estado. La inserción y el cierre del job son operaciones separadas: una interrupción entre ambas exige reconciliación, no un descuento basado exclusivamente en polling.
- **Parciales/reintentos:** pueden quedar preguntas guardadas sin examen final. El worker reintenta items, cambia enfoques según sus fallbacks y sustituye preguntas inválidas/duplicadas; no debe consumir por pregunta ni intento bajo la propuesta de la sección 3. Si falla la validación final, no se guarda deliberadamente un examen incompleto. Un timeout de polling en frontend tampoco demuestra que el worker no haya terminado.
- **Regeneración:** no hay endpoint dedicado para actualizar un examen mediante IA. Un nuevo POST crea otro job y, si termina, otra fila de examen. La cardinalidad 0–1 describe una ejecución, no una garantía de idempotencia frente a requests repetidos o ejecución duplicada del worker. `scheduleExamGenerationJob` agenda con `setTimeout` dentro del proceso; no hay recuperación durable demostrada.

## 3. Propuestas técnicas y correspondencias pendientes de validación

Estas propuestas no alteran los servicios ni los contratos existentes:

| Propuesta de unidad comercial | Ejemplo | Pregunta concreta pendiente |
| --- | --- | --- |
| Un anexo = un recurso completo guardado en `anexos`, no cada material interno ni cada llamada API. | Una fila contiene 4 materiales; consumiría 1 anexo. Seleccionar 3 planeaciones puede guardar 3 filas y consumiría 3. | ¿Confirmamos que el cupo de 1 anexo permite un paquete completo de 3–5 materiales de una planeación? |
| Una lista = una lista completa guardada, no el request por lote ni cada criterio. | Un POST guarda listas para 2 planeaciones; consumiría 2, aunque comparta job de métricas. | ¿Confirmamos una unidad por lista completa asociada a una planeación? |
| Un examen = un examen completo guardado, no cada pregunta, llamada API o item del job. | Un examen de 20 preguntas consumiría 1, aunque tenga múltiples reintentos. | ¿Confirmamos esa unidad independientemente del número de preguntas? El tamaño requiere análisis de costes y eventual decisión explícita, no un límite inventado aquí. |

Propuesta de diseño para una sesión posterior: autorización y reserva atómica de saldo en servidor por usuario, recurso y periodo; confirmación del consumo ligada a persistencia e identidad de operación; liberación de reserva sin consumo al confirmar fallo. No basta ocultar botones ni consultar un saldo antes de ejecutar. No se propone aquí schema, SQL, middleware concreto ni un mecanismo aprobado.

La idempotencia deberá distinguir un reintento de la misma operación de una nueva regeneración intencional. Un ID de recurso es necesario para trazabilidad, pero insuficiente para deduplicar regeneraciones que actualizan la misma fila. El registro de consumo tampoco puede depender de que el recurso siga existiendo: eliminar no devuelve cuota.

El aviso previo de temas debe corresponder con la capacidad autorizada antes de generar. Si otra solicitud cambia el saldo entre aviso y ejecución, habrá que diseñar reserva/revalidación y actualización del aviso. No elegir silenciosamente otros temas ni presumir que el actual orden de respuestas de DB coincide con la selección del usuario.

## 4. Ejemplos de aceptación para implementación futura

Son escenarios esperados, **no pruebas ejecutadas ni aprobadas**. Los ejemplos con anexos/listas/exámenes completos están condicionados a validar la unidad propuesta.

| Caso | Resultado esperado |
| --- | --- |
| Saldo de planeaciones 3; selección ordenada A, B, C, D, E | Antes de ejecutar, indicar A/B/C a generar y D/E pendientes. Ejecutar solo A/B/C. Si las tres se guardan correctamente, consumo 3 y saldo 0. |
| Una planeación guardada en bloque X y dos en bloque Y durante el mismo mes | Consumo del usuario 3, saldo 0; crear un bloque nuevo no reinicia el saldo. |
| Tres resultados permitidos; dos guardados y uno fallido | Consumo 2, saldo restante 1. No descontar por la fila pending/error ni por llamadas fallidas. No completar automáticamente con temas pendientes sin una decisión y aviso acordes. |
| Reintento técnico de una operación cuyo resultado ya se contabilizó | Devolver/reconciliar el resultado sin otro descuento; no confundir respuesta HTTP perdida con falta de persistencia. |
| Nueva regeneración explícita que termina y guarda correctamente | Nuevo consumo; también si el anexo conserva su UUID. Si falla, no consume. |
| Eliminar un resultado ya contabilizado | El consumo histórico no cambia y no se devuelve saldo. |
| Editar manualmente, consultar o descargar | No altera ninguna de las cuatro cuotas. |
| Usar una cuota de recurso | No resta unidades de las otras tres. |
| Renovación mensual sin operaciones en curso | Al pasar al día 1 según `America/Mexico_City`, Inicio dispone de 3 planeaciones, 1 anexo, 1 lista y 1 examen. Saldos anteriores no se suman; cada contador se renueva independientemente del uso de los demás. |
| Dos solicitudes concurrentes de dos planeaciones cada una, con saldo total 3 | No autorizar más de 3 resultados consumibles entre ambas. El orden de asignación entre requests debe especificarse técnicamente; dentro de cada selección se respeta su orden y se comunica lo pendiente antes de generar. |
| `already_exists`, `skipped` sin nuevo resultado, HTTP 202 o preguntas intermedias | No contabilizar como generación comercial nueva por esas señales aisladas. |

## 5. Decisiones pendientes y cuándo bloquean

| Decisión | Pregunta / alcance | Bloquea |
| --- | --- | --- |
| Unidades derivadas | Resolver las tres preguntas de la sección 3. | Conteo y aceptación de anexos/listas/exámenes. |
| Lotes derivados superiores al saldo | Si se seleccionan 3 planeaciones para anexos o listas y solo queda 1 unidad, ¿se recorta con aviso/orden o se exige reducir la selección? La regla ya confirmada de planeaciones no decide esto. | UX y autorización de lotes derivados. |
| Fallback de planeación | Si la IA no produce JSON válido y el backend guarda una tabla de respaldo como `ready`, ¿se considera resultado generado correctamente para consumir, o se excluye? | Definición fiable de éxito comercial de planeaciones. No cambiar el fallback existente para resolverlo incidentalmente. |
| Usuarios existentes | ¿Qué plan/derechos recibirán y cuándo? ¿Habrá excepciones explícitas? | Activación comercial sobre cuentas actuales; no bloquea una revisión de entorno/esquema. |
| Pro | Límites, impuestos, ciclo de cuota y proveedor de pagos. | Publicación operativa de Pro y checkout; el precio mensual ya está decidido. |
| Cruce de mes, decisión técnica pendiente | Una operación empieza el último día y termina el día 1: ¿cómo se atribuye y reserva el periodo, y cómo se evita doble imputación? | Diseño de periodos y concurrencia. No se adopta por defecto ni mes de inicio ni mes de finalización. |
| Trabajos interrumpidos, decisión técnica pendiente | ¿Cómo distinguir guardado confirmado, resultado aún incierto y fallo, recuperar el trabajo y reconciliar reservas sin doble descuento? | Implementación de consumo y recuperación; no fijar expiración/liberación por tiempo sin evidencia del estado. |
| Identidad y atomicidad, decisión técnica pendiente | ¿Cómo persistir y reconciliar el resultado y el consumo, distinguir retry/regeneración y evitar carreras en todas las entradas API? | Diseño de DB/servicio de cuotas; no implementado por este documento. |

Las reglas confirmadas no requieren volver a elegir precio Inicio/Pro, cuota de planeaciones, zona horaria o devolución por eliminación. Una siguiente sesión de entorno y esquema puede avanzar sin resolver decisiones comerciales de Pro; una sesión que implemente consumo sí necesita las definiciones de resultado y recuperación que le correspondan.

## 6. Preparación del análisis de costes, sin datos externos

Separar coste técnico de consumo comercial: una llamada fallida, una carrera de inserción o un retry puede costar dinero aunque no genere una unidad consumible. No usar únicamente resultados exitosos para estimar el coste operativo de entregarlos.

| Fuente local | Utilidad potencial | Carencia a comprobar antes de calcular límites |
| --- | --- | --- |
| [aiMetrics.service.js](../src/services/aiMetrics.service.js): `createAiJob`, `finishAiJob`, `failAiJob`; snapshot `ai_generation_jobs` | Tipo/acción, referencias a artefactos, estados, resúmenes, tokens, costes, llamadas y retries acumulados. | Un job no tiene cardinalidad uniforme: planeación individual, lote de listas, generación/regeneración de anexo o examen. Las referencias y finalizaciones pueden faltar. |
| `logAiCall`, `normalizeOpenAiUsage`; snapshot `ai_generation_calls` | Tokens de entrada/salida/caché/razonamiento, modelo, propósito, versión, intento, duración, validación y coste calculado por llamada. | Writes no bloqueantes y algunos sin await; inserción y acumulación separadas mediante lectura/actualización, con riesgo de pérdidas concurrentes. Verificar completitud, duplicados y correlación; `request_id` existente como campo no prueba que los callers lo rellenen ni que sea único. |
| `getModelPrice`, `calculateAiCost`; snapshot `ai_model_prices` | Tarifas de entrada/salida por modelo; copia de tarifas en calls para interpretar el cálculo. | Sin tarifa devuelve 0; usage ausente se normaliza a 0. **Coste ausente/desconocido no es coste cero.** Validar cobertura y vigencia de tarifas. El cálculo no usa la tarifa reducida de caché aunque se consulte; no hay historial efectivo de precios demostrado. |
| `generarTablaIa`, `guardarMetricasIa` en planeaciones | Ruta general registra intentos en métricas nuevas y escritura legacy en `ia_metrics`. | Ruta vigente por unidad no pasa `jobId`/`userId` a `generarTablaIa`; no cubre calls nuevas. Legacy retiene usage del intento final, no la suma de todos los intentos; no incluye identidad del resultado en el objeto `metrics` construido allí. Schema de `ia_metrics` no está definido en el snapshot. |
| `generateAnexosWithIa` y `generateListaWithIa` | Usage de generación validada y resúmenes del recurso/lote. Anexos también escribe tokens en su fila. | El registro de calls ocurre después de validar; fallos de API/parsing/validación pueden quedar fuera. Tokens de anexo se sobrescriben al regenerar. `anexos_creados` del resumen cuenta materiales internos, no filas comerciales. |
| `generateSingleQuestionWithIa`, `processExamGenerationJob`; jobs/items de examen | Coste por pregunta/intento, cantidad y tipos, validación, reintentos y resultado final. | Verificar cobertura de fallos, SDK retries, sustituciones y correlación entre job de generación, job de métricas y examen. No sumar un helper histórico de examen completo como si fuera el camino vigente por pregunta. |

Propuesta de análisis posterior, previa verificación: segmentar por recurso, modelo/versión y tamaño (temas, longitud/contexto, materiales o preguntas); contrastar calls contra jobs/resultados e identificar pérdidas; estimar distribución de costes incluyendo fallos, retries y regeneraciones, no solo una media de éxitos. Para listas, el job por lote no permite atribución exacta por lista si falta correlación individual: no dividirlo uniformemente y presentarlo como medición real.

Antes de convertir costes en límites Pro también harán falta supuestos explícitos de mezcla de uso, margen, infraestructura, almacenamiento y comisiones/impuestos. No hay cálculos ni límites propuestos en esta sesión; no se consultaron tarifas externas ni métricas productivas.

## 7. Configuración externa no verificada y comprobaciones

- El schema disponible es documental: no acredita tablas reales, unicidad, RLS, triggers, grants, cascadas o migraciones desplegadas. No se consultó Supabase ni se ejecutó SQL.
- Pendiente verificar mediante esquema sin datos la estructura real y el aislamiento; la instrumentación requiere después una validación controlada en entorno aislado, con resultados sintéticos, antes de autorizar extracción/análisis de métricas reales.
- No se verificaron proyectos y separación de ambientes, HEAD desplegado, Auth, Storage, correo, dominio, proveedor de pagos ni precios efectivos del proveedor IA. No confundir estos pendientes externos con decisiones comerciales.
- La renovación comercial debe usar `America/Mexico_City`; no existe configuración de cuotas implementada o verificada. El diseño deberá probar las fronteras de fecha con reloj controlado, incluyendo el caso pendiente de operaciones en curso.
- Verificación de esta sesión: inspección local de rutas, controllers, servicios, owners y documentación; validación de referencias y diff documental. No hubo pruebas de generación, browser, pagos ni políticas live. La prueba manual de 00.1 continúa pendiente.
