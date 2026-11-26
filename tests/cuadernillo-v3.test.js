import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPO_CUADERNILLO_IDS, obtenerMetadataTipoCuadernillo } from '../src/domain/cuadernillos.js';
import {
  ANEXO_SCHEMA_VERSION_V3,
  CUADERNILLO_V3_COMMON_EDITORIAL_POLICY,
  CUADERNILLO_V3_PROCEDURAL_LEVELS,
  CUADERNILLO_V3_TYPE_POLICIES,
  CUADERNILLO_V3_DESCRIPTIONS,
  obtenerBlueprintCuadernilloV3,
  obtenerContratoPedagogicoSlotV3,
  obtenerMetadataTipoCuadernilloV3,
  obtenerFuncionEditorialSlotV3,
  obtenerNivelProcedimentalSlotV3,
  obtenerGruposCoherenciaCuadernilloV3,
  obtenerSlotsCuadernilloV3,
  validarGruposCoherenciaCuadernilloV3,
  validarSlotsCuadernilloV3
} from '../src/domain/cuadernillosV3.js';
import { resolverRepresentacionSlotCuadernilloV3 } from '../src/domain/cuadernilloV3Representations.js';
import {
  construirPromptSegmentoCuadernilloV3,
  crearPlanSegmentosCuadernilloV3,
  generarCuadernilloV3,
  validarRespuestasSlotsCuadernilloV3
} from '../src/services/cuadernilloV3.engine.js';
import {
  construirBloqueV3DesdeSlot,
  lintCuadernilloV3Block,
  validateCuadernilloV3
} from '../src/validators/cuadernilloV2.validator.js';
import {
  normalizeCuadernilloV3EditorialBlock,
  normalizeParagraphSeparators
} from '../src/utils/cuadernilloV3EditorialText.js';

const expectedCounts = Object.freeze({ ejercicios_aplicacion: 21, actividades_integradoras: 17, aprendizaje_guiado: 19 });
const expectedSections = Object.freeze({ ejercicios_aplicacion: 6, actividades_integradoras: 5, aprendizaje_guiado: 5 });
const context = Object.freeze({
  materia: 'Matematicas', nivel: 'Universidad', tema: 'Algebra lineal', duracion: 60,
  tabla_ia: [{ momento: 'Desarrollo', actividad: 'Resolver problemas' }],
  actividades_momentos: { desarrollo: 'Aplicacion guiada' }, datos_generales: {}
});

function materialize(value, slot) {
  if (typeof value === 'string' && value.startsWith('<')) return `Desarrolla ${value.slice(1, -1)} para ${slot.nombre} sobre el tema.`;
  if (Array.isArray(value)) return value.map((item) => materialize(item, slot));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, slot)]));
  return value;
}

function responseFor(slots, contextoPlaneacion = context) {
  return {
    respuestas: slots.map((slot) => ({
      slot_id: slot.slotId,
      bloque: blockFor(slot, contextoPlaneacion)
    }))
  };
}

function blockFor(slot, contextoPlaneacion = null) {
  if (slot.slotId === 'actividades_integradoras:contextualizacion:18'
    && contextoPlaneacion?.tema === 'Algebra lineal') return {
    tipo: 'tabla',
    variables: [
      { simbolo: 'x', significado: 'cantidad del recurso A' },
      { simbolo: 'y', significado: 'cantidad del recurso B' },
      { simbolo: 'z', significado: 'cantidad del recurso C' }
    ],
    etiquetas_filas: ['Restriccion 1', 'Restriccion 2', 'Restriccion 3'],
    matriz: [['2', '1', '-1'], ['1', '-1', '2'], ['3', '2', '1']],
    vector_b: ['7', '2', '10']
  };
  if (slot.tipoCuadernillo === 'ejercicios_aplicacion' && slot.numero === 36) return {
    tipo: 'ejemplo_resuelto',
    contrato_cuantitativo: { familia_problema: 'determinante_2x2', datos: { matriz: [['2', '3'], ['1', '-1']] } }
  };
  if (slot.tipoCuadernillo === 'ejercicios_aplicacion' && slot.numero === 15) return {
    tipo: 'ejemplo_resuelto',
    contrato_cuantitativo: {
      familia_problema: 'sistema_lineal_2x2',
      datos: { ecuaciones: [{ coeficiente_x: '2', coeficiente_y: '3', termino_independiente: '6' }, { coeficiente_x: '1', coeficiente_y: '-1', termino_independiente: '2' }] },
      metodo: 'cramer'
    }
  };
  const block = materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot);
  if (slot.slotId === 'aprendizaje_guiado:actividades_comprension:23') {
    block.items[0].opciones = ['matriz', 'vector', 'determinante'];
    block.items[0].respuesta_correcta = 'matriz';
    block.items[0].enunciado = 'Identifica el concepto que corresponde a un arreglo rectangular organizado en filas y columnas.';
  }
  const contract = obtenerContratoPedagogicoSlotV3(slot);
  const count = contract?.itemsExact ?? contract?.itemsMin;
  if (count && Array.isArray(block.items)) {
    block.items = Array.from({ length: count }, (_, index) => {
      const item = structuredClone(block.items[0]);
      if (typeof item === 'string') return `${item} ${index + 1}`;
      if (item.enunciado) item.enunciado = `${item.enunciado} ${index + 1}`;
      if (item.termino) item.termino = `${item.termino} ${index + 1}`;
      return item;
    });
  }
  if (contract?.filasMin && Array.isArray(block.filas)) {
    block.filas = Array.from({ length: contract.filasMin }, (_, index) => block.filas[0].map((cell) => `${cell} ${index + 1}`));
  }
  if (contract?.filasMin && Array.isArray(block.elementos)) {
    block.elementos = Array.from({ length: contract.filasMin }, (_, index) => `${block.elementos[0]} ${index + 1}`);
  }
  if (contract?.productoOwner || contract?.productoReference) block.producto = 'Producto final sintetico';
  return block;
}

function syntheticCompleter(handler = null) {
  const calls = [];
  return {
    calls,
    completar: async (request) => {
      calls.push(request);
      const custom = handler?.(request, calls.length);
      return custom || {
        content: JSON.stringify(responseFor(request.slots)),
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        durationMs: 5,
        finishReason: 'stop'
      };
    }
  };
}

test('v3 editorial paragraph normalization repairs only unequivocal separators', () => {
  assert.equal(normalizeParagraphSeparators('Uno.\\n\\nDos.'), 'Uno.\n\nDos.');
  assert.equal(normalizeParagraphSeparators('Uno.\\r\\n\\r\\nDos.'), 'Uno.\n\nDos.');
  assert.equal(normalizeParagraphSeparators('Uno.\\n\\n\\n\\nDos.'), 'Uno.\n\nDos.');
  assert.equal(normalizeParagraphSeparators('Uno.\r\n\r\nDos.'), 'Uno.\n\nDos.');
  assert.equal(normalizeParagraphSeparators('Uno.\n\n\nDos.'), 'Uno.\n\nDos.');
  assert.equal(normalizeParagraphSeparators('En JavaScript, "\\n" representa un salto'), 'En JavaScript, "\\n" representa un salto');

  const parsedRealBreaks = JSON.parse('{"texto":"Uno.\\n\\nDos."}').texto;
  const parsedLiteralEscapes = JSON.parse('{"texto":"Uno.\\\\n\\\\nDos."}').texto;
  assert.equal(parsedRealBreaks, 'Uno.\n\nDos.');
  assert.equal(parsedLiteralEscapes, 'Uno.\\n\\nDos.');
});

test('v3 block normalization excludes structured mathematics', () => {
  const matrix = [['2', '1'], ['1', '-1']];
  const quantitative = { familia_problema: 'sistema_lineal_2x2', datos: { ecuaciones: matrix } };
  const block = { tipo: 'tabla', titulo: 'Datos\\n\\ndel caso', columnas: ['x', 'y'], filas: matrix, contrato_cuantitativo: quantitative };
  normalizeCuadernilloV3EditorialBlock(block);
  assert.equal(block.titulo, 'Datos\n\ndel caso');
  assert.deepEqual(block.filas, matrix);
  assert.deepEqual(block.contrato_cuantitativo, quantitative);
});

test('repairable paragraph separators persist normalized without triggering retry', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_1') return null;
    const payload = responseFor(request.slots);
    const prose = payload.respuestas.find(({ bloque }) => bloque.tipo === 'texto');
    prose.bloque.contenido = 'Primer parrafo.\\n\\nSegundo parrafo.';
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar });
  const persisted = contenido.secciones.flatMap(({ bloques }) => bloques).find(({ tipo, contenido: text }) => tipo === 'texto' && text?.startsWith('Primer parrafo'));
  assert.equal(persisted.contenido, 'Primer parrafo.\n\nSegundo parrafo.');
  assert.equal(persisted.contenido.includes('\\n\\n'), false);
  assert.equal(calls.length, 4);
  assert.equal(calls.some(({ intento }) => intento === 2), false);
  assert.equal(calls[0].userPrompt.includes('no escribas secuencias visibles \\n, \\r\\n'), true);
});

test('v3 blueprints derive the 2O counts and omit general data plus evaluation', () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const blueprint = obtenerBlueprintCuadernilloV3(tipo);
    const slots = obtenerSlotsCuadernilloV3(tipo);
    assert.equal(slots.length, expectedCounts[tipo]);
    assert.equal(blueprint.length, expectedSections[tipo]);
    assert.deepEqual(validarSlotsCuadernilloV3(tipo), { ok: true, slots: expectedCounts[tipo] });
    assert.equal(blueprint.some(({ id }) => id === 'datos_generales'), false);
    assert.equal(slots.some(({ nombre }) => /autoevaluacion/i.test(nombre)), false);
    assert.equal(blueprint.some(({ id }) => /evaluacion/i.test(id)), false);
    assert.match(blueprint.at(-1).id, /cierre/);
    assert.equal(slots.some(({ numero }) => numero <= 6), false);
    assert.equal(new Set(slots.map(({ slotId }) => slotId)).size, slots.length);
  }
  assert.equal(obtenerBlueprintCuadernilloV3('aprendizaje_guiado').some(({ id }) => id === 'actividades_aplicacion'), false);
  assert.equal(obtenerBlueprintCuadernilloV3('ejercicios_aplicacion').some(({ id }) => ['ejercicios_intermedios', 'retos_problemas'].includes(id)), false);
  assert.equal(obtenerBlueprintCuadernilloV3('actividades_integradoras').some(({ id }) => /^fase_[123]/.test(id)), false);
});

test('v3 keeps four ordered segments and every canonical slot exactly once', () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const plan = crearPlanSegmentosCuadernilloV3(tipo);
    assert.equal(plan.length, 4);
    assert.deepEqual(plan.flatMap(({ slots }) => slots.map(({ slotId }) => slotId)), obtenerSlotsCuadernilloV3(tipo).map(({ slotId }) => slotId));
  }
});

test('2O.1 pedagogical cardinalities are canonical and distributed by modality', () => {
  const contract = (tipo, numero) => obtenerContratoPedagogicoSlotV3(
    obtenerSlotsCuadernilloV3(tipo).find((slot) => slot.numero === numero)
  );
  assert.equal(contract('aprendizaje_guiado', 8).itemsExact, 3);
  assert.equal(contract('aprendizaje_guiado', 8).contratoEntrada, 'tres_aprendizajes');
  assert.equal(contract('aprendizaje_guiado', 21).itemsMin, 4);
  assert.equal(contract('aprendizaje_guiado', 21).itemsMax, 5);
  assert.equal(contract('aprendizaje_guiado', 34).itemsExact, 3);
  assert.equal(contract('aprendizaje_guiado', 35).itemsExact, 2);
  assert.deepEqual([22, 23, 24].map((numero) => contract('aprendizaje_guiado', numero).modalidad), ['preguntas', 'completar', 'relacionar']);
  assert.equal(contract('aprendizaje_guiado', 26).tipo, 'tabla');

  const exercises = obtenerBlueprintCuadernilloV3('ejercicios_aplicacion');
  assert.equal(exercises.find(({ id }) => id === 'ejemplos_resueltos').cobertura_requerida.filter(({ nombre }) => /Ejemplo resuelto/.test(nombre)).length, 2);
  assert.equal(exercises.find(({ id }) => id === 'ejercicios_basicos').cobertura_requerida.length, 3);
  assert.equal(exercises.some(({ id }) => ['ejercicios_intermedios', 'retos_problemas'].includes(id)), false);
  assert.equal(exercises.find(({ id }) => id === 'actividad_integradora').cobertura_requerida.length, 3);
  assert.equal(contract('ejercicios_aplicacion', 28).itemsExact, 1);
  assert.match(resolverRepresentacionSlotCuadernilloV3(obtenerSlotsCuadernilloV3('ejercicios_aplicacion').find(({ numero }) => numero === 28)).reglas.join(' '), /exactamente un item/);
  assert.equal(contract('ejercicios_aplicacion', 35).itemsExact, 2);

  assert.equal(contract('actividades_integradoras', 8).itemsExact, 3);
  assert.equal(contract('actividades_integradoras', 8).contratoEntrada, 'tres_aprendizajes_proyecto');
  assert.equal(contract('actividades_integradoras', 11).itemsExact, 2);
  assert.equal(contract('actividades_integradoras', 11).contratoEntrada, 'dos_acciones_ruta_compacta');
  assert.equal(contract('actividades_integradoras', 20).itemsExact, 3);
  assert.equal(contract('actividades_integradoras', 20).contratoEntrada, 'tres_preguntas_caso');
  assert.equal(contract('actividades_integradoras', 10).productoOwner, true);
  assert.equal(contract('actividades_integradoras', 31).productoReference, true);
  assert.equal(obtenerBlueprintCuadernilloV3('actividades_integradoras').find(({ id }) => id === 'contextualizacion').cobertura_requerida.filter(({ numero }) => numero === 31).length, 1);
  assert.equal(contract('actividades_integradoras', 45).itemsExact, 2);
});

test('guided slot 8 requires three named inputs and hydrates one canonical visible list', () => {
  const segment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[0];
  const slot = segment.slots.find(({ numero }) => numero === 8);
  const prompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento: segment, slots: [slot]
  });
  const definition = prompt.jsonSchema.$defs.bloque_lista_tres_aprendizajes;
  assert.deepEqual(definition.required, ['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']);
  assert.equal(definition.additionalProperties, false);
  assert.deepEqual(Object.keys(definition.properties), ['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']);
  assert.match(prompt.userPrompt, /exactamente tres aprendizajes diferentes/);

  const valid = {
    tipo: 'lista',
    aprendizaje_1: 'Identifica los conceptos centrales del tema.',
    aprendizaje_2: 'Explica las relaciones entre los conceptos del tema.',
    aprendizaje_3: 'Compara aplicaciones pertinentes de los conceptos.'
  };
  const hydrated = construirBloqueV3DesdeSlot(slot, valid);
  assert.deepEqual(hydrated.items, [valid.aprendizaje_1, valid.aprendizaje_2, valid.aprendizaje_3]);
  assert.deepEqual(Object.keys(hydrated).sort(), ['cobertura', 'items', 'tipo']);
  assert.equal(JSON.stringify(hydrated).includes('aprendizaje_1'), false);

  for (const missing of ['aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']) {
    const candidate = { ...valid };
    delete candidate[missing];
    assert.throws(() => construirBloqueV3DesdeSlot(slot, candidate), (error) => error.code === 'texto_requerido' && error.path.endsWith(missing));
  }
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...valid, extra: 'no permitido' }), (error) => error.code === 'propiedad_no_permitida' && error.path.endsWith('.extra'));
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...valid, aprendizaje_2: '   ' }), (error) => error.code === 'texto_requerido' && error.path.endsWith('.aprendizaje_2'));
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...valid, aprendizaje_3: '  IDENTIFICA los conceptos centrales del tema!!! ' }), (error) => error.code === 'aprendizaje_duplicado' && error.path.endsWith('.items'));

  for (const count of [0, 1, 2, 3, 4]) {
    assert.throws(
      () => construirBloqueV3DesdeSlot(slot, { tipo: 'lista', items: Array.from({ length: count }, (_, index) => `Aprendizaje ${index + 1}`) }),
      (error) => error.code === 'propiedad_no_permitida' && error.path.endsWith('.items')
    );
  }
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { tipo: 'lista', aprendizaje_1: 1, aprendizaje_2: 'Dos', aprendizaje_3: 'Tres' }), (error) => error.code === 'texto_requerido');
});

test('integrative presentation cardinalities are structural and hydrate canonical visible lists', () => {
  const segment = crearPlanSegmentosCuadernilloV3('actividades_integradoras')[0];
  const slot8 = segment.slots.find(({ numero }) => numero === 8);
  const slot11 = segment.slots.find(({ numero }) => numero === 11);
  const prompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, segmento: segment
  });
  const learnings = prompt.jsonSchema.$defs.bloque_lista_tres_aprendizajes_proyecto;
  const route = prompt.jsonSchema.$defs.bloque_lista_dos_acciones_compactas;
  assert.deepEqual(learnings.required, ['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']);
  assert.deepEqual(route.required, ['tipo', 'accion_1', 'accion_2']);
  assert.equal(learnings.additionalProperties, false);
  assert.equal(route.additionalProperties, false);
  assert.equal(Object.hasOwn(learnings.properties, 'items'), false);
  assert.equal(Object.hasOwn(route.properties, 'items'), false);

  const visible8 = construirBloqueV3DesdeSlot(slot8, {
    tipo: 'lista', aprendizaje_1: 'Analiza el caso central.', aprendizaje_2: 'Relaciona la evidencia con la teoría.', aprendizaje_3: 'Comunica conclusiones justificadas.'
  });
  const visible11 = construirBloqueV3DesdeSlot(slot11, {
    tipo: 'lista', accion_1: 'Analiza el caso y organiza la evidencia disponible.', accion_2: 'Construye la evidencia final y redacta conclusiones.'
  });
  assert.equal(visible8.items.length, 3);
  assert.equal(visible11.items.length, 2);
  assert.doesNotMatch(JSON.stringify([visible8, visible11]), /aprendizaje_[123]|accion_[12]/);
  assert.throws(
    () => construirBloqueV3DesdeSlot(slot8, { tipo: 'lista', items: ['Uno', 'Dos', 'Tres', 'Cuatro'] }),
    (error) => error.code === 'propiedad_no_permitida'
  );

  const contextualization = crearPlanSegmentosCuadernilloV3('actividades_integradoras')[2];
  const slot20 = contextualization.slots.find(({ numero }) => numero === 20);
  const contextualPrompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, segmento: contextualization
  });
  const questions = contextualPrompt.jsonSchema.$defs.bloque_actividad_tres_preguntas_caso;
  assert.deepEqual(questions.required, ['tipo', 'modalidad', 'instrucciones', 'pregunta_1', 'pregunta_2', 'pregunta_3', 'contrato_tarea']);
  assert.equal(questions.additionalProperties, false);
  assert.equal(Object.hasOwn(questions.properties, 'items'), false);
  const visible20 = construirBloqueV3DesdeSlot(slot20, blockFor(slot20));
  assert.equal(visible20.items.length, 3);
  assert.equal(visible20.items.every((item) => item.espacio_respuesta?.lineas === 3), true);
  assert.doesNotMatch(JSON.stringify(visible20), /pregunta_[123]/);
});

test('guided slot 8 retry is isolated, preserves valid siblings and exposes only safe cardinality metadata', async () => {
  const diagnostics = [];
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_1' && request.intento === 1) {
      const payload = responseFor(request.slots);
      payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':8')).bloque = {
        tipo: 'lista', aprendizaje_1: 'Identifica el tema.', aprendizaje_2: '', aprendizaje_3: 'Explica el tema.'
      };
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  const result = await generarCuadernilloV3({
    tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar,
    diagnosticar: (event) => diagnostics.push(event)
  });
  const first = calls.find(({ segmento, intento }) => segmento.id === 'segmento_1' && intento === 1);
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_1' && intento === 2);
  assert.equal(first.slots.length, 3);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [8]);
  assert.match(retry.userPrompt, /aprendizaje_1.*aprendizaje_2.*aprendizaje_3/);
  assert.match(retry.userPrompt, /exactamente aprendizaje_1, aprendizaje_2 y aprendizaje_3/);
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_1').length, 2);
  const event = diagnostics.find(({ eventType, segmentoId }) => eventType === 'segment_slot_retry' && segmentoId === 'segmento_1');
  assert.equal(event.respuestasValidas, 2);
  assert.equal(event.respuestasInvalidas, 1);
  assert.equal(JSON.stringify(event).includes('Identifica el tema'), false);
  assert.doesNotThrow(() => validateCuadernilloV3('aprendizaje_guiado', result.contenido));
});

test('integrative central activity owns complete matrix and vector data without persisting transient metadata', () => {
  const segment = crearPlanSegmentosCuadernilloV3('actividades_integradoras')[2];
  const slot = segment.slots.find(({ numero }) => numero === 18);
  const prompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, segmento: segment
  });
  const schema = prompt.jsonSchema.$defs.bloque_datos_matriz_vector_actividad_central;
  assert.deepEqual(schema.required, ['tipo', 'variables', 'etiquetas_filas', 'matriz', 'vector_b']);
  assert.equal(schema.additionalProperties, false);
  assert.match(prompt.userPrompt, /matriz A numerica 3x3/i);
  assert.match(prompt.userPrompt, /no remitas a datos/i);

  const valid = blockFor(slot, context);
  const visible = construirBloqueV3DesdeSlot(slot, valid, { contextoPlaneacion: context });
  assert.equal(visible.tipo, 'tabla');
  assert.deepEqual(visible.columnas, ['Fila', 'x: cantidad del recurso A', 'y: cantidad del recurso B', 'z: cantidad del recurso C', 'b']);
  assert.equal(visible.filas.length, 3);
  assert.deepEqual(visible.filas[0], ['Restriccion 1', '2', '1', '-1', '7']);
  assert.doesNotMatch(JSON.stringify(visible), /"(?:variables|etiquetas_filas|vector_b|matriz)"\s*:/);
  assert.doesNotMatch(JSON.stringify(visible), /determinante\s*=|rango\s*=|x\s*=/i);

  const rejects = (candidate, suffix) => assert.throws(
    () => construirBloqueV3DesdeSlot(slot, candidate, { contextoPlaneacion: context }),
    (error) => error.code === 'datos_actividad_incompletos' && error.path.endsWith(suffix)
  );
  const withoutMatrix = structuredClone(valid); delete withoutMatrix.matriz;
  rejects(withoutMatrix, '.matriz');
  const withoutVector = structuredClone(valid); delete withoutVector.vector_b;
  rejects(withoutVector, '.vector_b');
  rejects({ ...valid, matriz: [['1', '2'], ['3', '4'], ['5', '6']] }, '.matriz[0]');
  rejects({ ...valid, vector_b: ['1', '2'] }, '.vector_b');
  rejects({ ...valid, variables: valid.variables.slice(0, 2) }, '.variables');
  rejects({ ...valid, etiquetas_filas: ['Fila 1', 'Fila 2'] }, '.etiquetas_filas');
});

test('missing structured central data retries the whole group with the causal error and aborts after two attempts', async () => {
  const diagnostics = [];
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.tipoCuadernillo !== 'actividades_integradoras' || request.segmento.id !== 'segmento_3') return null;
    const payload = responseFor(request.slots);
    payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':18')).bloque = {
      tipo: 'texto', contenido: 'El laboratorio entrega los datos necesarios.'
    };
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  });
  await assert.rejects(
    generarCuadernilloV3({
      tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, completar,
      diagnosticar: (event) => diagnostics.push(event)
    }),
    (error) => error.code === 'segmento_invalido_tras_retry'
  );
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_3' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [17, 18, 20, 31]);
  assert.match(retry.userPrompt, /datos_actividad_incompletos/);
  assert.match(retry.userPrompt, /matriz A numerica 3x3/i);
  const failed = diagnostics.find(({ eventType, segmentoId }) => eventType === 'segment_slot_retry_failed' && segmentoId === 'segmento_3');
  assert.equal(failed.errorCode, 'datos_actividad_incompletos');
  assert.equal(failed.slotCausal, 'actividades_integradoras:contextualizacion:18');
  assert.equal(failed.retryScope, 'group');
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_3').length, 2);
});

test('guided slot 8 second invalid attempt aborts without a third call', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_1') return null;
    return {
      content: JSON.stringify({ respuestas: request.slots.map((slot) => ({
        slot_id: slot.slotId,
        bloque: slot.numero === 8
          ? { tipo: 'lista', aprendizaje_1: 'Identifica.', aprendizaje_2: '', aprendizaje_3: 'Explica.' }
          : blockFor(slot)
      })) }),
      finishReason: 'stop'
    };
  });
  await assert.rejects(
    generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar }),
    (error) => error.code === 'segmento_invalido_tras_retry'
  );
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_1').length, 2);
});

test('cardinality diagnostics expose counts without exposing pedagogical content', () => {
  const segment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[3];
  const slot = segment.slots.find(({ numero }) => numero === 34);
  const payload = responseFor([slot]);
  payload.respuestas[0].bloque.items = ['Primera idea privada.', 'Segunda idea privada.'];
  const analysis = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: [slot], payload });
  const error = analysis.invalidas.get(slot.slotId);
  assert.equal(error.code, 'cantidad_pedagogica_invalida');
  assert.equal(error.path, `slots[${slot.slotId}].bloque.items`);
  assert.equal(error.cantidadEsperada, 3);
  assert.equal(error.cantidadRecibida, 2);
  assert.equal(JSON.stringify(error).includes('Primera idea privada'), false);
});

test('canonical coherence groups contain known unique slots and remain segment-local', () => {
  assert.deepEqual(validarGruposCoherenciaCuadernilloV3('ejercicios_aplicacion'), { ok: true, grupos: 3 });
  assert.deepEqual(validarGruposCoherenciaCuadernilloV3('actividades_integradoras'), { ok: true, grupos: 2 });
  assert.deepEqual(validarGruposCoherenciaCuadernilloV3('aprendizaje_guiado'), { ok: true, grupos: 0 });
  const exercises = obtenerGruposCoherenciaCuadernilloV3('ejercicios_aplicacion');
  assert.deepEqual(exercises.map(({ id, miembrosNumeros }) => [id, miembrosNumeros]), [
    ['ejemplo_resuelto_15_17', [15, 16, 17]],
    ['ejemplo_resuelto_36_38', [36, 37, 38]],
    ['actividad_integradora_28_30', [28, 29, 30]]
  ]);
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const plan = crearPlanSegmentosCuadernilloV3(tipo);
    for (const group of obtenerGruposCoherenciaCuadernilloV3(tipo)) {
      assert.equal(plan.filter(({ slots }) => group.miembros.every(({ slotId }) => slots.some((slot) => slot.slotId === slotId))).length, 1);
    }
  }
});

test('effective prompts carry common and type-specific editorial policies without copyable schema prose', () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const segment = crearPlanSegmentosCuadernilloV3(tipo)[0];
    const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: tipo, contextoPlaneacion: context, segmento: segment });
    assert.match(prompt.userPrompt, /POLITICA EDITORIAL COMUN OBLIGATORIA/);
    assert.match(prompt.userPrompt, /Escribe exclusivamente para el estudiante/);
    assert.doesNotMatch(prompt.userPrompt, /Esta actividad permitira/);
    assert.match(prompt.userPrompt, /No repitas etiquetas/);
    for (const rule of CUADERNILLO_V3_TYPE_POLICIES[tipo]) assert.match(prompt.userPrompt, new RegExp(rule.slice(0, 24)));
    assert.equal(prompt.jsonSchema.additionalProperties, false);
    const representations = segment.slots.map(resolverRepresentacionSlotCuadernilloV3);
    const serializedSchemas = JSON.stringify(representations.map(({ esquemaMinimo }) => esquemaMinimo));
    assert.doesNotMatch(serializedSchemas, /Instrucciones claras|Contenido pedagogico util|Elemento pedagogico desarrollado/i);
  }
  assert.equal(CUADERNILLO_V3_COMMON_EDITORIAL_POLICY.length >= 10, true);
});

test('effective prompts contain no removed 2O.1 sections or obsolete three-phase route', () => {
  const forbidden = /actividades_aplicacion|ejercicios_intermedios|retos_problemas|fase_1_analisis|fase_2_diseno|fase_3_producto|ruta de tres etapas/i;
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const prompt = crearPlanSegmentosCuadernilloV3(tipo).map((segmento) => construirPromptSegmentoCuadernilloV3({
      tipoCuadernillo: tipo, contextoPlaneacion: context, segmento
    }).userPrompt).join('\n');
    assert.doesNotMatch(prompt, forbidden);
  }
});

test('v3 assigns canonical procedural depth by workbook type and section', () => {
  const slot = (tipo, numero) => obtenerSlotsCuadernilloV3(tipo).find((item) => item.numero === numero);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('aprendizaje_guiado', 16)), CUADERNILLO_V3_PROCEDURAL_LEVELS.DEMOSTRATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('aprendizaje_guiado', 17)), CUADERNILLO_V3_PROCEDURAL_LEVELS.DEMOSTRATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('ejercicios_aplicacion', 15)), CUADERNILLO_V3_PROCEDURAL_LEVELS.DEMOSTRATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('ejercicios_aplicacion', 18)), CUADERNILLO_V3_PROCEDURAL_LEVELS.ORIENTADOR);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('ejercicios_aplicacion', 28)), CUADERNILLO_V3_PROCEDURAL_LEVELS.OPERATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('actividades_integradoras', 31)), CUADERNILLO_V3_PROCEDURAL_LEVELS.OPERATIVO);
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    for (const candidate of obtenerSlotsCuadernilloV3(tipo)) {
      const representation = resolverRepresentacionSlotCuadernilloV3(candidate);
      if (representation.bloquesPermitidos.includes('procedimiento') || representation.recomendacionPrincipal.tipo === 'ejemplo_resuelto') {
        assert.ok(representation.nivelProcedimental, candidate.slotId);
      }
    }
  }
});

test('procedural policies distinguish demonstration, guidance and operation without adding verbosity', () => {
  const byId = (id) => TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3).find((slot) => slot.slotId === id);
  const demonstrative = resolverRepresentacionSlotCuadernilloV3(byId('aprendizaje_guiado:desarrollo_teorico:16'));
  const orienting = resolverRepresentacionSlotCuadernilloV3(byId('ejercicios_aplicacion:ejercicios_basicos:18'));
  const operational = resolverRepresentacionSlotCuadernilloV3(byId('actividades_integradoras:contextualizacion:31'));
  assert.match(demonstrative.reglas.join(' '), /operaciones intermedias/);
  assert.match(demonstrative.reglas.join(' '), /pasos breves, una accion concreta por paso/);
  assert.match(orienting.reglas.join(' '), /deja las operaciones y el resultado final al estudiante/);
  assert.match(operational.reglas.join(' '), /acciones, decisiones, entregables y evidencias/);
  const guidedSegment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado').find(({ slots }) => slots.some(({ numero }) => numero === 16));
  const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento: guidedSegment });
  assert.match(prompt.userPrompt, /"nivel_procedimental"\s*:\s*"demostrativo"/);
  assert.match(prompt.userPrompt, /operaciones intermedias/);
});

test('demonstrative procedures reject generic or duplicate steps and accept concrete development', () => {
  const slot = obtenerSlotsCuadernilloV3('aprendizaje_guiado').find(({ numero }) => numero === 16);
  assert.throws(
    () => construirBloqueV3DesdeSlot(slot, { tipo: 'procedimiento', pasos: ['Calcula el resultado.', 'Aplica la fórmula.'] }),
    (error) => error.code === 'paso_demostrativo_generico' && /pasos\[0\]$/.test(error.path)
  );
  assert.throws(
    () => construirBloqueV3DesdeSlot(slot, { tipo: 'procedimiento', pasos: ['Compara los datos del caso.', '  Compara los datos del caso! '] }),
    (error) => error.code === 'paso_procedimiento_duplicado'
  );
  assert.doesNotThrow(() => construirBloqueV3DesdeSlot(slot, {
    tipo: 'procedimiento',
    pasos: ['Forma la matriz A con los coeficientes dados.', 'Calcula Δ = (2)(-1) - (3)(1) = -5.']
  }));
  assert.doesNotThrow(() => construirBloqueV3DesdeSlot(slot, {
    tipo: 'procedimiento',
    pasos: ['Distingue la tesis de cada argumento del caso.', 'Compara sus evidencias y justifica cuál sostiene mejor la conclusión.']
  }));
});

test('student-work slots use canonical response structures instead of expository placeholders', () => {
  const slots = TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3).filter((slot) => obtenerContratoPedagogicoSlotV3(slot)?.requiereEspacio);
  assert.equal(slots.length > 0, true);
  for (const slot of slots) {
    const representation = resolverRepresentacionSlotCuadernilloV3(slot);
    assert.equal(['registro', 'espacio_respuesta', 'actividad', 'proyecto'].includes(representation.recomendacionPrincipal.tipo), true);
    assert.equal(representation.recomendacionPrincipal.tipo === 'texto', false);
  }
});

test('guided comprehension separates complete prompts from backend-owned response spaces', () => {
  const slots = obtenerSlotsCuadernilloV3('aprendizaje_guiado');
  const completar = slots.find(({ numero }) => numero === 23);
  const relacionar = slots.find(({ numero }) => numero === 24);
  const clasificar = slots.find(({ numero }) => numero === 26);
  const segment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[2];
  const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento: segment });

  assert.equal(resolverRepresentacionSlotCuadernilloV3(completar).recomendacionPrincipal.modalidad, 'completar');
  assert.equal(resolverRepresentacionSlotCuadernilloV3(relacionar).recomendacionPrincipal.modalidad, 'relacionar');
  assert.equal(resolverRepresentacionSlotCuadernilloV3(clasificar).recomendacionPrincipal.tipo, 'tabla');
  assert.match(prompt.userPrompt, /backend agrega los espacios visuales/i);
  assert.match(prompt.userPrompt, /descripcion u oracion completa para identificar un termino/i);
  assert.match(prompt.userPrompt, /categorias y al menos cuatro elementos completos/i);
  assert.doesNotMatch(resolverRepresentacionSlotCuadernilloV3(completar).reglas.join(' '), /incluye lineas|guiones bajos dentro/i);
  assert.doesNotMatch(resolverRepresentacionSlotCuadernilloV3(clasificar).reglas.join(' '), /incluye lineas|guiones bajos dentro/i);

  const completarSchema = Object.values(prompt.jsonSchema.$defs).find((schema) => schema.properties?.modalidad?.enum?.includes('completar'));
  assert.ok(completarSchema);
  assert.equal(Object.hasOwn(completarSchema.properties.items.items.properties, 'espacio_respuesta'), false);
  assert.equal(Object.hasOwn(completarSchema.properties.items.items.properties, 'opciones'), true);
  assert.equal(Object.hasOwn(completarSchema.properties.items.items.properties, 'respuesta_correcta'), true);
  const classificationSchema = prompt.jsonSchema.$defs.bloque_tabla_clasificacion;
  assert.deepEqual(classificationSchema.required, ['tipo', 'categorias', 'elementos']);
  assert.equal(classificationSchema.additionalProperties, false);

  const completed = construirBloqueV3DesdeSlot(completar, {
    tipo: 'actividad', modalidad: 'completar', instrucciones: 'Identifica cada concepto con el banco de palabras.',
    items: [{
      enunciado: 'Escribe el término que corresponde a un arreglo rectangular organizado en filas y columnas.',
      opciones: ['matriz', 'vector', 'determinante'], respuesta_correcta: 'matriz'
    }],
    contrato_tarea: {
      conceptos_requeridos: ['matriz'], familia_tarea: 'identificacion_conceptual', datos_necesarios: ['descripción completa'],
      objetivo: 'Identificar el concepto', condicion_suficiencia: 'La descripción distingue el concepto', aplicacion_tema: 'Relaciona definición y concepto'
    }
  });
  assert.deepEqual(completed.items[0].espacio_respuesta, { lineas: 2 });
  assert.deepEqual(completed.items[0].opciones, ['matriz', 'vector', 'determinante']);
  assert.equal(Object.hasOwn(completed.items[0], 'respuesta_correcta'), false);
  assert.doesNotMatch(completed.items[0].enunciado, /matriz|_{3,}/i);

  const classified = construirBloqueV3DesdeSlot(clasificar, {
    tipo: 'tabla', categorias: ['Vector', 'Matriz'],
    elementos: ['Desplazamiento con magnitud y dirección', 'Arreglo rectangular de números', 'Lista ordenada de componentes', 'Transformación organizada por filas y columnas']
  });
  assert.equal(classified.filas.length, 4);
  assert.equal(classified.filas.every((row) => row.length === 2 && row[0] && row[1] === ''), true);
});

test('placeholder line linter rejects visual text markers but accepts complete prompts', () => {
  for (const invalid of ['Completa ____ con el concepto.', 'Escribe en la línea la respuesta.', 'Responde en el recuadro de abajo.', 'Relaciona el concepto -----']) {
    assert.throws(() => lintCuadernilloV3Block({ tipo: 'texto', contenido: invalid }, 'bloque'), (error) => error.code === 'editorial_placeholder_lineas');
  }
  assert.doesNotThrow(() => lintCuadernilloV3Block({ tipo: 'texto', contenido: 'Explica cómo se relacionan los dos conceptos del caso.' }, 'bloque'));
});

test('guided theory remains expository and rejects embedded comprehension activities', () => {
  const slots = obtenerSlotsCuadernilloV3('aprendizaje_guiado');
  const theory = slots.find(({ numero }) => numero === 12);
  assert.throws(
    () => construirBloqueV3DesdeSlot(theory, { tipo: 'texto', contenido: 'Comprueba tu comprensión: responde qué relación existe entre ambos conceptos.' }),
    (error) => error.code === 'actividad_en_desarrollo_teorico' && error.path.endsWith('.contenido')
  );
  assert.doesNotThrow(() => construirBloqueV3DesdeSlot(theory, {
    tipo: 'texto', contenido: 'Una matriz organiza valores en filas y columnas; su dimensión relaciona ambas cantidades.'
  }));
  assert.doesNotThrow(() => construirBloqueV3DesdeSlot(theory, {
    tipo: 'texto', contenido: 'Ejemplo ilustrativo resuelto: una matriz con dos filas y tres columnas tiene dimensión 2 × 3.'
  }));
});

test('complete-with-bank validates a hidden answer and strips it before persistence', () => {
  const slot = obtenerSlotsCuadernilloV3('aprendizaje_guiado').find(({ numero }) => numero === 23);
  const build = (enunciado, respuesta = 'determinante', opciones = ['determinante', 'vector propio', 'espacio nulo']) => construirBloqueV3DesdeSlot(slot, {
    tipo: 'actividad', modalidad: 'completar', instrucciones: 'Identifica el término correspondiente.',
    items: [{ enunciado, opciones, respuesta_correcta: respuesta }],
    contrato_tarea: {
      conceptos_requeridos: ['matrices'], familia_tarea: 'identificacion_conceptual', datos_necesarios: ['pista completa'],
      objetivo: 'Identificar el concepto', condicion_suficiencia: 'El banco contiene una respuesta inequívoca', aplicacion_tema: 'Relaciona propiedades y conceptos'
    }
  });
  assert.throws(
    () => build('Valor escalar asociado a una matriz cuadrada denominado determinante.'),
    (error) => error.code === 'respuesta_revelada' && error.path.endsWith('.items[0].enunciado')
  );
  assert.throws(
    () => build('Valor escalar asociado a una matriz cuadrada.', 'rango'),
    (error) => error.code === 'respuesta_fuera_banco' && error.path.endsWith('.respuesta_correcta')
  );
  const block = build('Valor escalar asociado a una matriz cuadrada que permite analizar si es invertible.');
  assert.equal(Object.hasOwn(block.items[0], 'respuesta_correcta'), false);
  assert.deepEqual(block.items[0].opciones, ['determinante', 'vector propio', 'espacio nulo']);
  assert.deepEqual(block.items[0].espacio_respuesta, { lineas: 2 });
});

test('revealed answer retry remains isolated and gives a safe corrective contract', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_3' && request.intento === 1) {
      const payload = responseFor(request.slots);
      const item = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':23')).bloque.items[0];
      item.enunciado = 'El determinante es el valor escalar asociado a una matriz cuadrada.';
      item.respuesta_correcta = 'determinante';
      item.opciones = ['determinante', 'vector propio', 'espacio nulo'];
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_3' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [23]);
  assert.match(retry.userPrompt, /reformula la descripcion sin mencionar el termino correcto/i);
  assert.match(retry.userPrompt, /metadata interna/i);
  assert.doesNotMatch(JSON.stringify(contenido), /respuesta_correcta/);
});

test('placeholder retry requests only guided slots 23 and 26 and preserves valid siblings', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_3' && request.intento === 1) {
      const payload = responseFor(request.slots);
      payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':23')).bloque.items[0].enunciado = 'Completa _____ con el concepto.';
      payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':26')).bloque.elementos[0] = 'Clasifica este elemento _____';
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_3' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [23, 26]);
  assert.match(retry.userPrompt, /Elimina guiones bajos, lineas y caracteres repetidos/);
  assert.match(retry.userPrompt, /backend lo agrega automaticamente/);
  assert.match(retry.userPrompt, /Conserva la actividad y su banco de palabras, columnas o categorias/);
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_3').length, 2);
  assert.doesNotThrow(() => validateCuadernilloV3('aprendizaje_guiado', contenido));
});

test('a second placeholder failure aborts guided comprehension without a third call', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_3') return null;
    const payload = responseFor(request.slots);
    for (const response of payload.respuestas) {
      if (response.slot_id.endsWith(':23')) response.bloque.items[0].enunciado = 'Completa _____.';
      if (response.slot_id.endsWith(':26')) response.bloque.elementos[0] = 'Clasifica _____.';
    }
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  });
  await assert.rejects(
    generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar }),
    (error) => error.code === 'segmento_invalido_tras_retry'
  );
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_3').length, 2);
});

test('every advertised allowed schema is structurally valid for its slot', () => {
  for (const slot of TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3)) {
    const representation = resolverRepresentacionSlotCuadernilloV3(slot);
    assert.deepEqual(representation.schemasPermitidos.map(({ tipo }) => tipo), representation.bloquesPermitidos);
    for (const { esquema } of representation.schemasPermitidos) {
      const block = esquema.tipo === representation.recomendacionPrincipal.tipo ? blockFor(slot) : materialize(esquema, slot);
      assert.doesNotThrow(() => construirBloqueV3DesdeSlot(slot, block), `${slot.slotId}:${esquema.tipo}`);
    }
  }
});

test('resolved-example contract requires a visible quantitative check and field consistency', () => {
  const slot = TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3)
    .find((item) => resolverRepresentacionSlotCuadernilloV3(item).recomendacionPrincipal.tipo === 'ejemplo_resuelto');
  const representation = resolverRepresentacionSlotCuadernilloV3(slot);
  assert.match(representation.reglas.join(' '), /devuelve exclusivamente datos matematicos de entrada racionales/);
  assert.match(representation.reglas.join(' '), /backend construye pasos, determinantes, solucion, resultado, comprobacion/);
  assert.match(representation.reglas.join(' '), /No incluyas .*resultado_estructurado/);
  const consistent = {
    tipo: 'ejemplo_resuelto',
    contrato_cuantitativo: {
      familia_problema: 'sistema_lineal_2x2',
      datos: { ecuaciones: [{ coeficiente_x: '2', coeficiente_y: '3', termino_independiente: '6' }, { coeficiente_x: '1', coeficiente_y: '-1', termino_independiente: '1' }] },
      metodo: 'cramer'
    }
  };
  const block = construirBloqueV3DesdeSlot(slot, consistent);
  assert.equal(block.resultado, 'x = 9/5, y = 4/5');
  assert.equal(block.verificacion.length, 2);
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...consistent, resultado: 'x = 3' }), (error) => error.code === 'propiedad_no_permitida');
  assert.throws(() => construirBloqueV3DesdeSlot(slot, {
    ...consistent,
    contrato_cuantitativo: { ...consistent.contrato_cuantitativo, resultado_estructurado: { x: '3', y: '0' } }
  }), (error) => error.code === 'propiedad_cuantitativa_no_permitida');
});

test('v3 descriptions are direct while historical v2 metadata remains unchanged', () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const metadataV3 = obtenerMetadataTipoCuadernilloV3(tipo);
    assert.equal(metadataV3.descripcion, CUADERNILLO_V3_DESCRIPTIONS[tipo]);
    assert.doesNotMatch(metadataV3.descripcion, /Proporcionar al estudiante|tiene como objetivo|material permitira|proposito de este documento/i);
  }
  assert.match(obtenerMetadataTipoCuadernillo('aprendizaje_guiado').objetivo, /Proporcionar al estudiante/);
});

test('guided prompts distinguish definition, support, comprehension and direct closure roles', () => {
  const plan = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado');
  const prompts = plan.map((segmento) => construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento
  }).userPrompt);
  const combined = prompts.join('\n');
  assert.match(combined, /desarrollo_teorico.*Expone, define, compara y relaciona conceptos/);
  assert.match(combined, /reserva todas las consignas y actividades para Actividades de comprension/);
  assert.match(combined, /apoyos_aprendizaje.*no repite definiciones extensas/);
  assert.match(combined, /actividades_comprension.*Comprueba reconocimiento/);
  assert.doesNotMatch(combined, /actividades_aplicacion/);
  assert.doesNotMatch(combined, /evaluacion_aprendizaje/);
  assert.match(combined, /cierre.*sin reintroducir la importancia del tema/);
  assert.match(prompts[1], /antecedentes_canonicos/);
  assert.match(prompts[1], /componentes_ya_solicitados/);
  assert.doesNotMatch(combined, /Proporcionar al estudiante|Esta actividad permitira|Este material permitira|Esta seccion permitira/i);
});

test('v3 prompt requires strict thematic relevance and self-control without keyword classification', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion').find(({ slots }) => slots.some(({ numero }) => numero === 28));
  const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, segmento: segment }).userPrompt;
  assert.match(prompt, /debe requerir realmente los conceptos del tema/);
  assert.match(prompt, /no basta con pertenecer a la misma asignatura/);
  assert.match(prompt, /formula un modelo que use explicitamente el tema/);
  assert.match(prompt, /vectores, matrices, determinantes, sistemas lineales, transformaciones/);
  assert.match(prompt, /si podria resolverse sin utilizar el tema; si la respuesta es si, reemplazala/);
  assert.match(prompt, /Grupos de coherencia solicitados/);
  assert.match(prompt, /actividad_integradora_28_30/);
});

test('exercise review slots 11 and 12 have distinct editorial roles and representations', () => {
  const slots = obtenerSlotsCuadernilloV3('ejercicios_aplicacion');
  const panorama = slots.find(({ numero }) => numero === 11);
  const definitions = slots.find(({ numero }) => numero === 12);
  assert.match(obtenerFuncionEditorialSlotV3(panorama), /panorama breve.*relaciones/);
  assert.match(obtenerFuncionEditorialSlotV3(definitions), /definiciones operativas precisas/);
  assert.deepEqual(resolverRepresentacionSlotCuadernilloV3(panorama).recomendacionPrincipal, { tipo: 'lista' });
  assert.deepEqual(resolverRepresentacionSlotCuadernilloV3(definitions).recomendacionPrincipal, { tipo: 'conceptos' });
});

test('editorial linter is accent/case insensitive and returns safe codes plus paths', () => {
  for (const [text, code] of [
    ['INSTRUCCIONES   CLARAS para trabajar.', 'editorial_instrucciones_genericas'],
    ['Esta actividad permitirá aprender.', 'editorial_metadiscurso'],
    ['El DOCENTE deberá explicar.', 'editorial_docente'],
    ['Como inteligencia artificial sugiero.', 'editorial_generador']
  ]) {
    assert.throws(() => lintCuadernilloV3Block({ tipo: 'texto', contenido: text }, 'slot.bloque'), (error) => error.code === code && error.path === 'slot.bloque.contenido');
  }
  for (const text of [
    'Proporcionar al estudiante una guia.',
    'Este cuadernillo tiene como objetivo practicar.',
    'Este material permitira comprender.',
    'Esta seccion permitira aplicar.',
    'El algebra es fundamental para comprender otros temas.',
    'El metodo es crucial para entender el resultado.'
  ]) {
    assert.throws(() => lintCuadernilloV3Block({ tipo: 'texto', contenido: text }), (error) => ['editorial_metadiscurso', 'editorial_cierre_generico'].includes(error.code));
  }
  assert.doesNotThrow(() => lintCuadernilloV3Block({ tipo: 'texto', contenido: 'Identifica los conceptos fundamentales del tema.' }));
});

test('v3 engine assembles all types without general data or self-evaluation and validates final content', async () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const { completar, calls } = syntheticCompleter();
    const result = await generarCuadernilloV3({ tipoCuadernillo: tipo, contextoPlaneacion: context, completar });
    assert.equal(calls.length, 4);
    assert.equal(result.contenido.schema_version, ANEXO_SCHEMA_VERSION_V3);
    assert.equal(Object.hasOwn(result.contenido, 'datos_generales'), false);
    assert.equal(result.contenido.secciones.some(({ id }) => id === 'datos_generales'), false);
    assert.equal(result.contenido.secciones.some(({ bloques }) => bloques.some((block) => block.modalidad === 'autoevaluacion')), false);
    assert.equal(JSON.stringify(result.contenido).includes('contrato_tarea'), false);
    assert.equal(JSON.stringify(result.contenido).includes('contrato_cuantitativo'), false);
    assert.doesNotThrow(() => validateCuadernilloV3(tipo, result.contenido));
  }
});

test('deterministic grouping joins only compatible adjacent blocks and preserves complete coverage', async () => {
  const { completar } = syntheticCompleter();
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar });
  const presentation = contenido.secciones.find(({ id }) => id === 'presentacion');
  assert.deepEqual(presentation.bloques.flatMap(({ cobertura }) => cobertura), [7, 8, 10]);
  assert.equal(presentation.bloques.length, 3);
});

test('editorial retry requests only the invalid slot and never makes a third call', async () => {
  let rejectedSlot = null;
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_1' && request.intento === 1) {
      const payload = responseFor(request.slots);
      rejectedSlot = request.slots[0].slotId;
      payload.respuestas[0].bloque = { tipo: 'texto', contenido: 'Instrucciones claras para realizar la actividad.' };
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  const result = await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[1].slots.map(({ slotId }) => slotId), [rejectedSlot]);
  assert.match(calls[1].userPrompt, /editorial_instrucciones_genericas/);
  assert.equal(result.metricas.reintentos, 1);
});

test('slot 11 concepts contract rejects generic contenido at the observed safe path', () => {
  const segment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[1];
  const slot = segment.slots.find(({ numero }) => numero === 11);
  assert.equal(slot.slotId, 'aprendizaje_guiado:desarrollo_teorico:11');
  const representation = resolverRepresentacionSlotCuadernilloV3(slot);
  assert.deepEqual(representation.recomendacionPrincipal, { tipo: 'conceptos' });
  assert.deepEqual(representation.bloquesPermitidos, ['conceptos']);
  const analysis = validarRespuestasSlotsCuadernilloV3({
    segmento: segment,
    slotsSolicitados: [slot],
    payload: { respuestas: [{ slot_id: slot.slotId, bloque: { tipo: 'conceptos', contenido: 'Conceptos de matrices.' } }] }
  });
  assert.equal(analysis.validas.size, 0);
  assert.equal(analysis.invalidas.get(slot.slotId).code, 'propiedad_no_permitida');
  assert.equal(analysis.invalidas.get(slot.slotId).path, `slots[${slot.slotId}].bloque.contenido`);
  assert.deepEqual(analysis.invalidas.get(slot.slotId).propiedadesProhibidasDetectadas, ['contenido']);
});

test('concept slot prompt is local, exact and contains no contradictory conceptos/contenido schema', () => {
  const segment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[1];
  const slot = segment.slots.find(({ numero }) => numero === 11);
  const prompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento: segment, slots: [slot]
  }).userPrompt;
  assert.match(prompt, /Devuelve una entrada para aprendizaje_guiado:desarrollo_teorico:11/);
  const schema = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento: segment, slots: [slot] }).jsonSchema;
  const blockRef = schema.properties.respuestas.items.anyOf[0].properties.bloque.$ref.split('/').at(-1);
  assert.deepEqual(schema.$defs[blockRef].properties.tipo.enum, ['conceptos']);
  assert.equal(schema.$defs[blockRef].additionalProperties, false);
  assert.doesNotMatch(prompt, /"tipo":"conceptos","contenido"/);
  assert.match(prompt, /No resumas, agrupes ni combines slots/);
});

test('ten valid siblings survive one invalid response and retry requests only slot 11 with actionable contract', async () => {
  const diagnostics = [];
  let originalValidBlocks;
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_2' && request.intento === 1) {
      const payload = responseFor(request.slots);
      const invalid = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':11'));
      invalid.bloque = { tipo: 'conceptos', contenido: 'Conceptos de matrices.' };
      originalValidBlocks = new Map(payload.respuestas
        .filter(({ slot_id }) => !slot_id.endsWith(':11'))
        .map(({ slot_id, bloque }) => [slot_id, structuredClone(bloque)]));
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: { completion_tokens: 237 } };
    }
    return null;
  });
  const result = await generarCuadernilloV3({
    tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar,
    diagnosticar: (event) => diagnostics.push(event)
  });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_2' && intento === 2);
  assert.deepEqual(retry.slots.map(({ slotId }) => slotId), ['aprendizaje_guiado:desarrollo_teorico:11']);
  assert.match(retry.userPrompt, /propiedad_no_permitida/);
  assert.match(retry.userPrompt, /propiedadesProhibidasDetectadas.*contenido/);
  assert.match(retry.userPrompt, /propiedadesRequeridas.*tipo.*items/);
  assert.match(retry.userPrompt, /schemaMinimoValido.*conceptos.*items/);
  assert.match(retry.userPrompt, /contenido no esta permitido para conceptos/);
  assert.match(retry.userPrompt, /cada item requiere termino y explicacion/);
  assert.match(retry.userPrompt, /una entrada independiente por cada slot solicitado/);
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_2').length, 2);
  const retryEvent = diagnostics.find(({ eventType, segmentoId }) => eventType === 'segment_slot_retry' && segmentoId === 'segmento_2');
  assert.deepEqual({
    recibidas: retryEvent.respuestasRecibidas,
    validas: retryEvent.respuestasValidas,
    invalidas: retryEvent.respuestasInvalidas,
    ausentes: retryEvent.respuestasAusentes
  }, { recibidas: 10, validas: 9, invalidas: 1, ausentes: 0 });
  assert.equal(originalValidBlocks.size, 9);
  assert.doesNotThrow(() => validateCuadernilloV3('aprendizaje_guiado', result.contenido));
});

test('all omitted slots remain pending contracts and a valid retry completes the segment', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_2' && request.intento === 1) {
      return { content: JSON.stringify({ respuestas: [] }), finishReason: 'stop' };
    }
    return null;
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_2' && intento === 2);
  const expected = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[1].slots.length;
  assert.equal(retry.slots.length, expected);
  assert.equal((retry.userPrompt.match(/"code":"slot_ausente"/g) || []).length, expected);
  for (const slot of retry.slots) {
    assert.match(retry.userPrompt, new RegExp(slot.slotId));
    assert.match(retry.userPrompt, new RegExp(resolverRepresentacionSlotCuadernilloV3(slot).recomendacionPrincipal.tipo));
  }
  assert.doesNotThrow(() => validateCuadernilloV3('aprendizaje_guiado', contenido));
});

test('a second invalid slot response aborts after two calls without a partial document', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_2') return null;
    return {
      content: JSON.stringify({ respuestas: request.slots.map((slot) => ({
        slot_id: slot.slotId,
        bloque: { tipo: 'conceptos', contenido: 'Forma invalida.' }
      })) }),
      finishReason: 'stop'
    };
  });
  await assert.rejects(
    generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar }),
    (error) => error.code === 'segmento_invalido_tras_retry'
  );
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_2').length, 2);
});

test('missing slots 29 and 30 retry the complete 28-30 coherence group while preserving outsiders', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_4') return null;
    const payload = responseFor(request.slots);
    if (request.intento === 1) {
      payload.respuestas = payload.respuestas.filter(({ slot_id }) => !slot_id.endsWith(':29') && !slot_id.endsWith(':30'));
      const main = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':28'));
      if (main.bloque.instrucciones) main.bloque.instrucciones = 'CONTEXTO VIEJO que debe descartarse.';
      const outsider = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':34'));
      if (outsider?.bloque.contenido) outsider.bloque.contenido = 'CONSERVA ESTE CIERRE AJENO AL GRUPO.';
    } else {
      const main = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':28'));
      if (main.bloque.instrucciones) main.bloque.instrucciones = 'Resuelve el mismo problema integrador con los datos indicados.';
    }
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_4' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [28, 29, 30]);
  assert.match(retry.userPrompt, /actividad_integradora_28_30/);
  assert.match(retry.userPrompt, /mismo problema, contexto, datos, variables y resultado/);
  const serialized = JSON.stringify(contenido);
  assert.doesNotMatch(serialized, /CONTEXTO VIEJO/);
  assert.match(serialized, /CONSERVA ESTE CIERRE AJENO AL GRUPO/);
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_4').length, 2);
});

test('an invalid group member also expands retry to the complete coherence group', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_4' && request.intento === 1) {
      const payload = responseFor(request.slots);
      payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':29')).bloque = {
        tipo: 'procedimiento', contenido: 'Propiedad ajena al schema.'
      };
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_4' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [28, 29, 30]);
  assert.match(retry.userPrompt, /propiedad_no_permitida/);
});

test('integrative group retry preserves the causal member error separately from group scope', async () => {
  const diagnostics = [];
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.tipoCuadernillo === 'actividades_integradoras' && request.segmento.id === 'segmento_3' && request.intento === 1) {
      const payload = responseFor(request.slots);
      const invalid = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':20'));
      delete invalid.bloque.pregunta_3;
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  const result = await generarCuadernilloV3({
    tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, completar,
    diagnosticar: (event) => diagnostics.push(event)
  });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_3' && intento === 2);
  const event = diagnostics.find(({ eventType, segmentoId }) => eventType === 'segment_slot_retry' && segmentoId === 'segmento_3');
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [17, 18, 20, 31]);
  assert.equal(event.errorCode, 'texto_requerido');
  assert.match(event.errorPath, /contextualizacion:20.*\.bloque\.pregunta_3$/);
  assert.equal(event.slotCausal, 'actividades_integradoras:contextualizacion:20');
  assert.equal(event.retryScope, 'group');
  assert.equal(event.groupExpanded, true);
  assert.deepEqual(event.groupIds, ['actividad_central_17_31']);
  assert.match(retry.userPrompt, /texto_requerido/);
  assert.match(retry.userPrompt, /contextualizacion:20.*bloque\.pregunta_3/);
  assert.doesNotMatch(retry.userPrompt, /grupo_coherencia_reintentado/);
  assert.doesNotThrow(() => validateCuadernilloV3('actividades_integradoras', result.contenido));
});

test('two invalid group members keep deterministic safe causes without exposing rejected content', async () => {
  const diagnostics = [];
  const { completar } = syntheticCompleter((request) => {
    if (request.tipoCuadernillo === 'actividades_integradoras' && request.segmento.id === 'segmento_3' && request.intento === 1) {
      const payload = responseFor(request.slots);
      payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':18')).bloque = { tipo: 'texto', contenido: 'CAMPO_RECHAZADO_SECRETO', extra: 'no permitido' };
      const invalid20 = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':20'));
      delete invalid20.bloque.pregunta_3;
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  await generarCuadernilloV3({
    tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, completar,
    diagnosticar: (event) => diagnostics.push(event)
  });
  const event = diagnostics.find(({ eventType, segmentoId }) => eventType === 'segment_slot_retry' && segmentoId === 'segmento_3');
  assert.deepEqual(event.erroresCausales.map(({ slotCausal }) => slotCausal), [
    'actividades_integradoras:contextualizacion:18',
    'actividades_integradoras:contextualizacion:20'
  ]);
  assert.equal(event.errorCode, event.erroresCausales[0].code);
  assert.equal(JSON.stringify(event).includes('CAMPO_RECHAZADO_SECRETO'), false);
});

test('a repeated integrative group failure reports the real cause again and stops after two calls', async () => {
  const diagnostics = [];
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.tipoCuadernillo !== 'actividades_integradoras' || request.segmento.id !== 'segmento_3') return null;
    const payload = responseFor(request.slots);
    const invalid = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':20'));
    delete invalid.bloque.pregunta_3;
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  });
  await assert.rejects(
    generarCuadernilloV3({
      tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context, completar,
      diagnosticar: (event) => diagnostics.push(event)
    }),
    (error) => error.code === 'segmento_invalido_tras_retry'
  );
  const failed = diagnostics.find(({ eventType, segmentoId }) => eventType === 'segment_slot_retry_failed' && segmentoId === 'segmento_3');
  assert.equal(failed.errorCode, 'texto_requerido');
  assert.equal(failed.slotCausal, 'actividades_integradoras:contextualizacion:20');
  assert.equal(failed.retryScope, 'group');
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_3').length, 2);
});

test('exact normalized duplicate statements invalidate only the later slot', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[2];
  const activitySlots = segment.slots.filter((slot) => resolverRepresentacionSlotCuadernilloV3(slot).recomendacionPrincipal.tipo === 'actividad').slice(0, 2);
  const payload = responseFor(activitySlots);
  payload.respuestas[0].bloque.items[0].enunciado = 'Resuelve el sistema lineal.';
  payload.respuestas[1].bloque.items[0].enunciado = '  RESUELVE   EL SISTEMA LINEAL!!! ';
  const analysis = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: activitySlots, payload });
  assert.equal(analysis.validas.size, 1);
  assert.equal(analysis.invalidas.get(activitySlots[1].slotId).code, 'enunciado_duplicado');
  assert.deepEqual(analysis.pendientes.map(({ slotId }) => slotId), [activitySlots[1].slotId]);
});

test('v3 solved examples require non-generic verification while historical v2 remains unchanged', () => {
  const slot = obtenerSlotsCuadernilloV3('ejercicios_aplicacion')
    .find((item) => resolverRepresentacionSlotCuadernilloV3(item).recomendacionPrincipal.tipo === 'ejemplo_resuelto');
  const block = materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot);
  assert.doesNotThrow(() => construirBloqueV3DesdeSlot(slot, block));
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...block, verificacion: [] }), (error) => error.code === 'verificacion_requerida');
  for (const generic of ['La respuesta es correcta.', 'Se verificó el resultado.', 'La solución cumple.', 'Comprobación realizada.']) {
    assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...block, verificacion: [generic] }), (error) => error.code === 'verificacion_generica');
  }
});

test('v3 rejects general data, raw slots and self-evaluation while historical validators remain separate', async () => {
  const { completar } = syntheticCompleter();
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar });
  assert.throws(() => validateCuadernilloV3('aprendizaje_guiado', { ...structuredClone(contenido), datos_generales: {} }), (error) => error.code === 'propiedad_no_permitida');
  const slot = obtenerSlotsCuadernilloV3('aprendizaje_guiado')[0];
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { tipo: 'evaluacion', modalidad: 'autoevaluacion', criterios: [{ texto: 'Criterio.' }] }), (error) => error.code === 'evaluacion_no_permitida_v3');
});
