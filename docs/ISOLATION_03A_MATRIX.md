# Educativo IA — matriz anon/A/B y fixtures 03A

[CSV completo](ISOLATION_03A_MATRIX.csv): 310 casos estables por recurso, capa, operación y actor. Son un diseño reproducible, no 310 tests implementados ni aprobados. Todos permanecen **NO EJECUTADOS**. Cada fila incluye precondiciones, solicitud sin secretos, esperado propuesto, evidencia, control de efectos y limpieza. API y Supabase directo no se sustituyen mutuamente. La tabla de correspondencia del harness registra por separado las 11 comprobaciones acotadas ejecutadas; no actualiza resultados del CSV ni aprueba sus 310 casos. Los casos suplementarios posteriores siguen NO EJECUTADOS.

## G0: condiciones comunes obligatorias

Solo APP_ENV=test, proyecto gwdtlbisykzzplgzczzq, API http://127.0.0.1:3000 y frontend http://127.0.0.1:5500. Metadatos y backend test verificados según [auditoría](ISOLATION_03A.md), dos usuarios sintéticos existentes A/B distintos, sin concurrencia sobre fixtures ni datos ajenos usados para destrucción. Identidades confirmadas con Auth, no solo claims decodificados ni user_profiles.is_test_user. Sin service role, altas Auth, OpenAI, workers, generación, SQL destructivo o inicializador. Redirects rechazados. Credenciales solo en memoria del proceso; nunca en solicitud reproducida/documento/argumentos.

Marcadores `{A}`, `{B}` son UUID de identidad; `{recurso_A}` y `{recurso_B}` son IDs creados por esta ejecución, **no copiar IDs preexistentes para escrituras**. `planeacion_id` es bigint, no UUID; guardar representación exacta sin redondeo. `generation_job_B` significa `job_B`; aliases `planeacion_B`, `batch_B`, `plantel_B`, etc. derivan del campo FK. Cada caso de escritura usa una copia fresca de F_A/F_B, no una fila ya eliminada por otro caso.

Solicitudes SB usan el origen test y credencial pública test; actor autenticado lleva sesión de ese usuario, anon no lleva Bearer de usuario. API usa solo origen local y Bearer propio. No se proporcionan ejemplos curl con tokens. Payloads son JSON sintético; estos procedimientos amplios aún requieren adaptar un ejecutor revisado con los mismos guards, ledger y controles de efectos del harness. No improvisar un transporte sin guards para completar CSV.

El procedimiento de cada fila es: preparar fixtures; leer estado completo como owner A y B; realizar **una** solicitud del actor; validar campos devueltos, owner y relaciones contra fixtures; releer como ambos propietarios filas/relaciones/objetos afectados; registrar solo resultado y comparación booleana; limpiar IDs confirmados en orden inverso. Ante 5xx, error de transporte, fila ausente en control positivo o paginación incompleta: INCONCLUSO. No considerar 200/403/404/lista vacía como prueba autónoma. Para ID conocido compararlo con ID inexistente reservado y no insertado; registrar diferencias de status/shape sin revelar contenido.

## Plantillas F_A/F_B para revisión posterior de metadatos

**Solo planteles se crean con el harness actual.** El resto son blueprints estáticos, NO fixtures remotos existentes. No ejecutarlos hasta revisar FK, defaults, triggers, policies/grants actuales y ausencia de efectos externos. Usar UUID nuevos por ejecución para tablas UUID, IDs devueltos para bigint y nombre/título `Educativo IA 03A <runId> <actor>`. No repetir inicializador ni crear perfil para “arreglar” FK.

| Tabla | Payload mínimo propuesto, además de IDs/owner propios cuando aplica | Dependencias / limpieza |
| --- | --- | --- |
| planteles | nombre | Auth A/B ya existente; limpiar último, solo si no tiene dependientes |
| grados | plantel_id, nombre, nivel_base:Primaria, orden:1 | plantel propio |
| materias | grado_id, nombre | grado propio |
| unidades | materia_id, nombre, orden:1 | materia propia |
| temas | unidad_id, titulo, duracion:10, orden:1 | unidad propia; conservar owner |
| planeacion_batches | user_id, titulo, plantel_id,grado_id,materia_id,unidad_id propios | jerarquía propia |
| planeaciones | user_id, tema_id, batch_id, custom_title, tabla_ia:[], status:ready | tema/batch propios; ID DB; tabla sintética sin IA. No usar ese array para probar PUT tabla_ia, que exige 3 momentos |
| anexos | user_id,planeacion_id,tema_id,unidad_id,batch_id,titulo,contenido:{} | planeación propia exclusiva: unique planeacion_id |
| listas_cotejo | user_id,planeacion_id,tema_id,unidad_id,batch_id,titulo,criterios:[],total_puntos:10 | unique planeacion_id, json array; propio |
| examen_generation_jobs | user_id,titulo,total_preguntas:0,status:completed,configuracion:{},contexto_temas:[] | unidad/otros IDs propios opcionales; sin schedule. Crear solo tras confirmar que INSERT directo no dispara workers/webhooks |
| examen_generation_items | user_id,job_id,pregunta_numero:1,tipo_pregunta:opcion_multiple,status:completed | job propio; tema_id opcional propio; unique job+numero |
| examenes | user_id,unidad_id,batch_id,titulo,total_preguntas:0,examen_ia:[],generation_job_id:null | unidad/batch propios; no invocar generate. Caso relación job usa job sintético terminal |

API de jerarquía: omitir id/user_id en creación normal (controller solo acepta campos listados); para temas envolver en `{unidad_id,temas:[{titulo,duracion,orden}]}`. Casos CREATE-OWNER añaden user_id al body externo; verificar que sea ignorado/rechazado. API no expone alta sintética de batches/planeaciones/documentos/jobs ni update de materias/temas/documentos/jobs: esos CRUD del CSV existen solo en SB; no inventar endpoints ni sustituir por generate.

Orden de preparación ampliada: plantel → grado → materia → unidad → tema → batch → planeación → anexo/lista → job terminal → item → examen (con job null por defecto). Evitar ciclos job↔examen; un caso que los cree debe planificar desasociación propia antes de borrar. Limpieza: objetos Storage exactos → items → examen → job → anexo/lista → planeación → batch → tema → unidad → materia → grado → plantel. Leer después de cada operación; preservar ledger de confirmados y lista separada de intentos inciertos. No crear ai_generation_jobs/calls como fixture de consumo: podrían no admitir cleanup de usuario.

## Correspondencia exacta del harness acotado

La clave de evidencia es `(caseId, actor)`; identifica establemente el caso. `prepare` crea una raíz por actor con POST directo; `execute` no escribe; `cleanup` elimina únicamente esas raíces confirmadas.

| caseId / actor | Procedimiento | Esperado / evidencia / efectos | Observado |
| --- | --- | --- | --- |
| 03A-SB-PL-ID-A / A | GET directo id del plantel A | fila exacta, owner/nombre A; snapshot antes/después | PASS |
| 03A-SB-PL-ID-A / B | mismo GET con B | sin fila A; control positivo A; snapshot intacto | PASS |
| 03A-SB-PL-ID-A / anon | mismo GET sin sesión | sin fila; error HTTP solo queda inconcluso | PASS: sin datos |
| 03A-SB-PL-ID-B / B | GET directo id del plantel B | fila exacta B; snapshot | PASS |
| 03A-SB-PL-ID-B / A | mismo GET con A | sin fila B, snapshot | PASS |
| 03A-SB-PL-ID-B / anon | mismo GET sin sesión | sin fila B, snapshot | PASS: sin datos |
| 03A-API-PL-LIST / A | GET /api/planteles | A presente, B ausente, nombre sintético exacto | PASS |
| 03A-API-PL-LIST / B | GET /api/planteles | B presente, A ausente | PASS |
| 03A-API-PL-LIST / anon | GET /api/planteles | 401 y error Token requerido; snapshots | PASS: HTTP 401 esperado |
| 03A-PL-NO-EFFECT / A | relectura owner directa | igualdad completa respecto de before | PASS |
| 03A-PL-NO-EFFECT / B | relectura owner directa | igualdad completa respecto de before | PASS |

Los listados de este harness comparan **los dos fixtures**; no certifican todos los recursos ni toda la paginación. El CSV propone una comprobación más amplia. API de planteles no tiene GET por ID: para conocimiento de ID se inspecciona su lista; Supabase directo sí consulta por ID. No confundir esas superficies.

Resultado comunicado para runId `ca11685d-5e72-4b16-a92c-4fff42ec1a35`: 11 PASS, 0 FAIL, 0 INCONCLUSIVE; ambos fixtures eliminados, `fixturesPending=[]`, `uncertainPending=[]` y cero residuos conocidos. Los metadatos test y la API local fueron confirmados por el operador como precondiciones. Este resultado no modifica las 310 filas del CSV, que permanecen NO EJECUTADAS.

## Casos suplementarios: API, integridad y Archivados

Precondición de todos: G0, F_A/F_B completos creados por ejecutor revisado; actualmente bloqueados. Capturar caseId/actor/status y igualdad before/after de recursos y dependencias, nunca bodies reales. Limpiar copias específicas según orden anterior. Cada caso es NO EJECUTADO.

| ID | Actor / capa | Solicitud o procedimiento | Contrato esperado propuesto / riesgo |
| --- | --- | --- | --- |
| 03A-PE-ID-MUTATE | A / API | PUT /api/planeaciones/{planeacion_A}, body id={nuevo bigint libre}; revisar PK/FK antes | No mover identidad; no ejecutar con ID ajeno preexistente; H01 |
| 03A-PE-ARCHIVE-CROSS | A / API | PATCH /api/planeaciones/{planeacion_B}/archive, después /restore en copia independiente | B sin cambios |
| 03A-BA-ARCHIVE-CROSS | A / API | PATCH /api/planeaciones/batch/{batch_B}/archive o /restore, casos independientes | todas las planeaciones B intactas |
| 03A-PE-PERMANENT-CROSS | A / API | DELETE /api/planeaciones/{planeacion_B}/permanent con B archivada | B y derivados intactos |
| 03A-BA-PERMANENT-CROSS | A / API | DELETE /api/planeaciones/batch/{batch_B}/permanent con B archivado | sin borrado parcial B |
| 03A-ARCHIVED-LIST | A y B / API | GET /api/planeaciones/archived con una planeación propia archivada por identidad | solo propios; control activo/archivado correcto |
| 03A-JOB-CROSS-READ | A y anon / API | GET /api/examenes/generacion/{job_B} terminal | sin progreso/examen/error de B; comparar inexistente |
| 03A-JOB-CROSS-EDIT | A / SB | PATCH examen_generation_jobs?id=eq.{job_B} con titulo sintético | B y items intactos; no tocar status de job activo |
| 03A-EX-BATCH-INPUT | A / API, diseño únicamente | POST /api/examenes/generate: unidad_id={unidad_A},planeacion_ids=[{planeacion_A}],batch_id={batch_B},tipos_pregunta:[opcion_multiple],cantidades_pregunta:{opcion_multiple:1} | Rechazar relación antes de job/worker/IA. **NO ENVIAR en 03A**; requiere infraestructura aislada posterior |
| 03A-EX-SELECTION | A / API, diseño únicamente | mismo payload, planeacion_ids=[{planeacion_B}] y luego mezcla A/B | No fallback silencioso a todos ni selección parcial; **NO ENVIAR** |
| 03A-LC-UNIT-INPUT | A / API, diseño únicamente | POST /api/listas-cotejo/generate: planeacion_ids:[{planeacion_A}],unidad_id:{unidad_B} | No guardar lista A ligada a unidad B; **NO ENVIAR** |
| 03A-GEN-ANON | anon / API, diseño únicamente | rutas generate/generar/regenerate del inventario | Auth antes de generación; **NO ENVIAR**, incluso payload negativo |
| 03A-BROWSER-SWITCH | A→B / navegador | mismo perfil local, login A, visitar Archivados; logout, login B; comparar UI con sesión limpia B | Ninguna metadata/selección de A debe aparecer; clave local compartida H09. No copiar contenido de localStorage al reporte |

## Casos Storage

G0 + bucket actual revisado + planeaciones F_A/F_B + imagen PNG sintética mínima. Operaciones directas por SDK Storage con cliente test del actor, no API backend. `pA={A}/{planeacion_A}/desarrollo/{run}-a.png`, `pB={B}/{planeacion_B}/desarrollo/{run}-b.png`; registrar **cada path exacto creado** solo en manifiesto local, no URLs firmadas. Para alteraciones usar objeto exclusivo de cada caso. No enlazar ni borrar objetos preexistentes. Evidencia: ID del caso, status, comparación de tamaño/hash en memoria y presencia/ausencia como propietario; ningún token/firma/imagen real. Resultado de TODOS: NO EJECUTADO por credenciales/metadatos/fixtures no disponibles; ejecutor Storage aún no implementado.

| ID | Actor | Operación reproducible | Esperado propuesto / comprobación sin efectos | Limpieza |
| --- | --- | --- | --- | --- |
| ST-UP-OWN | A | upload(pA,PNG,{upsert:false}) | propio creado, tipo/tamaño esperado, B intacto | remove([pA]) como A |
| ST-UP-PREFIX | A | upload({B}/{planeacion_B}/desarrollo/{run}-ataque.png,PNG,{upsert:false}) | denegado, propietario B confirma ausencia | si falla aislamiento, registrar path exacto y limpiar como B; no admin |
| ST-UP-RELATION | A | upload({A}/{planeacion_B}/desarrollo/{run}-rel.png,PNG,{upsert:false}) | contrato de integridad propuesto: denegar. SQL actual podría permitir: documentar separado de aislamiento de usuario | remove del path exacto como A si se creó |
| ST-UP-MISSING | A | upload({A}/{bigint reservado inexistente}/desarrollo/{run}-missing.png,PNG,{upsert:false}) | relación inexistente no debería aceptarse; comprobar ausencia DB; no inventar una planeación | remove exacto como A |
| ST-READ-CROSS | A | download(pB), list prefijo B | sin bytes/metadata B; B puede leer pB | objetos preparados A/B solamente |
| ST-READ-ANON | anon | download(pA) con cliente anon sin sesión | sin bytes; bucket privado | ningún objeto nuevo |
| ST-SIGN-CROSS | A | createSignedUrl(pB,3600) | no obtener capacidad ajena; no imprimir respuesta/URL | ningún objeto nuevo |
| ST-SIGN-OWN | A | createSignedUrl(pA,3600); consumir en memoria con redirects bloqueados | propia accesible; es credencial temporal, no evidencia pública. Vencimiento pendiente de observación real | remove pA |
| ST-UPDATE-OWN | A | update(pA,PNG2) | cambio solo objeto A; metadata DB no cambia automáticamente | remove pA |
| ST-UPDATE-CROSS | A | update(pB,PNG2) | hash/metadata B intactos, incluso con status 200 | remove pB como B al finalizar |
| ST-MOVE-PREFIX | A | move(pA,{B}/{planeacion_B}/desarrollo/{run}-moved.png) | WITH CHECK no permite prefijo B; verificar original/destino | solo paths creados confirmados |
| ST-DELETE-CROSS | A | remove([pB]) | B sigue descargando mismo objeto; lista vacía de SDK no demuestra borrado | remove pB como B |
| ST-DELETE-OWN | A | remove([pA]) | objeto ausente; DB no debe mutar inesperadamente | verificar ausencia |
| ST-ORPHAN | A | subir pA; eliminar exclusivamente planeación_A fixture vía API directo; consultar objeto | registrar si queda huérfano; comportamiento contractual por decidir, no asumir cascada Storage | remove pA antes de resto de cleanup |
| ST-METADATA-PATH | A / API | PUT planeación_A con tabla_ia válida de tres momentos y metadata path=pB | no persistir referencia ajena; comparar tabla y objetos A/B | no borrar pB desde A; revertir/eliminar fixture A |

No modificar TTL/policies para ejecutar estos casos. No crear avatars. Los casos que en el futuro acepten una relación inconsistente se reportan FAIL del contrato propuesto, con distinción explícita de comportamiento actual observado.
