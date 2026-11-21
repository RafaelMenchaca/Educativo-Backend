import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIPO_CUADERNILLO_IDS,
  obtenerBlueprintCuadernillo,
  obtenerSlotsCuadernillo,
  obtenerSlotsSeccionCuadernillo,
  obtenerSlotsSegmentoCuadernillo,
  resolverSlotCuadernillo,
  validarSlotsCuadernillo
} from '../src/domain/cuadernillos.js';
import {
  CuadernilloV2GenerationError,
  construirPromptSegmentoCuadernilloV2,
  crearPlanSegmentosCuadernilloV2,
  generarCuadernilloV2,
  validarRespuestasSlotsCuadernilloV2
} from '../src/services/cuadernilloV2.engine.js';
import {
  construirBloqueV2DesdeSlot,
  construirSeccionDatosGeneralesV2,
  validateCuadernilloV2
} from '../src/validators/cuadernilloV2.validator.js';

function context(overrides = {}) {
  return {
    materia: 'Matematicas',
    nivel: 'Universidad',
    tema: 'Algebra lineal',
    duracion: 90,
    tabla_ia: [{ momento: 'Desarrollo', actividad: 'Resolver sistemas matriciales' }],
    actividades_momentos: { desarrollo: 'Resolucion guiada' },
    datos_generales: {},
    ...overrides
  };
}

function textResponse(slot, suffix = '') {
  return {
    slot_id: slot.slotId,
    bloque: {
      tipo: 'texto',
      contenido: `Contenido pedagogico util para ${slot.nombre}${suffix}.`
    }
  };
}

function responseFor(slots, { reverse = false } = {}) {
  const values = slots.map((slot) => textResponse(slot));
  if (reverse) values.reverse();
  return { respuestas: values };
}

function syntheticCompleter(handler = null) {
  const calls = [];
  return {
    calls,
    completar: async (request) => {
      calls.push(request);
      const custom = await handler?.(request, calls.length);
      if (custom) return custom;
      return {
        content: JSON.stringify(responseFor(request.slots)),
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        durationMs: 5,
        finishReason: 'stop'
      };
    }
  };
}

test('canonical slots are stable, unique, blueprint-derived and exclude general data', () => {
  for (const type of TIPO_CUADERNILLO_IDS) {
    const blueprint = obtenerBlueprintCuadernillo(type);
    const slots = obtenerSlotsCuadernillo(type);
    const expected = blueprint.slice(1).flatMap((section) => section.cobertura_requerida.map((component) => ({
      id: `${type}:${section.id}:${component.numero}`,
      section: section.id,
      number: component.numero
    })));
    assert.deepEqual(slots.map((slot) => ({ id: slot.slotId, section: slot.seccionId, number: slot.numero })), expected);
    assert.equal(new Set(slots.map(({ slotId }) => slotId)).size, slots.length);
    assert.equal(slots.some(({ seccionId }) => seccionId === 'datos_generales'), false);
    const firstSectionId = blueprint[1].id;
    assert.deepEqual(
      obtenerSlotsSeccionCuadernillo(type, firstSectionId).map(({ slotId }) => slotId),
      slots.filter(({ seccionId }) => seccionId === firstSectionId).map(({ slotId }) => slotId)
    );
    assert.deepEqual(
      obtenerSlotsSegmentoCuadernillo(type, blueprint.slice(1, 3).map(({ id }) => id)).map(({ slotId }) => slotId),
      slots.filter(({ seccionId }) => [blueprint[1].id, blueprint[2].id].includes(seccionId)).map(({ slotId }) => slotId)
    );
    assert.deepEqual(resolverSlotCuadernillo(type, slots[0].slotId), slots[0]);
    assert.equal(resolverSlotCuadernillo(type, 'slot:desconocido'), null);
    assert.deepEqual(validarSlotsCuadernillo(type), {
      ok: true,
      slots: type === 'actividades_integradoras' ? 39 : 29,
      coberturaTotal: type === 'actividades_integradoras' ? 45 : 35
    });
  }
});

test('segment plan remains four ordered groups and owns all pedagogical slots once', () => {
  for (const type of TIPO_CUADERNILLO_IDS) {
    const plan = crearPlanSegmentosCuadernilloV2(type);
    assert.equal(plan.length, 4);
    const slots = plan.flatMap(({ slots }) => slots);
    assert.deepEqual(slots.map(({ slotId }) => slotId), obtenerSlotsCuadernillo(type).map(({ slotId }) => slotId));
    assert.equal(new Set(slots.map(({ slotId }) => slotId)).size, slots.length);
  }
});

test('slot prompt delegates content only, not coverage, IDs, sections or order', () => {
  const segment = crearPlanSegmentosCuadernilloV2('ejercicios_aplicacion')[1];
  const prompt = construirPromptSegmentoCuadernilloV2({
    tipoCuadernillo: 'ejercicios_aplicacion',
    contextoPlaneacion: context(),
    segmento: segment
  });
  assert.match(prompt.userPrompt, /"respuestas"/);
  assert.match(prompt.userPrompt, /slot_id/);
  assert.match(prompt.userPrompt, /Formulas, reglas o propiedades/);
  assert.match(prompt.userPrompt, /alternativa/);
  assert.match(prompt.userPrompt, /No incluyas cobertura/);
  assert.match(prompt.userPrompt, /nunca id/);
  assert.doesNotMatch(prompt.userPrompt, /"correcciones"/);
  assert.doesNotMatch(prompt.userPrompt, /"cobertura":\s*\[/);
  assert.doesNotMatch(prompt.userPrompt, /"secciones"/);
});

for (const type of TIPO_CUADERNILLO_IDS) {
  test(`engine assembles a strict complete workbook from slots for ${type}`, async () => {
    const { completar, calls } = syntheticCompleter();
    const result = await generarCuadernilloV2({ tipoCuadernillo: type, contextoPlaneacion: context(), completar });
    assert.equal(calls.length, 4);
    assert.deepEqual(result.metricas, {
      segmentos: 4, llamadas: 4, reintentos: 0,
      tokensPrompt: 40, tokensCompletion: 80, tokensTotal: 120, duracionMs: 20
    });
    assert.equal(validateCuadernilloV2(type, result.contenido).ok, true);
    const coverage = result.contenido.secciones.flatMap(({ bloques }) => bloques.flatMap(({ cobertura }) => cobertura));
    assert.equal(coverage.length, type === 'actividades_integradoras' ? 45 : 35);
    assert.deepEqual(coverage, [...coverage].sort((a, b) => a - b));
  });
}

test('response order is irrelevant and backend assigns canonical section, order and coverage', async () => {
  const { completar } = syntheticCompleter((request) => ({
    content: JSON.stringify(responseFor(request.slots, { reverse: true })),
    finishReason: 'stop'
  }));
  const { contenido } = await generarCuadernilloV2({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context(), completar
  });
  const blueprint = obtenerBlueprintCuadernillo('ejercicios_aplicacion');
  assert.deepEqual(contenido.secciones.map(({ id, orden }) => ({ id, orden })), blueprint.map(({ id, orden }) => ({ id, orden })));
  for (const section of contenido.secciones.slice(1)) {
    assert.deepEqual(section.bloques.flatMap(({ cobertura }) => cobertura), blueprint
      .find(({ id }) => id === section.id).cobertura_requerida.map(({ numero }) => numero));
  }
});

test('backend creates deterministic technical IDs and rejects model-supplied IDs', () => {
  const slot = obtenerSlotsCuadernillo('aprendizaje_guiado')[0];
  const activity = construirBloqueV2DesdeSlot(slot, {
    tipo: 'actividad', modalidad: 'preguntas', instrucciones: 'Responde.',
    items: [{ enunciado: 'Pregunta uno.' }, { enunciado: 'Pregunta dos.' }]
  });
  assert.deepEqual(activity.items.map(({ id }) => id), [
    'aprendizaje_guiado__presentacion_tema__7__actividad__item_1',
    'aprendizaje_guiado__presentacion_tema__7__actividad__item_2'
  ]);
  assert.deepEqual(activity.cobertura, [7]);
  assert.throws(() => construirBloqueV2DesdeSlot(slot, {
    tipo: 'actividad', modalidad: 'preguntas', instrucciones: 'Responde.',
    items: [{ id: 'inventado', enunciado: 'Pregunta.' }]
  }), (error) => error.code === 'propiedad_no_permitida');
});

test('slot input schemas reject extra properties, invalid modalities and non-rectangular tables', () => {
  const slot = obtenerSlotsCuadernillo('ejercicios_aplicacion')[0];
  assert.throws(() => construirBloqueV2DesdeSlot(slot, {
    tipo: 'texto', contenido: 'Valido', cobertura: [slot.numero]
  }), (error) => error.code === 'propiedad_no_permitida');
  assert.throws(() => construirBloqueV2DesdeSlot(slot, {
    tipo: 'actividad', modalidad: 'otra', instrucciones: 'Responde.',
    items: [{ enunciado: 'Pregunta util.' }]
  }), (error) => error.code === 'modalidad_actividad_desconocida');
  assert.throws(() => construirBloqueV2DesdeSlot(slot, {
    tipo: 'tabla', columnas: ['A', 'B'], filas: [['solo una']]
  }), (error) => error.code === 'tabla_no_rectangular');
});

test('slot response analysis detects missing and invalid content without assigning coverage', () => {
  const segment = crearPlanSegmentosCuadernilloV2('ejercicios_aplicacion')[0];
  const payload = responseFor(segment.slots.slice(0, -1));
  payload.respuestas[0].bloque.contenido = '';
  const analysis = validarRespuestasSlotsCuadernilloV2({
    segmento: segment, slotsSolicitados: segment.slots, payload
  });
  assert.equal(analysis.validas.has(segment.slots[0].slotId), false);
  assert.equal(analysis.invalidas.has(segment.slots[0].slotId), true);
  assert.deepEqual(analysis.pendientes.map(({ slotId }) => slotId), [
    segment.slots[0].slotId,
    segment.slots.at(-1).slotId
  ]);
});

test('unknown and duplicate slots are rejected fail-closed', () => {
  const segment = crearPlanSegmentosCuadernilloV2('ejercicios_aplicacion')[0];
  const unknown = responseFor(segment.slots);
  unknown.respuestas[0].slot_id = 'otro:slot:999';
  assert.throws(() => validarRespuestasSlotsCuadernilloV2({
    segmento: segment, slotsSolicitados: segment.slots, payload: unknown
  }), (error) => error.code === 'slot_desconocido');
  const duplicate = responseFor(segment.slots);
  duplicate.respuestas.push(structuredClone(duplicate.respuestas[0]));
  assert.throws(() => validarRespuestasSlotsCuadernilloV2({
    segmento: segment, slotsSolicitados: segment.slots, payload: duplicate
  }), (error) => error.code === 'slot_duplicado');
});

test('retry requests only pending slots, preserves valid content and merges by slot ID', async () => {
  let preservedText;
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_2') return null;
    if (request.intento === 1) {
      const payload = responseFor(request.slots);
      preservedText = payload.respuestas[0].bloque.contenido;
      payload.respuestas = payload.respuestas.filter(({ slot_id }) => !slot_id.endsWith(':13') && !slot_id.endsWith(':17'));
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    assert.deepEqual(request.slots.map(({ numero }) => numero), [13, 17]);
    return { content: JSON.stringify(responseFor([...request.slots].reverse())), finishReason: 'stop' };
  });
  const { contenido, metricas } = await generarCuadernilloV2({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context(), completar
  });
  assert.equal(metricas.llamadas, 5);
  assert.equal(metricas.reintentos, 1);
  assert.equal(calls[2].userPrompt.includes(preservedText), false);
  assert.doesNotMatch(calls[2].userPrompt, /correcciones|regenera el segmento completo/i);
  assert.equal(contenido.secciones.find(({ id }) => id === 'repaso_teorico').bloques[0].contenido, preservedText);
});

test('invalid known slot is retried while already valid slots are not requested again', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id !== 'segmento_1') return null;
    if (request.intento === 1) {
      const payload = responseFor(request.slots);
      payload.respuestas[1].bloque.contenido = '';
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return { content: JSON.stringify(responseFor(request.slots)), finishReason: 'stop' };
  });
  await generarCuadernilloV2({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context(), completar });
  assert.equal(calls[1].slots.length, 1);
  assert.equal(calls[1].slots[0].numero, 8);
});

test('all four segments may retry once but never produce a ninth call', async () => {
  const seen = new Set();
  const { completar, calls } = syntheticCompleter((request) => {
    if (!seen.has(request.segmento.id)) {
      seen.add(request.segmento.id);
      return { content: JSON.stringify({ respuestas: [] }), finishReason: 'stop' };
    }
    return { content: JSON.stringify(responseFor(request.slots)), finishReason: 'stop' };
  });
  const result = await generarCuadernilloV2({
    tipoCuadernillo: 'actividades_integradoras', contextoPlaneacion: context(), completar
  });
  assert.equal(calls.length, 8);
  assert.equal(result.metricas.reintentos, 4);
});

for (const scenario of ['retry_incomplete', 'json', 'length']) {
  test(`${scenario} failure aborts after at most two calls for the segment`, async () => {
    const { completar, calls } = syntheticCompleter((request) => {
      if (request.segmento.id !== 'segmento_1') return null;
      if (scenario === 'json') return { content: '{', finishReason: 'stop' };
      if (scenario === 'length') return { content: JSON.stringify(responseFor(request.slots)), finishReason: 'length' };
      return { content: JSON.stringify({ respuestas: [] }), finishReason: 'stop' };
    });
    await assert.rejects(
      generarCuadernilloV2({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context(), completar }),
      CuadernilloV2GenerationError
    );
    assert.equal(calls.length, 2);
  });
}

test('unknown or duplicate slot aborts without a repair call', async () => {
  for (const scenario of ['unknown', 'duplicate']) {
    const { completar, calls } = syntheticCompleter((request) => {
      const payload = responseFor(request.slots);
      if (scenario === 'unknown') payload.respuestas[0].slot_id = 'desconocido:slot:1';
      else payload.respuestas.push(structuredClone(payload.respuestas[0]));
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    });
    await assert.rejects(
      generarCuadernilloV2({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context(), completar }),
      (error) => error.code === `slot_${scenario === 'unknown' ? 'desconocido' : 'duplicado'}`
    );
    assert.equal(calls.length, 1);
  }
});

test('general data remains deterministic, appears once and is excluded from every completion', async () => {
  const { completar, calls } = syntheticCompleter();
  const { contenido } = await generarCuadernilloV2({
    tipoCuadernillo: 'aprendizaje_guiado',
    contextoPlaneacion: context({ datos_generales: { institucion: 'Institucion', unidad: 'Unidad 2' } }),
    completar
  });
  assert.deepEqual(contenido.datos_generales.institucion, { valor: 'Institucion', modo: 'backend' });
  assert.equal(contenido.secciones.filter(({ id }) => id === 'datos_generales').length, 1);
  assert.deepEqual(contenido.secciones[0], construirSeccionDatosGeneralesV2({
    blueprint: obtenerBlueprintCuadernillo('aprendizaje_guiado'),
    datosGenerales: contenido.datos_generales
  }));
  assert.equal(calls.every(({ slots }) => slots.every(({ seccionId }) => seccionId !== 'datos_generales')), true);
});

test('safe slot observability contains metadata but no pedagogical response', async () => {
  const diagnostics = [];
  const { completar } = syntheticCompleter((request) => ({
    content: JSON.stringify({ respuestas: [] }), finishReason: 'stop',
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }, durationMs: 6
  }));
  await assert.rejects(generarCuadernilloV2({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context(), completar,
    diagnosticar: (item) => diagnostics.push(item)
  }));
  assert.deepEqual(diagnostics.map(({ eventType }) => eventType), ['segment_slot_retry', 'segment_slot_retry_failed']);
  assert.equal(JSON.stringify(diagnostics).includes('Contenido pedagogico'), false);
  assert.ok(diagnostics[0].slotsPendientes.length > 0);
});

test('invalid type and client-shaped context fail before completion', async () => {
  for (const input of [
    { tipoCuadernillo: 'otro', contextoPlaneacion: context() },
    { tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context({ user_id: 'forbidden' }) },
    { tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context({ materia: '' }) }
  ]) {
    let calls = 0;
    await assert.rejects(generarCuadernilloV2({ ...input, completar: async () => { calls += 1; } }));
    assert.equal(calls, 0);
  }
});

test('v1 annex contract remains statically intact', () => {
  const service = readFileSync(new URL('../src/services/anexos.service.js', import.meta.url), 'utf8');
  assert.match(service, /Genera entre 3 y 5 anexos/);
  assert.match(service, /temperature:\s*0\.5/);
  assert.match(service, /payload\.anexos\.length < 3/);
});
