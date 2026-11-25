import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatRational,
  parseRational,
  rationalAdd,
  rationalDivide,
  rationalEqual,
  rationalMultiply
} from '../src/domain/rational.js';
import { formatearExpresionLineal, verificarContratoCuantitativo } from '../src/domain/cuadernilloV3Quantitative.js';
import { construirJsonSchemaCompletionV3 } from '../src/domain/cuadernilloV3Contracts.js';
import { resolverRepresentacionSlotCuadernilloV3 } from '../src/domain/cuadernilloV3Representations.js';
import { obtenerGruposCoherenciaCuadernilloV3, obtenerSlotsCuadernilloV3 } from '../src/domain/cuadernillosV3.js';
import {
  createCuadernilloV2Completer,
  createCuadernilloV3Completer,
  resolveCuadernilloV3Model
} from '../src/services/anexos.service.js';
import { construirBloqueV3DesdeSlot, lintCuadernilloV3Block } from '../src/validators/cuadernilloV2.validator.js';
import { construirPromptSegmentoCuadernilloV3, crearPlanSegmentosCuadernilloV3, generarCuadernilloV3, validarRespuestasSlotsCuadernilloV3 } from '../src/services/cuadernilloV3.engine.js';

const context = { materia: 'Matematicas', nivel: 'Universidad', tema: 'Algebra lineal', duracion: 60, tabla_ia: [], actividades_momentos: {}, datos_generales: {} };
function materialize(value, slot) {
  if (typeof value === 'string' && value.startsWith('<')) return `Desarrolla ${value.slice(1, -1)} para ${slot.nombre}.`;
  if (Array.isArray(value)) return value.map((item) => materialize(item, slot));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, slot)]));
  return value;
}
const responseFor = (slots) => ({ respuestas: slots.map((slot) => ({ slot_id: slot.slotId, bloque: materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot) })) });

test('exact rationals parse, reduce and operate without floating point equality', () => {
  assert.equal(formatRational(parseRational('-6/-8')), '3/4');
  assert.equal(formatRational(parseRational('0.5')), '1/2');
  assert.equal(formatRational(rationalAdd(parseRational('1/3'), parseRational('1/6'))), '1/2');
  assert.equal(formatRational(rationalMultiply(parseRational('-2'), parseRational('3/4'))), '-3/2');
  assert.equal(formatRational(rationalDivide(parseRational('3/5'), parseRational('9/10'))), '2/3');
  assert.equal(rationalEqual(parseRational('0.50'), parseRational('1/2')), true);
  for (const invalid of ['NaN', 'Infinity', '1e3', '2 kg', 'x', '1/0', '']) {
    assert.throws(() => parseRational(invalid));
  }
});

test('determinant 2x2 is derived only by backend from model inputs', () => {
  const contract = {
    familia_problema: 'determinante_2x2', datos: { matriz: [['2', '3'], ['1', '-1']] }
  };
  const verified = verificarContratoCuantitativo(contract, ['determinante_2x2']);
  assert.equal(verified.visible.resultado, 'Δ = -5');
  assert.equal(verified.contratoHidratadoBackend.resultado, '-5');
  assert.equal(verified.contratoHidratadoBackend.producto_diagonal_principal, '-2');
  assert.equal(verified.contratoHidratadoBackend.producto_diagonal_secundaria, '3');
  assert.deepEqual(verified.visible.matrices[0].filas, [['2', '3'], ['1', '-1']]);
  assert.throws(() => verificarContratoCuantitativo({ ...contract, datos: { matriz: [['1']] } }, ['determinante_2x2']));
});

test('determinant verification handles zero and negative entries exactly', () => {
  const build = (matriz) => ({ familia_problema: 'determinante_2x2', datos: { matriz } });
  assert.equal(verificarContratoCuantitativo(build([['1', '2'], ['2', '4']]), ['determinante_2x2']).visible.resultado, 'Δ = 0');
  assert.equal(verificarContratoCuantitativo(build([['-2', '3'], ['4', '1']]), ['determinante_2x2']).visible.resultado, 'Δ = -14');
});

test('rational arithmetic derives every chained result and rejects unsupported input operations', () => {
  const contract = {
    familia_problema: 'aritmetica_racional', datos: { valor_inicial: '1/2' },
    operaciones: [{ operacion: 'suma', operando: '0.25' }, { operacion: 'division', operando: '3' }]
  };
  assert.equal(verificarContratoCuantitativo(contract, ['aritmetica_racional']).visible.resultado, '1/4');
  assert.throws(() => verificarContratoCuantitativo({ ...contract, operaciones: [{ operacion: 'potencia', operando: '2' }] }, ['aritmetica_racional']), (error) => error.code === 'operacion_no_permitida');
  assert.throws(() => verificarContratoCuantitativo({ ...contract, operaciones: [{ operacion: 'division', operando: '0' }] }, ['aritmetica_racional']), (error) => error.code === 'denominador_cero');
});

function systemContract(equations = null) {
  return {
    familia_problema: 'sistema_lineal_2x2',
    datos: { ecuaciones: equations || [{ coeficiente_x: '2', coeficiente_y: '3', termino_independiente: '6' }, { coeficiente_x: '1', coeficiente_y: '-1', termino_independiente: '2' }] },
    metodo: 'cramer'
  };
}

test('supported quantitative input contracts contain no free text or model-derived values', () => {
  const slots = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').filter(({ numero }) => numero === 15);
  const schema = construirJsonSchemaCompletionV3(slots, resolverRepresentacionSlotCuadernilloV3, new Map([[slots[0].slotId, 'sistema_lineal_2x2']]));
  const serialized = JSON.stringify(schema);
  for (const forbidden of ['contexto_pedagogico', 'resultado_estructurado', 'verificacion_estructurada', 'solucion', 'determinante', 'interpretacion']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
  assert.throws(
    () => verificarContratoCuantitativo({ ...systemContract(), contexto_pedagogico: '2x + 3y = 6' }, ['sistema_lineal_2x2'], 'slots[ejercicios_aplicacion:ejemplos_resueltos:15].bloque.contrato_cuantitativo'),
    (error) => error.code === 'propiedad_cuantitativa_no_permitida'
      && error.path === 'slots[ejercicios_aplicacion:ejemplos_resueltos:15].bloque.contrato_cuantitativo.contexto_pedagogico'
  );
});

test('retry schema and backend validation lock a supported family', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
  const slot = segment.slots.find(({ numero }) => numero === 15);
  const expected = new Map([[slot.slotId, 'sistema_lineal_2x2']]);
  const prompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, segmento: segment,
    slots: [slot], familiasEsperadas: expected,
    errores: [{ slotId: slot.slotId, code: 'racional_invalido', familiaCuantitativa: 'sistema_lineal_2x2' }]
  });
  const schema = JSON.stringify(prompt.jsonSchema);
  assert.match(schema, /sistema_lineal_2x2/);
  assert.doesNotMatch(schema, /no_cuantitativo|determinante_2x2|aritmetica_racional/);
  const analysis = validarRespuestasSlotsCuadernilloV3({
    segmento: segment, slotsSolicitados: [slot], familiasEsperadas: expected,
    payload: { respuestas: [{ slot_id: slot.slotId, bloque: materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot) }] }
  });
  assert.equal(analysis.invalidas.get(slot.slotId).code, 'familia_cuantitativa_inconsistente');
  assert.equal(analysis.invalidas.get(slot.slotId).familiaCuantitativa, 'sistema_lineal_2x2');
});

test('the former retry degradation reached historical resultado validation, while the family lock rejects it first', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
  const slot = segment.slots.find(({ numero }) => numero === 15);
  const degraded = {
    tipo: 'ejemplo_resuelto', enunciado: 'Ejemplo conceptual.', pasos: ['Analiza la situación.', 'Relaciona sus elementos.'], resultado: '',
    verificacion: ['Contrasta la relación con las condiciones del enunciado.'], interpretacion: 'La relación explica el caso.',
    contrato_cuantitativo: { familia_problema: 'no_cuantitativo' }
  };
  const former = validarRespuestasSlotsCuadernilloV3({
    segmento: segment, slotsSolicitados: [slot],
    payload: { respuestas: [{ slot_id: slot.slotId, bloque: degraded }] }
  });
  assert.equal(former.invalidas.get(slot.slotId).code, 'texto_requerido');
  assert.match(former.invalidas.get(slot.slotId).path, /\.bloque\.resultado$/);
  const locked = validarRespuestasSlotsCuadernilloV3({
    segmento: segment, slotsSolicitados: [slot], familiasEsperadas: new Map([[slot.slotId, 'sistema_lineal_2x2']]),
    payload: { respuestas: [{ slot_id: slot.slotId, bloque: degraded }] }
  });
  assert.equal(locked.invalidas.get(slot.slotId).code, 'familia_cuantitativa_inconsistente');
});

test('the 15-17 group declares one mathematical owner and persists one hydrated block', async () => {
  const group = obtenerGruposCoherenciaCuadernilloV3('ejercicios_aplicacion').find(({ id }) => id === 'ejemplo_resuelto_15_17');
  assert.equal(group.ownerMatematico.slotPrincipalNumero, 15);
  assert.deepEqual(group.ownerMatematico.coberturaConsolidada, [15, 16, 17]);
  const result = await generarCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
    completar: async (request) => {
      const payload = responseFor(request.slots);
      const example = payload.respuestas.find(({ slot_id }) => slot_id === group.slotPrincipalId);
      if (example) {
        example.bloque = { tipo: 'ejemplo_resuelto', contrato_cuantitativo: systemContract() };
      }
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
    }
  });
  const section = result.contenido.secciones.find(({ id }) => id === 'ejemplos_resueltos');
  const owners = section.bloques.filter(({ cobertura }) => cobertura.some((numero) => [15, 16, 17].includes(numero)));
  assert.equal(owners.length, 1);
  assert.deepEqual(owners[0].cobertura, [15, 16, 17]);
  assert.equal(owners[0].resultado, 'x = 12/5, y = 2/5');
  assert.equal(owners[0].verificacion.length, 2);
  assert.equal(Object.hasOwn(owners[0], 'contrato_cuantitativo'), false);
});

test('linear system 2x2 derives determinants, solution and both checks from inputs', () => {
  const result = verificarContratoCuantitativo(systemContract(), ['sistema_lineal_2x2']);
  assert.equal(result.visible.resultado, 'x = 12/5, y = 2/5');
  assert.equal(result.contratoHidratadoBackend.delta, '-5');
  assert.equal(result.contratoHidratadoBackend.delta_x, '-12');
  assert.equal(result.contratoHidratadoBackend.delta_y, '-2');
  assert.equal(result.visible.verificaciones.length, 2);
  assert.equal(result.visible.pasos.some((step) => /Ecuación \d+:/.test(step)), false);
  assert.equal(result.visible.verificaciones.every((step) => /Ecuación \d+:/.test(step)), true);
  assert.equal(result.visible.pasos.includes(result.visible.resultado), false);
  assert.deepEqual(result.contratoHidratadoBackend.comprobaciones.map(({ lado_izquierdo, lado_derecho }) => [lado_izquierdo, lado_derecho]), [['6', '6'], ['2', '2']]);
  assert.throws(() => verificarContratoCuantitativo(systemContract([{ coeficiente_x: '1', coeficiente_y: '1', termino_independiente: '2' }, { coeficiente_x: '2', coeficiente_y: '2', termino_independiente: '4' }]), ['sistema_lineal_2x2']), (error) => error.code === 'sistema_singular_no_soportado');
  assert.throws(() => verificarContratoCuantitativo(systemContract([{ coeficiente_x: '99999999', coeficiente_y: '1', termino_independiente: '2' }, { coeficiente_x: '2', coeficiente_y: '3', termino_independiente: '4' }]), ['sistema_lineal_2x2']), (error) => error.code === 'valor_fuera_limite');
  for (const literal of ['6', '2(12/5) + 3(2/5)', '2 * 12/5 + 3 * 2/5', '6 = 6']) {
    const attempted = systemContract();
    attempted.datos.ecuaciones[0].coeficiente_x = literal;
    if (literal === '6') assert.doesNotThrow(() => verificarContratoCuantitativo(attempted, ['sistema_lineal_2x2']));
    else assert.throws(() => verificarContratoCuantitativo(attempted, ['sistema_lineal_2x2']), (error) => error.code === 'racional_invalido');
  }
});

test('linear expression formatter omits unit and zero coefficients without changing rationals', () => {
  assert.equal(formatearExpresionLineal('2', '1'), '2x + y');
  assert.equal(formatearExpresionLineal('1', '-1'), 'x − y');
  assert.equal(formatearExpresionLineal('-1', '3'), '−x + 3y');
  assert.equal(formatearExpresionLineal('0', '-2'), '−2y');
  assert.equal(formatearExpresionLineal('12/5', '1/2'), '12/5x + 1/2y');
  assert.doesNotMatch(formatearExpresionLineal('2', '-3'), /\+ -/);
});

function setNetworkActivity(response, equations, label) {
  response.bloque.instrucciones = `Analiza ${label} y construye el modelo lineal.`;
  response.bloque.items = [{ enunciado: `Usa las relaciones ${equations.join('; ')} para resolver ${label}.` }];
  response.bloque.contrato_tarea = {
    conceptos_requeridos: ['sistemas lineales'], familia_tarea: 'red_lineal',
    datos_necesarios: [...equations], objetivo: `Determina los valores de ${label}.`,
    condicion_suficiencia: 'Las relaciones forman un sistema determinado.',
    aplicacion_tema: 'El sistema lineal modela las relaciones de la red.'
  };
}

test('structural duplicate detection rejects the later canonical slot regardless of response order', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[2];
  const slots = segment.slots.filter(({ numero }) => [24, 28].includes(numero));
  const payload = responseFor([...slots].reverse());
  const equations = ['x + y = 4', 'x + z = 5', 'y + z = 3'];
  const reformulated = ['y + x = 4', 'z + x = 5', 'z + y = 3'];
  payload.respuestas.forEach((response) => setNetworkActivity(response, response.slot_id.includes(':24') ? equations : reformulated, response.slot_id.includes(':24') ? 'una red de nodos' : 'la red de tres nodos'));
  const analysis = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: slots, payload });
  assert.equal(analysis.validas.has('ejercicios_aplicacion:retos_problemas:24'), true);
  assert.equal(analysis.invalidas.get('ejercicios_aplicacion:actividad_integradora:28').code, 'actividad_repetida');
  assert.equal(analysis.invalidas.get('ejercicios_aplicacion:actividad_integradora:28').tipoCoincidencia, 'mismas_relaciones');

  const distinct = responseFor(slots);
  setNetworkActivity(distinct.respuestas[0], equations, 'una red de nodos');
  setNetworkActivity(distinct.respuestas[1], ['a + b = 8', 'a − b = 2'], 'la distribución de recursos');
  const allowed = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: slots, payload: distinct });
  assert.equal(allowed.invalidas.size, 0);
  assert.equal(allowed.validas.size, 2);
});

test('a repeated integrative problem retries only its coherence group and preserves the earlier challenge', async () => {
  const calls = [];
  const repeated = ['x + y = 4', 'x + z = 5', 'y + z = 3'];
  const replacement = ['a + b = 8', 'a − b = 2'];
  const result = await generarCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
    completar: async (request) => {
      calls.push(request);
      const payload = responseFor(request.slots);
      if (request.segmento.id === 'segmento_3') {
        const challenge = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':24'));
        const integrative = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':28'));
        if (challenge) setNetworkActivity(challenge, repeated, 'una red de nodos');
        if (integrative) setNetworkActivity(integrative, request.intento === 1 ? repeated : replacement, request.intento === 1 ? 'la red de tres nodos' : 'la distribución de recursos');
      }
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
    }
  });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[3].slots.map(({ numero }) => numero), [28, 29, 30]);
  assert.match(calls[3].userPrompt, /actividad_repetida/);
  const retos = result.contenido.secciones.find(({ id }) => id === 'retos_problemas');
  assert.equal(retos.bloques.some(({ cobertura }) => cobertura.includes(24)), true);
});

test('a repeated integrative problem on the second attempt aborts without a third segment call', async () => {
  const calls = [];
  const equations = ['x + y = 4', 'x + z = 5', 'y + z = 3'];
  await assert.rejects(generarCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
    completar: async (request) => {
      calls.push(request);
      const payload = responseFor(request.slots);
      if (request.segmento.id === 'segmento_3') {
        for (const response of payload.respuestas.filter(({ slot_id }) => slot_id.endsWith(':24') || slot_id.endsWith(':28'))) {
          setNetworkActivity(response, equations, response.slot_id.endsWith(':24') ? 'una red de nodos' : 'la red reformulada');
        }
      }
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
    }
  }), (error) => error.code === 'segmento_invalido_tras_retry'
    && error.diagnostics.some(({ errorCode }) => errorCode === 'actividad_repetida'));
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_3').length, 2);
  assert.equal(calls.length, 4);
});

test('dynamic strict schema exposes only requested slot IDs and principal blocks', () => {
  const slots = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').slice(0, 3);
  const schema = construirJsonSchemaCompletionV3(slots, resolverRepresentacionSlotCuadernilloV3);
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties.respuestas, 'minItems'), false);
  assert.equal(Object.hasOwn(schema.properties.respuestas, 'maxItems'), false);
  assert.deepEqual(schema.properties.respuestas.items.anyOf.map((item) => item.properties.slot_id.enum[0]), slots.map(({ slotId }) => slotId));
  schema.properties.respuestas.items.anyOf.forEach((variant) => {
    const id = variant.properties.bloque.$ref.split('/').at(-1);
    assert.equal(schema.$defs[id].additionalProperties, false);
  });
});

test('supported quantitative schema accepts only inputs and backend alone hydrates derived fields', () => {
  const slot = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').find(({ numero }) => numero === 15);
  const schema = construirJsonSchemaCompletionV3([slot], resolverRepresentacionSlotCuadernilloV3);
  const blockRef = schema.properties.respuestas.items.anyOf[0].properties.bloque.$ref.split('/').at(-1);
  const quantitativeBranch = schema.$defs[blockRef].anyOf[1];
  assert.deepEqual(Object.keys(quantitativeBranch.properties).sort(), ['contrato_cuantitativo', 'tipo']);
  const contractSchema = JSON.stringify(quantitativeBranch.properties.contrato_cuantitativo);
  for (const derived of ['resultado_estructurado', 'verificacion_estructurada', 'lado_izquierdo', 'lado_derecho', 'solucion', 'delta']) {
    assert.doesNotMatch(contractSchema, new RegExp(derived));
  }
  const input = { tipo: 'ejemplo_resuelto', contrato_cuantitativo: systemContract() };
  const block = construirBloqueV3DesdeSlot(slot, input);
  assert.equal(block.resultado, 'x = 12/5, y = 2/5');
  assert.equal(block.pasos.some((step) => step.includes('Δx =') && step.includes('-12')), true);
  assert.equal(block.verificacion.length, 2);
  assert.equal(Object.hasOwn(block, 'contrato_cuantitativo'), false);
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...input, resultado: 'x = 3, y = 0' }), (error) => error.code === 'propiedad_no_permitida');
  assert.throws(() => construirBloqueV3DesdeSlot(slot, {
    ...input, contrato_cuantitativo: { ...input.contrato_cuantitativo, resultado_estructurado: { x: '3', y: '0' } }
  }), (error) => error.code === 'propiedad_cuantitativa_no_permitida');
});

test('v3 prose prompts are smaller than the pre-2N baseline without dropping academic policy', () => {
  const baseline = [9317, 21629, 19464, 11968];
  crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion').forEach((segment, index) => {
    const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, segmento: segment });
    assert.equal(prompt.systemPrompt.length + prompt.userPrompt.length < baseline[index], true);
    assert.match(prompt.userPrompt, /pertinencia|conceptos|tema/i);
    assert.ok(prompt.jsonSchema.$defs);
  });
});

test('v3 linter rejects LaTeX while allowing plain text and basic Unicode math', () => {
  for (const value of ['\\(x+y\\)', '$x+y$', '$$x+y$$', '\\begin{pmatrix}1&2\\end{pmatrix}', '\\frac{1}{2}']) {
    assert.throws(() => lintCuadernilloV3Block({ contenido: value }), (error) => error.code === 'latex_no_permitido');
  }
  assert.doesNotThrow(() => lintCuadernilloV3Block({ contenido: '2x + 3y = 6; x = 12/5; Δ = ad − bc; 2 × 3 = 6.' }));
});

test('v3 model configuration is isolated, allowlisted and uses strict Structured Outputs', async () => {
  assert.equal(resolveCuadernilloV3Model({}), 'gpt-6-luna');
  assert.throws(() => resolveCuadernilloV3Model({ OPENAI_CUADERNILLO_V3_MODEL: '' }), /Configuracion/);
  assert.throws(() => resolveCuadernilloV3Model({ OPENAI_CUADERNILLO_V3_MODEL: 'modelo-cliente' }), /Configuracion/);
  const calls = [];
  const client = { chat: { completions: { create: async (request, options) => {
    calls.push({ request, options });
    return { choices: [{ message: { content: '{"respuestas":[]}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 1 } } };
  } } } };
  const completeV3 = createCuadernilloV3Completer({ openaiClient: client, env: {}, logCall: async () => {} });
  const emptyStrictSchema = { type: 'object', additionalProperties: false, properties: {}, required: [] };
  await completeV3({ systemPrompt: 's', userPrompt: 'u', jsonSchema: emptyStrictSchema, segmento: { id: 'segmento_1' }, slots: [], intento: 1 });
  assert.equal(calls[0].request.model, 'gpt-6-luna');
  assert.equal(calls[0].request.reasoning_effort, 'low');
  assert.equal(Object.hasOwn(calls[0].request, 'temperature'), false);
  assert.equal(Object.hasOwn(calls[0].request, 'max_tokens'), false);
  assert.equal(calls[0].request.response_format.type, 'json_schema');
  assert.equal(calls[0].request.response_format.json_schema.strict, true);
  assert.equal(calls[0].request.max_completion_tokens, 5000);
  assert.deepEqual(calls[0].options, { timeout: 120000 });
  assert.equal(Object.hasOwn(calls[0].request, 'timeout'), false);

  const v2Calls = [];
  const completeV2 = createCuadernilloV2Completer({ openaiClient: { chat: { completions: { create: async (request) => { v2Calls.push(request); return { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: {} }; } } } }, logCall: async () => {} });
  await completeV2({ systemPrompt: 's', userPrompt: 'u', segmento: { id: 'segmento_1' }, intento: 1 });
  assert.equal(v2Calls[0].model, 'gpt-4o-mini');
  assert.equal(v2Calls[0].temperature, 0.3);
  assert.equal(v2Calls[0].max_tokens, 3000);
  assert.equal(Object.hasOwn(v2Calls[0], 'reasoning_effort'), false);
  for (const file of ['planeaciones.service.js', 'examenes.service.js', 'listas_cotejo.service.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/services/${file}`, import.meta.url), 'utf8'), /gpt-6-luna/);
  }
});

test('a deterministic math failure retries its complete coherence group and never a third call', async () => {
  const calls = [];
  const complete = async (request) => {
    calls.push(request);
    const payload = responseFor(request.slots);
    if (request.segmento.id === 'segmento_2') {
      const example = payload.respuestas.find(({ slot_id }) => slot_id === 'ejercicios_aplicacion:ejemplos_resueltos:15');
      if (example) {
        example.bloque.contrato_cuantitativo = request.intento === 1
          ? {
              familia_problema: 'sistema_lineal_2x2',
              datos: { ecuaciones: [{ coeficiente_x: '2(12/5)', coeficiente_y: '3', termino_independiente: '6' }, { coeficiente_x: '1', coeficiente_y: '-1', termino_independiente: '2' }] },
              metodo: 'cramer'
            }
          : systemContract();
        for (const key of ['enunciado', 'pasos', 'resultado', 'verificacion', 'interpretacion']) delete example.bloque[key];
      }
    }
    return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
  };
  const result = await generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar: complete });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[2].slots.map(({ numero }) => numero), [15, 16, 17]);
  assert.match(calls[2].userPrompt, /racional_invalido/);
  assert.match(calls[2].userPrompt, /datos\.ecuaciones\[2\]\.coeficiente_x/);
  assert.match(JSON.stringify(calls[2].jsonSchema), /sistema_lineal_2x2/);
  assert.doesNotMatch(JSON.stringify(calls[2].jsonSchema), /no_cuantitativo/);
  assert.equal(result.metricas.reintentos, 1);
});

test('a second-attempt family change aborts without persistence or a third segment call', async () => {
  const calls = [];
  await assert.rejects(
    generarCuadernilloV3({
      tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
      completar: async (request) => {
        calls.push(request);
        const payload = responseFor(request.slots);
        if (request.segmento.id === 'segmento_2') {
          const example = payload.respuestas.find(({ slot_id }) => slot_id === 'ejercicios_aplicacion:ejemplos_resueltos:15');
          if (example && request.intento === 1) {
            example.bloque = {
              tipo: 'ejemplo_resuelto',
              contrato_cuantitativo: { ...systemContract(), contexto_pedagogico: 'Texto libre que el contrato ya no permite.' }
            };
          }
        }
        return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
      }
    }),
    (error) => error.code === 'segmento_invalido_tras_retry'
      && error.diagnostics.some(({ errorCode }) => errorCode === 'familia_cuantitativa_inconsistente')
  );
  assert.equal(calls.length, 3);
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_2').length, 2);
});

test('refusal and incomplete finish reasons fail closed after two calls', async () => {
  for (const completion of [{ content: '', refusal: 'blocked', finishReason: 'stop' }, { content: '{}', finishReason: 'content_filter' }]) {
    let calls = 0;
    await assert.rejects(
      generarCuadernilloV3({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: context, completar: async () => { calls += 1; return completion; } }),
      (error) => error.code === 'segmento_invalido_tras_retry'
    );
    assert.equal(calls, 2);
  }
});
