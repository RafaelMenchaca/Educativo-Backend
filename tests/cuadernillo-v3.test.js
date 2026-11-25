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

const expectedCounts = Object.freeze({ ejercicios_aplicacion: 28, actividades_integradoras: 38, aprendizaje_guiado: 28 });
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

function responseFor(slots) {
  return {
    respuestas: slots.map((slot) => ({
      slot_id: slot.slotId,
      bloque: materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot)
    }))
  };
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

test('v3 blueprints derive 28/38/28 slots and omit general data plus self-evaluation', () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const blueprint = obtenerBlueprintCuadernilloV3(tipo);
    const slots = obtenerSlotsCuadernilloV3(tipo);
    assert.equal(slots.length, expectedCounts[tipo]);
    assert.deepEqual(validarSlotsCuadernilloV3(tipo), { ok: true, slots: expectedCounts[tipo] });
    assert.equal(blueprint.some(({ id }) => id === 'datos_generales'), false);
    assert.equal(slots.some(({ nombre }) => /autoevaluacion/i.test(nombre)), false);
    assert.equal(slots.some(({ numero }) => numero <= 6), false);
    assert.equal(new Set(slots.map(({ slotId }) => slotId)).size, slots.length);
  }
});

test('v3 keeps four ordered segments and every canonical slot exactly once', () => {
  for (const tipo of TIPO_CUADERNILLO_IDS) {
    const plan = crearPlanSegmentosCuadernilloV3(tipo);
    assert.equal(plan.length, 4);
    assert.deepEqual(plan.flatMap(({ slots }) => slots.map(({ slotId }) => slotId)), obtenerSlotsCuadernilloV3(tipo).map(({ slotId }) => slotId));
  }
});

test('canonical coherence groups contain known unique slots and remain segment-local', () => {
  assert.deepEqual(validarGruposCoherenciaCuadernilloV3('ejercicios_aplicacion'), { ok: true, grupos: 2 });
  assert.deepEqual(validarGruposCoherenciaCuadernilloV3('actividades_integradoras'), { ok: true, grupos: 5 });
  assert.deepEqual(validarGruposCoherenciaCuadernilloV3('aprendizaje_guiado'), { ok: true, grupos: 0 });
  const exercises = obtenerGruposCoherenciaCuadernilloV3('ejercicios_aplicacion');
  assert.deepEqual(exercises.map(({ id, miembrosNumeros }) => [id, miembrosNumeros]), [
    ['ejemplo_resuelto_15_17', [15, 16, 17]],
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

test('v3 assigns canonical procedural depth by workbook type and section', () => {
  const slot = (tipo, numero) => obtenerSlotsCuadernilloV3(tipo).find((item) => item.numero === numero);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('aprendizaje_guiado', 16)), CUADERNILLO_V3_PROCEDURAL_LEVELS.DEMOSTRATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('aprendizaje_guiado', 17)), CUADERNILLO_V3_PROCEDURAL_LEVELS.DEMOSTRATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('ejercicios_aplicacion', 15)), CUADERNILLO_V3_PROCEDURAL_LEVELS.DEMOSTRATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('ejercicios_aplicacion', 18)), CUADERNILLO_V3_PROCEDURAL_LEVELS.ORIENTADOR);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('ejercicios_aplicacion', 28)), CUADERNILLO_V3_PROCEDURAL_LEVELS.OPERATIVO);
  assert.equal(obtenerNivelProcedimentalSlotV3(slot('actividades_integradoras', 32)), CUADERNILLO_V3_PROCEDURAL_LEVELS.OPERATIVO);
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
  const operational = resolverRepresentacionSlotCuadernilloV3(byId('actividades_integradoras:produccion_proyecto:32'));
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

test('completable slots use student work structures instead of invented expository paragraphs', () => {
  const slots = TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3).filter(({ clasificacion }) => clasificacion === 'para_completar');
  assert.equal(slots.length > 0, true);
  for (const slot of slots) {
    const representation = resolverRepresentacionSlotCuadernilloV3(slot);
    assert.equal(['registro', 'espacio_respuesta', 'actividad'].includes(representation.recomendacionPrincipal.tipo), true);
    assert.equal(representation.recomendacionPrincipal.tipo === 'texto', false);
  }
});

test('every advertised allowed schema is structurally valid for its slot', () => {
  for (const slot of TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3)) {
    const representation = resolverRepresentacionSlotCuadernilloV3(slot);
    assert.deepEqual(representation.schemasPermitidos.map(({ tipo }) => tipo), representation.bloquesPermitidos);
    for (const { esquema } of representation.schemasPermitidos) {
      assert.doesNotThrow(() => construirBloqueV3DesdeSlot(slot, materialize(esquema, slot)), `${slot.slotId}:${esquema.tipo}`);
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

test('guided prompts distinguish definition, support, application, evaluation and direct closure roles', () => {
  const plan = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado');
  const prompts = plan.map((segmento) => construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, segmento
  }).userPrompt);
  const combined = prompts.join('\n');
  assert.match(combined, /desarrollo_teorico.*Define y explica conceptos/);
  assert.match(combined, /apoyos_aprendizaje.*no repite definiciones extensas/);
  assert.match(combined, /actividades_aplicacion.*no redefine ni repite ejemplos resueltos/);
  assert.match(combined, /evaluacion_aprendizaje.*preguntas nuevas respecto de Comprensión/u);
  assert.match(combined, /cierre.*sin reintroducir la importancia del tema/);
  assert.match(prompts[1], /antecedentes_canonicos/);
  assert.match(prompts[1], /componentes_ya_solicitados/);
  assert.doesNotMatch(combined, /Proporcionar al estudiante|Esta actividad permitira|Este material permitira|Esta seccion permitira/i);
});

test('v3 prompt requires strict thematic relevance and self-control without keyword classification', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[2];
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
  assert.equal(presentation.bloques.length, 1);
  assert.deepEqual(presentation.bloques[0].cobertura, [7, 8, 9, 10]);
  assert.equal(presentation.bloques[0].contenido.split('\n\n').length, 4);
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
  }, { recibidas: 11, validas: 10, invalidas: 1, ausentes: 0 });
  assert.equal(originalValidBlocks.size, 10);
  assert.doesNotThrow(() => validateCuadernilloV3('aprendizaje_guiado', result.contenido));
});

test('eleven omitted slots remain eleven pending contracts and a valid retry completes the segment', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_2' && request.intento === 1) {
      return { content: JSON.stringify({ respuestas: [] }), finishReason: 'stop' };
    }
    return null;
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_2' && intento === 2);
  assert.equal(retry.slots.length, 11);
  assert.equal((retry.userPrompt.match(/"code":"slot_ausente"/g) || []).length, 11);
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
    if (request.segmento.id !== 'segmento_3') return null;
    const payload = responseFor(request.slots);
    if (request.intento === 1) {
      payload.respuestas = payload.respuestas.filter(({ slot_id }) => !slot_id.endsWith(':29') && !slot_id.endsWith(':30'));
      const main = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':28'));
      if (main.bloque.instrucciones) main.bloque.instrucciones = 'CONTEXTO VIEJO que debe descartarse.';
      const outsider = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':27'));
      if (outsider?.bloque.instrucciones) outsider.bloque.instrucciones = 'CONSERVA ESTE RETO AJENO AL GRUPO.';
    } else {
      const main = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':28'));
      if (main.bloque.instrucciones) main.bloque.instrucciones = 'Resuelve el mismo problema integrador con los datos indicados.';
    }
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  });
  const { contenido } = await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_3' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [28, 29, 30]);
  assert.match(retry.userPrompt, /actividad_integradora_28_30/);
  assert.match(retry.userPrompt, /mismo problema, contexto, datos, variables y resultado/);
  const serialized = JSON.stringify(contenido);
  assert.doesNotMatch(serialized, /CONTEXTO VIEJO/);
  assert.match(serialized, /CONSERVA ESTE RETO AJENO AL GRUPO/);
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_3').length, 2);
});

test('an invalid group member also expands retry to the complete coherence group', async () => {
  const { completar, calls } = syntheticCompleter((request) => {
    if (request.segmento.id === 'segmento_3' && request.intento === 1) {
      const payload = responseFor(request.slots);
      payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':29')).bloque = {
        tipo: 'procedimiento', contenido: 'Propiedad ajena al schema.'
      };
      return { content: JSON.stringify(payload), finishReason: 'stop' };
    }
    return null;
  });
  await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar });
  const retry = calls.find(({ segmento, intento }) => segmento.id === 'segmento_3' && intento === 2);
  assert.deepEqual(retry.slots.map(({ numero }) => numero), [28, 29, 30]);
  assert.match(retry.userPrompt, /propiedad_no_permitida/);
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
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { tipo: 'evaluacion', modalidad: 'autoevaluacion', criterios: [{ texto: 'Criterio.' }] }), (error) => ['autoevaluacion_no_permitida', 'modalidad_evaluacion_desconocida'].includes(error.code));
});
