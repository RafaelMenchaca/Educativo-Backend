import {
  CUADERNILLO_TIPOS_METADATA,
  TIPO_CUADERNILLO_IDS,
  esTipoCuadernillo,
  obtenerBlueprintCuadernillo
} from './cuadernillos.js';

export const ANEXO_SCHEMA_VERSION_V3 = 3;

export const CUADERNILLO_V3_DESCRIPTIONS = Object.freeze({
  ejercicios_aplicacion: 'Practica los conceptos del tema mediante ejercicios progresivos, problemas y retos de aplicación.',
  actividades_integradoras: 'Desarrolla un proyecto que conecte el análisis del tema con una solución y un producto final.',
  aprendizaje_guiado: 'Estudia el tema paso a paso mediante explicaciones, ejemplos y actividades de comprobación.'
});

export const CUADERNILLO_V3_SECTION_EDITORIAL_ROLES = Object.freeze({
  ejercicios_aplicacion: Object.freeze({
    presentacion: 'Presenta brevemente la ruta de práctica sin explicar el propósito del apartado.',
    repaso_teorico: 'Recupera únicamente conceptos y reglas indispensables para resolver.',
    ejemplos_resueltos: 'Modela procedimientos completos, coherentes y comprobados.',
    ejercicios_basicos: 'Practica reconocimiento y procedimientos iniciales sin resolver por el estudiante.',
    ejercicios_intermedios: 'Aplica los procedimientos en situaciones de dificultad media.',
    retos_problemas: 'Transfiere lo aprendido a problemas nuevos y retadores.',
    actividad_integradora: 'Integra los procedimientos en una aplicación articulada.',
    evaluacion: 'Comprueba desempeño con tareas nuevas, sin repetir ejercicios previos.',
    cierre: 'Solicita una síntesis o reflexión breve sin reintroducir el tema.'
  }),
  actividades_integradoras: Object.freeze({
    presentacion_proyecto: 'Define una sola vez el reto y el producto esperado.',
    fundamentacion_teorica: 'Aporta únicamente conceptos necesarios para ejecutar el proyecto.',
    contextualizacion: 'Plantea una situación concreta vinculada con el mismo reto.',
    actividades_analisis: 'Analiza información, casos o alternativas útiles para el reto.',
    actividades_aplicacion: 'Diseña y aplica la solución sin redefinir el producto.',
    produccion_proyecto: 'Construye y registra el producto o evidencia.',
    presentacion_resultados: 'Solicita evidencias y presentación de resultados, sin inventarlos.',
    evaluacion: 'Valora el producto con criterios observables y nuevos.',
    cierre_reflexivo: 'Solicita una reflexión breve conectada con el reto.'
  }),
  aprendizaje_guiado: Object.freeze({
    presentacion_tema: 'Introduce la ruta de estudio de forma directa y breve.',
    desarrollo_teorico: 'Define y explica conceptos de manera gradual.',
    apoyos_aprendizaje: 'Representa, visualiza, ejemplifica o resume; no repite definiciones extensas y mantiene el glosario compacto.',
    actividades_comprension: 'Comprueba reconocimiento y relación entre conceptos.',
    actividades_aplicacion: 'Usa los conceptos en situaciones nuevas; no redefine ni repite ejemplos resueltos.',
    evaluacion_aprendizaje: 'Comprueba lo aprendido con preguntas nuevas respecto de Comprensión.',
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
      'actividad_integradora_28_30',
      'Resolver e interpretar un unico problema integrador.',
      28,
      [28, 29, 30],
      'Los tres slots usan exactamente el mismo problema, contexto, datos, variables y resultado.',
      ['No cambies de contexto entre slots.', 'El procedimiento resuelve el problema principal.', 'La interpretacion analiza el resultado de ese procedimiento.']
    )
  ]),
  actividades_integradoras: Object.freeze([
    coherenceGroup('situacion_17_20', 'Plantear y analizar una sola situacion.', 17, [17, 18, 19, 20], 'Situacion, problema, contexto y preguntas comparten los mismos datos y reto.', ['No introduzcas un segundo problema.']),
    coherenceGroup('analisis_21_25', 'Analizar una misma problematica y sus alternativas.', 21, [21, 22, 23, 24, 25], 'Casos, interpretacion, alternativas y argumentacion responden a la misma problematica.', ['Conserva las variables y criterios de comparacion.']),
    coherenceGroup('aplicacion_26_29', 'Disenar y aplicar una solucion coherente.', 26, [26, 27, 28, 29], 'Situacion, diseno, aplicacion y propuesta forman una sola solucion.', ['No reformules el reto ni el producto.']),
    coherenceGroup('producto_30_34', 'Planear, elaborar y registrar un solo producto.', 30, [30, 31, 32, 33, 34], 'Planeacion, materiales, procedimiento, desarrollo y registro pertenecen al mismo producto.', ['No sustituyas el producto entre etapas.']),
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
    ejercicios_intermedios: 'orientador',
    retos_problemas: 'orientador',
    actividad_integradora: 'operativo',
    evaluacion: 'orientador'
  }),
  actividades_integradoras: Object.freeze({
    fundamentacion_teorica: 'operativo',
    contextualizacion: 'operativo',
    actividades_analisis: 'operativo',
    actividades_aplicacion: 'operativo',
    produccion_proyecto: 'operativo',
    presentacion_resultados: 'operativo',
    evaluacion: 'orientador'
  }),
  aprendizaje_guiado: Object.freeze({
    desarrollo_teorico: 'demostrativo',
    apoyos_aprendizaje: 'demostrativo',
    actividades_comprension: 'orientador',
    actividades_aplicacion: 'orientador',
    evaluacion_aprendizaje: 'orientador'
  })
});

const CUADERNILLO_V3_SLOT_EDITORIAL_OVERRIDES = Object.freeze({
  'ejercicios_aplicacion:repaso_teorico:11': 'Presenta un panorama breve de conceptos y de sus relaciones; no redactes definiciones completas repetidas.',
  'ejercicios_aplicacion:repaso_teorico:12': 'Formula definiciones operativas precisas de los conceptos necesarios; no repitas el panorama relacional.',
  'ejercicios_aplicacion:actividad_integradora:28': 'Integra varios conceptos en un escenario nuevo, con decisiones y evidencia; no reformules un reto o ejercicio anterior ni repitas su sistema con instrucciones mas largas.'
});

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const cloneComponent = (item) => Object.freeze({ ...item });

function buildBlueprint(tipoCuadernillo) {
  return Object.freeze(obtenerBlueprintCuadernillo(tipoCuadernillo)
    .filter(({ id }) => id !== 'datos_generales')
    .map((section, index) => Object.freeze({
      ...section,
      orden: index + 1,
      cobertura_requerida: Object.freeze(section.cobertura_requerida
        .filter(({ nombre }) => normalize(nombre) !== 'autoevaluacion')
        .map(cloneComponent)),
      elementos_condicionales: Object.freeze([...section.elementos_condicionales]),
      elementos_para_completar: Object.freeze([...section.elementos_para_completar])
    })));
}

export const CUADERNILLO_V3_BLUEPRINTS = Object.freeze(Object.fromEntries(
  TIPO_CUADERNILLO_IDS.map((tipo) => [tipo, buildBlueprint(tipo)])
));

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
  'Toda actividad, ejercicio, problema, ejemplo, reto y evaluacion debe requerir realmente los conceptos del tema; no basta con pertenecer a la misma asignatura.',
  'En contextos cotidianos formula un modelo que use explicitamente el tema y conserva el nivel academico de la planeacion; no introduzcas calculo, porcentajes, areas, velocidades u otros contenidos aislados.',
  'Si el tema es Algebra lineal, cada tarea debe requerir vectores, matrices, determinantes, sistemas lineales, transformaciones u otro concepto presente en el contexto.',
  'Antes de devolver cada actividad, comprueba si podria resolverse sin utilizar el tema; si la respuesta es si, reemplazala.',
  'Evita introducciones prescindibles y conserva un tono concreto, academico y apropiado al nivel.',
  'No incluyas razonamiento interno, comentarios sobre el prompt ni indicaciones destinadas al generador.'
]);

export const CUADERNILLO_V3_TYPE_POLICIES = Object.freeze({
  ejercicios_aplicacion: Object.freeze([
    'Avanza de reconocimiento a aplicacion y reto; prioriza ejercicios concretos sobre exposicion.',
    'Separa enunciado, procedimiento y respuesta; no resuelvas ejercicios destinados al estudiante.',
    'Usa ejemplos resueltos solo en la seccion ejemplos_resueltos.',
    'Los componentes de interpretacion deben aportar una tarea o lectura nueva, no repetir la interpretacion de un ejemplo anterior.',
    'No agregues conclusiones genericas despues de resultados; usa instrucciones breves y accionables.'
  ]),
  actividades_integradoras: Object.freeze([
    'Mantiene un unico reto y una continuidad visible entre contexto, analisis, solucion, producto, evidencias y evaluacion.',
    'Define el producto esperado una sola vez y no lo reformules en bloques posteriores.',
    'Incluye en fundamentacion solo la informacion necesaria para ejecutar el proyecto.',
    'Presenta en contextualizacion una situacion concreta y conecta analisis, aplicacion y produccion con esa misma situacion.',
    'Pide resultados y evidencias como entregables o espacios de trabajo; no afirmes resultados que el estudiante aun no obtiene.',
    'Mantiene el cierre reflexivo breve y orientado a una accion del estudiante.'
  ]),
  aprendizaje_guiado: Object.freeze([
    'Conserva explicacion gradual, conceptos antes de aplicacion, ejemplos, apoyos y comprobacion progresiva.',
    'Incrementa la dificultad sin convertir el cuadernillo en una coleccion exclusiva de ejercicios.',
    'Usa explicaciones claras y autosuficientes, seguidas de comprension y aplicacion.'
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
