# Contratos de generación con IA

## Naturaleza y autoridad

Este documento es la fuente documental de prompts, contratos de salida, normalización, validaciones, retries, jobs y métricas IA del backend. Resume el comportamiento ejecutable sin copiar prompts completos.

El código es la fuente técnica real. Antes de cambiar persistencia, consultar también [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md). Antes de trabajar, cumplir [`../AGENTS.md`](../AGENTS.md).

Si este documento contradice el código, detenerse y reportar la contradicción. No modificar el contrato ni su documentación sin autorización.

## Reglas transversales

- `user_id` procede de `req.user.id` y las consultas de usuario reciben `createUserClient(req.accessToken)`.
- Los mensajes system/user, estructuras JSON, modelos, temperaturas, límites, retries y `prompt_version` son contrato protegido.
- Las respuestas se parsean y validan antes de persistirse; los fallbacks son parte del comportamiento.
- `createAiJob`, `logAiCall`, `finishAiJob` y `failAiJob` forman el sistema central de métricas. Sus fallos no deben cambiar el resultado principal cuando hoy se manejan como no bloqueantes.
- `ia_metrics` sigue recibiendo métricas de planeaciones por compatibilidad legacy.
- No se registran prompts ni respuestas completas. Los errores que ve el usuario deben permanecer sanitizados.
- Biblioteca es el consumidor visual principal actual. El explorador visual jerárquico antiguo no define contratos alternativos de generación.
- Un refactor frontend debe conservar payloads, jobs, polling backend, prompts y métricas; no se modifica generación para acomodar código visual legacy.

## Planeaciones

### Fuente y función principal

- Servicio: `src/services/planeaciones.service.js`.
- Builder del prompt pedagógico: `src/utils/buildPromptByLevel.js`.
- Funciones: `generarPlaneacionesIA`, `generarPlaneacionesIAConProgreso` y `generarPlaneacionesIAPorUnidad`; la llamada IA se concentra en `generarTablaIa`.

### Entradas

El flujo `/api/planeaciones/generate` recibe `materia`, `nivel`, `unidad` numérica y un arreglo no vacío `temas`. Cada tema normaliza nombre, duración mínima de 10 minutos, `actividades_momentos` y el campo legacy `actividad_cierre`.

El flujo por unidad recibe `unidadId` desde la ruta, temas con título/duración y datos opcionales de batch/contexto. Puede crear temas y una planeación pending antes de generar.

### Salida, normalización y validación

La salida IA esperada es un objeto con `tabla`, exactamente tres momentos: Conocimientos previos, Desarrollo y Cierre. Cada fila conserva los campos contractuales de tiempo de sesión, actividades, minutos, producto, instrumento y evaluación.

El parser intenta JSON directo, bloque delimitado y fragmentos objeto/arreglo. Acepta `tabla`, `tabla_ia` o un arreglo como envoltura normalizable. Si los intentos no producen JSON utilizable, se persiste una tabla fallback de tres filas.

Las actividades seleccionadas se validan contra el catálogo actual y se asignan solo a su momento. El flujo por unidad marca duplicados de tema como `skipped` y otros fallos por item como `error`.

### Retries, eventos y métricas

- Versión vigente: `v3_actividades_momentos`.
- Modelo y parámetros exactos: definidos en `planeaciones.service.js`; no se repiten aquí para evitar una segunda configuración editable.
- Hay dos intentos de generación de tabla con parámetros distintos y fallback posterior.
- SSE puede emitir `item_started`, `item_completed`, `item_error` y, en el flujo por unidad, `item_skipped`; el controller cierra con `done`.
- El flujo principal crea un job de métricas por planeación, registra cada intento y finaliza/falla el job; también escribe `ia_metrics`.
- El flujo `generarPlaneacionesIAPorUnidad` conserva hoy la escritura legacy en `ia_metrics`, pero llama `generarTablaIa` sin `jobId`; no se debe afirmar que ese camino registra todas las calls nuevas sin cambiar el código.

### Elementos protegidos

Builder y mensajes, catálogo de actividades, estructura de tres filas, parser, fallback, versiones, parámetros, creación/reuso de batch, estados, SSE, persistencia y ambos sistemas de métricas.

## Anexos

### Fuente, relación y entrada

- Servicio: `src/services/anexos.service.js`.
- Funciones: `generarAnexo`, `regenerarAnexo` y `generateAnexosWithIa`.
- Entrada pública de generación: `planeacion_id`.
- La planeación perteneciente al usuario aporta nivel, materia, tema, duración, `tabla_ia`, `actividades_momentos`, `tema_id` y `batch_id`.

Existe como máximo un anexo por planeación según el índice único documentado. Si ya existe, generación devuelve `already_exists`; una carrera de inserción duplicada se resuelve consultando el existente.

### Salida, regeneración y constraints

La salida esperada contiene `titulo_general`, descripción y entre 3 y 5 anexos. Cada anexo requiere número, título, tipo e instrucciones; una tabla opcional requiere columnas y filas. El parser tolera JSON directo, bloque delimitado o fragmento de objeto, y la validación falla con 502 si no cumple.

Regenerar vuelve a cargar la planeación original, genera el mismo contrato y actualiza el registro existente. No crea una segunda fila.

Persistencia: consultar [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) para columnas y relaciones. Versión vigente: `v1_anexos_desde_planeacion`.

### Métricas y elementos protegidos

Se crea un job `anexo` para generar o regenerar, se registra la llamada y se finaliza o falla el job. Se protegen el vínculo uno-a-uno, fuente de contexto, salida de 3–5 elementos, parser, validaciones, timeout, versión, modelo/parámetros, regeneración y métricas.

## Listas de cotejo

### Fuente y selección de actividad

- Servicio: `src/services/listas_cotejo.service.js`.
- Funciones: `generarListasCotejoPorIds`, `generarListasCotejoUnidad`, `getActividadesEvaluadas` y `generateListaWithIa`.
- Flujo vigente de Biblioteca: selección explícita mediante `planeacion_ids`; `unidad_id` puede aportar contexto.
- Flujo legacy: generación por una unidad completa cuando no se envía `planeacion_ids`.

El contrato actual no depende exclusivamente de `actividad_cierre`: primero usa todas las entradas válidas de `actividades_momentos`; luego cae a `actividad_cierre` legacy y finalmente intenta una fila disponible de `tabla_ia` con prioridad cierre, desarrollo y conocimientos previos. Si no hay actividad evaluable, omite el recurso.

### Salida, skipped y duplicados

La IA debe devolver una sola lista con exactamente cinco criterios; cada criterio vale 2 en “sí” y 0 en “no”, para un total exacto de 10. El parser tolera JSON directo, bloque delimitado o fragmento de objeto.

En selección por IDs, `skipped` puede incluir `already_exists`, `missing_closing_activity` o `invalid_ai_response`. El nombre `missing_closing_activity` es legacy y actualmente representa ausencia de actividades evaluables, no solo ausencia de cierre. En flujo por unidad, las razones equivalentes se expresan en `razon` y el guardado usa upsert por `planeacion_id`.

La prevención de duplicados se apoya en consulta previa y en la unicidad de `planeacion_id` documentada en [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).

### Métricas y elementos protegidos

Versión vigente: `v2_lista_cotejo_actividades_momentos`. Se crea un job por request/lote, se registra una call por lista generada y se finaliza o falla según el resultado agregado. Se protegen selección/fallback de actividades, razones `skipped`, estructura 5×2=10, relación con `planeacion_id`, upsert/duplicados, modelo/parámetros, timeout, versión y métricas.

## Exámenes

### Fuente y selección vigente

- Controller: `src/controllers/examenes.controller.js`.
- Servicio, job y worker: `src/services/examenes.service.js`.
- Builder del flujo de examen completo conservado en código: `src/utils/buildExamPromptByUnit.js`.
- Funciones vigentes del job por pregunta: `generarExamenUnidad`, `processExamGenerationJob`, `generateSingleQuestionWithIa` y `obtenerEstadoGeneracionExamen`.

Biblioteca selecciona planeaciones y envía `planeacion_ids`. El backend consulta esas planeaciones, deriva sus `tema_ids` y limita el contexto a esos temas. `planeacion_ids` son IDs bigint de `planeaciones`; `tema_ids` son UUID de `temas` y no son intercambiables.

`unidad_id` sigue siendo obligatorio para iniciar el request y resolver contexto, pero no es la única fuente de verdad de la selección. Si los temas derivados pertenecen a una sola unidad distinta, el backend usa esa unidad efectiva; si mezclan unidades, rechaza el request. Si no hay selección explícita, usa los temas de la unidad.

### Creación del job y worker

El POST acepta tipos seleccionados, `cantidades_pregunta`, selección opcional y `batch_id`. Cada tipo seleccionado requiere una cantidad entera mayor a cero. Se crea una fila en `examen_generation_jobs`, una fila por reactivo en `examen_generation_items`, se devuelve `202` con `job_id` y se agenda el worker dentro del proceso Node mediante `setTimeout(..., 0)`.

El polling lee `GET /api/examenes/generacion/:jobId` y expone `processing`, `completed` o `failed` según el job, junto con progreso, paso actual y `examen_id`. Los items usan `pending`, `processing`, `retrying`, `completed` y `failed`. No renombrar estados sin revisar backend y frontend.

### Tipos, cantidades y salida

Tipos admitidos:

- `opcion_multiple`
- `verdadero_falso`
- `respuesta_corta`
- `emparejamiento`
- `pregunta_abierta`
- `calculo_numerico`
- `ordenacion_jerarquizacion`

Las cantidades son las solicitadas por el usuario para cada tipo y el total es su suma. La salida persistida contiene título, instrucciones generales y preguntas normalizadas. Cada pregunta exige tipo, tema, texto, respuesta y criterios; los campos adicionales dependen del tipo. Opción múltiple exige exactamente cuatro opciones distintas y una respuesta contenida en ellas.

### Retries y duplicados

Versión vigente: `v8_unit_exam_counts_by_type_completion`. Cada item guarda `max_retries` con valor vigente definido por `EXAM_ITEM_MAX_RETRIES`. La generación intenta el tema/tipo original y después planes fallback que rotan enfoque cognitivo, tema o tipo; los parámetros exactos y la relajación final de similitud viven en el servicio y son protegidos.

La validación detecta duplicados exactos y similitud semántica mediante umbrales definidos en código. Una pregunta inválida o duplicada se sustituye sin cancelar inmediatamente todo el examen. Tras completar items se ejecuta una validación global; los reactivos problemáticos se regeneran y el job falla si aún quedan incompletos o duplicados.

### Guardado, métricas y errores de usuario

Solo un examen validado se inserta en `examenes`, ligado al job y al `batch_id` resuelto. El worker crea un job central de métricas, registra cada llamada por pregunta con retries y finaliza con conteos agregados.

Los detalles internos de OpenAI, validación, similitud, prompts, respuestas crudas y stack traces permanecen en el ámbito interno. El polling de un job fallido devuelve el mensaje genérico vigente: no se debe sustituir por errores internos.

### Elementos protegidos

Resolución `planeacion_ids` → `tema_ids`, autocorrección controlada de unidad, tipos/cantidades, estructura de jobs/items, worker, polling, estados, contratos de pregunta, retries, fallbacks, umbrales, sustitución de duplicados, guardado, versión, modelos/parámetros, métricas y mensaje genérico al usuario.

## Zona protegida durante refactors

En sesiones no dedicadas explícitamente a generación IA está prohibido modificar:

- prompts o mensajes system/user;
- schemas, nombres de campos o estructuras JSON;
- parsing, normalización o validaciones;
- modelos, temperaturas, límites de tokens o timeouts;
- `prompt_version`;
- retries, fallbacks, umbrales o detección/sustitución de duplicados;
- creación, estados, worker o polling de jobs;
- payloads, selección de IDs o persistencia de artefactos;
- eventos SSE;
- métricas IA o compatibilidad con `ia_metrics`.

Una extracción estructural debe conservar literalmente estos contratos. Cualquier cambio intencional requiere alcance explícito, revisión cruzada de frontend/backend/schema, actualización de este documento y del handoff.
