import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CUADERNILLO_BLUEPRINTS,
  TIPO_CUADERNILLO_IDS
} from '../src/domain/cuadernillos.js';
import {
  CuadernilloV2GenerationError,
  crearPlanSegmentosCuadernilloV2,
  generarCuadernilloV2
} from '../src/services/cuadernilloV2.engine.js';
import { validateCuadernilloV2 } from '../src/validators/cuadernilloV2.validator.js';

function context(overrides = {}) {
  return {
    materia: 'Matematicas',
    nivel: 'Secundaria',
    tema: 'Ecuaciones lineales',
    duracion: 50,
    tabla_ia: [{ momento: 'Desarrollo', actividad: 'Resolver situaciones' }],
    actividades_momentos: { desarrollo: 'Resolucion guiada' },
    datos_generales: {},
    ...overrides
  };
}

function sectionFixture(section) {
  return {
    id: section.id,
    titulo: section.titulo,
    orden: section.orden,
    bloques: [{
      tipo: 'texto',
      titulo: 'Contenido util',
      contenido: `Desarrollo pedagogico para ${section.titulo}.`,
      cobertura: section.cobertura_requerida.map(({ numero }) => numero)
    }]
  };
}

function validSegment(segment) {
  return { secciones: segment.secciones.map(sectionFixture) };
}

function syntheticCompleter({ mutate, firstRaw, usage } = {}) {
  const calls = [];
  const completar = async (request) => {
    calls.push(request);
    if (firstRaw !== undefined && calls.length === 1) {
      return { content: firstRaw, usage: usage ?? { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }, durationMs: 4 };
    }
    const payload = validSegment(request.segmento);
    mutate?.(payload, request, calls.length);
    return {
      content: JSON.stringify(payload),
      usage: usage ?? { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      durationMs: 5
    };
  };
  return { completar, calls };
}

async function expectSegmentFailure(mutate, expectedCode = 'segmento_invalido_tras_retry') {
  const { completar, calls } = syntheticCompleter({ mutate });
  await assert.rejects(
    generarCuadernilloV2({
      tipoCuadernillo: 'aprendizaje_guiado',
      contextoPlaneacion: context(),
      completar
    }),
    (error) => error instanceof CuadernilloV2GenerationError && error.code === expectedCode
  );
  assert.equal(calls.length, 2);
}

test('segment plan is deterministic and covers each canonical blueprint exactly once', () => {
  for (const type of TIPO_CUADERNILLO_IDS) {
    const plan = crearPlanSegmentosCuadernilloV2(type);
    const blueprint = CUADERNILLO_BLUEPRINTS[type];
    assert.equal(plan.length, 4);
    assert.deepEqual(plan.map(({ secciones }) => secciones.length), blueprint.length === 10 ? [2, 3, 3, 2] : [2, 2, 2, 2]);
    assert.deepEqual(plan.flatMap(({ secciones }) => secciones.map(({ id }) => id)), blueprint.map(({ id }) => id));
    assert.equal(new Set(plan.flatMap(({ secciones }) => secciones.map(({ id }) => id))).size, blueprint.length);
  }
});

for (const type of TIPO_CUADERNILLO_IDS) {
  test(`offline engine assembles a valid complete document for ${type}`, async () => {
    const { completar, calls } = syntheticCompleter();
    const { contenido, metricas } = await generarCuadernilloV2({
      tipoCuadernillo: type,
      contextoPlaneacion: context(),
      completar
    });
    assert.deepEqual(validateCuadernilloV2(type, contenido), { ok: true, schemaVersion: 2, tipoCuadernillo: type });
    assert.equal(contenido.secciones.flatMap(({ bloques }) => bloques.flatMap(({ cobertura }) => cobertura)).length, type === 'actividades_integradoras' ? 45 : 35);
    assert.equal(calls.length, 4);
    assert.deepEqual(metricas, {
      segmentos: 4,
      llamadas: 4,
      reintentos: 0,
      tokensPrompt: 40,
      tokensCompletion: 80,
      tokensTotal: 120,
      duracionMs: 20
    });
  });
}

test('invalid type is rejected before any completion', async () => {
  let calls = 0;
  await assert.rejects(
    generarCuadernilloV2({ tipoCuadernillo: 'otro', contextoPlaneacion: context(), completar: async () => { calls += 1; } }),
    (error) => error.code === 'tipo_cuadernillo_invalido'
  );
  assert.equal(calls, 0);
});

test('incomplete or client-shaped context is rejected before any completion', async () => {
  for (const invalid of [
    context({ materia: '' }),
    context({ duracion: 0 }),
    context({ tabla_ia: null }),
    context({ user_id: 'forbidden' }),
    context({ datos_generales: { estudiante: 'Inventado' } })
  ]) {
    let calls = 0;
    await assert.rejects(
      generarCuadernilloV2({ tipoCuadernillo: 'aprendizaje_guiado', contextoPlaneacion: invalid, completar: async () => { calls += 1; } }),
      CuadernilloV2GenerationError
    );
    assert.equal(calls, 0);
  }
});

test('invalid JSON gets one safe corrective retry and then succeeds', async () => {
  const { completar, calls } = syntheticCompleter({ firstRaw: 'not-json' });
  const result = await generarCuadernilloV2({
    tipoCuadernillo: 'aprendizaje_guiado',
    contextoPlaneacion: context(),
    completar
  });
  assert.equal(result.metricas.llamadas, 5);
  assert.equal(result.metricas.reintentos, 1);
  assert.equal(calls[1].intento, 2);
  assert.match(calls[1].userPrompt, /json_segmento_invalido/);
  assert.doesNotMatch(calls[1].userPrompt, /not-json/);
});

test('structurally invalid first result gets one corrective retry and then succeeds', async () => {
  let first = true;
  const { completar, calls } = syntheticCompleter({
    mutate(payload) {
      if (first) {
        first = false;
        payload.secciones[0].bloques = [];
      }
    }
  });
  const result = await generarCuadernilloV2({
    tipoCuadernillo: 'ejercicios_aplicacion',
    contextoPlaneacion: context(),
    completar
  });
  assert.equal(result.metricas.reintentos, 1);
  assert.match(calls[1].userPrompt, /bloques_vacios/);
});

test('two invalid attempts abort the whole workbook and stop remaining segments', async () => {
  await expectSegmentFailure((payload) => { payload.secciones = []; });
});

test('additional, missing and out-of-order sections are rejected', async () => {
  await expectSegmentFailure((payload) => { payload.secciones.push(structuredClone(payload.secciones[0])); });
  await expectSegmentFailure((payload) => { payload.secciones.pop(); });
  await expectSegmentFailure((payload) => { payload.secciones.reverse(); });
});

test('duplicate, missing and foreign coverage are rejected', async () => {
  await expectSegmentFailure((payload) => { payload.secciones[0].bloques[0].cobertura.push(payload.secciones[0].bloques[0].cobertura[0]); });
  await expectSegmentFailure((payload) => { payload.secciones[0].bloques[0].cobertura.pop(); });
  await expectSegmentFailure((payload) => { payload.secciones[0].bloques[0].cobertura[0] = 999; });
});

test('unknown block and activity modality are rejected', async () => {
  await expectSegmentFailure((payload) => { payload.secciones[0].bloques[0].tipo = 'imagen'; });
  await expectSegmentFailure((payload) => {
    const coverage = payload.secciones[0].bloques[0].cobertura;
    payload.secciones[0].bloques = [{
      tipo: 'actividad',
      modalidad: 'arbitraria',
      instrucciones: 'Responde.',
      items: [{ id: 'a1', enunciado: 'Pregunta util' }],
      cobertura: coverage
    }];
  });
});

test('duplicate activity IDs are rejected inside a segment', async () => {
  await expectSegmentFailure((payload) => {
    const section = payload.secciones[0];
    const coverage = section.bloques[0].cobertura;
    section.bloques = [{
      tipo: 'actividad',
      modalidad: 'preguntas',
      instrucciones: 'Responde.',
      items: [
        { id: 'duplicada', enunciado: 'Primera pregunta' },
        { id: 'duplicada', enunciado: 'Segunda pregunta' }
      ],
      cobertura: coverage
    }];
  });
});

test('backend owns general data and completions cannot overwrite it', async () => {
  const { completar } = syntheticCompleter();
  const { contenido } = await generarCuadernilloV2({
    tipoCuadernillo: 'aprendizaje_guiado',
    contextoPlaneacion: context({ datos_generales: { institucion: 'Escuela confiable', unidad: 'Unidad 2' } }),
    completar
  });
  assert.deepEqual(contenido.datos_generales.institucion, { valor: 'Escuela confiable', modo: 'backend' });
  assert.deepEqual(contenido.datos_generales.unidad, { valor: 'Unidad 2', modo: 'backend' });
  for (const key of ['estudiante', 'grupo', 'fecha']) {
    assert.equal(contenido.datos_generales[key].valor, '');
    assert.equal(contenido.datos_generales[key].modo, 'completar');
  }
  assert.equal(Object.hasOwn(contenido, 'tipo_cuadernillo'), false);

  await expectSegmentFailure((payload) => { payload.datos_generales = { estudiante: 'Inventado' }; });
});

test('metrics accumulate synthetic retries, token aliases and durations without persistence', async () => {
  const { completar } = syntheticCompleter({
    firstRaw: '{bad',
    usage: { input_tokens: 3, output_tokens: 7 }
  });
  const { metricas } = await generarCuadernilloV2({
    tipoCuadernillo: 'actividades_integradoras',
    contextoPlaneacion: context(),
    completar
  });
  assert.deepEqual(metricas, {
    segmentos: 4,
    llamadas: 5,
    reintentos: 1,
    tokensPrompt: 15,
    tokensCompletion: 35,
    tokensTotal: 50,
    duracionMs: 24
  });
});

test('segment prompts are scoped and contain no v1 catalog or full document root request', async () => {
  const { completar, calls } = syntheticCompleter();
  await generarCuadernilloV2({
    tipoCuadernillo: 'aprendizaje_guiado',
    contextoPlaneacion: context(),
    completar
  });
  for (const call of calls) {
    assert.match(call.userPrompt, /Blueprint solicitado/);
    assert.match(call.userPrompt, /Allowlist de bloques/);
    assert.match(call.systemPrompt, /No incluyas datos_generales, schema_version, titulo, descripcion ni tipo_cuadernillo/);
    assert.doesNotMatch(call.userPrompt, /Genera entre 3 y 5 anexos/);
  }
});

test('v1 annex contract remains present while integration is version-dispatched', () => {
  const service = readFileSync(new URL('../src/services/anexos.service.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../src/controllers/anexos.controller.js', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../src/routes/anexos.routes.js', import.meta.url), 'utf8');
  assert.match(service, /v1_anexos_desde_planeacion/);
  assert.match(service, /payload\.anexos\.length < 3 \|\| payload\.anexos\.length > 5/);
  assert.match(service, /cuadernilloV2\.engine/);
  assert.match(controller, /tipo_cuadernillo/);
  assert.doesNotMatch(routes, /tipo_cuadernillo|generarCuadernilloV2/);
});
