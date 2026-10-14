# Educativo IA — inventario trazable 03A

Todos los paths privados incluyen `/api`. Evidencia A de los HEAD en [auditoría](ISOLATION_03A.md); estado remoto D. Cada fila es una operación. Owners: `src/routes/<dominio>.routes.js` → `src/controllers/<dominio>.controller.js` → `src/services/<dominio>.service.js`, salvo generación por jerarquía que llama planeaciones.service.js. Los nombres de controller/service de las tablas permiten localizar la implementación sin depender de líneas cambiantes.

## Reglas comunes que forman parte de cada fila

| Código | Auth, propietario, cliente, filtros, RLS, relaciones |
| --- | --- |
| J | requireAuth; cliente usuario obligatorio como parámetro, sin fallback en jerarquia.service. user_id omitido en INSERT; default auth.uid() esperado del SQL. SELECT/UPDATE/DELETE filtran por id o parent, sin user_id explícito. ensureRecordExists verifica visibilidad del padre bajo RLS; no prueba propiedad si RLS está mal. Archivo añade userId en planeaciones. |
| P | requireAuth; req.user.id; cliente usuario en HTTP, getClient tiene fallback admin. Filtro user_id condicional en CRUD; borrado directo lo exige. Enriquecimiento consulta tema y jerarquía usando el mismo cliente. Relación batch/tema al editar sin validación explícita de propietario común. |
| D | requireAuth; req.user.id; cliente usuario en HTTP, fallback admin en servicio. Lecturas por ID/relación añaden user_id cuando existe; deletes exigen userId y comprueban fila propia. Dependencia adicional de RLS para relaciones/consultas auxiliares. |
| B | requireAuth; req.user.id requerido; cliente usuario en HTTP/fallback admin interno. Todas las consultas del agregado/borrado filtran user_id. Batch se comprueba por id+user_id para detalle/delete. |
| G | requireAuth; req.user.id; cliente usuario, con excepciones admin para batches/métricas/worker. Escrituras y efectos externos; rutas excluidas de ejecución 03A aunque el body parezca inválido. |

Inputs: `p:` params, `b:` body, `q:` query. `—` significa no utilizado; no demuestra validación/rechazo de campos extra. `q:stream` solo elige SSE y no es ID. El fallback frontend `?tema_id=` sobre listado de planeaciones existe, pero getPlaneaciones no utiliza ese query: no contar con filtrado por tema de ese endpoint.

Pruebas de cada fila: matriz por recurso/capa, RO (own/cross/list/anon), WR (own/cross/owner/relación y before/after), DEL (own/cross y descendientes), GEN (pendiente por prohibición de IA). Los fixtures completos y equivalencias de ID están en [matriz](ISOLATION_03A_MATRIX.md).

Superficies públicas adicionales en src/app.js: GET /health devuelve `{ok:true}` y GET / devuelve texto de disponibilidad, sin requireAuth, servicio, IDs, tablas ni ownership. No acreditan destino Supabase ni aislamiento. CORS usa configuración validada y JSON tiene límite 1 MB; no equivale a validación semántica del body.

## Jerarquía — consumidor js/api/jerarquia.api.js → js/services/jerarquia.service.js

Quick Create y loaders de dashboard.page.js consumen creación/lectura; Archivados y planeaciones.service.js consumen archivo/restauración/metadata. Ninguno autoriza reintroducir Explorer visual.

| Método / ruta | Controller → servicio | Tablas / operaciones | IDs y otros inputs | Control | Efectos / prueba / riesgo |
| --- | --- | --- | --- | --- | --- |
| GET /planteles | getPlanteles → listarPlanteles | planteles S | — | J | RO, listado depende RLS |
| POST /planteles | postPlantel → crearPlantel | planteles S/I | b:nombre; propietario ignorado | J | dedup por nombre visible; WR |
| PATCH /planteles/:plantelId | patchPlantel → actualizarPlantel | planteles S/U | p:plantelId; b:nombre | J | WR |
| PATCH /planteles/:plantelId/archive | archivePlantel → archivarPlaneacionesDePlantel | jerarquía S; planeaciones U | p:plantelId | J | archivo de descendientes; WR |
| DELETE /planteles/:plantelId | deletePlantel → eliminarPlantel | jerarquía/planeaciones S/D; FK indirectas | p:plantelId | J | borrado múltiple secuencial; DEL H10 |
| GET /planteles/:plantelId/grados | getGradosByPlantel → listarGradosPorPlantel | planteles/grados S | p:plantelId | J | RO, check padre |
| POST /grados | postGrado → crearGrado | planteles/grados S; grados I | b:plantel_id,nombre,orden,nivel_base | J | normaliza nivel/orden, dedup; WR |
| PATCH /grados/:gradoId | patchGrado → actualizarGrado | grados S/U | p:gradoId; b:nombre | J | WR |
| PATCH /grados/:gradoId/archive | archiveGrado → archivarPlaneacionesDeGrado | grados/materias/unidades/temas S; planeaciones U | p:gradoId | J | WR archivo descendiente |
| DELETE /grados/:gradoId | deleteGrado → eliminarGrado | grados + descendientes S/D | p:gradoId | J | DEL H10 |
| GET /grados/:gradoId/materias | getMateriasByGrado → listarMateriasPorGrado | grados/materias S | p:gradoId | J | RO |
| POST /materias | postMateria → crearMateria | grados/materias S; materias I | b:grado_id,nombre | J | dedup, WR |
| PATCH /materias/:materiaId/archive | archiveMateria → archivarPlaneacionesDeMateria | materias/unidades/temas S; planeaciones U | p:materiaId | J | WR |
| DELETE /materias/:materiaId | deleteMateria → eliminarMateria | materias + descendientes S/D | p:materiaId | J | DEL H10 |
| GET /materias/:materiaId/unidades | getUnidadesByMateria → listarUnidadesPorMateria | materias/unidades S | p:materiaId | J | RO |
| POST /unidades | postUnidad → crearUnidad | materias/unidades S; unidades I | b:materia_id,nombre,orden | J | WR; API check padre, SQL sin trigger equivalente |
| PATCH /unidades/:unidadId | patchUnidad → actualizarUnidad | unidades S/U | p:unidadId; b:nombre | J | WR |
| PATCH /unidades/:unidadId/archive | archiveUnidad → archivarPlaneacionesDeUnidad | unidades/temas S; planeaciones U | p:unidadId | J | WR |
| DELETE /unidades/:unidadId | deleteUnidad → eliminarUnidad | unidades/temas/planeaciones S/D; FK exámenes | p:unidadId | J | DEL H10 |
| GET /unidades/:unidadId/temas | getTemasByUnidad → listarTemasPorUnidad | unidades/temas/planeaciones S | p:unidadId | J | RO; solo devuelve temas con planeación activa |
| POST /temas | postTemas → crearTemas | unidades/temas S; temas I | b:unidad_id,temas[].titulo/duracion/orden o campos simples | J | filtra campos y valida duración; WR |
| DELETE /temas/:temaId | deleteTema → eliminarTema | temas/planeaciones S/D | p:temaId | J | DEL |
| POST /unidades/:unidadId/generar | generarPlaneacionesPorUnidad → generarPlaneacionesIAPorUnidad | jerarquía/temas/planeaciones/batches/metricas | p:unidadId; b:temas,batch_id,force_new_batch,mode,titulo_conjunto,materia,nivel; q:stream | G | valida contexto vía cliente; batches admin; SSE/IA GEN |
| GET /temas/:temaId/planeacion | getPlaneacionByTema → obtenerPlaneacionPorTema | temas/planeaciones S | p:temaId | J | RO; última activa |

## Planeaciones — js/api/planeaciones.api.js y biblioteca.api.js

Consumers: planeaciones.service.js, detalle.page.js (PUT), Archivados, features/planeaciones, Biblioteca y Quick Create.

| Método / ruta | Controller → servicio | Tablas / operaciones | Inputs | Control | Efectos / prueba / riesgo |
| --- | --- | --- | --- | --- | --- |
| GET /planeaciones | getPlaneaciones → listarPlaneaciones | planeaciones + jerarquía S | q:tema_id no usado | P | RO activas |
| GET /planeaciones/archived | getPlaneacionesArchivadas → listarPlaneacionesArchivadas | planeaciones S | — | P | RO agrupación de archivo |
| GET /planeaciones/batches | getBatches → listarBatches | planeaciones S (agrupa batch_id) | — | P | RO; no confundir con tabla batches |
| PATCH /planeaciones/batch/:batchId/archive | archiveBatch → archivarBatchPlaneaciones | planeaciones U | p:batchId | P | WR, todos los rows visibles del batch |
| PATCH /planeaciones/batch/:batchId/restore | restoreBatch → restaurarBatchPlaneaciones | planeaciones U | p:batchId | P | WR |
| DELETE /planeaciones/batch/:batchId/permanent | deleteBatchPermanent → eliminarBatchPermanentemente | planeaciones D | p:batchId | P | solo archivadas, DEL |
| GET /planeaciones/batch/:batch_id | getPlaneacionesByBatch → listarPlaneacionesPorBatch | planeaciones S | p:batch_id | P | RO; vacío devuelve 404 |
| POST /planeaciones/generate | generarPlaneaciones → generarPlaneacionesIA / IAConProgreso | batches/planeaciones I; metricas I/U | b:materia,nivel,unidad integer,temas; q:stream | G | IA/SSE, GEN |
| PATCH /planeaciones/:id/archive | archivePlaneacion → archivarPlaneacion | planeaciones S/U | p:id Number integer | P | WR |
| PATCH /planeaciones/:id/restore | restorePlaneacion → restaurarPlaneacion | planeaciones S/U | p:id Number integer | P | WR |
| DELETE /planeaciones/:id/permanent | deletePlaneacionPermanent → eliminarPlaneacionPermanentemente | planeaciones S/D | p:id Number integer | P | exige archivada, DEL |
| DELETE /planeaciones/:id/directo | deletePlaneacionDirectaController → eliminarPlaneacionDirecta | planeaciones S/D; anexos/listas D | p:id | P | DEL secuencial; sin limpieza Storage |
| GET /planeaciones/:id | getPlaneacionById → obtenerPlaneacionPorId | planeaciones + jerarquía S | p:id Number | P | RO |
| PUT /planeaciones/:id | updatePlaneacion → actualizarPlaneacion | planeaciones U; jerarquía S solo si la fila actualizada conserva tema_id | p:id entero seguro positivo; b:solo tabla_ia | P | 03B completada: allowlist explícita, cliente y userId obligatorios, filtros id+user_id, 404 uniforme; validación manual PASS |
| DELETE /planeaciones/:id | deletePlaneacion → eliminarPlaneacion | planeaciones D | p:id Number | P | DELETE físico; controller catch genérico 500; DEL |

## Biblioteca — js/api/biblioteca.api.js

Consumers: biblioteca-loader.js, biblioteca-block-delete.js, detalle.page.js, facade biblioteca.page.js. No hay endpoint de alta/edición de bloque independiente.

| Método / ruta | Controller → servicio | Tablas / operaciones | Inputs | Control | Efectos / prueba / riesgo |
| --- | --- | --- | --- | --- | --- |
| GET /biblioteca/conjuntos | getConjuntos → listConjuntosByUser | batches/planeaciones/exámenes/listas/anexos S | — | B | RO activo, agregado por batch |
| GET /biblioteca/conjuntos/:batchId | getConjunto → getConjuntoById | mismas tablas S | p:batchId | B | RO, exige batch propio |
| DELETE /biblioteca/bloques/:batchId | deleteBloque → deleteBibliotecaBloque | anexos→listas→exámenes→planeaciones→batches D | p:batchId | B | DEL, no transacción, Storage no borrado |

## Documentos y jobs

APIs: anexos.api.js, listas_cotejo.api.js, examenes.api.js; biblioteca.api.js proporciona deletes compartidos. Consumers: owners generation/preview/download/delete de cada recurso, services de listas/exámenes, Biblioteca. exam-generation.js hace polling del job devuelto por el POST.

| Método / ruta | Controller → servicio | Tablas / operaciones | Inputs | Control | Efectos / prueba / riesgo |
| --- | --- | --- | --- | --- | --- |
| POST /anexos/generate | postGenerarAnexo → generarAnexo | planeaciones/temas/anexos S; anexos I; métricas | b:planeacion_id | G | carga planeación con user_id; copia relaciones; IA GEN |
| POST /anexos/:id/regenerate | postRegenerarAnexo → regenerarAnexo | anexos/planeaciones S; anexos U; métricas | p:id | G | check anexo+planeación; UPDATE final por id, RLS; IA GEN |
| GET /anexos/batch/:batchId | getAnexosPorBatch → obtenerAnexosPorBatch | anexos S | p:batchId | D | RO |
| GET /anexos/planeacion/:planeacionId | getAnexoPorPlaneacion → obtenerAnexoPorPlaneacion | anexos S | p:planeacionId | D | RO |
| GET /anexos/:id | getAnexoById → obtenerAnexoPorId | anexos S | p:id | D | RO |
| DELETE /anexos/:id | deleteAnexoController → eliminarAnexo | anexos S/D | p:id | D | DEL |
| POST /listas-cotejo/generate | postGenerateListasCotejo → generarListasCotejoPorIds / generarListasCotejoUnidad | planeaciones/temas/jerarquía/listas S; listas I/upsert; métricas | b:planeacion_ids,unidad_id | G | selección own visible; unidad explícita puede preceder tema, H06; GEN |
| GET /listas-cotejo/unidad/:unidadId | getListasCotejoPorUnidad → listarListasCotejoPorUnidad | listas S | p:unidadId | D | RO |
| GET /listas-cotejo/planeacion/:planeacionId | getListaCotejoPorPlaneacion → obtenerListaCotejoPorPlaneacion | listas S | p:planeacionId | D | RO |
| GET /listas-cotejo/:id | getListaCotejoById → obtenerListaCotejoPorId | listas S | p:id | D | RO |
| DELETE /listas-cotejo/:id | deleteListaCotejoController → eliminarListaCotejo | listas S/D | p:id | D | DEL |
| POST /examenes/generate | postGenerateExamen → generarExamenUnidad | jerarquía/temas/planeaciones/batches S; job pending + items I; exámenes worker I; métricas | b:unidad_id,tema_ids,planeacion_ids,batch_id,tipos_pregunta,cantidades_pregunta | G | 03C: allowlist; batch/selección/cardinalidad completas; compensación `failed`; cliente usuario obligatorio; worker admin revalida autoridad antes de processing y del INSERT final; GEN real pendiente |
| POST /examenes/generar | postGenerateExamen → generarExamenUnidad | mismas tablas | mismos inputs | G | alias con el mismo contrato 03C |
| GET /examenes/generacion/:jobId | getExamenGenerationJob → obtenerEstadoGeneracionExamen | examen_generation_jobs S | p:jobId UUID | D | 03C: cliente usuario obligatorio, id+user_id, 404 uniforme; evidencia automática simulada |
| GET /examenes/unidad/:unidadId | getExamenesByUnidad → listarExamenesPorUnidad | exámenes S | p:unidadId | D | RO |
| GET /examenes/:id | getExamenById → obtenerExamenPorId | exámenes S | p:id | D | RO |
| DELETE /examenes/:id | deleteExamen → eliminarExamen | exámenes S/D | p:id | D | DEL; job FK set null según SQL |

No hay API de update/delete jobs o items ni CRUD público de métricas. Supabase REST directo es una capa distinta: SQL versionado permite CRUD propio de jobs/items, INSERT/SELECT de calls, INSERT/SELECT/UPDATE de ai jobs. Revisión de privilegios pendiente, nunca confundir con endpoints Express.

## Storage y privilegios directos

Owner frontend `js/pages/detalle.page.js`: obtenerUsuarioAutenticado → subirImagenActividad, crearSignedUrlActividad, eliminarImagenesStorage, construirTablaIaParaGuardar. Consumidores: edición/guardado e hidratación de tabla_ia; cliente Supabase público con sesión; no endpoint Express de objetos.

| Operación | Entrada / propietario / filtro | Relación / efecto | Caso |
| --- | --- | --- | --- |
| upload, upsert:false | bucket fijo planeacion-actividades; userId de auth.getUser; planeacionId de PLANEACION_ORIGINAL.id; file/momento | objeto creado antes de guardar metadata; SQL INSERT bucket+segmento1 | ST-UP-* |
| createSignedUrl(path,3600) | path persistido en metadata; sesión y policy SELECT | URL temporal en memoria, no serializar preview_url; no imprimir URL | ST-READ / ST-SIGN |
| remove(uniquePaths) | rutas removidas al comparar tablas; sesión y policy DELETE | no transacción con UPDATE planeación | ST-DELETE / ST-ORPHAN |
| update directo | no consumidor UI actual; policy UPDATE versionada USING y CHECK bucket+segmento1 | diseñar alteración contenido y movimiento prefijo; no habilitar UI | ST-UPDATE |
| listado/descarga directa | no listado UI; policy SELECT disponible en SQL | comprobar anon/cross/own por SDK Storage test | ST-READ |

Cuatro policies de actividades para authenticated; otras cuatro avatars históricas, fuera de alcance y sin crear bucket. Configuración histórica: privado, 10485760 bytes, image/*. Ni MIME ni límite prueban contenido válido. Policies solo comparan primer segmento; no existencia/owner de planeación en segundo segmento. SQL no es verificación actual del bucket.

Privilegios/relaciones adicionales a revisar: public.profiles(id) y user_profiles(user_id) separados; user_settings propio; ia_metrics_legacy RLS sin policies en inicializador; ai_model_prices SELECT authenticated; grants amplios versionados no garantizan acceso efectivo vía PostgREST. Función SECURITY DEFINER handle_new_user aprovisiona profiles/user_settings, no user_profiles. Ningún consumidor RPC encontrado en el alcance auditado; no invocar funciones para investigarlas.
