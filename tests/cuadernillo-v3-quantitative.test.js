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
import { evaluarContratoCuantitativo, formatearExpresionLineal, verificarContratoCuantitativo } from '../src/domain/cuadernilloV3Quantitative.js';
import { construirContratoDistanciaPuntoMedio2dV3, construirJsonSchemaCompletionV3, obtenerDatasetDistanciaPuntoMedio2dV3, obtenerFamiliasCuantitativasContextoV3 } from '../src/domain/cuadernilloV3Contracts.js';
import { resolverRepresentacionSlotCuadernilloV3 } from '../src/domain/cuadernilloV3Representations.js';
import { obtenerContratoPedagogicoSlotV3, obtenerGruposCoherenciaCuadernilloV3, obtenerSlotsCuadernilloV3 } from '../src/domain/cuadernillosV3.js';
import {
  createCuadernilloV2Completer,
  createCuadernilloV3Completer,
  resolveCuadernilloV3Model
} from '../src/services/anexos.service.js';
import { construirBloqueV3DesdeSlot, lintCuadernilloV3Block } from '../src/validators/cuadernilloV2.validator.js';
import { consolidarGruposCuantitativosV3, construirFamiliasEsperadasSegmentoV3, construirPromptSegmentoCuadernilloV3, crearPlanSegmentosCuadernilloV3, generarCuadernilloV3, validarRespuestasSlotsCuadernilloV3 } from '../src/services/cuadernilloV3.engine.js';

const context = { materia: 'Matematicas', nivel: 'Universidad', tema: 'Algebra lineal', duracion: 60, tabla_ia: [], actividades_momentos: {}, datos_generales: {} };
function materialize(value, slot) {
  if (typeof value === 'string' && value.startsWith('<')) return `Desarrolla ${value.slice(1, -1)} para ${slot.nombre}.`;
  if (Array.isArray(value)) return value.map((item) => materialize(item, slot));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, slot)]));
  return value;
}
function blockFor(slot) {
  if (slot.tipoCuadernillo === 'ejercicios_aplicacion' && slot.numero === 36) return { tipo: 'ejemplo_resuelto', contrato_cuantitativo: { familia_problema: 'determinante_2x2', datos: { matriz: [['2', '3'], ['1', '-1']] } } };
  if (slot.tipoCuadernillo === 'ejercicios_aplicacion' && slot.numero === 15) return { tipo: 'ejemplo_resuelto', contrato_cuantitativo: systemContract() };
  const block = materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot);
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
  if (contract?.productoOwner || contract?.productoReference) block.producto = 'Producto final sintetico';
  return block;
}
const responseFor = (slots) => ({ respuestas: slots.map((slot) => ({ slot_id: slot.slotId, bloque: blockFor(slot) })) });

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
  response.bloque.items = [{ enunciado: `Usa las relaciones ${equations.join('; ')} para resolver ${label}.`, espacio_respuesta: { lineas: 4 } }];
  response.bloque.contrato_tarea = {
    conceptos_requeridos: ['sistemas lineales'], familia_tarea: 'red_lineal',
    datos_necesarios: [...equations], objetivo: `Determina los valores de ${label}.`,
    condicion_suficiencia: 'Las relaciones forman un sistema determinado.',
    aplicacion_tema: 'El sistema lineal modela las relaciones de la red.'
  };
}

test('structural duplicate detection rejects a later slot against prior segment summaries', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[3];
  const slots = segment.slots.filter(({ numero }) => numero === 28);
  const payload = responseFor(slots);
  const equations = ['x + y = 4', 'x + z = 5', 'y + z = 3'];
  const reformulated = ['y + x = 4', 'z + x = 5', 'z + y = 3'];
  setNetworkActivity(payload.respuestas[0], reformulated, 'la red de tres nodos');
  const resumenesPrevios = [{ seccion: 'ejercicios_basicos', modalidad: 'ejercicio', escenario: 'analiza una red de nodos y construye el modelo lineal', variables: ['x', 'y', 'z'], relaciones: ['x:1|y:1=4', 'x:1|z:1=5', 'y:1|z:1=3'], objetivo: 'determina los valores de una red de nodos', taskSignature: '' }];
  const analysis = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: slots, payload, resumenesPrevios });
  assert.equal(analysis.invalidas.get('ejercicios_aplicacion:actividad_integradora:28').code, 'actividad_repetida');
  assert.equal(analysis.invalidas.get('ejercicios_aplicacion:actividad_integradora:28').tipoCoincidencia, 'mismas_relaciones');

  const distinct = responseFor(slots);
  setNetworkActivity(distinct.respuestas[0], ['a + b = 8', 'a − b = 2'], 'la distribución de recursos');
  const allowed = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: slots, payload: distinct, resumenesPrevios });
  assert.equal(allowed.invalidas.size, 0);
  assert.equal(allowed.validas.size, 1);
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
        const challenge = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':18'));
        if (challenge) setNetworkActivity(challenge, repeated, 'una red de nodos');
      }
      if (request.segmento.id === 'segmento_4') {
        const integrative = payload.respuestas.find(({ slot_id }) => slot_id.endsWith(':28'));
        if (integrative) setNetworkActivity(integrative, request.intento === 1 ? repeated : replacement, request.intento === 1 ? 'la red de tres nodos' : 'la distribución de recursos');
      }
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
    }
  });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[4].slots.map(({ numero }) => numero), [28, 29, 30]);
  assert.match(calls[4].userPrompt, /actividad_repetida/);
  const basicos = result.contenido.secciones.find(({ id }) => id === 'ejercicios_basicos');
  assert.equal(basicos.bloques.some(({ cobertura }) => cobertura.includes(18)), true);
});

test('a repeated integrative problem on the second attempt aborts without a third segment call', async () => {
  const calls = [];
  const equations = ['x + y = 4', 'x + z = 5', 'y + z = 3'];
  await assert.rejects(generarCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
    completar: async (request) => {
      calls.push(request);
      const payload = responseFor(request.slots);
      const response = payload.respuestas.find(({ slot_id }) => request.segmento.id === 'segmento_3'
        ? slot_id.endsWith(':18')
        : request.segmento.id === 'segmento_4' && slot_id.endsWith(':28'));
      if (response) setNetworkActivity(response, equations, request.segmento.id === 'segmento_3' ? 'una red de nodos' : 'la red reformulada');
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
    }
  }), (error) => error.code === 'segmento_invalido_tras_retry'
    && error.diagnostics.some(({ errorCode }) => errorCode === 'actividad_repetida'));
  assert.equal(calls.filter(({ segmento }) => segmento.id === 'segmento_4').length, 2);
  assert.equal(calls.length, 5);
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

test('academic metadata constrains algebra examples from the first schema while conceptual subjects keep non-quantitative examples', async () => {
  assert.deepEqual(obtenerFamiliasCuantitativasContextoV3(context), ['determinante_2x2', 'sistema_lineal_2x2']);
  assert.deepEqual(obtenerFamiliasCuantitativasContextoV3({ materia: 'Historia', tema: 'Revoluciones modernas' }), []);

  const algebraCalls = [];
  const algebra = await generarCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
    completar: async (request) => {
      algebraCalls.push(request);
      return { content: JSON.stringify(responseFor(request.slots)), finishReason: 'stop', usage: {} };
    }
  });
  assert.equal(algebraCalls.length, 4);
  const exampleSchema = JSON.stringify(algebraCalls[1].jsonSchema);
  assert.match(exampleSchema, /determinante_2x2/);
  assert.match(exampleSchema, /sistema_lineal_2x2/);
  assert.doesNotMatch(exampleSchema, /no_cuantitativo/);
  assert.equal(algebra.metricas.reintentos, 0);

  const conceptualContext = { ...context, materia: 'Historia', tema: 'Revoluciones modernas' };
  const conceptual = await generarCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: conceptualContext,
    completar: async (request) => {
      const payload = responseFor(request.slots);
      for (const response of payload.respuestas) {
        const slot = request.slots.find(({ slotId }) => slotId === response.slot_id);
        if ([15, 36].includes(slot.numero)) response.bloque = materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot);
      }
      return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
    }
  });
  assert.equal(conceptual.metricas.reintentos, 0);
});

test('v3 prose prompts remain bounded and keep academic policy after 2O specialization', () => {
  crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion').forEach((segment, index) => {
    const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, segmento: segment });
    assert.equal(prompt.systemPrompt.length + prompt.userPrompt.length < 30000, true, `segmento ${index + 1}`);
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
          } else if (example) {
            example.bloque = {
              tipo: 'ejemplo_resuelto', enunciado: 'Caso conceptual.', pasos: ['Analiza el caso.', 'Explica la relación.'],
              resultado: 'Relación conceptual establecida.', verificacion: ['Contrasta la relación con las condiciones del caso.'],
              interpretacion: 'La relación conecta los conceptos.', contrato_cuantitativo: { familia_problema: 'no_cuantitativo' }
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

const segmentContext = { materia: 'Matemáticas', nivel: 'Preparatoria', tema: 'Segmentos de recta: cálculo de distancia entre dos puntos y punto medio', duracion: 50, tabla_ia: [], actividades_momentos: {}, datos_generales: {} };
const distanceContract = (operacion = 'ambas') => ({
  familia_problema: 'distancia_punto_medio_2d',
  datos: { punto_a: { x: '1', y: '2' }, punto_b: { x: '5', y: '5' } },
  operacion
});

test('distance and midpoint family activates only for the exact canonical academic context', () => {
  assert.deepEqual(obtenerFamiliasCuantitativasContextoV3(segmentContext), ['distancia_punto_medio_2d']);
  assert.deepEqual(obtenerFamiliasCuantitativasContextoV3({ ...segmentContext, materia: 'Química' }), []);
  assert.deepEqual(obtenerFamiliasCuantitativasContextoV3({ ...segmentContext, tema: 'Segmentos de recta' }), []);
  const guidedSegment = crearPlanSegmentosCuadernilloV3('aprendizaje_guiado')[1];
  assert.equal(construirFamiliasEsperadasSegmentoV3('aprendizaje_guiado', segmentContext, guidedSegment).get('aprendizaje_guiado:apoyos_aprendizaje:17')[0], 'distancia_punto_medio_2d');
});

test('backend derives exact distance, midpoint, operations and verification from coordinates', () => {
  const verified = verificarContratoCuantitativo(distanceContract(), ['distancia_punto_medio_2d']);
  assert.equal(verified.ok, true);
  assert.equal(verified.contratoHidratadoBackend.distancia, '5');
  assert.deepEqual(verified.contratoHidratadoBackend.punto_medio, { x: '3', y: '7/2' });
  assert.match(verified.visible.pasos.join(' '), /16/);
  assert.match(verified.visible.pasos.join(' '), /9/);
  assert.match(verified.visible.pasos.join(' '), /√25 = 5/);
  assert.match(verified.visible.resultado, /distancia = 5/);
  assert.match(verified.visible.verificaciones[0], /5² = 25/);
});

test('midpoint accepts integer and rational exact results while distance rejects unsupported roots', () => {
  const integer = verificarContratoCuantitativo({ ...distanceContract('punto_medio'), datos: { punto_a: { x: '0', y: '0' }, punto_b: { x: '4', y: '6' } } }, ['distancia_punto_medio_2d']);
  assert.deepEqual(integer.contratoHidratadoBackend.punto_medio, { x: '2', y: '3' });
  const rational = verificarContratoCuantitativo(distanceContract('punto_medio'), ['distancia_punto_medio_2d']);
  assert.deepEqual(rational.contratoHidratadoBackend.punto_medio, { x: '3', y: '7/2' });
  const unsupported = evaluarContratoCuantitativo({ ...distanceContract('distancia'), datos: { punto_a: { x: '0', y: '0' }, punto_b: { x: '1', y: '1' } } }, ['distancia_punto_medio_2d']);
  assert.equal(unsupported.code, 'raiz_no_racional_soportada');
});

test('distance contract rejects symbolic coordinates and model-provided results', () => {
  assert.equal(evaluarContratoCuantitativo({ ...distanceContract(), datos: { punto_a: { x: 'a', y: 'b' }, punto_b: { x: 'c', y: 'd' } } }, ['distancia_punto_medio_2d']).code, 'racional_invalido');
  assert.equal(evaluarContratoCuantitativo({ ...distanceContract(), resultado: '5' }, ['distancia_punto_medio_2d']).code, 'propiedad_cuantitativa_no_permitida');
});

test('student coordinate activities require concrete data and persist no solution metadata', () => {
  const slot = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').find(({ slotId }) => slotId === 'ejercicios_aplicacion:ejercicios_basicos:18');
  const input = {
    tipo: 'actividad', modalidad: 'ejercicio', instrucciones: 'Calcula y explica tu procedimiento.',
    contrato_tarea: { conceptos_requeridos: ['distancia', 'punto medio'], familia_tarea: 'geometria_analitica', datos_necesarios: ['coordenadas de A y B'], objetivo: 'Calcular e interpretar.', condicion_suficiencia: 'Se incluyen ambas coordenadas.', aplicacion_tema: 'Aplica distancia y punto medio.' }
  };
  const block = construirBloqueV3DesdeSlot(slot, input, { contextoPlaneacion: segmentContext });
  assert.match(block.items[0].enunciado, /A\(0, 0\).*B\(3, 4\)/);
  assert.equal(Object.hasOwn(block, 'punto_a'), false);
  assert.doesNotMatch(JSON.stringify(block), /distancia = 5|punto medio =/i);
  assert.ok(block.items[0].espacio_respuesta);
  assert.throws(() => construirBloqueV3DesdeSlot(slot, { ...input, punto_a: { x: 'p', y: 'q' } }, { contextoPlaneacion: segmentContext }), (error) => error.code === 'propiedad_no_permitida');
});

test('distance schemas require concrete inputs for examples, basics and the integrative activity', () => {
  const exercisePlan = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion');
  const examples = exercisePlan[1];
  const exampleFamilies = construirFamiliasEsperadasSegmentoV3('ejercicios_aplicacion', segmentContext, examples);
  const examplePrompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: segmentContext, segmento: examples, familiasEsperadas: exampleFamilies });
  const serializedExamples = JSON.stringify(examplePrompt.jsonSchema);
  assert.match(serializedExamples, /distancia_punto_medio_2d/);
  assert.doesNotMatch(serializedExamples, /punto_a|punto_b|operacion/);
  assert.doesNotMatch(serializedExamples, /no_cuantitativo/);
  assert.doesNotMatch(serializedExamples, /resultado_estructurado/);
  const retryPrompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: segmentContext, segmento: examples, familiasEsperadas: exampleFamilies, errores: [{ code: 'raiz_no_racional_soportada', path: 'slots[x].bloque' }] });
  assert.deepEqual(retryPrompt.jsonSchema, examplePrompt.jsonSchema);

  for (const segment of [exercisePlan[2], exercisePlan[3]]) {
    const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: segmentContext, segmento: segment });
    const schema = JSON.stringify(prompt.jsonSchema);
    assert.doesNotMatch(schema, /punto_a|punto_b|operacion/);
    assert.doesNotMatch(schema, /resultado_estructurado|solucion/);
  }
});

test('the former generic activity shape is rejected and the final schema matches the validator shape', () => {
  const slot = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').find(({ slotId }) => slotId === 'ejercicios_aplicacion:ejercicios_basicos:18');
  const legacyShape = {
    tipo: 'actividad', modalidad: 'ejercicio', instrucciones: 'Calcula la distancia.',
    items: [{ enunciado: 'Usa los puntos indicados.' }],
    contrato_tarea: { conceptos_requeridos: ['distancia'], familia_tarea: 'geometria', datos_necesarios: ['puntos'], objetivo: 'Calcular.', condicion_suficiencia: 'Hay dos puntos.', aplicacion_tema: 'Usa distancia.' }
  };
  assert.throws(() => construirBloqueV3DesdeSlot(slot, legacyShape, { contextoPlaneacion: segmentContext }), (error) => error.code === 'propiedad_no_permitida');
  const schema = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: segmentContext, segmento: crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[2] }).jsonSchema;
  const definition = schema.$defs.bloque_actividad_coordenadas_2d_ejercicio;
  assert.deepEqual(definition.required, ['tipo', 'modalidad', 'instrucciones', 'contrato_tarea']);
  assert.deepEqual(Object.keys(definition.properties), definition.required);
  assert.equal(definition.additionalProperties, false);
});

test('all backend coordinate datasets are complete, distinct and safe for their assigned operation', () => {
  const slotIds = [
    'aprendizaje_guiado:apoyos_aprendizaje:17',
    'ejercicios_aplicacion:ejemplos_resueltos:15',
    'ejercicios_aplicacion:ejemplos_resueltos:36',
    'ejercicios_aplicacion:ejercicios_basicos:18',
    'ejercicios_aplicacion:ejercicios_basicos:19',
    'ejercicios_aplicacion:ejercicios_basicos:20',
    'ejercicios_aplicacion:actividad_integradora:28'
  ];
  const allSlots = ['aprendizaje_guiado', 'ejercicios_aplicacion'].flatMap(obtenerSlotsCuadernilloV3);
  const signatures = new Set();
  for (const slotId of slotIds) {
    const slot = allSlots.find((candidate) => candidate.slotId === slotId);
    const dataset = obtenerDatasetDistanciaPuntoMedio2dV3(slot, segmentContext);
    assert.ok(dataset);
    assert.notDeepEqual(dataset.punto_a, dataset.punto_b);
    const signature = JSON.stringify(dataset);
    assert.equal(signatures.has(signature), false);
    signatures.add(signature);
    const solved = evaluarContratoCuantitativo(construirContratoDistanciaPuntoMedio2dV3(slot, segmentContext), ['distancia_punto_medio_2d']);
    assert.equal(solved.ok, true);
  }
});

test('two solved distance examples receive different backend-owned coordinate data', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
  const slots = segment.slots.filter(({ numero }) => [15, 36].includes(numero));
  const families = new Map(slots.map(({ slotId }) => [slotId, 'distancia_punto_medio_2d']));
  const payload = { respuestas: slots.map(({ slotId }) => ({ slot_id: slotId, bloque: { tipo: 'ejemplo_resuelto', contrato_cuantitativo: { familia_problema: 'distancia_punto_medio_2d' } } })) };
  const analysis = validarRespuestasSlotsCuadernilloV3({ segmento: segment, slotsSolicitados: slots, payload, familiasEsperadas: families, contextoPlaneacion: segmentContext });
  assert.equal(analysis.validas.size, 2);
  assert.notEqual(analysis.validas.get(slots[0].slotId).enunciado, analysis.validas.get(slots[1].slotId).enunciado);
  assert.notDeepEqual(obtenerDatasetDistanciaPuntoMedio2dV3(slots[0], segmentContext), obtenerDatasetDistanciaPuntoMedio2dV3(slots[1], segmentContext));
});

test('conceptual subjects retain non-quantitative examples and receive no geometry contract', () => {
  for (const conceptual of [
    { ...segmentContext, materia: 'Filosofía', tema: 'Argumentación ética' },
    { ...segmentContext, materia: 'Historia', tema: 'Revolución mexicana' },
    { ...segmentContext, materia: 'Química', tema: segmentContext.tema }
  ]) {
    const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
    const families = construirFamiliasEsperadasSegmentoV3('ejercicios_aplicacion', conceptual, segment);
    assert.equal(families.get('ejercicios_aplicacion:ejemplos_resueltos:15'), 'no_cuantitativo');
    const prompt = construirPromptSegmentoCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: conceptual, segmento: segment, familiasEsperadas: families });
    assert.doesNotMatch(JSON.stringify(prompt.jsonSchema), /distancia_punto_medio_2d|punto_a|punto_b/);
  }
});

test('v3 editorial linter rejects technical metadata at its exact visible path', () => {
  for (const [text, codePath] of [
    ['Practica la familia distancia_punto_medio_2d.', 'contenido'],
    ['Usa ejercicios_aplicacion:ejercicios_basicos:18.', 'contenido'],
    ['Repite el grupo ejemplo_resuelto_15_17.', 'contenido'],
    ['Consulta dataset_case_01.', 'contenido'],
    ['Completa contrato_cuantitativo.', 'contenido'],
    ['Usa contrato_tarea.', 'contenido']
  ]) {
    assert.throws(
      () => lintCuadernilloV3Block({ tipo: 'texto', contenido: text }, 'bloque'),
      (error) => error.code === 'metadata_tecnica_expuesta' && error.path === `bloque.${codePath}`
    );
  }
  assert.doesNotThrow(() => lintCuadernilloV3Block({ tipo: 'texto', contenido: 'Calcula la distancia entre dos puntos y determina el punto medio.' }, 'bloque'));
});

test('backend-owned activity instructions always match each assigned operation', () => {
  const slots = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').filter(({ slotId }) => [
    'ejercicios_aplicacion:ejercicios_basicos:18',
    'ejercicios_aplicacion:ejercicios_basicos:19',
    'ejercicios_aplicacion:ejercicios_basicos:20',
    'ejercicios_aplicacion:actividad_integradora:28'
  ].includes(slotId));
  for (const slot of slots) {
    const modalidad = slot.slotId.endsWith(':28') ? 'problema' : 'ejercicio';
    const block = construirBloqueV3DesdeSlot(slot, {
      tipo: 'actividad', modalidad,
      instrucciones: 'Calcula deliberadamente una operación contradictoria.',
      contrato_tarea: { conceptos_requeridos: ['segmentos'], familia_tarea: 'geometria', datos_necesarios: ['dos puntos'], objetivo: 'Resolver.', condicion_suficiencia: 'El backend aporta los puntos.', aplicacion_tema: 'Aplica el tema.' }
    }, { contextoPlaneacion: segmentContext });
    const operation = obtenerDatasetDistanciaPuntoMedio2dV3(slot, segmentContext).operacion;
    const visible = `${block.instrucciones} ${block.items[0].enunciado}`.toLowerCase();
    if (operation === 'distancia') {
      assert.match(visible, /calcula la distancia/);
      assert.doesNotMatch(visible, /punto medio/);
    } else if (operation === 'punto_medio') {
      assert.match(visible, /calcula el punto medio/);
      assert.doesNotMatch(visible, /calcula la distancia/);
    } else {
      assert.match(visible, /calcula la distancia y el punto medio/);
    }
    assert.doesNotMatch(visible, /contradictoria|distancia_punto_medio_2d|dataset|contrato_/);
    assert.doesNotMatch(visible, /distancia =|punto medio =/);
  }
});

test('the complete integrative group is hydrated from the backend operation without residual alternatives', () => {
  const slots = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').filter(({ slotId }) => [
    'ejercicios_aplicacion:actividad_integradora:28',
    'ejercicios_aplicacion:actividad_integradora:29',
    'ejercicios_aplicacion:actividad_integradora:30'
  ].includes(slotId));
  const task = { conceptos_requeridos: ['segmentos'], familia_tarea: 'geometria', datos_necesarios: ['dos puntos'], objetivo: 'Resolver.', condicion_suficiencia: 'El backend aporta los puntos.', aplicacion_tema: 'Aplica el tema.' };
  const inputs = new Map([
    [28, { tipo: 'actividad', modalidad: 'problema', instrucciones: 'Selecciona la fórmula de distancia o de punto medio.', contrato_tarea: task }],
    [29, { tipo: 'procedimiento', pasos: ['Selecciona la fórmula de distancia o de punto medio.', 'Revisa si obtuviste una longitud o un punto.'] }],
    [30, { tipo: 'texto', contenido: 'Explica si expresa una longitud o las coordenadas de un punto.' }]
  ]);
  const blocks = slots.map((slot) => construirBloqueV3DesdeSlot(slot, inputs.get(slot.numero), { contextoPlaneacion: segmentContext }));
  const visible = JSON.stringify(blocks).toLowerCase();
  assert.match(visible, /fórmula d =/);
  assert.match(visible, /fórmula m =/);
  assert.match(visible, /una longitud y un par ordenado/);
  assert.match(visible, /distancia como separación/);
  assert.match(visible, /punto medio como ubicación central/);
  assert.doesNotMatch(visible, /distancia o de punto medio|longitud o|distancia_punto_medio_2d|dataset|contrato_/);
  assert.doesNotMatch(visible, /distancia =|punto medio =/);
});

test('distance and midpoint solved output uses an operation-specific interpretation', () => {
  const distance = verificarContratoCuantitativo(distanceContract('distancia'), ['distancia_punto_medio_2d']).visible;
  assert.match(distance.interpretacion, /distancia.*separación.*longitud/i);
  assert.doesNotMatch(distance.interpretacion, /punto medio|par ordenado/i);
  const midpoint = verificarContratoCuantitativo(distanceContract('punto_medio'), ['distancia_punto_medio_2d']).visible;
  assert.match(midpoint.interpretacion, /punto medio.*ubicación central.*par ordenado/i);
  assert.doesNotMatch(midpoint.interpretacion, /distancia|separación.*longitud/i);
  const both = verificarContratoCuantitativo(distanceContract('ambas'), ['distancia_punto_medio_2d']).visible;
  assert.match(both.interpretacion, /distancia.*longitud.*punto medio.*par ordenado/i);
});

test('distance examples consolidate each mathematical group into one backend-owned visible block', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
  const blocks = new Map(segment.slots.map((slot) => [slot.slotId, { tipo: 'texto', contenido: 'Complemento generado.', cobertura: [slot.numero] }]));
  for (const principal of segment.slots.filter(({ numero }) => [15, 36].includes(numero))) {
    blocks.set(principal.slotId, construirBloqueV3DesdeSlot(principal, {
      tipo: 'ejemplo_resuelto', contrato_cuantitativo: { familia_problema: 'distancia_punto_medio_2d' }
    }, { contextoPlaneacion: segmentContext }));
  }
  consolidarGruposCuantitativosV3('ejercicios_aplicacion', segment, blocks, segmentContext);
  assert.equal(blocks.has('ejercicios_aplicacion:ejemplos_resueltos:16'), false);
  assert.equal(blocks.has('ejercicios_aplicacion:ejemplos_resueltos:17'), false);
  assert.equal(blocks.has('ejercicios_aplicacion:ejemplos_resueltos:37'), false);
  assert.equal(blocks.has('ejercicios_aplicacion:ejemplos_resueltos:38'), false);
  assert.deepEqual(blocks.get('ejercicios_aplicacion:ejemplos_resueltos:15').cobertura, [15, 16, 17]);
  assert.deepEqual(blocks.get('ejercicios_aplicacion:ejemplos_resueltos:36').cobertura, [36, 37, 38]);
});

test('guided case and solved examples expose calculations but no quantitative metadata', () => {
  const guidedSlot = obtenerSlotsCuadernilloV3('aprendizaje_guiado').find(({ slotId }) => slotId === 'aprendizaje_guiado:apoyos_aprendizaje:17');
  const exerciseSlots = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').filter(({ numero }) => [15, 36].includes(numero));
  for (const slot of [guidedSlot, ...exerciseSlots]) {
    const block = construirBloqueV3DesdeSlot(slot, { tipo: 'ejemplo_resuelto', contrato_cuantitativo: { familia_problema: 'distancia_punto_medio_2d' } }, { contextoPlaneacion: segmentContext });
    assert.match(block.resultado, /distancia =/);
    assert.doesNotMatch(JSON.stringify(block), /distancia_punto_medio_2d|contrato_cuantitativo|dataset_/);
  }
});

test('technical metadata retries only its presentation slot and a repeated leak stops after two calls', async () => {
  for (const alwaysInvalid of [false, true]) {
    const calls = [];
    const execution = generarCuadernilloV3({
      tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context,
      completar: async (request) => {
        calls.push(request);
        const payload = responseFor(request.slots);
        const target = payload.respuestas.find(({ slot_id }) => slot_id === 'ejercicios_aplicacion:presentacion:7');
        if (target && (alwaysInvalid || request.intento === 1)) target.bloque = { tipo: 'texto', contenido: 'Practica sistema_lineal_2x2.' };
        return { content: JSON.stringify(payload), finishReason: 'stop', usage: {} };
      }
    });
    if (alwaysInvalid) {
      await assert.rejects(execution, (error) => error.code === 'segmento_invalido_tras_retry'
        && error.diagnostics.some(({ errorCode }) => errorCode === 'metadata_tecnica_expuesta'));
      assert.equal(calls.length, 2);
    } else {
      await execution;
      assert.deepEqual(calls[1].slots.map(({ slotId }) => slotId), ['ejercicios_aplicacion:presentacion:7']);
      assert.match(calls[1].userPrompt, /metadata_tecnica_expuesta/);
      assert.equal(calls.length, 5);
    }
  }
});
