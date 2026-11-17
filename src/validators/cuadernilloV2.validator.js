import {
  ANEXO_SCHEMA_VERSION_V2,
  obtenerBlueprintCuadernillo,
  esTipoCuadernillo
} from '../domain/cuadernillos.js';

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

const BLOCK_TYPE_SET = new Set(CUADERNILLO_V2_BLOCK_TYPES);
const ACTIVITY_MODALITY_SET = new Set(CUADERNILLO_V2_ACTIVITY_MODALITIES);
const EVALUATION_MODALITY_SET = new Set(CUADERNILLO_V2_EVALUATION_MODALITIES);
const ROOT_KEYS = new Set(['schema_version', 'titulo', 'descripcion', 'datos_generales', 'secciones']);
const GENERAL_KEYS = Object.freeze(['institucion', 'asignatura', 'unidad', 'tema', 'estudiante', 'grupo', 'fecha']);
const COMPLETABLE_GENERAL_KEYS = new Set(['estudiante', 'grupo', 'fecha']);
const FLEXIBLE_GENERAL_KEYS = new Set(['institucion', 'unidad']);

export class CuadernilloV2ValidationError extends Error {
  constructor(code, path) {
    super(`Contenido de cuadernillo v2 invalido: ${code}`);
    this.name = 'CuadernilloV2ValidationError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new CuadernilloV2ValidationError(code, path);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function validateCoverage(value, allowedCoverage, path) {
  if (!Array.isArray(value) || value.length === 0) fail('cobertura_requerida', path);
  const seen = new Set();
  for (const numero of value) {
    if (!Number.isInteger(numero) || !allowedCoverage.has(numero)) fail('cobertura_ajena', path);
    if (seen.has(numero)) fail('cobertura_duplicada', path);
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
  if (!Array.isArray(contenido.secciones) || contenido.secciones.length !== blueprint.length) {
    fail('cantidad_secciones_invalida', 'contenido.secciones');
  }

  const allRequiredCoverage = new Set(blueprint.flatMap((item) => item.cobertura_requerida.map(({ numero }) => numero)));
  const covered = new Set();
  const sectionIds = new Set();
  const activityIds = new Set();

  contenido.secciones.forEach((section, index) => {
    const path = `contenido.secciones[${index}]`;
    const expected = blueprint[index];
    if (!isObject(section)) fail('seccion_invalida', path);
    assertExactKeys(section, new Set(['id', 'titulo', 'orden', 'bloques']), path);
    assertText(section.id, `${path}.id`);
    if (sectionIds.has(section.id)) fail('seccion_duplicada', `${path}.id`);
    sectionIds.add(section.id);
    if (section.id !== expected.id) fail('seccion_ajena_o_fuera_de_orden', `${path}.id`);
    if (section.orden !== index + 1 || section.orden !== expected.orden) fail('orden_seccion_invalido', `${path}.orden`);
    assertText(section.titulo, `${path}.titulo`);
    if (!Array.isArray(section.bloques) || section.bloques.length === 0) fail('bloques_vacios', `${path}.bloques`);

    const allowedCoverage = new Set(expected.cobertura_requerida.map(({ numero }) => numero));
    for (let blockIndex = 0; blockIndex < section.bloques.length; blockIndex += 1) {
      const blockCoverage = validateBlock(section.bloques[blockIndex], `${path}.bloques[${blockIndex}]`, allowedCoverage, activityIds);
      for (const numero of blockCoverage) {
        if (covered.has(numero)) fail('cobertura_duplicada', `${path}.bloques[${blockIndex}].cobertura`);
        covered.add(numero);
      }
    }
    for (const numero of allowedCoverage) {
      if (!covered.has(numero)) fail('cobertura_incompleta', path);
    }
  });

  if (covered.size !== allRequiredCoverage.size) fail('cobertura_incompleta', 'contenido.secciones');
  return Object.freeze({ ok: true, schemaVersion: ANEXO_SCHEMA_VERSION_V2, tipoCuadernillo });
}
