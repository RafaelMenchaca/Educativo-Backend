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

La generación por unidad continúa creando una llamada IA independiente por tema. Dentro del mismo request, el servicio conserva temporalmente las actividades de hasta los últimos cinco temas generados correctamente y las entrega como contexto breve al prompt del tema siguiente. Este contexto solo orienta la variedad en momentos sin actividad específica; una selección explícita del docente siempre tiene prioridad. El historial no se persiste, no se consulta entre requests y no cambia el payload público.

### Salida, normalización y validación

La salida IA esperada es un objeto con `tabla`, exactamente tres momentos: Conocimientos previos, Desarrollo y Cierre. Cada fila conserva los campos contractuales de tiempo de sesión, actividades, minutos, producto, instrumento y evaluación.

El parser intenta JSON directo, bloque delimitado y fragmentos objeto/arreglo. Acepta `tabla`, `tabla_ia` o un arreglo como envoltura normalizable. Si los intentos no producen JSON utilizable, se persiste una tabla fallback de tres filas.

Las actividades seleccionadas se validan contra el catálogo actual y se asignan solo a su momento. El flujo por unidad marca duplicados de tema como `skipped` y otros fallos por item como `error`.

### Retries, eventos y métricas

- Versión vigente: `v4_variedad_entre_temas`.
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
- Entrada pública de generación: `planeacion_id` y el campo opcional
  `tipo_cuadernillo`. Sin tipo se conserva v1; con un ID canónico se usa v2.
- La planeación perteneciente al usuario aporta nivel, materia, tema, duración, `tabla_ia`, `actividades_momentos`, `tema_id` y `batch_id`.

Existe como máximo un anexo por planeación según el índice único documentado. Si ya existe, generación devuelve `already_exists`; una carrera de inserción duplicada se resuelve consultando el existente.

### Salida, regeneración y constraints

La salida esperada contiene `titulo_general`, descripción y entre 3 y 5 anexos. Cada anexo requiere número, título, tipo e instrucciones; una tabla opcional requiere columnas y filas. El parser tolera JSON directo, bloque delimitado o fragmento de objeto, y la validación falla con 502 si no cumple.

Regenerar vuelve a cargar la planeación original. Un histórico con tipo `NULL`
conserva v1; un registro v2 reutiliza obligatoriamente su tipo persistido. El
body no puede cambiarlo y la actualización final ocurre una sola vez.

Persistencia: consultar [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) para columnas y relaciones. Versión vigente: `v1_anexos_desde_planeacion`.

### Base contractual y motor offline de cuadernillos v2

El owner `src/domain/cuadernillos.js` define los tipos canónicos
`ejercicios_aplicacion`, `actividades_integradoras` y `aprendizaje_guiado`, su
metadata y los blueprints de cobertura. `src/validators/cuadernilloV2.validator.js`
valida de forma pura un documento con esta raíz:

```json
{
  "schema_version": 2,
  "titulo": "string",
  "descripcion": "string",
  "datos_generales": {},
  "secciones": []
}
```

El tipo no se duplica dentro de `contenido`: la columna
`anexos.tipo_cuadernillo` será su fuente canónica. El validador recibe ese tipo
como argumento externo y exige las secciones y cobertura del blueprint elegido.

`src/services/cuadernilloV2.engine.js` implementa una API interna pura que recibe
el tipo, contexto confiable de la planeación y una dependencia `completar`
inyectada. No importa ni invoca el cliente real de OpenAI. El plan se deriva del
blueprint en cuatro grupos pedagógicos contiguos: presentación, desarrollo
conceptual, aplicación/proyecto y evaluación/cierre. `datos_generales` no se
envía a ninguna completion: el backend construye primero la raíz
`contenido.datos_generales` y deriva de ella una única sección de presentación
en forma de tabla, con ID, título, orden y cobertura tomados del blueprint.
La raíz es la fuente de verdad y el validador rechaza cualquier divergencia de
la sección derivada. Los componentes 1–6 permanecen en los conteos 35/45/35.

Cada componente pedagógico posterior a `datos_generales` se convierte en un
slot canónico derivado del blueprint. Su ID estable combina tipo, sección y
número, por ejemplo
`ejercicios_aplicacion:repaso_teorico:13`. La completion devuelve únicamente:

```json
{
  "respuestas": [
    {
      "slot_id": "ejercicios_aplicacion:repaso_teorico:13",
      "bloque": {
        "tipo": "texto",
        "contenido": "Contenido pedagógico útil"
      }
    }
  ]
}
```

El bloque de entrada no contiene `cobertura`, IDs técnicos, sección, orden ni
metadata documental. Después de validar una respuesta real, el backend la ubica
en la sección canónica, asigna `cobertura: [numero]` y genera IDs deterministas
para items o criterios. Los slots se agrupan dentro de las 8–10 secciones del
blueprint; no se crean secciones por componente.

Cada segmento acepta como máximo dos completions: intento inicial y un retry
con los slots ausentes o cuyo contenido no validó. Las respuestas válidas se
conservan por `slot_id`; el segundo prompt no incluye la completion anterior y
usa la misma raíz `respuestas`, sin contrato separado de correcciones. El orden
del arreglo no es contractual. Slots desconocidos o duplicados se rechazan y un
`finish_reason: length` repetido aborta el cuadernillo. El backend construye título,
descripción, datos generales y `schema_version`, concatena las secciones en orden
y ejecuta `validateCuadernilloV2` antes de devolver el resultado. Las métricas de
llamadas, retries, tokens, duración y `finish_reason` se acumulan sin registrar
prompts ni respuestas. El cliente conserva el error 502 genérico; el backend
puede registrar solamente diagnóstico estructural acotado.

El prompt describe cada slot con nombre, clasificación, alternativa canónica y
una recomendación estructural determinista derivada por familias semánticas.
La recomendación distingue el discriminador `tipo` de las modalidades internas:
por ejemplo, reflexión usa `actividad/reflexion`, lista de cotejo usa
`evaluacion/lista_cotejo`, glosario usa `conceptos` y comparación de alternativas
prefiere `tabla`. Incluye los bloques permitidos, un schema mínimo válido y
prohibiciones específicas; el nombre pedagógico nunca crea un discriminador o
modalidad nueva.

Las allowlists del validador permanecen estrictas. No se aceptan aliases como
`tipo: reflexion`, `tipo: glosario`, `tipo: lista_cotejo` ni modalidades como
`comparacion`, y el backend no transforma esas respuestas. El retry por slots
pendientes continúa como red de seguridad para variaciones reales; las
recomendaciones buscan reducir fallos previsibles, no garantizar cero retries.
Los componentes condicionales no se omiten: cuando su forma literal no aplica,
la IA desarrolla la alternativa. La cobertura se asigna únicamente después de
validar contenido no vacío y el schema pedagógico del bloque; no se marca un
slot ausente o inválido. Las secciones ensambladas vuelven a pasar el validador
estricto de segmento y el documento completo conserva la validación exacta
35/45/35. En todos los casos hay como máximo dos completions por segmento y no
se persiste nada hasta validar el documento final.

Compatibilidad prevista:

- v1: `tipo_cuadernillo IS NULL` y `contenido.anexos[]`;
- v2: tipo canónico no nulo, `contenido.schema_version = 2` y
  `contenido.secciones[]`.
- v3: tipo canónico no nulo, `contenido.schema_version = 3`, sin
  `datos_generales`, Autoevaluación ni secciones de Evaluación, y
  `contenido.secciones[]`.

Las generaciones tipadas nuevas usan v3 con
`prompt_version = v3_cuadernillo_academico_tipado`. Sus blueprints se
son owners explícitos sin renumerar componentes: 21 slots para Ejercicios,
17 para Integradoras y 19 para Guiado. Conservan cuatro segmentos, máximo dos
llamadas por segmento, retry exclusivo de slots pendientes y persistencia final
atómica. La política común exige lenguaje directo al estudiante y prohíbe
metadiscurso, placeholders copiables, reafirmaciones y conclusiones genéricas.
Ejercicios contiene dos ejemplos, tres ejercicios básicos y una integradora;
Integradoras conecta un caso compacto con una evidencia única; Guiado mantiene
explicación gradual y cuatro actividades de comprensión, sin sección de aplicación.
Todas terminan en Cierre y reflexión. La regeneración no actualiza versiones: v1 usa v1, un
histórico v2 usa v2 y un documento v3 usa v3.

Cada slot v3 incluye sus discriminadores permitidos y schemas locales exactos.
La completion devuelve una entrada independiente por `slot_id`; no resume ni
agrupa slots, porque la agrupación sucede después de validar en backend. Si una
respuesta usa propiedades ajenas a su discriminador, el retry recibe tipo,
propiedades requeridas/opcionales, propiedades prohibidas detectadas y schema
mínimo, sin recibir la respuesta pedagógica rechazada. Las respuestas hermanas
válidas se conservan.

V3 usa un adaptador exclusivo de Chat Completions: modelo allowlisted
`gpt-6-luna` (configurable solo mediante `OPENAI_CUADERNILLO_V3_MODEL`),
`reasoning_effort: low`, sin `temperature`, `max_completion_tokens: 5000` y
timeout de 120 segundos. La respuesta usa Structured Outputs con JSON Schema
estricto y dinámico para los `slot_id` solicitados. V1 y v2 continúan con
`gpt-4o-mini` y sus parámetros históricos; ningún modelo procede del request.
Las tarifas de GPT-6 Luna difieren de `gpt-4o-mini` y el razonamiento puede
aportar tokens adicionales. El costo y la latencia deben medirse con `usage` en
Supabase test antes de producción; la compactación del prompt no constituye
una garantía de ahorro.

Antes de enviar una llamada v3, el backend valida offline que el JSON Schema
sea serializable, no circular, use solo el subconjunto admitido por Structured
Outputs, enumere como requeridas todas las propiedades de cada objeto y use
`additionalProperties: false`. Cardinalidad exacta, contenido no vacío,
rectangularidad y unicidad siguen siendo responsabilidad del validador backend;
no se expresan mediante keywords incompatibles del proveedor.

El evento seguro `completion_request` registra solo configuración, segmento,
intento y cantidad de slots. Si el SDK o API falla, `completion_error` conserva
etapa, clase normalizada, status, type/code/param, request ID, duración y si el
fallo sería reintentable. No registra messages, prompt, schema completo,
completion ni contexto académico. Errores permanentes de credenciales, cuota,
acceso al modelo, parámetros o schema detienen el segmento y no consumen el
segundo intento reservado a correcciones pedagógicas.

La especialización pedagógica 2O cambia la distribución y cardinalidad de los
segmentos, por lo que mediciones anteriores de caracteres no son comparables.
El schema estricto también consume entrada: `usage` de una futura generación
controlada en test sigue siendo la única medición autorizada de costo y latencia.

V3 construye localmente descripciones directas para las tres modalidades; no
reutiliza el objetivo metadiscursivo histórico de v2. Cada sección aporta al
prompt una función editorial y un inventario canónico de componentes ya
solicitados, nunca completions anteriores. En Aprendizaje guiado, Desarrollo
define, Apoyos representa o resume, Comprensión ejercita cuatro modalidades,
y Cierre sintetiza tres ideas y solicita dos reflexiones. El slot de aprendizajes
esperados usa en Structured Outputs tres propiedades requeridas
`aprendizaje_1/2/3`; el backend valida texto no vacío y unicidad, y las hidrata
como una sola `lista.items` sin persistir esos nombres técnicos. V3 no genera
calificación, rúbricas, listas de cotejo ni exámenes.

Las consignas v3 nunca contienen líneas, guiones bajos ni recuadros escritos
por el modelo. En actividades con escritura, la IA entrega oraciones completas,
bancos u opciones; el backend añade `espacio_respuesta` con líneas canónicas por
modalidad. La clasificación de Guiado recibe únicamente categorías y elementos,
y el backend construye una tabla con celdas de respuesta vacías. El linter
`editorial_placeholder_lineas` permanece fail-closed y el retry pide reformular
sin limpiar silenciosamente el contenido rechazado.

En la modalidad `completar`, cada item transitorio incluye
`respuesta_correcta` para comprobar que pertenece al banco y que el enunciado
no revela literalmente el término. El backend elimina esa metadata antes de
hidratar y persistir la actividad. `Desarrollo teórico` es exclusivamente
expositivo: define, compara, relaciona o presenta procedimientos y rechaza
consignas inequívocas como `Comprueba tu comprensión:`; las actividades se
reservan para `Actividades de comprensión`.

`ejemplo_resuelto` exige coherencia entre enunciado, pasos, resultado e
interpretación. En materias cuantitativas, el último paso debe mostrar una
comprobación concisa en todas las ecuaciones o condiciones originales y
conservar precisión decimal o fraccionaria. Esta es una defensa de prompt y
revisión pedagógica: el backend no pretende resolver álgebra general ni certificar
semánticamente resultados mediante expresiones regulares.

V3 declara en el owner grupos pequeños de coherencia. Si falta o falla un
miembro, el segundo intento descarta solo ese grupo y vuelve a solicitar todos
sus slots; conserva los bloques válidos ajenos. Ejercicios agrupa por separado
los ejemplos 15–17 y 36–38, además de la integradora 28–30. Integradoras agrupa
situación/análisis, diseño, construcción del producto y resultados. El producto
definido al presentar el proyecto es el único admitido en su construcción.
Guiado no añade grupos sin dependencia real.

La expansión de un retry por coherencia no sustituye su causa. Los eventos
`segment_slot_retry` y `segment_slot_retry_failed` conservan `errorCode`,
`errorPath` y `slotCausal` del miembro inválido, junto con una lista segura y
acotada `erroresCausales` cuando hay más de uno. `retryScope`, `groupExpanded`,
`groupIds` y `slotsGrupo` describen por separado el alcance de recuperación.
El prompt correctivo recibe esos códigos y paths causales, nunca contenido
rechazado ni el antiguo código artificial `grupo_coherencia_reintentado`.

En la Presentación de Integradoras, los tres aprendizajes esperados y las dos
acciones de la ruta compacta usan propiedades transitorias requeridas; el
backend las hidrata como listas visibles sin persistir sus nombres técnicos.
La Contextualización aplica el mismo límite estructural a exactamente tres
preguntas del caso, que se hidratan como una actividad con espacios de respuesta
backend. Así, Structured Outputs no puede producir arrays fuera de las
cardinalidades que después exige el owner.

En el contexto canónico Matemáticas/Álgebra lineal, el slot 18 de
Contextualización es la única fuente de datos de la actividad central. Su
contrato transitorio exige una matriz numérica 3×3, un vector `b` de tres
componentes, tres variables ordenadas con significado y tres etiquetas de
fila. El backend valida racionales, rectangularidad y correspondencia de
dimensiones, y lo hidrata como una tabla aumentada visible; no persiste los
nombres transitorios ni calcula rango, determinante o solución. Los slots
17, 20 y 31 conservan respectivamente caso, tres consignas y espacio de
trabajo. Un dato ausente produce `datos_actividad_incompletos` y reintenta el
grupo 17–31 con la causa segura preservada.

`ejemplo_resuelto` v3 añade `verificacion: string[]`, obligatoria, no vacía y
visible. Rechaza fórmulas genéricas de comprobación; v2 no incorpora esta
propiedad. El prompt exige pertinencia real al tema y autocontrol previo, sin
clasificadores por palabras clave. Los enunciados exactamente duplicados se
detectan tras normalizar caja, espacios y puntuación periférica. Un duplicado
intersegmento se rechaza en la validación final: no se abre una tercera llamada
para repararlo.

Cada slot v3 recibe además un nivel procedimental canónico que no se persiste:
`demostrativo` desarrolla datos, sustituciones, operaciones o decisiones;
`orientador` ofrece una ruta sin resolver el trabajo del estudiante; y
`operativo` ordena fases, entregables y evidencias sin inventar resultados. En
Guiado, Desarrollo y Apoyos son demostrativos; en Ejercicios, los ejemplos son
demostrativos, la práctica es orientadora y la actividad
integradora es operativa; Integradoras usa procedimientos operativos. V3
rechaza pasos demostrativos que sean solo una orden genérica o que se repitan
exactamente. Profundidad significa operaciones y decisiones breves, no mayor
verbosidad. `pasos`, `resultado`, `verificacion` e `interpretacion` conservan
responsabilidades separadas.

Para el contexto canónico Matemáticas/Álgebra lineal, el JSON Schema inicial de
los dos ejemplos de Ejercicios admite únicamente `determinante_2x2` y
`sistema_lineal_2x2`; no ofrece `no_cuantitativo`, por lo que evita el retry
previsible por `familia_cuantitativa_requerida`. La clasificación procede de
metadata académica canónica exacta. En materias conceptuales se conserva el
ejemplo no cuantitativo desarrollado y no se presenta como cálculo verificado.

Los ejemplos cuantitativos v3 pueden declarar únicamente
`aritmetica_racional`, `determinante_2x2` o `sistema_lineal_2x2`. El backend
es la única fuente de verdad matemática: la IA entrega únicamente racionales
de entrada, secuencia de operaciones allowlisted y método.
No puede entregar solución, determinantes, resultados, operaciones resueltas ni
lados de comprobación; tampoco entrega contexto, interpretación ni texto libre
dentro del contrato cuantitativo. El backend hidrata un contrato interno, opera racionales
exactos y construye procedimiento, resultado, comprobaciones, matrices e
interpretación canónica antes de descartar tanto la entrada como la hidratación.
No es un CAS: otras
familias no se anuncian como verificadas y deben quedar como práctica
orientadora o fallar cerrado cuando el slot exija resolución. Los contratos de
tarea estructuran conceptos, datos suficientes, objetivo y aplicación del
tema, pero no pretenden demostrar pertinencia semántica general.

Las entradas se limitan a numeradores de magnitud máxima 10,000 y denominadores
máximos de 1,000; los derivados usan guardas mayores pero acotadas. Racionales
inválidos, cero en denominador, sistemas singulares, valores fuera de límites o
fallos de hidratación reintentan únicamente el slot o grupo canónico. El evento
seguro conserva familia, código, path y etapa del solver, nunca coeficientes,
ecuaciones, operaciones o soluciones.

Si el primer intento declara una familia cuantitativa soportada, el backend la
conserva como estado seguro del slot. El JSON Schema del retry admite únicamente
esa familia: no puede degradarse a `no_cuantitativo` ni cambiar a otra familia.
En el grupo 15–17 de Ejercicios, el slot 15 es el único owner matemático; después
de validar el grupo, el backend persiste un solo bloque hidratado con cobertura
`[15, 16, 17]`, sin duplicar procedimiento, resultado, comprobación o interpretación.

La presentación cuantitativa mantiene responsabilidades separadas: `pasos`
termina al calcular las variables, `resultado` contiene la solución una vez y
`verificacion` contiene exclusivamente las sustituciones. El formateador lineal
omite coeficientes unitarios y términos nulos, usa `−` para signos negativos y
nunca genera secuencias `+ -`.

Después de cada segmento, el motor conserva únicamente resúmenes acotados de
actividades: sección, modalidad, escenario normalizado, variables, relaciones y
objetivo. El siguiente prompt recibe estos resúmenes, no las completions. Una
coincidencia inequívoca por conjunto de relaciones, contrato de tarea o escenario
con variables produce `actividad_repetida` en el slot posterior y utiliza el retry
normal del segmento; el segundo fallo aborta sin persistencia. La observabilidad
solo registra sección previa y tipo de coincidencia, nunca el contenido comparado.

V3 prohíbe LaTeX y conserva texto plano, Unicode básico, fracciones `a/b` y
tablas. Preview y Word reciben solo bloques pedagógicos; no persisten ni
muestran los contratos internos. Un fallo matemático usa el retry localizado o
grupal vigente, con máximo dos llamadas y sin persistencia parcial.

El endpoint individual despacha por versión. El adaptador v2 usa Chat
Completions con `gpt-4o-mini`, temperatura `0.3`, `max_tokens: 3000`, JSON mode y
timeout individual de 90 segundos. Solo se inserta o actualiza después de
validar el documento completo; los tokens y datos del job se agregan al nivel
del cuadernillo. Además de las completions sintéticas, la integración se validó
en test con generaciones reales controladas de los tres tipos. Los retries
observados se resolvieron por slots pendientes; el resolver de representaciones
busca reducirlos, no garantizar cero retries. El límite de 3000 tokens se
conserva porque cada llamada genera solo un grupo de secciones; el truncamiento
explícito permite medir antes de decidir un aumento. El frontend tipado, el
renderer web v2 y el exportador Word v2 están implementados y conservan sus
dispatches v1. La columna nullable y su CHECK canónico están aplicados y
postverificados en Supabase test y producción; `NULL` continúa identificando
históricos v1 y el tipo canónico externo acompaña a `schema_version: 2`. El
rollback productivo no fue ejecutado. El flujo v2 está desplegado; v3 se prepara
en `work/features` y todavía no se declara desplegado.

### Universalidad contextual v3

El contexto v3 procede exclusivamente de la planeación persistida y propiedad
del usuario, no del request HTTP. Incluye materia, nivel, tema, duración y el
contenido estructurado; cuando existen incorpora unidad, subtema, título
personalizado y actividad de cierre. El engine normaliza una copia inmutable
por job y la reutiliza en los cuatro segmentos y retries. Resúmenes, familias y
fingerprints viven solo durante esa generación y no existe fallback disciplinar
ni estado global entre planeaciones.

Los ejemplos usan un contrato universal: caso concreto incluido, al menos tres
acciones demostrativas distinguibles, evidencia observada o comparada,
resultado o conclusión e interpretación. Cuando el owner no asigna una familia
cuantitativa a la combinación exacta materia/tema, Structured Outputs solo
admite `no_cuantitativo` y el prompt/schema omite ramas de racionales, matrices,
determinantes y Cramer. Las tres familias soportadas permanecen aisladas y
nunca se infieren desde contenido generado. La tabla matricial 3×3 de la
actividad central también se activa únicamente para el contexto canónico
Matemáticas/Álgebra lineal.

Los diagnósticos de retry conservan tipo, segmento, intento, slot, código,
path, representación, modalidad, familia cuando aplica, alcance grupal,
`finishReason` y modelo, sin registrar el contexto académico ni contenido.

En Actividades integradoras, Presentación solo posee propósito general, tres
aprendizajes, producto único y ruta compacta. Sus slots 7, 8, 10 y 11 no pueden
fijar cantidades de casos o elementos ni enumerar categorías disciplinares que
todavía no existen. Contextualización posee el caso y sus datos concretos; sus
preguntas y espacio de trabajo, así como Resultados y conclusiones, deben
referirse únicamente a esos elementos. Una promesa prematura detectable falla
con `promesa_datos_prematura` y usa el retry localizado existente, sin modificar
ni completar artificialmente los datos posteriores.

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

Una extracción estructural debe conservar literalmente estos contratos. Cualquier cambio intencional requiere alcance explícito, revisión cruzada de frontend/backend/schema y actualización de este documento.
