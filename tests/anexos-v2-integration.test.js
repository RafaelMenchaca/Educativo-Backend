import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPO_CUADERNILLO_IDS } from '../src/domain/cuadernillos.js';
import { resolverRepresentacionSlotCuadernilloV3 } from '../src/domain/cuadernilloV3Representations.js';
import { createCuadernilloV2Completer, generarAnexo, regenerarAnexo } from '../src/services/anexos.service.js';
import { postGenerarAnexo, postRegenerarAnexo } from '../src/controllers/anexos.controller.js';

const planeacion = Object.freeze({
  id: 'plan-1', user_id: 'user-1', tema_id: 'tema-1', batch_id: 'batch-1',
  tema: 'Ecuaciones lineales', materia: 'Matematicas', nivel: 'Secundaria', duracion: 50,
  tabla_ia: [{ momento: 'Desarrollo', actividad: 'Resolver situaciones' }],
  actividades_momentos: { desarrollo: 'Resolucion guiada' }
});

function fixtureCompleter({ invalidFirst = false, alwaysInvalid = false, calls = [] } = {}) {
  return async (request) => {
    calls.push(request);
    if (alwaysInvalid || (invalidFirst && calls.length === 1)) return { content: '{', usage: {} };
    const materialize = (value, slot) => {
      if (typeof value === 'string' && value.startsWith('<')) return `Desarrolla ${value.slice(1, -1)} para ${slot.nombre}.`;
      if (Array.isArray(value)) return value.map((item) => materialize(item, slot));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, slot)]));
      return value;
    };
    return {
      content: JSON.stringify({
        respuestas: request.slots.map((slot) => ({
          slot_id: slot.slotId,
          bloque: request.schemaVersion === 3
            ? materialize(resolverRepresentacionSlotCuadernilloV3(slot).esquemaMinimo, slot)
            : {
            tipo: 'texto',
            titulo: 'Contenido util',
            contenido: `Desarrollo para ${slot.nombre}`
          }
        }))
      }),
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      durationMs: 5
    };
  };
}

function fakeMetrics({ failCreate = false } = {}) {
  const calls = { create: [], finish: [], fail: [] };
  return {
    calls,
    api: {
      async createAiJob(payload) { calls.create.push(payload); if (failCreate) throw new Error('metrics offline'); return 'job-1'; },
      async finishAiJob(id, payload) { calls.finish.push({ id, payload }); },
      async failAiJob(id, payload) { calls.fail.push({ id, payload }); },
      async logAiCall() {}
    }
  };
}

function fakeDb({ existing = null, insertError = null, ownedPlaneacion = planeacion } = {}) {
  const state = { anexos: existing ? [structuredClone(existing)] : [], inserts: [], updates: [] };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.payload = null; }
    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    order() { return this; }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload) { this.op = 'update'; this.payload = payload; return this; }
    matches(row) { return this.filters.every(([key, value]) => String(row?.[key]) === String(value)); }
    rows() {
      if (this.table === 'planeaciones') return ownedPlaneacion ? [ownedPlaneacion] : [];
      if (this.table === 'temas') return [{ id: 'tema-1', unidad_id: null }];
      return state.anexos;
    }
    async execute(single = false) {
      if (this.op === 'insert') {
        state.inserts.push(structuredClone(this.payload));
        if (insertError) return { data: null, error: insertError };
        const row = { id: `anexo-${state.anexos.length + 1}`, created_at: '2026-01-01', ...structuredClone(this.payload) };
        state.anexos.push(row);
        return { data: row, error: null };
      }
      if (this.op === 'update') {
        const row = state.anexos.find((item) => this.matches(item));
        state.updates.push(structuredClone(this.payload));
        if (row) Object.assign(row, structuredClone(this.payload));
        return { data: row || null, error: null };
      }
      const rows = this.rows().filter((row) => this.matches(row));
      return { data: single ? (rows[0] || null) : rows, error: null };
    }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  }
  return { client: { from: (table) => new Query(table) }, state };
}

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

for (const tipo of TIPO_CUADERNILLO_IDS) {
  test(`generation dispatches ${tipo} through the segmented engine and inserts once`, async () => {
    const { client, state } = fakeDb();
    const metrics = fakeMetrics();
    const calls = [];
    const result = await generarAnexo({
      supabaseClient: client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: tipo,
      completarV2: fixtureCompleter({ calls }), metricas: metrics.api
    });
    assert.equal(calls.length, 4);
    assert.equal(state.inserts.length, 1);
    assert.equal(state.inserts[0].tipo_cuadernillo, tipo);
    assert.equal(state.inserts[0].contenido.schema_version, 3);
    assert.equal(state.inserts[0].contenido.datos_generales, undefined);
    assert.equal(state.inserts[0].contenido.tipo_cuadernillo, undefined);
    assert.equal(state.inserts[0].prompt_version, 'v3_cuadernillo_academico_tipado');
    assert.equal(state.inserts[0].tokens_total, 120);
    assert.equal(result.schema_version, 3);
    assert.match(calls[0].userPrompt, /Ecuaciones lineales/);
    assert.doesNotMatch(calls[0].userPrompt, /materia manipulada/i);
  });
}

test('v1 dispatch remains injectable and persists a null type with its original version', async () => {
  const { client, state } = fakeDb();
  let calls = 0;
  await generarAnexo({
    supabaseClient: client, userId: 'user-1', planeacionId: 'plan-1', metricas: fakeMetrics().api,
    generarV1: async (context) => {
      calls += 1;
      assert.equal(context.tema, planeacion.tema);
      return { contenido: { titulo_general: 'Anexos', descripcion: 'd', anexos: [{}, {}, {}] }, tokensPrompt: 1, tokensCompletion: 2, tokensTotal: 3 };
    }
  });
  assert.equal(calls, 1);
  assert.equal(state.inserts[0].tipo_cuadernillo, null);
  assert.equal(state.inserts[0].prompt_version, 'v1_anexos_desde_planeacion');
});

test('invalid type, visible label and missing ownership fail before completion', async () => {
  for (const tipo of ['otro', 'Cuadernillo de aprendizaje guiado']) {
    let calls = 0;
    await assert.rejects(generarAnexo({
      supabaseClient: fakeDb().client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: tipo,
      completarV2: async () => { calls += 1; }
    }), (error) => error.status === 400 && error.code === 'tipo_cuadernillo_invalido');
    assert.equal(calls, 0);
  }
  let calls = 0;
  await assert.rejects(generarAnexo({
    supabaseClient: fakeDb({ ownedPlaneacion: null }).client, userId: 'user-1', planeacionId: 'plan-1',
    tipoCuadernillo: 'aprendizaje_guiado', completarV2: async () => { calls += 1; }
  }), (error) => error.status === 404);
  assert.equal(calls, 0);
});

test('retry succeeds, but two invalid attempts or a late segment failure never insert partial content', async () => {
  const retryDb = fakeDb();
  const retryCalls = [];
  await generarAnexo({
    supabaseClient: retryDb.client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: 'aprendizaje_guiado',
    completarV2: fixtureCompleter({ invalidFirst: true, calls: retryCalls }), metricas: fakeMetrics().api
  });
  assert.equal(retryCalls.length, 5);
  assert.equal(retryDb.state.inserts.length, 1);

  for (const failAtLateSegment of [false, true]) {
    const db = fakeDb();
    let calls = 0;
    const completarV2 = async (request) => {
      calls += 1;
      if (!failAtLateSegment || request.segmento.orden === 4) return { content: '{', usage: {} };
      return fixtureCompleter()(request);
    };
    await assert.rejects(generarAnexo({
      supabaseClient: db.client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: 'aprendizaje_guiado',
      completarV2, metricas: fakeMetrics().api
    }), (error) => error.status === 502);
    assert.equal(db.state.inserts.length, 0);
    assert.ok(calls <= 5);
  }
});

test('slot retry inserts once on success and zero times when pending slots remain invalid', async () => {
  for (const succeeds of [true, false]) {
    const db = fakeDb();
    let calls = 0;
    const completarV2 = async (request) => {
      calls += 1;
      if (request.segmento.id !== 'segmento_2') return fixtureCompleter()(request);
      if (request.intento === 1) {
        const first = await fixtureCompleter()(request);
        const payload = JSON.parse(first.content);
        payload.respuestas = payload.respuestas.filter(({ slot_id }) => !slot_id.endsWith(':13'));
        return { content: JSON.stringify(payload), finishReason: 'stop' };
      }
      return {
        content: succeeds
          ? JSON.stringify({ respuestas: [{
              slot_id: request.slots[0].slotId,
              bloque: { tipo: 'texto', contenido: 'Reglas y propiedades matriciales útiles.' }
            }] })
          : '{',
        finishReason: 'stop'
      };
    };
    const operation = generarAnexo({
      supabaseClient: db.client, userId: 'user-1', planeacionId: 'plan-1',
      tipoCuadernillo: 'ejercicios_aplicacion', completarV2, metricas: fakeMetrics().api
    });
    if (succeeds) {
      await operation;
      assert.equal(db.state.inserts.length, 1);
      assert.equal(calls, 5);
    } else {
      await assert.rejects(operation, (error) => error.status === 502);
      assert.equal(db.state.inserts.length, 0);
      assert.equal(calls, 3);
    }
  }
});

test('failure in any segment and final validation failure produce zero inserts', async () => {
  for (const failingSegment of [1, 2, 3, 4]) {
    const db = fakeDb();
    const completarV2 = async (request) => {
      if (request.segmento.orden === failingSegment) return { content: '{', usage: {}, finishReason: 'stop' };
      return fixtureCompleter()(request);
    };
    await assert.rejects(generarAnexo({
      supabaseClient: db.client, userId: 'user-1', planeacionId: 'plan-1',
      tipoCuadernillo: 'ejercicios_aplicacion', completarV2, metricas: fakeMetrics().api
    }), (error) => error.status === 502 && error.message === 'No se pudo generar un cuadernillo valido.');
    assert.equal(db.state.inserts.length, 0, `segment ${failingSegment}`);
  }

  const finalDb = fakeDb();
  const finalCompleter = async ({ slots }) => {
    const payload = {
      respuestas: slots.map((slot) => ({
        slot_id: slot.slotId,
        bloque: {
          tipo: 'texto', contenido: `Contenido ${slot.nombre}`
        }
      }))
    };
    payload.respuestas[0].bloque.contenido = '';
    return { content: JSON.stringify(payload), finishReason: 'stop' };
  };
  await assert.rejects(generarAnexo({
    supabaseClient: finalDb.client, userId: 'user-1', planeacionId: 'plan-1',
    tipoCuadernillo: 'ejercicios_aplicacion', completarV2: finalCompleter, metricas: fakeMetrics().api
  }), (error) => error.status === 502);
  assert.equal(finalDb.state.inserts.length, 0);
});

test('provider failure before the first v3 completion is sanitized and persists nothing', async () => {
  const db = fakeDb();
  let calls = 0;
  await assert.rejects(generarAnexo({
    supabaseClient: db.client,
    userId: 'user-1',
    planeacionId: 'plan-1',
    tipoCuadernillo: 'ejercicios_aplicacion',
    completarV2: async () => {
      calls += 1;
      const error = new Error('provider request contained secret detail');
      error.isCuadernilloV3ProviderError = true;
      error.safeDetails = { providerClass: 'invalid_json_schema', retryable: false, stage: 'provider_request' };
      throw error;
    },
    metricas: fakeMetrics().api
  }), (error) => error.status === 502
    && error.message === 'No se pudo generar un cuadernillo valido.'
    && !error.message.includes('secret'));
  assert.equal(calls, 1);
  assert.equal(db.state.inserts.length, 0);
});

test('already_exists and a 23505 race return the owned record without changing its type', async () => {
  const existing = { id: 'a-1', planeacion_id: 'plan-1', user_id: 'user-1', tipo_cuadernillo: 'ejercicios_aplicacion', prompt_version: 'v2_cuadernillo_segmentado' };
  let calls = 0;
  const direct = fakeDb({ existing });
  const result = await generarAnexo({
    supabaseClient: direct.client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: 'aprendizaje_guiado',
    completarV2: async () => { calls += 1; }
  });
  assert.equal(result.status, 'already_exists');
  assert.equal(result.tipo_cuadernillo, 'ejercicios_aplicacion');
  assert.equal(calls, 0);

  const race = fakeDb({ insertError: { code: '23505' } });
  const raceCalls = [];
  const originalInsert = race.client.from;
  // The in-memory race winner becomes visible before the reread.
  race.client.from = (table) => {
    const query = originalInsert(table);
    if (table === 'anexos') {
      const insert = query.insert.bind(query);
      query.insert = (payload) => {
        race.state.anexos.push(structuredClone(existing));
        return insert(payload);
      };
    }
    return query;
  };
  const raced = await generarAnexo({
    supabaseClient: race.client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: 'aprendizaje_guiado',
    completarV2: fixtureCompleter({ calls: raceCalls }), metricas: fakeMetrics().api
  });
  assert.equal(raced.status, 'already_exists');
  assert.equal(raced.tipo_cuadernillo, 'ejercicios_aplicacion');
});

test('regeneration preserves the persisted version and performs one final update', async () => {
  for (const { tipo, schemaVersion } of [
    { tipo: null, schemaVersion: 1 },
    { tipo: 'actividades_integradoras', schemaVersion: 2 },
    { tipo: 'aprendizaje_guiado', schemaVersion: 3 }
  ]) {
    const existing = { id: 'a-1', planeacion_id: 'plan-1', user_id: 'user-1', tipo_cuadernillo: tipo,
      contenido: tipo ? { schema_version: schemaVersion } : { anexos: [] },
      prompt_version: tipo ? `${schemaVersion === 3 ? 'v3_cuadernillo_editorial' : 'v2_cuadernillo'}_segmentado` : 'v1_anexos_desde_planeacion' };
    const db = fakeDb({ existing });
    let v1Calls = 0;
    const result = await regenerarAnexo({
      supabaseClient: db.client, userId: 'user-1', id: 'a-1', completarV2: fixtureCompleter(), metricas: fakeMetrics().api,
      generarV1: async () => { v1Calls += 1; return { contenido: { titulo_general: 'v1', anexos: [{}, {}, {}] }, tokensPrompt: 1, tokensCompletion: 2, tokensTotal: 3 }; }
    });
    assert.equal(db.state.updates.length, 1);
    assert.equal(result.tipo_cuadernillo, tipo);
    assert.equal(result.schema_version, tipo ? schemaVersion : null);
    assert.equal(db.state.updates[0].contenido.schema_version ?? null, tipo ? schemaVersion : null);
    assert.equal(v1Calls, tipo ? 0 : 1);
    assert.equal(db.state.updates[0].tipo_cuadernillo, undefined);
  }
});

test('invalid persisted type and controller-manipulated payloads fail before generation', async () => {
  let calls = 0;
  await assert.rejects(regenerarAnexo({
    supabaseClient: fakeDb({ existing: { id: 'a-1', planeacion_id: 'plan-1', user_id: 'user-1', tipo_cuadernillo: 'otro' } }).client,
    userId: 'user-1', id: 'a-1', completarV2: async () => { calls += 1; }
  }), (error) => error.code === 'tipo_cuadernillo_persistido_invalido');
  assert.equal(calls, 0);

  for (const body of [
    { planeacion_id: 'plan-1', tipo_cuadernillo: 'otro' },
    { planeacion_id: 'plan-1', user_id: 'attacker' },
    { planeacion_id: 'plan-1', materia: 'materia manipulada' }
  ]) {
    const res = responseRecorder();
    await postGenerarAnexo({ body, user: { id: 'user-1' }, accessToken: null }, res);
    assert.equal(res.statusCode, 400);
  }
  const res = responseRecorder();
  await postRegenerarAnexo({ body: { tipo_cuadernillo: 'ejercicios_aplicacion' }, params: { id: 'a-1' }, user: { id: 'user-1' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'tipo_cuadernillo_no_modificable');
});

test('metrics failures are non-blocking and static boundaries remain intact', async () => {
  const db = fakeDb();
  await generarAnexo({
    supabaseClient: db.client, userId: 'user-1', planeacionId: 'plan-1', tipoCuadernillo: 'aprendizaje_guiado',
    completarV2: fixtureCompleter(), metricas: fakeMetrics({ failCreate: true }).api
  });
  assert.equal(db.state.inserts.length, 1);
  const routes = readFileSync(new URL('../src/routes/anexos.routes.js', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../src/services/anexos.service.js', import.meta.url), 'utf8');
  const biblioteca = readFileSync(new URL('../src/services/biblioteca.service.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.post\('\/generate',\s*requireAuth,\s*postGenerarAnexo\)/);
  assert.match(service, /Genera entre 3 y 5 anexos/);
  assert.match(service, /model:\s*'gpt-4o-mini'/);
  assert.match(service, /payload\.anexos\.length < 3 \|\| payload\.anexos\.length > 5/);
  assert.match(biblioteca, /tipo_cuadernillo, prompt_version/);
  assert.doesNotMatch(biblioteca, /\.select\([^\n]*contenido[^\n]*\)\n\s*\.in\('batch_id'/);
});

test('OpenAI adapter uses scoped Chat Completions parameters and exposes usage without a real call', async () => {
  let request;
  const metricCalls = [];
  const completar = createCuadernilloV2Completer({
    jobId: 'job-1', userId: 'user-1', tipoCuadernillo: 'aprendizaje_guiado', tema: 'Tema backend',
    openaiClient: { chat: { completions: { async create(payload) {
      request = payload;
      return { choices: [{ message: { content: '{"respuestas":[]}' }, finish_reason: 'length' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } };
    } } } },
    async logCall(payload) { metricCalls.push(payload); }
  });
  const result = await completar({ systemPrompt: 's', userPrompt: 'u', segmento: { id: 'segmento_1' }, intento: 2 });
  assert.deepEqual(request, {
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 3000
  });
  assert.equal(result.content, '{"respuestas":[]}');
  assert.equal(result.usage.total_tokens, 5);
  assert.equal(result.finishReason, 'length');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(metricCalls[0].retryNumber, 1);
  assert.equal(metricCalls[0].metadata.segmento, 'segmento_1');
  assert.equal(metricCalls[0].metadata.finish_reason, 'length');
});
