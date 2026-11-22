import {
  CUADERNILLO_V2_ACTIVITY_MODALITIES,
  CUADERNILLO_V2_BLOCK_TYPES,
  CUADERNILLO_V2_EVALUATION_MODALITIES
} from '../validators/cuadernilloV2.validator.js';

const BLOCK_SET = new Set(CUADERNILLO_V2_BLOCK_TYPES);
const ACTIVITY_SET = new Set(CUADERNILLO_V2_ACTIVITY_MODALITIES);
const EVALUATION_SET = new Set(CUADERNILLO_V2_EVALUATION_MODALITIES);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const EXAMPLES = Object.freeze({
  texto: Object.freeze({ tipo: 'texto', contenido: 'Contenido pedagogico util y especifico para el componente.' }),
  lista: Object.freeze({ tipo: 'lista', items: Object.freeze(['Elemento pedagogico desarrollado.']) }),
  conceptos: Object.freeze({ tipo: 'conceptos', items: Object.freeze([Object.freeze({ termino: 'Concepto', explicacion: 'Explicacion clara y contextualizada.' })]) }),
  tabla: Object.freeze({ tipo: 'tabla', columnas: Object.freeze(['Alternativa', 'Analisis']), filas: Object.freeze([Object.freeze(['Opcion pertinente', 'Comparacion argumentada.'])]) }),
  procedimiento: Object.freeze({ tipo: 'procedimiento', pasos: Object.freeze(['Paso explicado y contextualizado.']) }),
  ejemplo_resuelto: Object.freeze({ tipo: 'ejemplo_resuelto', enunciado: 'Situacion de ejemplo.', pasos: Object.freeze(['Desarrollo explicado.']), resultado: 'Resultado del ejemplo.', interpretacion: 'Interpretacion del resultado.' }),
  proyecto: Object.freeze({ tipo: 'proyecto', producto: 'Producto esperado.', instrucciones: 'Instrucciones claras.', etapas: Object.freeze(['Etapa de trabajo.']), espacio_respuesta: Object.freeze({ lineas: 3 }) }),
  registro: Object.freeze({ tipo: 'registro', campos: Object.freeze(['Dato que debe registrarse.']), espacio_respuesta: Object.freeze({ lineas: 2 }) }),
  espacio_respuesta: Object.freeze({ tipo: 'espacio_respuesta', etiqueta: 'Respuesta del estudiante', lineas: 3 })
});

function activityExample(modalidad) {
  return Object.freeze({
    tipo: 'actividad',
    modalidad,
    instrucciones: 'Instrucciones claras para realizar la actividad.',
    items: Object.freeze([Object.freeze({ enunciado: 'Consigna pedagogica util para el estudiante.' })])
  });
}

function evaluationExample(modalidad) {
  return Object.freeze({
    tipo: 'evaluacion',
    modalidad,
    criterios: Object.freeze([Object.freeze({ texto: 'Criterio observable y especifico.' })])
  });
}

function recommendation({ family, allowed, type, modality = null, example, rules }) {
  if (!allowed.every((value) => BLOCK_SET.has(value)) || !BLOCK_SET.has(type)) {
    throw new Error('Representacion de slot invalida: tipo no allowlisted');
  }
  if (modality && type === 'actividad' && !ACTIVITY_SET.has(modality)) {
    throw new Error('Representacion de slot invalida: modalidad de actividad');
  }
  if (modality && type === 'evaluacion' && !EVALUATION_SET.has(modality)) {
    throw new Error('Representacion de slot invalida: modalidad de evaluacion');
  }
  return Object.freeze({
    familia: family,
    bloquesPermitidos: Object.freeze([...allowed]),
    recomendacionPrincipal: Object.freeze({ tipo: type, ...(modality ? { modalidad: modality } : {}) }),
    esquemaMinimo: example,
    reglas: Object.freeze([...rules])
  });
}

const FAMILY_BUILDERS = Object.freeze([
  Object.freeze({
    family: 'lista_cotejo',
    matches: (name) => /lista de cotejo/.test(name),
    build: () => recommendation({ family: 'lista_cotejo', allowed: ['evaluacion'], type: 'evaluacion', modality: 'lista_cotejo', example: evaluationExample('lista_cotejo'), rules: ['lista_cotejo es modalidad de evaluacion, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'rubrica',
    matches: (name) => /rubrica/.test(name),
    build: () => recommendation({ family: 'rubrica', allowed: ['evaluacion'], type: 'evaluacion', modality: 'rubrica', example: evaluationExample('rubrica'), rules: ['rubrica es modalidad de evaluacion, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'autoevaluacion',
    matches: (name) => /autoevaluacion/.test(name),
    build: () => recommendation({ family: 'autoevaluacion', allowed: ['evaluacion'], type: 'evaluacion', modality: 'autoevaluacion', example: evaluationExample('autoevaluacion'), rules: ['autoevaluacion es modalidad de evaluacion, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'reflexion',
    matches: (name) => /reflexion/.test(name),
    build: () => recommendation({ family: 'reflexion', allowed: ['actividad', 'texto'], type: 'actividad', modality: 'reflexion', example: activityExample('reflexion'), rules: ['reflexion es modalidad de actividad, nunca tipo de bloque.', 'Usa texto solo para una reflexion expositiva sin items.'] })
  }),
  Object.freeze({
    family: 'glosario',
    matches: (name) => /glosario/.test(name),
    build: () => recommendation({ family: 'glosario', allowed: ['conceptos', 'tabla', 'lista'], type: 'conceptos', example: EXAMPLES.conceptos, rules: ['glosario no es un tipo de bloque; representa terminos con conceptos.'] })
  }),
  Object.freeze({
    family: 'comparacion',
    matches: (name) => /comparacion|comparar/.test(name),
    build: () => recommendation({ family: 'comparacion', allowed: ['tabla', 'actividad', 'texto', 'lista'], type: 'tabla', example: EXAMPLES.tabla, rules: ['comparacion y comparar no son modalidades.', 'Si eliges actividad, usa modalidad preguntas.'] })
  }),
  Object.freeze({
    family: 'preguntas',
    matches: (name) => /preguntas|cuestionario/.test(name),
    build: () => recommendation({ family: 'preguntas', allowed: ['actividad'], type: 'actividad', modality: 'preguntas', example: activityExample('preguntas'), rules: ['preguntas es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'completar',
    matches: (name) => /completar/.test(name),
    build: () => recommendation({ family: 'completar', allowed: ['actividad'], type: 'actividad', modality: 'completar', example: activityExample('completar'), rules: ['completar es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'relacionar',
    matches: (name) => /relacionar/.test(name),
    build: () => recommendation({ family: 'relacionar', allowed: ['actividad'], type: 'actividad', modality: 'relacionar', example: activityExample('relacionar'), rules: ['relacionar es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'identificar',
    matches: (name) => /identificar|identificacion|reconocimiento/.test(name),
    build: () => recommendation({ family: 'identificar', allowed: ['actividad'], type: 'actividad', modality: 'identificar', example: activityExample('identificar'), rules: ['identificar es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'clasificar',
    matches: (name) => /^clasificar|clasificacion de informacion/.test(name),
    build: () => recommendation({ family: 'clasificar', allowed: ['actividad'], type: 'actividad', modality: 'clasificar', example: activityExample('clasificar'), rules: ['clasificar es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'ejercicio',
    matches: (name) => /ejercicio/.test(name),
    build: () => recommendation({ family: 'ejercicio', allowed: ['actividad'], type: 'actividad', modality: 'ejercicio', example: activityExample('ejercicio'), rules: ['ejercicio es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'problema',
    matches: (name) => /problema|situacion problematica/.test(name),
    build: () => recommendation({ family: 'problema', allowed: ['actividad'], type: 'actividad', modality: 'problema', example: activityExample('problema'), rules: ['problema es modalidad de actividad, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'actividad',
    matches: (name) => /^actividad/.test(name),
    build: () => recommendation({ family: 'actividad', allowed: ['actividad'], type: 'actividad', modality: 'preguntas', example: activityExample('preguntas'), rules: ['actividad requiere una modalidad allowlisted; preguntas es la modalidad general recomendada.'] })
  }),
  Object.freeze({
    family: 'ejemplo_resuelto',
    matches: (name) => /ejemplo.*(explicado|resuelto|paso a paso)/.test(name),
    build: () => recommendation({ family: 'ejemplo_resuelto', allowed: ['ejemplo_resuelto'], type: 'ejemplo_resuelto', example: EXAMPLES.ejemplo_resuelto, rules: ['ejemplo_resuelto es el discriminador soportado para un desarrollo explicado.'] })
  }),
  Object.freeze({
    family: 'procedimiento',
    matches: (name) => /procedimiento|metodo de analisis/.test(name),
    build: () => recommendation({ family: 'procedimiento', allowed: ['procedimiento', 'texto'], type: 'procedimiento', example: EXAMPLES.procedimiento, rules: ['procedimiento requiere pasos ordenados.'] })
  }),
  Object.freeze({
    family: 'tabla',
    matches: (name) => /tabla/.test(name),
    build: () => recommendation({ family: 'tabla', allowed: ['tabla'], type: 'tabla', example: EXAMPLES.tabla, rules: ['tabla exige columnas y filas rectangulares.'] })
  }),
  Object.freeze({
    family: 'representacion_visual',
    matches: (name) => /esquema|diagrama|representacion/.test(name),
    build: () => recommendation({ family: 'representacion_visual', allowed: ['tabla', 'lista', 'texto'], type: 'tabla', example: EXAMPLES.tabla, rules: ['esquema, diagrama y representacion no son tipos de bloque; usa una estructura textual soportada.'] })
  }),
  Object.freeze({
    family: 'conceptos',
    matches: (name) => /concepto|definicion/.test(name),
    build: () => recommendation({ family: 'conceptos', allowed: ['conceptos', 'texto', 'lista'], type: 'conceptos', example: EXAMPLES.conceptos, rules: ['conceptos representa termino y explicacion, con ejemplo opcional.'] })
  }),
  Object.freeze({
    family: 'evaluacion',
    matches: (name) => /criterios de evaluacion|valoracion del producto/.test(name),
    build: () => recommendation({ family: 'evaluacion', allowed: ['evaluacion'], type: 'evaluacion', modality: 'rubrica', example: evaluationExample('rubrica'), rules: ['rubrica es modalidad de evaluacion, nunca tipo de bloque.'] })
  }),
  Object.freeze({
    family: 'registro',
    matches: (name) => /registro/.test(name),
    build: () => recommendation({ family: 'registro', allowed: ['registro'], type: 'registro', example: EXAMPLES.registro, rules: ['registro usa campos y espacio de respuesta; registro no es una modalidad.'] })
  }),
  Object.freeze({
    family: 'proyecto',
    matches: (name) => /planeacion del producto|desarrollo del producto|producto final/.test(name),
    build: () => recommendation({ family: 'proyecto', allowed: ['proyecto', 'texto'], type: 'proyecto', example: EXAMPLES.proyecto, rules: ['proyecto usa producto, instrucciones, etapas y espacio de respuesta.'] })
  })
]);

const DEFAULT_REPRESENTATION = recommendation({
  family: 'explicacion',
  allowed: ['texto', 'lista'],
  type: 'texto',
  example: EXAMPLES.texto,
  rules: ['El nombre pedagogico del componente no crea un tipo de bloque nuevo.']
});

export function resolverRepresentacionSlotCuadernillo(slot) {
  if (!slot || typeof slot.nombre !== 'string' || !slot.nombre.trim()) return null;
  const normalizedName = normalize(slot.nombre);
  const rule = FAMILY_BUILDERS.find(({ matches }) => matches(normalizedName));
  return rule ? rule.build() : DEFAULT_REPRESENTATION;
}

export function inventariarRepresentacionesSlots(slots) {
  if (!Array.isArray(slots)) return Object.freeze([]);
  return Object.freeze(slots.map((slot) => Object.freeze({
    slotId: slot.slotId,
    numero: slot.numero,
    nombre: slot.nombre,
    seccionId: slot.seccionId,
    representacion: resolverRepresentacionSlotCuadernillo(slot)
  })));
}
