import {
  ANEXO_SCHEMA_VERSION_V2,
  obtenerBlueprintCuadernillo,
  esTipoCuadernillo
} from '../domain/cuadernillos.js';
import {
  ANEXO_SCHEMA_VERSION_V3,
  obtenerBlueprintCuadernilloV3,
  obtenerContratoDatosActividadCentralV3,
  obtenerContratoPedagogicoSlotV3,
  obtenerNivelProcedimentalSlotV3,
  obtenerSlotsCuadernilloV3
} from '../domain/cuadernillosV3.js';
import { evaluarContratoCuantitativo } from '../domain/cuadernilloV3Quantitative.js';
import { CUADERNILLO_V3_QUANTITATIVE_FAMILIES } from '../domain/cuadernilloV3Contracts.js';
import { normalizeCuadernilloV3EditorialBlock } from '../utils/cuadernilloV3EditorialText.js';

export const CUADERNILLO_V2_BLOCK_TYPES = Object.freeze([
  'texto',
  'lista',
  'conceptos',
  'tabla',
  'actividad',
  'procedimiento',
  'ejemplo_resuelto',
  'proyecto',
  'registro',
  'evaluacion',
  'espacio_respuesta'
]);

export const CUADERNILLO_V2_ACTIVITY_MODALITIES = Object.freeze([
  'preguntas',
  'completar',
  'relacionar',
  'identificar',
  'clasificar',
  'ejercicio',
  'problema',
  'reflexion'
]);

export const CUADERNILLO_V2_EVALUATION_MODALITIES = Object.freeze([
  'rubrica',
  'lista_cotejo',
  'autoevaluacion'
]);

export const CUADERNILLO_V2_BLOCK_CONTRACTS = Object.freeze({
  texto: Object.freeze({ requeridas: ['tipo', 'contenido', 'cobertura'], opcionales: ['titulo'] }),
  lista: Object.freeze({ requeridas: ['tipo', 'items', 'cobertura'], opcionales: ['titulo'], items: 'string[] no vacio' }),
  conceptos: Object.freeze({ requeridas: ['tipo', 'items', 'cobertura'], opcionales: ['titulo'], items: [{ termino: 'string', explicacion: 'string', ejemplo: 'string opcional' }] }),
  tabla: Object.freeze({ requeridas: ['tipo', 'columnas', 'filas', 'cobertura'], opcionales: ['titulo'], regla: 'filas rectangulares, celdas string no vacio' }),
  actividad: Object.freeze({ requeridas: ['tipo', 'modalidad', 'instrucciones', 'items', 'cobertura'], opcionales: ['titulo'], items: [{ id: 'string unico en el cuadernillo', enunciado: 'string', opciones: 'string[] opcional', espacio_respuesta: { lineas: 'entero positivo' } }] }),
  procedimiento: Object.freeze({ requeridas: ['tipo', 'pasos', 'cobertura'], opcionales: ['titulo'], pasos: 'string[] no vacio' }),
  ejemplo_resuelto: Object.freeze({ requeridas: ['tipo', 'enunciado', 'pasos', 'resultado', 'interpretacion', 'cobertura'], opcionales: ['titulo'] }),
  proyecto: Object.freeze({ requeridas: ['tipo', 'producto', 'instrucciones', 'etapas', 'espacio_respuesta', 'cobertura'], opcionales: ['titulo'], espacio_respuesta: { lineas: 'entero positivo' } }),
  registro: Object.freeze({ requeridas: ['tipo', 'campos', 'espacio_respuesta', 'cobertura'], opcionales: ['titulo'], campos: 'string[] no vacio', espacio_respuesta: { lineas: 'entero positivo' } }),
  evaluacion: Object.freeze({ requeridas: ['tipo', 'modalidad', 'criterios', 'cobertura'], opcionales: ['titulo', 'escala'], criterios: [{ id: 'string unico', texto: 'string' }], escala: 'string[] opcional' }),
  espacio_respuesta: Object.freeze({ requeridas: ['tipo', 'etiqueta', 'lineas', 'cobertura'], opcionales: [], lineas: 'entero positivo' })
});

export const CUADERNILLO_V2_SLOT_BLOCK_CONTRACTS = Object.freeze({
  texto: Object.freeze({ requeridas: ['tipo', 'contenido'], opcionales: ['titulo'] }),
  lista: Object.freeze({ requeridas: ['tipo', 'items'], opcionales: ['titulo'], items: 'string[] no vacio' }),
  conceptos: Object.freeze({ requeridas: ['tipo', 'items'], opcionales: ['titulo'], items: [{ termino: 'string', explicacion: 'string', ejemplo: 'string opcional' }] }),
  tabla: Object.freeze({ requeridas: ['tipo', 'columnas', 'filas'], opcionales: ['titulo'], regla: 'filas rectangulares, celdas string no vacio' }),
  actividad: Object.freeze({ requeridas: ['tipo', 'modalidad', 'instrucciones', 'items'], opcionales: ['titulo'], items: [{ enunciado: 'string', opciones: 'string[] opcional', espacio_respuesta: { lineas: 'entero positivo' } }] }),
  procedimiento: Object.freeze({ requeridas: ['tipo', 'pasos'], opcionales: ['titulo'], pasos: 'string[] no vacio' }),
  ejemplo_resuelto: Object.freeze({ requeridas: ['tipo', 'enunciado', 'pasos', 'resultado', 'interpretacion'], opcionales: ['titulo'] }),
  proyecto: Object.freeze({ requeridas: ['tipo', 'producto', 'instrucciones', 'etapas', 'espacio_respuesta'], opcionales: ['titulo'], espacio_respuesta: { lineas: 'entero positivo' } }),
  registro: Object.freeze({ requeridas: ['tipo', 'campos', 'espacio_respuesta'], opcionales: ['titulo'], campos: 'string[] no vacio', espacio_respuesta: { lineas: 'entero positivo' } }),
  evaluacion: Object.freeze({ requeridas: ['tipo', 'modalidad', 'criterios'], opcionales: ['titulo', 'escala'], criterios: [{ texto: 'string' }], escala: 'string[] opcional' }),
  espacio_respuesta: Object.freeze({ requeridas: ['tipo', 'etiqueta', 'lineas'], opcionales: [], lineas: 'entero positivo' })
});

const BLOCK_TYPE_SET = new Set(CUADERNILLO_V2_BLOCK_TYPES);
const ACTIVITY_MODALITY_SET = new Set(CUADERNILLO_V2_ACTIVITY_MODALITIES);
const EVALUATION_MODALITY_SET = new Set(CUADERNILLO_V2_EVALUATION_MODALITIES);
const ROOT_KEYS = new Set(['schema_version', 'titulo', 'descripcion', 'datos_generales', 'secciones']);
const GENERAL_KEYS = Object.freeze(['institucion', 'asignatura', 'unidad', 'tema', 'estudiante', 'grupo', 'fecha']);
const COMPLETABLE_GENERAL_KEYS = new Set(['estudiante', 'grupo', 'fecha']);
const FLEXIBLE_GENERAL_KEYS = new Set(['institucion', 'unidad']);

export class CuadernilloV2ValidationError extends Error {
  constructor(code, path, details = null) {
    super(`Contenido de cuadernillo v2 invalido: ${code}`);
    this.name = 'CuadernilloV2ValidationError';
    this.code = code;
    this.path = path;
    this.details = details;
  }
}

function fail(code, path, details = null) {
  throw new CuadernilloV2ValidationError(code, path, details);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])])
  );
}

function assertExactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('propiedad_no_permitida', `${path}.${key}`);
  }
}

function assertText(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail('texto_requerido', path);
}

function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) fail('arreglo_requerido', path);
  value.forEach((item, index) => assertText(item, `${path}[${index}]`));
}

function assertResponseSpace(value, path) {
  if (!isObject(value)) fail('espacio_respuesta_invalido', path);
  assertExactKeys(value, new Set(['lineas']), path);
  if (!Number.isInteger(value.lineas) || value.lineas <= 0) fail('lineas_invalidas', `${path}.lineas`);
}

function assertUniqueItems(items, path, validator, ids = new Set()) {
  if (!Array.isArray(items) || items.length === 0) fail('arreglo_requerido', path);
  items.forEach((item, index) => {
    if (!isObject(item)) fail('item_invalido', `${path}[${index}]`);
    assertText(item.id, `${path}[${index}].id`);
    if (ids.has(item.id)) fail('id_duplicado', `${path}[${index}].id`);
    ids.add(item.id);
    validator(item, `${path}[${index}]`);
  });
}

function validateGeneralData(value) {
  if (!isObject(value)) fail('datos_generales_invalidos', 'datos_generales');
  assertExactKeys(value, new Set(GENERAL_KEYS), 'datos_generales');
  for (const key of GENERAL_KEYS) {
    const field = value[key];
    const path = `datos_generales.${key}`;
    if (!isObject(field)) fail('campo_general_invalido', path);
    const allowedKeys = COMPLETABLE_GENERAL_KEYS.has(key) ? new Set(['valor', 'modo', 'lineas']) : new Set(['valor', 'modo']);
    assertExactKeys(field, allowedKeys, path);
    if (typeof field.valor !== 'string') fail('valor_general_invalido', `${path}.valor`);

    if (COMPLETABLE_GENERAL_KEYS.has(key)) {
      if (field.modo !== 'completar') fail('modo_general_invalido', `${path}.modo`);
      if (field.valor !== '') fail('valor_completable_debe_estar_vacio', `${path}.valor`);
      if (!Number.isInteger(field.lineas) || field.lineas <= 0) fail('lineas_invalidas', `${path}.lineas`);
    } else if (FLEXIBLE_GENERAL_KEYS.has(key)) {
      if (!['backend', 'completar'].includes(field.modo)) fail('modo_general_invalido', `${path}.modo`);
      if (field.modo === 'backend') assertText(field.valor, `${path}.valor`);
      if (field.modo === 'completar' && field.valor !== '') fail('valor_completable_debe_estar_vacio', `${path}.valor`);
    } else {
      if (field.modo !== 'backend') fail('modo_general_invalido', `${path}.modo`);
      assertText(field.valor, `${path}.valor`);
    }
  }
}

function displayGeneralValue(field) {
  return field.modo === 'backend' ? field.valor : '____________________';
}

export function construirSeccionDatosGeneralesV2({ blueprint, datosGenerales }) {
  if (!Array.isArray(blueprint) || blueprint[0]?.id !== 'datos_generales') {
    fail('blueprint_datos_generales_invalido', 'blueprint[0]');
  }
  validateGeneralData(datosGenerales);
  const section = blueprint[0];
  const components = section.cobertura_requerida;
  if (section.obligatoria !== true || components.length !== 6) {
    fail('blueprint_datos_generales_invalido', 'blueprint[0]');
  }
  const fieldKeys = ['institucion', 'asignatura', 'unidad', 'tema', 'estudiante'];
  const rows = fieldKeys.map((key, index) => [
    components[index].nombre,
    displayGeneralValue(datosGenerales[key])
  ]);
  rows.push([
    components[5].nombre,
    `Grupo: ${displayGeneralValue(datosGenerales.grupo)} | Fecha: ${displayGeneralValue(datosGenerales.fecha)}`
  ]);
  return {
    id: section.id,
    titulo: section.titulo,
    orden: section.orden,
    bloques: [{
      tipo: 'tabla',
      titulo: section.titulo,
      columnas: ['Campo', 'Valor'],
      filas: rows,
      cobertura: components.map(({ numero }) => numero)
    }]
  };
}

function validateCoverage(value, allowedCoverage, path) {
  if (!Array.isArray(value) || value.length === 0) fail('cobertura_requerida', path);
  const seen = new Set();
  for (const numero of value) {
    if (!Number.isInteger(numero) || !allowedCoverage.has(numero)) fail('cobertura_ajena', path, { numero });
    if (seen.has(numero)) fail('cobertura_duplicada', path, { duplicados: [numero] });
    seen.add(numero);
  }
  return seen;
}

function validateBlock(block, path, allowedCoverage, activityIds) {
  if (!isObject(block)) fail('bloque_invalido', path);
  assertText(block.tipo, `${path}.tipo`);
  if (!BLOCK_TYPE_SET.has(block.tipo)) fail('tipo_bloque_desconocido', `${path}.tipo`);
  const common = new Set(['tipo', 'titulo', 'cobertura']);
  const coverage = validateCoverage(block.cobertura, allowedCoverage, `${path}.cobertura`);
  if (block.titulo !== undefined) assertText(block.titulo, `${path}.titulo`);

  switch (block.tipo) {
    case 'texto':
      assertExactKeys(block, new Set([...common, 'contenido']), path);
      assertText(block.contenido, `${path}.contenido`);
      break;
    case 'lista':
      assertExactKeys(block, new Set([...common, 'items']), path);
      assertStringArray(block.items, `${path}.items`);
      break;
    case 'conceptos':
      assertExactKeys(block, new Set([...common, 'items']), path);
      if (!Array.isArray(block.items) || block.items.length === 0) fail('arreglo_requerido', `${path}.items`);
      block.items.forEach((item, index) => {
        if (!isObject(item)) fail('item_invalido', `${path}.items[${index}]`);
        assertExactKeys(item, new Set(['termino', 'explicacion', 'ejemplo']), `${path}.items[${index}]`);
        assertText(item.termino, `${path}.items[${index}].termino`);
        assertText(item.explicacion, `${path}.items[${index}].explicacion`);
        if (item.ejemplo !== undefined) assertText(item.ejemplo, `${path}.items[${index}].ejemplo`);
      });
      break;
    case 'tabla': {
      assertExactKeys(block, new Set([...common, 'columnas', 'filas']), path);
      assertStringArray(block.columnas, `${path}.columnas`);
      if (!Array.isArray(block.filas) || block.filas.length === 0) fail('arreglo_requerido', `${path}.filas`);
      block.filas.forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length !== block.columnas.length) fail('tabla_no_rectangular', `${path}.filas[${rowIndex}]`);
        row.forEach((cell, cellIndex) => assertText(cell, `${path}.filas[${rowIndex}][${cellIndex}]`));
      });
      break;
    }
    case 'actividad':
      assertExactKeys(block, new Set([...common, 'modalidad', 'instrucciones', 'items']), path);
      if (!ACTIVITY_MODALITY_SET.has(block.modalidad)) fail('modalidad_actividad_desconocida', `${path}.modalidad`);
      assertText(block.instrucciones, `${path}.instrucciones`);
      assertUniqueItems(block.items, `${path}.items`, (item, itemPath) => {
        assertExactKeys(item, new Set(['id', 'enunciado', 'opciones', 'espacio_respuesta']), itemPath);
        assertText(item.enunciado, `${itemPath}.enunciado`);
        if (item.opciones !== undefined) assertStringArray(item.opciones, `${itemPath}.opciones`);
        if (item.espacio_respuesta !== undefined) assertResponseSpace(item.espacio_respuesta, `${itemPath}.espacio_respuesta`);
      }, activityIds);
      break;
    case 'procedimiento':
      assertExactKeys(block, new Set([...common, 'pasos']), path);
      assertStringArray(block.pasos, `${path}.pasos`);
      break;
    case 'ejemplo_resuelto':
      assertExactKeys(block, new Set([...common, 'enunciado', 'pasos', 'resultado', 'interpretacion']), path);
      assertText(block.enunciado, `${path}.enunciado`);
      assertStringArray(block.pasos, `${path}.pasos`);
      assertText(block.resultado, `${path}.resultado`);
      assertText(block.interpretacion, `${path}.interpretacion`);
      break;
    case 'proyecto':
      assertExactKeys(block, new Set([...common, 'producto', 'instrucciones', 'etapas', 'espacio_respuesta']), path);
      assertText(block.producto, `${path}.producto`);
      assertText(block.instrucciones, `${path}.instrucciones`);
      assertStringArray(block.etapas, `${path}.etapas`);
      assertResponseSpace(block.espacio_respuesta, `${path}.espacio_respuesta`);
      break;
    case 'registro':
      assertExactKeys(block, new Set([...common, 'campos', 'espacio_respuesta']), path);
      assertStringArray(block.campos, `${path}.campos`);
      assertResponseSpace(block.espacio_respuesta, `${path}.espacio_respuesta`);
      break;
    case 'evaluacion':
      assertExactKeys(block, new Set([...common, 'modalidad', 'criterios', 'escala']), path);
      if (!EVALUATION_MODALITY_SET.has(block.modalidad)) fail('modalidad_evaluacion_desconocida', `${path}.modalidad`);
      assertUniqueItems(block.criterios, `${path}.criterios`, (item, itemPath) => {
        assertExactKeys(item, new Set(['id', 'texto']), itemPath);
        assertText(item.texto, `${itemPath}.texto`);
      });
      if (block.escala !== undefined) assertStringArray(block.escala, `${path}.escala`);
      break;
    case 'espacio_respuesta':
      assertExactKeys(block, new Set([...common, 'etiqueta', 'lineas']), path);
      assertText(block.etiqueta, `${path}.etiqueta`);
      if (!Number.isInteger(block.lineas) || block.lineas <= 0) fail('lineas_invalidas', `${path}.lineas`);
      break;
  }
  return coverage;
}

function technicalId(slotId, blockType, collection, index) {
  const safeSlot = slotId.replace(/[^a-z0-9_-]+/gi, '__');
  return `${safeSlot}__${blockType}__${collection}_${index + 1}`;
}

export function construirBloqueV2DesdeSlot(slot, inputBlock) {
  if (!isObject(slot) || typeof slot.slotId !== 'string' || !Number.isInteger(slot.numero)) {
    fail('slot_invalido', 'slot');
  }
  const path = `slots[${slot.slotId}].bloque`;
  if (!isObject(inputBlock)) fail('bloque_slot_invalido', path);
  if (!BLOCK_TYPE_SET.has(inputBlock.tipo)) fail('tipo_bloque_desconocido', `${path}.tipo`);
  const contract = CUADERNILLO_V2_SLOT_BLOCK_CONTRACTS[inputBlock.tipo];
  assertExactKeys(inputBlock, new Set([...contract.requeridas, ...contract.opcionales]), path);
  for (const key of contract.requeridas) {
    if (!Object.hasOwn(inputBlock, key)) fail('propiedad_requerida', `${path}.${key}`);
  }

  const finalBlock = structuredClone(inputBlock);
  if (finalBlock.tipo === 'actividad') {
    if (!Array.isArray(finalBlock.items)) fail('arreglo_requerido', `${path}.items`);
    finalBlock.items = finalBlock.items.map((item, index) => {
      const itemPath = `${path}.items[${index}]`;
      if (!isObject(item)) fail('item_invalido', itemPath);
      assertExactKeys(item, new Set(['enunciado', 'opciones', 'espacio_respuesta']), itemPath);
      return { id: technicalId(slot.slotId, finalBlock.tipo, 'item', index), ...structuredClone(item) };
    });
  }
  if (finalBlock.tipo === 'evaluacion') {
    if (!Array.isArray(finalBlock.criterios)) fail('arreglo_requerido', `${path}.criterios`);
    finalBlock.criterios = finalBlock.criterios.map((item, index) => {
      const itemPath = `${path}.criterios[${index}]`;
      if (!isObject(item)) fail('item_invalido', itemPath);
      assertExactKeys(item, new Set(['texto']), itemPath);
      return { id: technicalId(slot.slotId, finalBlock.tipo, 'criterio', index), ...structuredClone(item) };
    });
  }
  finalBlock.cobertura = [slot.numero];
  validateBlock(finalBlock, path, new Set([slot.numero]), new Set());
  return finalBlock;
}

const V3_FORBIDDEN_EDITORIAL_PATTERNS = Object.freeze([
  ['editorial_instrucciones_genericas', /\binstrucciones claras\b/],
  ['editorial_placeholder', /\bcontenido pedagogico util\b/],
  ['editorial_placeholder', /\belemento pedagogico desarrollado\b/],
  ['editorial_metadiscurso', /\besta actividad permitira\b/],
  ['editorial_metadiscurso', /\besta seccion sirve\b/],
  ['editorial_metadiscurso', /\bel objetivo de este apartado\b/],
  ['editorial_docente', /\bel docente debera\b/],
  ['editorial_generador', /\bcomo inteligencia artificial\b/],
  ['editorial_generador', /\bcomo modelo de lenguaje\b/],
  ['editorial_metadiscurso', /\bproporcionar al estudiante\b/],
  ['editorial_metadiscurso', /\beste cuadernillo tiene como objetivo\b/],
  ['editorial_metadiscurso', /\beste material permitira\b/],
  ['editorial_metadiscurso', /\besta seccion permitira\b/],
  ['editorial_cierre_generico', /\bes fundamental para comprender\b/],
  ['editorial_cierre_generico', /\bes crucial para entender\b/],
  ['editorial_tercera_persona', /\blos estudiantes (?:realizaran|deberan|haran)\b/],
  ['editorial_calificacion', /\b(?:criterios de evaluacion|calificacion|rubrica|examen)\b/],
  ['editorial_recurso_externo', /\b(?:consulta|busca|investiga) (?:en internet|en linea|un recurso externo)\b/],
  ['editorial_placeholder_lineas', /_{3,}|-{4,}|\.{4,}|·{4,}|\bescribe en la linea\b|\bresponde en el recuadro de abajo\b|\bcompleta\s+_{2,}/],
  ['latex_no_permitido', /\\\(|\\\)|\\begin\b|\\end\b|\\frac\b|\$\$|\$[^$]+\$/],
  ['editorial_marcador_estructural', /<[^>]+>/]
]);

function normalizeEditorialText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeExactLearning(value) {
  return normalizeEditorialText(value)
    .replace(/^[\s.,;:¡!¿?"'()\[\]{}-]+|[\s.,;:¡!¿?"'()\[\]{}-]+$/g, '');
}

function normalizeComparableText(value) {
  return normalizeEditorialText(value)
    .replace(/^[\s.,;:Â¡!Â¿?"'()\[\]{}-]+|[\s.,;:Â¡!Â¿?"'()\[\]{}-]+$/g, '');
}

function findTextMatch(value, path, patterns) {
  if (typeof value === 'string') {
    const normalized = normalizeEditorialText(value);
    return patterns.some((pattern) => pattern.test(normalized)) ? path : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findTextMatch(value[index], `${path}[${index}]`, patterns);
      if (match) return match;
    }
  } else if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const match = findTextMatch(nested, `${path}.${key}`, patterns);
      if (match) return match;
    }
  }
  return null;
}

const THEORETICAL_ACTIVITY_PATTERNS = Object.freeze([
  /\bcomprueba tu comprension\s*:/,
  /\bresponde\s*:/,
  /\bahora resuelve\s*:/,
  /\bcompleta el siguiente\b/
]);

function validateTheoreticalExposition(slot, block, path) {
  if (slot?.tipoCuadernillo !== 'aprendizaje_guiado' || slot?.seccionId !== 'desarrollo_teorico') return;
  const matchPath = findTextMatch(block, path, THEORETICAL_ACTIVITY_PATTERNS);
  if (matchPath) fail('actividad_en_desarrollo_teorico', matchPath);
}

function prepareCompletarInput(inputBlock, path) {
  if (inputBlock?.tipo !== 'actividad' || inputBlock.modalidad !== 'completar') return inputBlock;
  if (!Array.isArray(inputBlock.items)) fail('arreglo_requerido', `${path}.items`);
  const sanitized = structuredClone(inputBlock);
  sanitized.items = inputBlock.items.map((item, index) => {
    const itemPath = `${path}.items[${index}]`;
    if (!isObject(item)) fail('item_invalido', itemPath);
    assertExactKeys(item, new Set(['enunciado', 'opciones', 'respuesta_correcta']), itemPath);
    assertText(item.enunciado, `${itemPath}.enunciado`);
    assertStringArray(item.opciones, `${itemPath}.opciones`);
    assertText(item.respuesta_correcta, `${itemPath}.respuesta_correcta`);
    const normalizedOptions = item.opciones.map(normalizeComparableText);
    if (new Set(normalizedOptions).size !== normalizedOptions.length) fail('opcion_duplicada', `${itemPath}.opciones`);
    const normalizedAnswer = normalizeComparableText(item.respuesta_correcta);
    if (!normalizedOptions.includes(normalizedAnswer)) fail('respuesta_fuera_banco', `${itemPath}.respuesta_correcta`);
    if (normalizedOptions.length < 2) fail('opciones_pedagogicas_requeridas', `${itemPath}.opciones`);
    const normalizedPrompt = normalizeComparableText(item.enunciado);
    if (normalizedAnswer && new RegExp(`(^|[^a-z0-9])${normalizedAnswer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(normalizedPrompt)) {
      fail('respuesta_revelada', `${itemPath}.enunciado`);
    }
    const { respuesta_correcta, ...persistible } = item;
    return persistible;
  });
  return sanitized;
}

function findEditorialViolation(value, path) {
  if (typeof value === 'string') {
    const normalized = normalizeEditorialText(value);
    const match = V3_FORBIDDEN_EDITORIAL_PATTERNS.find(([, pattern]) => pattern.test(normalized));
    return match ? { code: match[0], path } : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const violation = findEditorialViolation(value[index], `${path}[${index}]`);
      if (violation) return violation;
    }
    return null;
  }
  if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const violation = findEditorialViolation(nested, `${path}.${key}`);
      if (violation) return violation;
    }
  }
  return null;
}

export function lintCuadernilloV3Block(block, path = 'bloque') {
  const violation = findEditorialViolation(block, path);
  if (violation) fail(violation.code, violation.path);
  return Object.freeze({ ok: true });
}

const GENERIC_DEMONSTRATIVE_STEPS = new Set([
  'calcula el resultado',
  'aplica la formula',
  'resuelve el problema',
  'verifica la solucion',
  'identifica los elementos',
  'analiza la informacion',
  'analiza el caso',
  'aplica el concepto',
  'revisa la informacion',
  'obten una conclusion',
  'realiza las operaciones',
  'obten la respuesta'
]);

function normalizeProcedureStep(value) {
  return normalizeEditorialText(value)
    .replace(/^[\s.,;:¡!¿?"'()\[\]{}-]+|[\s.,;:¡!¿?"'()\[\]{}-]+$/g, '');
}

function validateV3ProcedureDepth(block, level, path) {
  if (!['procedimiento', 'ejemplo_resuelto'].includes(block?.tipo)) return;
  const steps = block.pasos;
  if (!Array.isArray(steps) || steps.length === 0) fail('pasos_requeridos', `${path}.pasos`);
  const minimumSteps = level === 'demostrativo' && block.tipo === 'ejemplo_resuelto' ? 3 : 2;
  if (level === 'demostrativo' && steps.length < minimumSteps) fail('procedimiento_demostrativo_superficial', `${path}.pasos`);
  const seen = new Set();
  steps.forEach((step, index) => {
    const normalized = normalizeProcedureStep(step);
    if (seen.has(normalized)) fail('paso_procedimiento_duplicado', `${path}.pasos[${index}]`);
    seen.add(normalized);
    if (level === 'demostrativo' && GENERIC_DEMONSTRATIVE_STEPS.has(normalized)) {
      fail('paso_demostrativo_generico', `${path}.pasos[${index}]`);
    }
  });
}

function validateTaskContract(value, path) {
  if (!isObject(value)) fail('contrato_tarea_requerido', path);
  assertExactKeys(value, new Set(['conceptos_requeridos', 'familia_tarea', 'datos_necesarios', 'objetivo', 'condicion_suficiencia', 'aplicacion_tema']), path);
  assertStringArray(value.conceptos_requeridos, `${path}.conceptos_requeridos`);
  assertStringArray(value.datos_necesarios, `${path}.datos_necesarios`);
  ['familia_tarea', 'objetivo', 'condicion_suficiencia', 'aplicacion_tema'].forEach((key) => assertText(value[key], `${path}.${key}`));
}

function validatePedagogicalSlotContract(slot, block, path) {
  const contract = obtenerContratoPedagogicoSlotV3(slot);
  if (!contract) return;
  if (block.tipo !== contract.tipo) fail('representacion_pedagogica_invalida', `${path}.tipo`);
  if (contract.modalidad && block.modalidad !== contract.modalidad) fail('modalidad_pedagogica_invalida', `${path}.modalidad`);
  const collection = ['lista', 'conceptos', 'actividad'].includes(block.tipo) ? block.items : null;
  if (collection) {
    if (contract.itemsExact !== undefined && collection.length !== contract.itemsExact) fail('cantidad_pedagogica_invalida', `${path}.items`, { cantidadEsperada: contract.itemsExact, cantidadRecibida: collection.length });
    if (contract.itemsMin !== undefined && collection.length < contract.itemsMin) fail('cantidad_pedagogica_invalida', `${path}.items`, { cantidadEsperadaMin: contract.itemsMin, cantidadEsperadaMax: contract.itemsMax ?? null, cantidadRecibida: collection.length });
    if (contract.itemsMax !== undefined && collection.length > contract.itemsMax) fail('cantidad_pedagogica_invalida', `${path}.items`, { cantidadEsperadaMin: contract.itemsMin ?? null, cantidadEsperadaMax: contract.itemsMax, cantidadRecibida: collection.length });
  }
  if (block.tipo === 'tabla' && contract.filasMin !== undefined && block.filas.length < contract.filasMin) {
    fail('cantidad_pedagogica_invalida', `${path}.filas`);
  }
  if (block.tipo === 'actividad' && contract.requiereEspacio) {
    block.items.forEach((item, index) => {
      if (!item.espacio_respuesta) fail('espacio_respuesta_requerido', `${path}.items[${index}].espacio_respuesta`);
    });
  }
  if (block.tipo === 'actividad' && contract.requiereOpciones) {
    block.items.forEach((item, index) => {
      if (!Array.isArray(item.opciones) || item.opciones.length < 2) fail('opciones_pedagogicas_requeridas', `${path}.items[${index}].opciones`);
    });
  }
}

const RESPONSE_LINES_BY_MODALITY = Object.freeze({
  preguntas: 3,
  completar: 2,
  relacionar: 2,
  ejercicio: 4,
  problema: 5,
  reflexion: 5
});

function addBackendResponseSpaces(block) {
  if (block?.tipo !== 'actividad') return block;
  const lines = RESPONSE_LINES_BY_MODALITY[block.modalidad] || 3;
  block.items = block.items.map((item) => ({
    ...item,
    espacio_respuesta: { lineas: lines }
  }));
  return block;
}

const RATIONAL_ACTIVITY_INPUT_PATTERN = /^-?(?:(?:0|[1-9]\d*)(?:\.\d+)?|(?:0|[1-9]\d*)\/(?:[1-9]\d*))$/;

function assertActivityRational(value, path) {
  assertText(value, path);
  if (!RATIONAL_ACTIVITY_INPUT_PATTERN.test(value.trim())) fail('datos_actividad_incompletos', path);
}

export function construirBloqueV3DesdeSlot(slot, inputBlock, { contextoPlaneacion = null } = {}) {
  const path = `slots[${slot.slotId}].bloque`;
  let finalBlock;
  const centralDataContract = slot.slotId === 'actividades_integradoras:contextualizacion:18'
    ? obtenerContratoDatosActividadCentralV3(contextoPlaneacion)
    : null;
  if (centralDataContract) {
    if (!isObject(inputBlock)) fail('datos_actividad_incompletos', path);
    for (const key of ['tipo', 'variables', 'etiquetas_filas', 'matriz', 'vector_b']) {
      if (!Object.hasOwn(inputBlock, key)) fail('datos_actividad_incompletos', `${path}.${key}`);
    }
    assertExactKeys(inputBlock, new Set(['tipo', 'variables', 'etiquetas_filas', 'matriz', 'vector_b']), path);
    if (inputBlock.tipo !== 'tabla') fail('representacion_pedagogica_invalida', `${path}.tipo`);
    if (!Array.isArray(inputBlock.variables) || inputBlock.variables.length !== centralDataContract.columnas) {
      fail('datos_actividad_incompletos', `${path}.variables`);
    }
    const variables = inputBlock.variables.map((variable, index) => {
      if (!isObject(variable)) fail('datos_actividad_incompletos', `${path}.variables[${index}]`);
      assertExactKeys(variable, new Set(['simbolo', 'significado']), `${path}.variables[${index}]`);
      assertText(variable.simbolo, `${path}.variables[${index}].simbolo`);
      assertText(variable.significado, `${path}.variables[${index}].significado`);
      return { simbolo: variable.simbolo.trim(), significado: variable.significado.trim() };
    });
    if (new Set(variables.map(({ simbolo }) => normalizeExactLearning(simbolo))).size !== variables.length) {
      fail('datos_actividad_incompletos', `${path}.variables`);
    }
    assertStringArray(inputBlock.etiquetas_filas, `${path}.etiquetas_filas`);
    if (inputBlock.etiquetas_filas.length !== centralDataContract.filas) fail('datos_actividad_incompletos', `${path}.etiquetas_filas`);
    if (!Array.isArray(inputBlock.matriz) || inputBlock.matriz.length !== centralDataContract.filas) {
      fail('datos_actividad_incompletos', `${path}.matriz`);
    }
    inputBlock.matriz.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== centralDataContract.columnas) {
        fail('datos_actividad_incompletos', `${path}.matriz[${rowIndex}]`);
      }
      row.forEach((value, columnIndex) => assertActivityRational(value, `${path}.matriz[${rowIndex}][${columnIndex}]`));
    });
    assertStringArray(inputBlock.vector_b, `${path}.vector_b`);
    if (inputBlock.vector_b.length !== centralDataContract.filas) fail('datos_actividad_incompletos', `${path}.vector_b`);
    inputBlock.vector_b.forEach((value, index) => assertActivityRational(value, `${path}.vector_b[${index}]`));
    finalBlock = {
      tipo: 'tabla',
      titulo: 'Datos del caso: matriz A y vector b',
      columnas: ['Fila', ...variables.map(({ simbolo, significado }) => `${simbolo}: ${significado}`), 'b'],
      filas: inputBlock.matriz.map((row, index) => [inputBlock.etiquetas_filas[index].trim(), ...row.map((value) => value.trim()), inputBlock.vector_b[index].trim()]),
      cobertura: [slot.numero]
    };
  } else if (slot.slotId === 'actividades_integradoras:contextualizacion:20') {
    if (!isObject(inputBlock)) fail('bloque_invalido', path);
    assertExactKeys(inputBlock, new Set(['tipo', 'modalidad', 'instrucciones', 'pregunta_1', 'pregunta_2', 'pregunta_3', 'contrato_tarea']), path);
    if (inputBlock.tipo !== 'actividad') fail('representacion_pedagogica_invalida', `${path}.tipo`);
    if (inputBlock.modalidad !== 'preguntas') fail('modalidad_pedagogica_invalida', `${path}.modalidad`);
    assertText(inputBlock.instrucciones, `${path}.instrucciones`);
    validateTaskContract(inputBlock.contrato_tarea, `${path}.contrato_tarea`);
    const questions = ['pregunta_1', 'pregunta_2', 'pregunta_3'].map((key) => {
      assertText(inputBlock[key], `${path}.${key}`);
      return inputBlock[key].trim();
    });
    const normalized = questions.map(normalizeExactLearning);
    if (new Set(normalized).size !== questions.length) fail('pregunta_caso_duplicada', `${path}.items`);
    finalBlock = construirBloqueV2DesdeSlot(slot, {
      tipo: 'actividad', modalidad: 'preguntas', instrucciones: inputBlock.instrucciones,
      items: questions.map((enunciado) => ({ enunciado }))
    });
    addBackendResponseSpaces(finalBlock);
  } else if (slot.slotId === 'actividades_integradoras:presentacion_proyecto:8') {
    if (!isObject(inputBlock)) fail('bloque_invalido', path);
    assertExactKeys(inputBlock, new Set(['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']), path);
    if (inputBlock.tipo !== 'lista') fail('representacion_pedagogica_invalida', `${path}.tipo`);
    const items = ['aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3'].map((key) => {
      assertText(inputBlock[key], `${path}.${key}`);
      return inputBlock[key].trim();
    });
    const normalized = items.map(normalizeExactLearning);
    if (new Set(normalized).size !== items.length) fail('aprendizaje_duplicado', `${path}.items`);
    finalBlock = construirBloqueV2DesdeSlot(slot, { tipo: 'lista', items });
  } else if (slot.slotId === 'actividades_integradoras:presentacion_proyecto:11') {
    if (!isObject(inputBlock)) fail('bloque_invalido', path);
    assertExactKeys(inputBlock, new Set(['tipo', 'accion_1', 'accion_2']), path);
    if (inputBlock.tipo !== 'lista') fail('representacion_pedagogica_invalida', `${path}.tipo`);
    const items = ['accion_1', 'accion_2'].map((key) => {
      assertText(inputBlock[key], `${path}.${key}`);
      return inputBlock[key].trim();
    });
    const normalized = items.map(normalizeExactLearning);
    if (new Set(normalized).size !== items.length) fail('accion_ruta_duplicada', `${path}.items`);
    finalBlock = construirBloqueV2DesdeSlot(slot, { tipo: 'lista', items });
  } else if (slot.slotId === 'aprendizaje_guiado:presentacion_tema:8') {
    if (!isObject(inputBlock)) fail('bloque_invalido', path);
    assertExactKeys(inputBlock, new Set(['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']), path);
    if (inputBlock.tipo !== 'lista') fail('representacion_pedagogica_invalida', `${path}.tipo`);
    const items = ['aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3'].map((key) => {
      assertText(inputBlock[key], `${path}.${key}`);
      return inputBlock[key].trim();
    });
    const normalized = items.map((item) => normalizeExactLearning(item));
    if (new Set(normalized).size !== items.length) fail('aprendizaje_duplicado', `${path}.items`);
    finalBlock = construirBloqueV2DesdeSlot(slot, { tipo: 'lista', items });
  } else if (slot.slotId === 'aprendizaje_guiado:actividades_comprension:26') {
    if (!isObject(inputBlock)) fail('bloque_invalido', path);
    assertExactKeys(inputBlock, new Set(['tipo', 'categorias', 'elementos']), path);
    if (inputBlock.tipo !== 'tabla') fail('representacion_pedagogica_invalida', `${path}.tipo`);
    assertStringArray(inputBlock.categorias, `${path}.categorias`);
    assertStringArray(inputBlock.elementos, `${path}.elementos`);
    if (inputBlock.elementos.length < 4) fail('cantidad_pedagogica_invalida', `${path}.elementos`, { cantidadEsperadaMin: 4, cantidadRecibida: inputBlock.elementos.length });
    finalBlock = {
      tipo: 'tabla',
      columnas: ['Elemento', `Clasificación (${inputBlock.categorias.join(' / ')})`],
      filas: inputBlock.elementos.map((elemento) => [elemento.trim(), '']),
      cobertura: [slot.numero]
    };
  } else if (inputBlock?.tipo === 'ejemplo_resuelto') {
    const { verificacion, contrato_cuantitativo: quantitative, ...historicalInput } = inputBlock;
    if (!quantitative) fail('contrato_cuantitativo_requerido', `${path}.contrato_cuantitativo`);
    const verified = evaluarContratoCuantitativo(quantitative, CUADERNILLO_V3_QUANTITATIVE_FAMILIES, `${path}.contrato_cuantitativo`);
    if (!verified.ok) fail(verified.code, verified.path, { familia: verified.familia, solverStage: verified.solverStage });
    if (quantitative.familia_problema === 'no_cuantitativo') {
      finalBlock = construirBloqueV2DesdeSlot(slot, historicalInput);
      validateV3Verification(verificacion, `${path}.verificacion`);
      if (/=|\d+\s*[+*/×÷]\s*\d+/.test(finalBlock.resultado) || /^-?(?:\d+|\d+\.\d+|\d+\/-?\d+)$/.test(finalBlock.resultado.trim())) {
        fail('familia_cuantitativa_requerida', `${path}.contrato_cuantitativo.familia_problema`);
      }
      finalBlock.verificacion = structuredClone(verificacion);
    } else {
      assertExactKeys(inputBlock, new Set(['tipo', 'contrato_cuantitativo']), path);
      finalBlock = {
        tipo: 'ejemplo_resuelto',
        enunciado: verified.visible.enunciado,
        pasos: structuredClone(verified.visible.pasos),
        resultado: verified.visible.resultado,
        interpretacion: verified.visible.interpretacion,
        verificacion: structuredClone(verified.visible.verificaciones),
        cobertura: [slot.numero]
      };
      if (verified.visible.matrices) finalBlock.matrices = structuredClone(verified.visible.matrices);
    }
    validateV3Verification(finalBlock.verificacion, `${path}.verificacion`);
  } else if (['actividad', 'proyecto'].includes(inputBlock?.tipo)) {
    const { contrato_tarea: taskContract, ...historicalInputRaw } = inputBlock;
    validateTaskContract(taskContract, `${path}.contrato_tarea`);
    const historicalInput = prepareCompletarInput(historicalInputRaw, path);
    finalBlock = construirBloqueV2DesdeSlot(slot, historicalInput);
    if (obtenerContratoPedagogicoSlotV3(slot)?.requiereEspacio) addBackendResponseSpaces(finalBlock);
  } else {
    finalBlock = construirBloqueV2DesdeSlot(slot, inputBlock);
  }
  normalizeCuadernilloV3EditorialBlock(finalBlock);
  validatePedagogicalSlotContract(slot, finalBlock, path);
  validateV3ProcedureDepth(finalBlock, obtenerNivelProcedimentalSlotV3(slot), path);
  validateTheoreticalExposition(slot, finalBlock, path);
  if (finalBlock.tipo === 'evaluacion') {
    fail('evaluacion_no_permitida_v3', `slots[${slot.slotId}].bloque.tipo`);
  }
  lintCuadernilloV3Block(finalBlock, `slots[${slot.slotId}].bloque`);
  return finalBlock;
}

const GENERIC_VERIFICATION_PATTERNS = Object.freeze([
  /^la respuesta es correcta[.!]?$/,
  /^se verifico el resultado[.!]?$/,
  /^la solucion cumple[.!]?$/,
  /^comprobacion realizada[.!]?$/
]);

function validateV3Verification(value, path) {
  if (!Array.isArray(value) || value.length === 0) fail('verificacion_requerida', path);
  value.forEach((item, index) => {
    assertText(item, `${path}[${index}]`);
    const normalized = normalizeEditorialText(item).replace(/[¡!¿?]+$/g, '').trim();
    if (GENERIC_VERIFICATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
      fail('verificacion_generica', `${path}[${index}]`);
    }
  });
}

function validateBlockV3(block, path, allowedCoverage, activityIds, proceduralLevel = null) {
  if (block?.tipo === 'tabla' && Array.isArray(block.cobertura) && block.cobertura.length === 1 && block.cobertura[0] === 26) {
    assertExactKeys(block, new Set(['tipo', 'titulo', 'columnas', 'filas', 'cobertura']), path);
    const coverage = validateCoverage(block.cobertura, allowedCoverage, `${path}.cobertura`);
    if (block.titulo !== undefined) assertText(block.titulo, `${path}.titulo`);
    assertStringArray(block.columnas, `${path}.columnas`);
    if (!Array.isArray(block.filas) || block.filas.length < 4) fail('cantidad_pedagogica_invalida', `${path}.filas`);
    block.filas.forEach((row, index) => {
      if (!Array.isArray(row) || row.length !== 2) fail('tabla_no_rectangular', `${path}.filas[${index}]`);
      assertText(row[0], `${path}.filas[${index}][0]`);
      if (row[1] !== '') fail('respuesta_clasificacion_debe_estar_vacia', `${path}.filas[${index}][1]`);
    });
    return coverage;
  }
  if (block?.tipo !== 'ejemplo_resuelto') {
    const coverage = validateBlock(block, path, allowedCoverage, activityIds);
    validateV3ProcedureDepth(block, proceduralLevel, path);
    return coverage;
  }
  const { verificacion, matrices, ...historicalBlock } = block;
  const coverage = validateBlock(historicalBlock, path, allowedCoverage, activityIds);
  validateV3Verification(verificacion, `${path}.verificacion`);
  if (matrices !== undefined) {
    if (!Array.isArray(matrices) || matrices.length === 0) fail('matrices_invalidas', `${path}.matrices`);
    matrices.forEach((matrix, index) => {
      assertText(matrix?.titulo, `${path}.matrices[${index}].titulo`);
      assertStringArray(matrix?.columnas, `${path}.matrices[${index}].columnas`);
      if (!Array.isArray(matrix?.filas) || matrix.filas.length === 0
        || matrix.filas.some((row) => !Array.isArray(row) || row.length !== matrix.columnas.length)) {
        fail('tabla_no_rectangular', `${path}.matrices[${index}].filas`);
      }
      matrix.filas.forEach((row, rowIndex) => assertStringArray(row, `${path}.matrices[${index}].filas[${rowIndex}]`));
    });
  }
  validateV3ProcedureDepth(block, proceduralLevel, path);
  return coverage;
}

function validateSectionsAgainstBlueprint(secciones, blueprint, pathRoot, { allowMissingCoverage = false, schemaVersion = 2, tipoCuadernillo = null } = {}) {
  if (!Array.isArray(secciones) || secciones.length !== blueprint.length) {
    fail('cantidad_secciones_invalida', pathRoot);
  }

  const requiredCoverage = new Set(blueprint.flatMap((item) => item.cobertura_requerida.map(({ numero }) => numero)));
  const covered = new Set();
  const sectionIds = new Set();
  const activityIds = new Set();
  const missingCoverage = [];
  const statements = new Set();
  const v3SlotsByNumber = schemaVersion === 3
    ? new Map(obtenerSlotsCuadernilloV3(tipoCuadernillo).map((slot) => [slot.numero, slot]))
    : new Map();

  secciones.forEach((section, index) => {
    const expected = blueprint[index];
    const path = `${pathRoot}[${expected?.id || index}]`;
    if (!isObject(section)) fail('seccion_invalida', path);
    assertExactKeys(section, new Set(['id', 'titulo', 'orden', 'bloques']), path);
    assertText(section.id, `${path}.id`);
    if (sectionIds.has(section.id)) fail('seccion_duplicada', `${path}.id`);
    sectionIds.add(section.id);
    if (section.id !== expected.id) fail('seccion_ajena_o_fuera_de_orden', `${path}.id`);
    if (section.orden !== expected.orden) fail('orden_seccion_invalido', `${path}.orden`);
    assertText(section.titulo, `${path}.titulo`);
    if (!Array.isArray(section.bloques) || section.bloques.length === 0) fail('bloques_vacios', `${path}.bloques`);

    const allowedCoverage = new Set(expected.cobertura_requerida.map(({ numero }) => numero));
    const sectionCovered = new Set();
    for (let blockIndex = 0; blockIndex < section.bloques.length; blockIndex += 1) {
      const block = section.bloques[blockIndex];
      const proceduralLevels = schemaVersion === 3
        ? [...new Set((block.cobertura || []).map((numero) => obtenerNivelProcedimentalSlotV3(v3SlotsByNumber.get(numero))).filter(Boolean))]
        : [];
      const proceduralLevel = proceduralLevels.length === 1 ? proceduralLevels[0] : null;
      const blockCoverage = schemaVersion === 3
        ? validateBlockV3(block, `${path}.bloques[${blockIndex}]`, allowedCoverage, activityIds, proceduralLevel)
        : validateBlock(section.bloques[blockIndex], `${path}.bloques[${blockIndex}]`, allowedCoverage, activityIds);
      if (schemaVersion === 3) {
        const candidates = block.tipo === 'actividad'
          ? block.items.map(({ enunciado }, itemIndex) => ({ value: enunciado, path: `${path}.bloques[${blockIndex}].items[${itemIndex}].enunciado` }))
          : block.tipo === 'evaluacion'
            ? block.criterios.map(({ texto }, itemIndex) => ({ value: texto, path: `${path}.bloques[${blockIndex}].criterios[${itemIndex}].texto` }))
            : [];
        for (const candidate of candidates) {
          const normalized = normalizeEditorialText(candidate.value)
            .replace(/^[\s.,;:¡!¿?"'()\[\]{}-]+|[\s.,;:¡!¿?"'()\[\]{}-]+$/g, '');
          if (statements.has(normalized)) fail('enunciado_duplicado', candidate.path);
          statements.add(normalized);
        }
      }
      for (const numero of blockCoverage) {
        if (covered.has(numero)) fail('cobertura_duplicada', `${path}.bloques[${blockIndex}].cobertura`, { duplicados: [numero] });
        covered.add(numero);
        sectionCovered.add(numero);
      }
    }
    const faltantes = [...allowedCoverage].filter((numero) => !sectionCovered.has(numero));
    if (faltantes.length > 0) {
      if (!allowMissingCoverage) fail('cobertura_incompleta', path, { faltantes });
      missingCoverage.push({ seccionId: expected.id, numeros: faltantes });
    }
  });

  if (!allowMissingCoverage && covered.size !== requiredCoverage.size) fail('cobertura_incompleta', pathRoot);
  return { missingCoverage, activityIds };
}

function expectedSegmentBlueprint(tipoCuadernillo, expectedSectionIds) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido', 'tipoCuadernillo');
  if (!Array.isArray(expectedSectionIds) || expectedSectionIds.length === 0) {
    fail('segmento_sin_secciones', 'expectedSectionIds');
  }
  const fullBlueprint = obtenerBlueprintCuadernillo(tipoCuadernillo);
  const expectedBlueprint = expectedSectionIds.map((id, index) => {
    const section = fullBlueprint.find((item) => item.id === id);
    if (!section || section.orden !== fullBlueprint.findIndex((item) => item.id === id) + 1) {
      fail('blueprint_segmento_invalido', `expectedSectionIds[${index}]`);
    }
    return section;
  });
  if (new Set(expectedSectionIds).size !== expectedSectionIds.length) {
    fail('blueprint_segmento_invalido', 'expectedSectionIds');
  }
  for (let index = 1; index < expectedBlueprint.length; index += 1) {
    if (expectedBlueprint[index].orden !== expectedBlueprint[index - 1].orden + 1) {
      fail('blueprint_segmento_invalido', 'expectedSectionIds');
    }
  }
  return expectedBlueprint;
}

export function validateCuadernilloV2Segment(tipoCuadernillo, expectedSectionIds, payload) {
  if (!isObject(payload)) fail('raiz_segmento_invalida', 'segmento');
  assertExactKeys(payload, new Set(['secciones']), 'segmento');
  const expectedBlueprint = expectedSegmentBlueprint(tipoCuadernillo, expectedSectionIds);
  validateSectionsAgainstBlueprint(payload.secciones, expectedBlueprint, 'segmento.secciones');
  return Object.freeze({ ok: true, secciones: expectedSectionIds.length });
}

export function validateCuadernilloV2(tipoCuadernillo, contenido) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido', 'tipoCuadernillo');
  if (!isObject(contenido)) fail('raiz_invalida', 'contenido');
  if (Object.hasOwn(contenido, 'tipo_cuadernillo')) fail('tipo_no_permitido_en_contenido', 'contenido.tipo_cuadernillo');
  assertExactKeys(contenido, ROOT_KEYS, 'contenido');
  if (contenido.schema_version !== ANEXO_SCHEMA_VERSION_V2) fail('schema_version_invalida', 'contenido.schema_version');
  assertText(contenido.titulo, 'contenido.titulo');
  assertText(contenido.descripcion, 'contenido.descripcion');
  validateGeneralData(contenido.datos_generales);

  const blueprint = obtenerBlueprintCuadernillo(tipoCuadernillo);
  validateSectionsAgainstBlueprint(
    contenido.secciones,
    blueprint,
    'contenido.secciones'
  );
  const expectedGeneralSection = construirSeccionDatosGeneralesV2({
    blueprint,
    datosGenerales: contenido.datos_generales
  });
  if (JSON.stringify(canonicalJson(contenido.secciones[0])) !== JSON.stringify(canonicalJson(expectedGeneralSection))) {
    fail('seccion_datos_generales_incoherente', 'contenido.secciones[0]');
  }
  return Object.freeze({ ok: true, schemaVersion: ANEXO_SCHEMA_VERSION_V2, tipoCuadernillo });
}

function expectedSegmentBlueprintV3(tipoCuadernillo, expectedSectionIds) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido', 'tipoCuadernillo');
  if (!Array.isArray(expectedSectionIds) || expectedSectionIds.length === 0) {
    fail('segmento_sin_secciones', 'expectedSectionIds');
  }
  const fullBlueprint = obtenerBlueprintCuadernilloV3(tipoCuadernillo);
  const expectedBlueprint = expectedSectionIds.map((id, index) => {
    const section = fullBlueprint.find((item) => item.id === id);
    if (!section) fail('blueprint_segmento_invalido', `expectedSectionIds[${index}]`);
    return section;
  });
  if (new Set(expectedSectionIds).size !== expectedSectionIds.length) {
    fail('blueprint_segmento_invalido', 'expectedSectionIds');
  }
  for (let index = 1; index < expectedBlueprint.length; index += 1) {
    if (expectedBlueprint[index].orden !== expectedBlueprint[index - 1].orden + 1) {
      fail('blueprint_segmento_invalido', 'expectedSectionIds');
    }
  }
  return expectedBlueprint;
}

function assertNoV3ForbiddenContent(secciones) {
  for (let sectionIndex = 0; sectionIndex < secciones.length; sectionIndex += 1) {
    const section = secciones[sectionIndex];
    if (section.id === 'datos_generales') fail('datos_generales_no_permitidos', `contenido.secciones[${sectionIndex}].id`);
    for (let blockIndex = 0; blockIndex < section.bloques.length; blockIndex += 1) {
      const block = section.bloques[blockIndex];
      if (block.tipo === 'evaluacion' && block.modalidad === 'autoevaluacion') {
        fail('autoevaluacion_no_permitida', `contenido.secciones[${sectionIndex}].bloques[${blockIndex}].modalidad`);
      }
      lintCuadernilloV3Block(block, `contenido.secciones[${sectionIndex}].bloques[${blockIndex}]`);
      if (Object.hasOwn(block, 'slot_id')) fail('slot_crudo_no_permitido', `contenido.secciones[${sectionIndex}].bloques[${blockIndex}].slot_id`);
    }
  }
}

export function validateCuadernilloV3Segment(tipoCuadernillo, expectedSectionIds, payload) {
  if (!isObject(payload)) fail('raiz_segmento_invalida', 'segmento');
  assertExactKeys(payload, new Set(['secciones']), 'segmento');
  const expectedBlueprint = expectedSegmentBlueprintV3(tipoCuadernillo, expectedSectionIds);
  validateSectionsAgainstBlueprint(payload.secciones, expectedBlueprint, 'segmento.secciones', { schemaVersion: 3, tipoCuadernillo });
  assertNoV3ForbiddenContent(payload.secciones);
  return Object.freeze({ ok: true, secciones: expectedSectionIds.length });
}

export function validateCuadernilloV3(tipoCuadernillo, contenido) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido', 'tipoCuadernillo');
  if (!isObject(contenido)) fail('raiz_invalida', 'contenido');
  if (Object.hasOwn(contenido, 'tipo_cuadernillo')) fail('tipo_no_permitido_en_contenido', 'contenido.tipo_cuadernillo');
  assertExactKeys(contenido, new Set(['schema_version', 'titulo', 'descripcion', 'secciones']), 'contenido');
  if (contenido.schema_version !== ANEXO_SCHEMA_VERSION_V3) fail('schema_version_invalida', 'contenido.schema_version');
  assertText(contenido.titulo, 'contenido.titulo');
  assertText(contenido.descripcion, 'contenido.descripcion');
  lintCuadernilloV3Block({ titulo: contenido.titulo, descripcion: contenido.descripcion }, 'contenido');
  const blueprint = obtenerBlueprintCuadernilloV3(tipoCuadernillo);
  validateSectionsAgainstBlueprint(contenido.secciones, blueprint, 'contenido.secciones', { schemaVersion: 3, tipoCuadernillo });
  assertNoV3ForbiddenContent(contenido.secciones);
  return Object.freeze({ ok: true, schemaVersion: ANEXO_SCHEMA_VERSION_V3, tipoCuadernillo });
}
