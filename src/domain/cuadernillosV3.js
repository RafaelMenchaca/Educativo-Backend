import {
  CUADERNILLO_TIPOS_METADATA,
  TIPO_CUADERNILLO_IDS,
  esTipoCuadernillo
} from './cuadernillos.js';

export const ANEXO_SCHEMA_VERSION_V3 = 3;

const normalizeAcademicContextValue = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

const CENTRAL_ACTIVITY_DATA_CONTRACTS = Object.freeze({
  'matematicas|algebra lineal': Object.freeze({ id: 'matriz_vector_3x3', filas: 3, columnas: 3 }),
  'matematica|algebra lineal': Object.freeze({ id: 'matriz_vector_3x3', filas: 3, columnas: 3 })
});

export function obtenerContratoDatosActividadCentralV3(contexto) {
  const key = `${normalizeAcademicContextValue(contexto?.materia)}|${normalizeAcademicContextValue(contexto?.tema)}`;
  return CENTRAL_ACTIVITY_DATA_CONTRACTS[key] || null;
}

export const CUADERNILLO_V3_DESCRIPTIONS = Object.freeze({
  ejercicios_aplicacion: 'Practica los conceptos del tema mediante ejemplos verificados, ejercicios básicos y una actividad integradora.',
  actividades_integradoras: 'Desarrolla un proyecto que conecte el análisis del tema con una solución y un producto final.',
  aprendizaje_guiado: 'Estudia el tema paso a paso mediante explicaciones, ejemplos y actividades de comprobación.'
});

export const CUADERNILLO_V3_SECTION_EDITORIAL_ROLES = Object.freeze({
  ejercicios_aplicacion: Object.freeze({
    presentacion: 'Presenta brevemente la ruta de práctica sin explicar el propósito del apartado.',
    repaso_teorico: 'Recupera únicamente conceptos y reglas indispensables para resolver.',
    ejemplos_resueltos: 'Modela procedimientos completos, coherentes y comprobados.',
    ejercicios_basicos: 'Practica reconocimiento y procedimientos iniciales sin resolver por el estudiante.',
    actividad_integradora: 'Integra los procedimientos en una aplicación articulada.',
    cierre: 'Solicita una síntesis o reflexión breve sin reintroducir el tema.'
  }),
  actividades_integradoras: Object.freeze({
    presentacion_proyecto: 'Define una sola vez el reto y el producto esperado.',
    fundamentacion_teorica: 'Aporta únicamente conceptos necesarios para ejecutar el proyecto.',
    contextualizacion: 'Plantea una situación concreta vinculada con el mismo reto.',
    presentacion_resultados: 'Solicita evidencias y presentación de resultados, sin inventarlos.',
    cierre_reflexivo: 'Solicita una reflexión breve conectada con el reto.'
  }),
  aprendizaje_guiado: Object.freeze({
    presentacion_tema: 'Introduce la ruta de estudio de forma directa y breve.',
    desarrollo_teorico: 'Expone, define, compara y relaciona conceptos de manera gradual; reserva todas las consignas y actividades para Actividades de comprension.',
    apoyos_aprendizaje: 'Representa, visualiza, ejemplifica o resume; no repite definiciones extensas y mantiene el glosario compacto.',
    actividades_comprension: 'Comprueba reconocimiento y relación entre conceptos.',
    cierre: 'Comienza con una síntesis breve o consigna reflexiva, sin reintroducir la importancia del tema.'
  })
});

function coherenceGroup(id, proposito, principal, miembros, regla, instrucciones, ownerMatematico = null) {
  return Object.freeze({
    id,
    proposito,
    slotPrincipalNumero: principal,
    miembrosNumeros: Object.freeze(miembros),
    regla,
    instrucciones: Object.freeze(instrucciones),
    ...(ownerMatematico ? { ownerMatematico: Object.freeze(ownerMatematico) } : {})
  });
}

export const CUADERNILLO_V3_COHERENCE_GROUPS = Object.freeze({
  ejercicios_aplicacion: Object.freeze([
    coherenceGroup(
      'ejemplo_resuelto_15_17',
      'Desarrollar e interpretar un unico ejemplo resuelto.',
      15,
      [15, 16, 17],
      'Los tres slots usan exactamente el mismo enunciado, datos, variables, procedimiento y resultado.',
      ['El procedimiento resuelve el ejemplo del slot principal.', 'La interpretacion analiza exclusivamente el resultado obtenido.'],
      {
        slotPrincipalNumero: 15,
        coberturaConsolidada: Object.freeze([15, 16, 17]),
        regla: 'El slot principal es la unica fuente de datos y calculos; el backend construye y persiste un solo bloque visible con la cobertura completa del grupo.'
      }
    ),
    coherenceGroup(
      'ejemplo_resuelto_36_38',
      'Desarrollar e interpretar un segundo ejemplo resuelto independiente.',
      36,
      [36, 37, 38],
      'Los tres slots usan el mismo segundo ejemplo, distinto del primero.',
      ['El procedimiento resuelve el segundo ejemplo.', 'La interpretacion analiza exclusivamente su resultado.'],
      {
        slotPrincipalNumero: 36,
        coberturaConsolidada: Object.freeze([36, 37, 38]),
        regla: 'El slot 36 es la unica fuente matematica del segundo ejemplo.'
      }
    ),
    coherenceGroup(
      'actividad_integradora_28_30',
      'Resolver e interpretar un unico problema integrador.',
      28,
      [28, 29, 30],
      'Los tres slots usan exactamente el mismo problema, contexto, datos, variables y resultado.',
      ['No cambies de contexto entre slots.', 'El procedimiento resuelve el problema principal.', 'La interpretacion analiza el resultado de ese procedimiento.']
    )
  ]),
  actividades_integradoras: Object.freeze([
    coherenceGroup('actividad_central_17_31', 'Plantear y desarrollar una sola actividad integradora.', 17, [17, 18, 20, 31], 'Caso, datos, indicaciones y espacio de trabajo pertenecen a la misma evidencia.', ['No introduzcas un segundo problema ni otro producto.']),
    coherenceGroup('resultados_35_38', 'Presentar evidencias y conclusiones de un solo producto.', 35, [35, 36, 37, 38], 'Descripcion, resultados, evidencias y conclusiones corresponden al producto construido.', ['No inventes resultados ajenos al proceso.'])
  ]),
  aprendizaje_guiado: Object.freeze([])
});

export const CUADERNILLO_V3_PROCEDURAL_LEVELS = Object.freeze({
  DEMOSTRATIVO: 'demostrativo',
  ORIENTADOR: 'orientador',
  OPERATIVO: 'operativo'
});

const PROCEDURAL_SECTION_LEVELS = Object.freeze({
  ejercicios_aplicacion: Object.freeze({
    repaso_teorico: 'demostrativo',
    ejemplos_resueltos: 'demostrativo',
    ejercicios_basicos: 'orientador',
    actividad_integradora: 'operativo',
  }),
  actividades_integradoras: Object.freeze({
    fundamentacion_teorica: 'operativo',
    contextualizacion: 'operativo',
    presentacion_resultados: 'operativo',
  }),
  aprendizaje_guiado: Object.freeze({
    desarrollo_teorico: 'demostrativo',
    apoyos_aprendizaje: 'demostrativo',
    actividades_comprension: 'orientador'
  })
});

const CUADERNILLO_V3_SLOT_EDITORIAL_OVERRIDES = Object.freeze({
  'ejercicios_aplicacion:repaso_teorico:11': 'Presenta un panorama breve de conceptos y de sus relaciones; no redactes definiciones completas repetidas.',
  'ejercicios_aplicacion:repaso_teorico:12': 'Formula definiciones operativas precisas de los conceptos necesarios; no repitas el panorama relacional.',
  'ejercicios_aplicacion:actividad_integradora:28': 'Integra varios conceptos en un escenario nuevo, con decisiones y evidencia; no reformules un ejemplo o ejercicio basico anterior ni repitas su sistema con instrucciones mas largas.',
  'aprendizaje_guiado:actividades_comprension:26': 'Clasifica elementos en una tabla con categorias explicitas y espacio utilizable.',
  'actividades_integradoras:contextualizacion:18': 'Aporta la unica fuente de datos concretos del caso; cuando el owner exija operaciones, incluye aqui todos los valores, variables y correspondencias necesarios.',
  'actividades_integradoras:contextualizacion:31': 'Proporciona un unico espacio estructurado para analizar el caso y construir la evidencia definida al inicio.'
});

const pedagogicalContract = (tipo, options = {}) => Object.freeze({ tipo, ...options });

export const CUADERNILLO_V3_SLOT_PEDAGOGICAL_CONTRACTS = Object.freeze({
  'aprendizaje_guiado:presentacion_tema:8': pedagogicalContract('lista', { itemsExact: 3, contratoEntrada: 'tres_aprendizajes' }),
  'aprendizaje_guiado:apoyos_aprendizaje:17': pedagogicalContract('ejemplo_resuelto'),
  'aprendizaje_guiado:apoyos_aprendizaje:19': pedagogicalContract('texto'),
  'aprendizaje_guiado:apoyos_aprendizaje:21': pedagogicalContract('conceptos', { itemsMin: 4, itemsMax: 5 }),
  'aprendizaje_guiado:actividades_comprension:22': pedagogicalContract('actividad', { modalidad: 'preguntas', itemsExact: 1, requiereEspacio: true }),
  'aprendizaje_guiado:actividades_comprension:23': pedagogicalContract('actividad', { modalidad: 'completar', itemsExact: 1, requiereOpciones: true, requiereEspacio: true }),
  'aprendizaje_guiado:actividades_comprension:24': pedagogicalContract('actividad', { modalidad: 'relacionar', itemsExact: 4, requiereOpciones: true, requiereEspacio: true }),
  'aprendizaje_guiado:actividades_comprension:26': pedagogicalContract('tabla', { filasMin: 4, contratoEntrada: 'clasificacion_estructurada' }),
  'aprendizaje_guiado:cierre:34': pedagogicalContract('lista', { itemsExact: 3 }),
  'aprendizaje_guiado:cierre:35': pedagogicalContract('actividad', { modalidad: 'reflexion', itemsExact: 2, requiereEspacio: true }),

  'ejercicios_aplicacion:presentacion:8': pedagogicalContract('lista', { itemsMin: 2, itemsMax: 4 }),
  'ejercicios_aplicacion:ejemplos_resueltos:36': pedagogicalContract('ejemplo_resuelto'),
  'ejercicios_aplicacion:ejemplos_resueltos:37': pedagogicalContract('procedimiento'),
  'ejercicios_aplicacion:ejemplos_resueltos:38': pedagogicalContract('texto'),
  ...Object.fromEntries([18, 19, 20].map((numero) => [`ejercicios_aplicacion:ejercicios_basicos:${numero}`, pedagogicalContract('actividad', { modalidad: 'ejercicio', itemsExact: 1, requiereEspacio: true })])),
  'ejercicios_aplicacion:actividad_integradora:28': pedagogicalContract('actividad', { modalidad: 'problema', itemsExact: 1, requiereEspacio: true }),
  'ejercicios_aplicacion:actividad_integradora:29': pedagogicalContract('procedimiento'),
  'ejercicios_aplicacion:cierre:34': pedagogicalContract('texto'),
  'ejercicios_aplicacion:cierre:35': pedagogicalContract('actividad', { modalidad: 'reflexion', itemsExact: 2, requiereEspacio: true }),

  'actividades_integradoras:presentacion_proyecto:8': pedagogicalContract('lista', { itemsExact: 3, contratoEntrada: 'tres_aprendizajes_proyecto' }),
  'actividades_integradoras:presentacion_proyecto:10': pedagogicalContract('proyecto', { productoOwner: true }),
  'actividades_integradoras:presentacion_proyecto:11': pedagogicalContract('lista', { itemsExact: 2, contratoEntrada: 'dos_acciones_ruta_compacta' }),
  'actividades_integradoras:fundamentacion_teorica:14': pedagogicalContract('tabla', { filasMin: 2 }),
  'actividades_integradoras:contextualizacion:20': pedagogicalContract('actividad', { modalidad: 'preguntas', itemsExact: 3, requiereEspacio: true, contratoEntrada: 'tres_preguntas_caso' }),
  'actividades_integradoras:contextualizacion:31': pedagogicalContract('proyecto', { productoReference: true }),
  'actividades_integradoras:presentacion_resultados:35': pedagogicalContract('registro'),
  'actividades_integradoras:presentacion_resultados:36': pedagogicalContract('registro'),
  'actividades_integradoras:presentacion_resultados:38': pedagogicalContract('registro'),
  'actividades_integradoras:cierre_reflexivo:45': pedagogicalContract('actividad', { modalidad: 'reflexion', itemsExact: 2, requiereEspacio: true })
});

export function obtenerContratoPedagogicoSlotV3(slot) {
  return CUADERNILLO_V3_SLOT_PEDAGOGICAL_CONTRACTS[slot?.slotId] || null;
}

const component = (numero, nombre) => Object.freeze({ numero, nombre, clasificacion: 'obligatorio' });
const section = (id, titulo, orden, components) => Object.freeze({
  id, titulo, orden,
  cobertura_requerida: Object.freeze(components),
  elementos_condicionales: Object.freeze([]),
  elementos_para_completar: Object.freeze([])
});

export const CUADERNILLO_V3_BLUEPRINTS = Object.freeze({
  aprendizaje_guiado: Object.freeze([
    section('presentacion_tema', 'Presentación del tema', 1, [component(7, 'Propósito de aprendizaje'), component(8, 'Aprendizajes esperados'), component(9, 'Introducción significativa')]),
    section('desarrollo_teorico', 'Desarrollo teórico', 2, [component(11, 'Conceptos esenciales'), component(12, 'Explicación gradual'), component(13, 'Características y clasificaciones'), component(14, 'Elementos y componentes'), component(15, 'Reglas, principios o criterios'), component(16, 'Procedimientos cuando correspondan')]),
    section('apoyos_aprendizaje', 'Apoyos para el aprendizaje', 3, [component(17, 'Caso modelo explicado paso a paso'), component(18, 'Tabla comparativa'), component(19, 'Esquema conceptual con relaciones'), component(21, 'Glosario único')]),
    section('actividades_comprension', 'Actividades de comprensión', 4, [component(22, 'Comprensión directa'), component(23, 'Completar con banco de palabras'), component(24, 'Relacionar columnas'), component(26, 'Clasificar mediante tabla')]),
    section('cierre', 'Cierre y reflexión', 5, [component(34, 'Tres ideas clave'), component(35, 'Dos preguntas de reflexión')])
  ]),
  ejercicios_aplicacion: Object.freeze([
    section('presentacion', 'Presentación', 1, [component(7, 'Propósito práctico'), component(8, 'Competencias o habilidades'), component(10, 'Instrucciones generales')]),
    section('repaso_teorico', 'Repaso teórico', 2, [component(11, 'Panorama de conceptos'), component(12, 'Definiciones operativas'), component(13, 'Reglas, criterios o fórmulas'), component(14, 'Procedimientos indispensables')]),
    section('ejemplos_resueltos', 'Ejemplos resueltos', 3, [component(15, 'Ejemplo resuelto 1'), component(16, 'Procedimiento del ejemplo 1'), component(17, 'Interpretación del ejemplo 1'), component(36, 'Ejemplo resuelto 2'), component(37, 'Procedimiento del ejemplo 2'), component(38, 'Interpretación del ejemplo 2')]),
    section('ejercicios_basicos', 'Nivel 1: ejercicios básicos', 4, [component(18, 'Ejercicio básico 1'), component(19, 'Ejercicio básico 2'), component(20, 'Ejercicio básico 3')]),
    section('actividad_integradora', 'Actividad integradora', 5, [component(28, 'Planteamiento integrador'), component(29, 'Desarrollo guiado'), component(30, 'Interpretación del caso')]),
    section('cierre', 'Cierre y reflexión', 6, [component(34, 'Síntesis breve'), component(35, 'Dos preguntas metacognitivas')])
  ]),
  actividades_integradoras: Object.freeze([
    section('presentacion_proyecto', 'Presentación de la actividad integradora', 1, [component(7, 'Propósito de la actividad'), component(8, 'Aprendizajes esperados'), component(10, 'Evidencia final única'), component(11, 'Ruta compacta de trabajo')]),
    section('fundamentacion_teorica', 'Fundamentación teórica', 2, [component(12, 'Introducción breve'), component(13, 'Conceptos necesarios'), component(14, 'Tabla resumen de consulta')]),
    section('contextualizacion', 'Contextualización del caso', 3, [component(17, 'Caso central'), component(18, 'Información necesaria'), component(20, 'Preguntas o indicaciones concretas'), component(31, 'Espacio estructurado de trabajo')]),
    section('presentacion_resultados', 'Resultados y conclusiones', 4, [component(35, 'Presentación de la evidencia'), component(36, 'Explicación de hallazgos'), component(37, 'Relación con la teoría'), component(38, 'Conclusiones')]),
    section('cierre_reflexivo', 'Cierre y reflexión', 5, [component(43, 'Cierre breve'), component(45, 'Dos preguntas prospectivas')])
  ])
});

export const CUADERNILLO_V3_SEGMENT_SECTION_IDS = Object.freeze({
  aprendizaje_guiado: Object.freeze([
    Object.freeze(['presentacion_tema']),
    Object.freeze(['desarrollo_teorico', 'apoyos_aprendizaje']),
    Object.freeze(['actividades_comprension']),
    Object.freeze(['cierre'])
  ]),
  ejercicios_aplicacion: Object.freeze([
    Object.freeze(['presentacion']),
    Object.freeze(['repaso_teorico', 'ejemplos_resueltos']),
    Object.freeze(['ejercicios_basicos']),
    Object.freeze(['actividad_integradora', 'cierre'])
  ]),
  actividades_integradoras: Object.freeze([
    Object.freeze(['presentacion_proyecto']),
    Object.freeze(['fundamentacion_teorica']),
    Object.freeze(['contextualizacion']),
    Object.freeze(['presentacion_resultados', 'cierre_reflexivo'])
  ])
});

export const CUADERNILLO_V3_COMMON_EDITORIAL_POLICY = Object.freeze([
  'Escribe exclusivamente para el estudiante, en segunda persona o con instrucciones directas.',
  'Empieza cada actividad con un verbo concreto como resuelve, analiza, compara, identifica, construye, explica, registra o argumenta.',
  'Entrega directamente el contenido solicitado: no expliques para que sirve el apartado.',
  'No menciones al profesor, docente, facilitador, creador del material ni el proceso de generacion.',
  'No uses metadiscurso, placeholders ni frases que describan la finalidad del bloque; empieza directamente con contenido o una accion concreta.',
  'No repitas etiquetas dentro del contenido: instrucciones, resultado e interpretacion ya se muestran por estructura.',
  'No reafirmes una respuesta ya explicada ni agregues una conclusion generica despues de una interpretacion completa.',
  'No repitas en bloques consecutivos la misma idea, procedimiento, resultado o explicacion.',
  'En procedimientos, profundidad significa operaciones y decisiones concretas, no parrafos largos: usa pasos breves y una accion por paso.',
  'No repitas en prosa lo que ya muestran las operaciones ni dupliques resultado, verificacion o interpretacion dentro del procedimiento.',
  'Toda actividad, ejercicio, problema, ejemplo y reto debe requerir realmente los conceptos del tema; no basta con pertenecer a la misma asignatura.',
  'En contextos cotidianos formula un modelo que use explicitamente el tema y conserva el nivel academico de la planeacion; no introduzcas calculo, porcentajes, areas, velocidades u otros contenidos aislados.',
  'Si el tema es Algebra lineal, cada tarea debe requerir vectores, matrices, determinantes, sistemas lineales, transformaciones u otro concepto presente en el contexto.',
  'Antes de devolver cada actividad, comprueba si podria resolverse sin utilizar el tema; si la respuesta es si, reemplazala.',
  'Evita introducciones prescindibles y conserva un tono concreto, academico y apropiado al nivel.',
  'No incluyas secciones ni actividades de evaluacion, calificacion, examen, rubrica o lista de cotejo; termina con cierre y reflexion.',
  'Incluye toda la informacion indispensable y no obligues a consultar Internet ni recursos externos inexistentes.',
  'No incluyas razonamiento interno, comentarios sobre el prompt ni indicaciones destinadas al generador.'
]);

export const CUADERNILLO_V3_TYPE_POLICIES = Object.freeze({
  ejercicios_aplicacion: Object.freeze([
    'Avanza del reconocimiento basico a una sola actividad integradora; prioriza ejercicios concretos sobre exposicion.',
    'Separa enunciado, procedimiento y respuesta; no resuelvas ejercicios destinados al estudiante.',
    'Usa ejemplos resueltos solo en la seccion ejemplos_resueltos.',
    'Construye exactamente dos ejemplos independientes, tres ejercicios basicos, una actividad integradora y dos preguntas finales.',
    'Los componentes de interpretacion deben aportar una tarea o lectura nueva, no repetir la interpretacion de un ejemplo anterior.',
    'No agregues conclusiones genericas despues de resultados; usa instrucciones breves y accionables.'
  ]),
  actividades_integradoras: Object.freeze([
    'Mantiene una unica actividad central y continuidad visible entre contexto, evidencia, resultados y conclusiones.',
    'Define el producto esperado una sola vez y no lo reformules en bloques posteriores.',
    'Conserva una ruta compacta, un solo espacio estructurado de trabajo, una evidencia final y dos preguntas prospectivas.',
    'Incluye en fundamentacion solo la informacion necesaria para ejecutar el proyecto.',
    'Presenta en contextualizacion una situacion concreta con toda la informacion necesaria y orientacion suficiente para construir la evidencia; nunca remitas a datos que no aparecen en el cuadernillo.',
    'La Presentacion define proposito, aprendizajes, producto y ruta compacta; la Contextualizacion aporta caso, datos y consignas operativas sin redefinir el producto ni repetir la ruta.',
    'Pide resultados y evidencias como entregables o espacios de trabajo; no afirmes resultados que el estudiante aun no obtiene.',
    'Mantiene el cierre reflexivo breve y orientado a una accion del estudiante.'
  ]),
  aprendizaje_guiado: Object.freeze([
    'Conserva explicacion gradual, conceptos antes de aplicacion, ejemplos, apoyos y comprobacion progresiva.',
    'Incluye un caso modelo, una tabla comparativa, un esquema conceptual, un unico glosario de cuatro o cinco terminos, cuatro actividades de comprension, tres ideas clave y dos reflexiones.',
    'Incrementa la dificultad sin convertir el cuadernillo en una coleccion exclusiva de ejercicios.',
    'Usa explicaciones claras y autosuficientes, seguidas de comprension y cierre reflexivo.'
  ])
});

export function obtenerMetadataTipoCuadernilloV3(tipoCuadernillo) {
  if (!esTipoCuadernillo(tipoCuadernillo)) return null;
  const { objetivo: _objetivoHistorico, ...metadata } = CUADERNILLO_TIPOS_METADATA[tipoCuadernillo];
  return Object.freeze({
    ...metadata,
    descripcion: CUADERNILLO_V3_DESCRIPTIONS[tipoCuadernillo]
  });
}

export function obtenerFuncionEditorialSeccionV3(tipoCuadernillo, seccionId) {
  return CUADERNILLO_V3_SECTION_EDITORIAL_ROLES[tipoCuadernillo]?.[seccionId] || null;
}

export function obtenerFuncionEditorialSlotV3(slot) {
  return CUADERNILLO_V3_SLOT_EDITORIAL_OVERRIDES[slot?.slotId]
    || obtenerFuncionEditorialSeccionV3(slot?.tipoCuadernillo, slot?.seccionId);
}

export function obtenerNivelProcedimentalSlotV3(slot) {
  return PROCEDURAL_SECTION_LEVELS[slot?.tipoCuadernillo]?.[slot?.seccionId] || null;
}

export function obtenerGruposCoherenciaCuadernilloV3(tipoCuadernillo) {
  if (!esTipoCuadernillo(tipoCuadernillo)) return Object.freeze([]);
  const slots = obtenerSlotsCuadernilloV3(tipoCuadernillo);
  const byNumber = new Map(slots.map((slot) => [slot.numero, slot]));
  return Object.freeze(CUADERNILLO_V3_COHERENCE_GROUPS[tipoCuadernillo].map((group) => Object.freeze({
    ...group,
    slotPrincipalId: byNumber.get(group.slotPrincipalNumero)?.slotId || null,
    miembros: Object.freeze(group.miembrosNumeros.map((numero) => byNumber.get(numero)).filter(Boolean)),
    ...(group.ownerMatematico ? {
      ownerMatematico: Object.freeze({
        ...group.ownerMatematico,
        slotPrincipalId: byNumber.get(group.ownerMatematico.slotPrincipalNumero)?.slotId || null
      })
    } : {})
  })));
}

export function validarGruposCoherenciaCuadernilloV3(tipoCuadernillo) {
  const groups = obtenerGruposCoherenciaCuadernilloV3(tipoCuadernillo);
  const seen = new Set();
  return Object.freeze({
    ok: groups.every((group) => group.slotPrincipalId
      && group.miembros.length === group.miembrosNumeros.length
      && group.miembros.every(({ slotId }) => !seen.has(slotId) && seen.add(slotId))),
    grupos: groups.length
  });
}

export function obtenerBlueprintCuadernilloV3(tipoCuadernillo) {
  return esTipoCuadernillo(tipoCuadernillo) ? CUADERNILLO_V3_BLUEPRINTS[tipoCuadernillo] : null;
}

function slotFromComponent(tipoCuadernillo, section, component) {
  return Object.freeze({
    slotId: `${tipoCuadernillo}:${section.id}:${component.numero}`,
    tipoCuadernillo,
    seccionId: section.id,
    seccionTitulo: section.titulo,
    seccionOrden: section.orden,
    numero: component.numero,
    nombre: component.nombre,
    clasificacion: component.clasificacion,
    ...(component.alternativa ? { alternativa: component.alternativa } : {}),
    obligatorio: true
  });
}

export function obtenerSlotsCuadernilloV3(tipoCuadernillo) {
  const blueprint = obtenerBlueprintCuadernilloV3(tipoCuadernillo);
  if (!blueprint) return Object.freeze([]);
  return Object.freeze(blueprint.flatMap((section) => section.cobertura_requerida
    .map((component) => slotFromComponent(tipoCuadernillo, section, component))));
}

export function obtenerSlotsSegmentoCuadernilloV3(tipoCuadernillo, seccionIds) {
  if (!Array.isArray(seccionIds) || new Set(seccionIds).size !== seccionIds.length) return Object.freeze([]);
  const requested = new Set(seccionIds);
  return Object.freeze(obtenerSlotsCuadernilloV3(tipoCuadernillo).filter(({ seccionId }) => requested.has(seccionId)));
}

export function validarSlotsCuadernilloV3(tipoCuadernillo) {
  const blueprint = obtenerBlueprintCuadernilloV3(tipoCuadernillo);
  const slots = obtenerSlotsCuadernilloV3(tipoCuadernillo);
  if (!blueprint) return Object.freeze({ ok: false, slots: 0 });
  const ids = new Set(slots.map(({ slotId }) => slotId));
  const numbers = new Set(slots.map(({ numero }) => numero));
  return Object.freeze({
    ok: ids.size === slots.length && numbers.size === slots.length
      && slots.length === blueprint.flatMap(({ cobertura_requerida }) => cobertura_requerida).length,
    slots: slots.length
  });
}
