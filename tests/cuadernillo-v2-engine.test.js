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
  inventariarRepresentacionesSlots,
  resolverRepresentacionSlotCuadernillo
} from '../src/domain/cuadernilloRepresentations.js';
import {
  CuadernilloV2GenerationError,
  construirPromptSegmentoCuadernilloV2,
  crearPlanSegmentosCuadernilloV2,
  generarCuadernilloV2,
  validarRespuestasSlotsCuadernilloV2
} from '../src/services/cuadernilloV2.engine.js';
import {
  CUADERNILLO_V2_ACTIVITY_MODALITIES,
  CUADERNILLO_V2_BLOCK_TYPES,
  CUADERNILLO_V2_EVALUATION_MODALITIES,
  construirBloqueV2DesdeSlot,
  construirSeccionDatosGeneralesV2,
  validateCuadernilloV2
} from '../src/validators/cuadernilloV2.validator.js';

function slotBy(type, section, number) {
  return obtenerSlotsCuadernillo(type).find((slot) => slot.seccionId === section && slot.numero === number);
}

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

test('canonical representation resolver disambiguates the four observed slots', () => {
  const cases = [
    {
      slot: slotBy('ejercicios_aplicacion', 'cierre', 34),
      family: 'reflexion', type: 'actividad', modality: 'reflexion'
    },
    {
      slot: slotBy('actividades_integradoras', 'actividades_analisis', 24),
      family: 'comparacion', type: 'tabla', modality: undefined
    },
    {
      slot: slotBy('actividades_integradoras', 'evaluacion', 41),
      family: 'lista_cotejo', type: 'evaluacion', modality: 'lista_cotejo'
    },
    {
      slot: slotBy('aprendizaje_guiado', 'apoyos_aprendizaje', 21),
      family: 'glosario', type: 'conceptos', modality: undefined
    }
  ];
  for (const { slot, family, type, modality } of cases) {
    const representation = resolverRepresentacionSlotCuadernillo(slot);
    assert.equal(representation.familia, family);
    assert.equal(representation.recomendacionPrincipal.tipo, type);
    assert.equal(representation.recomendacionPrincipal.modalidad, modality);
    assert.doesNotThrow(() => construirBloqueV2DesdeSlot(slot, structuredClone(representation.esquemaMinimo)));
  }
});

test('semantic families recommend allowlisted blocks and modalities for every canonical slot', () => {
  const blockSet = new Set(CUADERNILLO_V2_BLOCK_TYPES);
  const activitySet = new Set(CUADERNILLO_V2_ACTIVITY_MODALITIES);
  const evaluationSet = new Set(CUADERNILLO_V2_EVALUATION_MODALITIES);
  for (const type of TIPO_CUADERNILLO_IDS) {
    const slots = obtenerSlotsCuadernillo(type);
    const inventory = inventariarRepresentacionesSlots(slots);
    assert.equal(inventory.length, slots.length);
    for (const entry of inventory) {
      const representation = entry.representacion;
      assert.ok(representation);
      assert.equal(representation.bloquesPermitidos.length > 0, true);
      assert.equal(representation.bloquesPermitidos.every((blockType) => blockSet.has(blockType)), true);
      const { tipo, modalidad } = representation.recomendacionPrincipal;
      assert.equal(blockSet.has(tipo), true);
      if (tipo === 'actividad' && modalidad) assert.equal(activitySet.has(modalidad), true);
      if (tipo === 'evaluacion' && modalidad) assert.equal(evaluationSet.has(modalidad), true);
      assert.doesNotThrow(() => construirBloqueV2DesdeSlot(
        slots.find(({ slotId }) => slotId === entry.slotId),
        structuredClone(representation.esquemaMinimo)
      ));
    }
  }
});

test('resolver covers evaluation and activity modality families without aliases', () => {
  const expected = [
    ['Autoevaluacion', 'evaluacion', 'autoevaluacion'],
    ['Rubrica de desempeno', 'evaluacion', 'rubrica'],
    ['Preguntas de comprension', 'actividad', 'preguntas'],
    ['Ejercicio practico', 'actividad', 'ejercicio'],
    ['Problema contextualizado', 'actividad', 'problema'],
    ['Identificar elementos', 'actividad', 'identificar'],
    ['Clasificar informacion', 'actividad', 'clasificar'],
    ['Relacionar conceptos', 'actividad', 'relacionar'],
    ['Completar enunciados', 'actividad', 'completar']
  ];
  expected.forEach(([nombre, tipo, modalidad], index) => {
    const representation = resolverRepresentacionSlotCuadernillo({ nombre, slotId: `synthetic:${index}` });
    assert.deepEqual(representation.recomendacionPrincipal, { tipo, modalidad });
  });
});

test('strict slot validator still rejects pedagogical labels used as types or invented modalities', () => {
  const reflection = slotBy('ejercicios_aplicacion', 'cierre', 34);
  const checklist = slotBy('actividades_integradoras', 'evaluacion', 41);
  const glossary = slotBy('aprendizaje_guiado', 'apoyos_aprendizaje', 21);
  const comparison = slotBy('actividades_integradoras', 'actividades_analisis', 24);
  assert.throws(() => construirBloqueV2DesdeSlot(reflection, { tipo: 'reflexion', contenido: 'Reflexion.' }), (error) => error.code === 'tipo_bloque_desconocido');
  assert.throws(() => construirBloqueV2DesdeSlot(checklist, { tipo: 'lista_cotejo', criterios: [{ texto: 'Criterio.' }] }), (error) => error.code === 'tipo_bloque_desconocido');
  assert.throws(() => construirBloqueV2DesdeSlot(glossary, { tipo: 'glosario', items: ['Concepto.'] }), (error) => error.code === 'tipo_bloque_desconocido');
  assert.throws(() => construirBloqueV2DesdeSlot(comparison, { tipo: 'actividad', modalidad: 'comparacion', instrucciones: 'Compara.', items: [{ enunciado: 'Compara opciones.' }] }), (error) => error.code === 'modalidad_actividad_desconocida');
});

test('real prompt includes slot-specific representation and distinguishes block type from modality', () => {
  const observed = [
    ['ejercicios_aplicacion', 'cierre', 34, /"modalidad":"reflexion"/, /reflexion es modalidad de actividad/],
    ['actividades_integradoras', 'actividades_analisis', 24, /"tipo":"tabla"/, /comparacion y comparar no son modalidades/],
    ['actividades_integradoras', 'evaluacion', 41, /"modalidad":"lista_cotejo"/, /lista_cotejo es modalidad de evaluacion/],
    ['aprendizaje_guiado', 'apoyos_aprendizaje', 21, /"tipo":"conceptos"/, /glosario no es un tipo de bloque/]
  ];
  for (const [type, section, number, schemaPattern, rulePattern] of observed) {
    const segment = crearPlanSegmentosCuadernilloV2(type).find(({ slots }) => slots.some((slot) => slot.seccionId === section && slot.numero === number));
    const slot = slotBy(type, section, number);
    const prompt = construirPromptSegmentoCuadernilloV2({ tipoCuadernillo: type, contextoPlaneacion: context(), segmento: segment, slots: [slot] });
    assert.match(prompt.systemPrompt, /tipo solo acepta discriminadores de bloque/);
    assert.match(prompt.userPrompt, schemaPattern);
    assert.match(prompt.userPrompt, rulePattern);
    assert.match(prompt.userPrompt, /nunca coloques una modalidad en tipo/);
    assert.match(prompt.userPrompt, /no crea un discriminador ni una modalidad nueva/);
  }
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
