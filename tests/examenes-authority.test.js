// Offline authority tests. Supabase, OpenAI, metrics and timers are replaced
// with in-memory fakes; this file never loads runtime configuration or .env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const serviceSource = readFileSync(new URL('../src/services/examenes.service.js', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('../src/controllers/examenes.controller.js', import.meta.url), 'utf8');
const routesSource = readFileSync(new URL('../src/routes/examenes.routes.js', import.meta.url), 'utf8');

const IDS = Object.freeze({
  userA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  batchA: '11111111-1111-4111-8111-111111111111',
  batchB: '22222222-2222-4222-8222-222222222222',
  jobA: '33333333-3333-4333-8333-333333333333',
  jobB: '44444444-4444-4444-8444-444444444444',
  itemA: '55555555-5555-4555-8555-555555555555',
  itemB: '55555555-5555-4555-8555-555555555556',
  unidadA: '66666666-6666-4666-8666-666666666666',
  materiaA: '77777777-7777-4777-8777-777777777777',
  gradoA: '88888888-8888-4888-8888-888888888888',
  plantelA: '99999999-9999-4999-8999-999999999999',
  temaA: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  temaB: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaab',
  planeacionA: 7
});

function synthetic(context, exports) {
  return new SyntheticModule(Object.keys(exports), function setExports() {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
}

function baseContext({ timers, openAiCalls, logs, timerThrows = false }) {
  return createContext({
    console: {
      info(...args) { logs.push(['info', ...args]); },
      warn(...args) { logs.push(['warn', ...args]); },
      error(...args) { logs.push(['error', ...args]); },
      log() {}
    },
    process: { env: { OPENAI_API_KEY: 'synthetic-placeholder' } },
    setTimeout(callback, delay) {
      if (timerThrows) throw new Error('synthetic timer failure with Bearer secret');
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
    AbortController,
    Set,
    Map,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Date,
    JSON,
    Math,
    Promise,
    Reflect,
    Error
  });
}

async function loadService({ adminClient, timerThrows = false, openAiResponse = null } = {}) {
  const timers = [];
  const openAiCalls = [];
  const logs = [];
  const context = baseContext({ timers, openAiCalls, logs, timerThrows });
  class OpenAI {
    constructor() {
      this.chat = { completions: { create: async () => {
        openAiCalls.push(true);
        if (openAiResponse) return openAiResponse;
        throw new Error('OpenAI must not run');
      } } };
    }
  }
  const service = new SourceTextModule(serviceSource, { context });
  const modules = {
    '../../supabaseClient.js': synthetic(context, {
      supabaseAdmin: adminClient || { from() { throw new Error('unexpected admin access'); } }
    }),
    openai: synthetic(context, { default: OpenAI }),
    '../utils/buildExamPromptByUnit.js': synthetic(context, { buildExamPromptByUnit: () => '' }),
    './jerarquia.service.js': synthetic(context, {
      obtenerContextoUnidad: async () => ({
        plantel: { id: IDS.plantelA },
        grado: { id: IDS.gradoA, nivel_base: 'synthetic' },
        materia: { id: IDS.materiaA, nombre: 'synthetic' },
        unidad: { id: IDS.unidadA, nombre: 'synthetic' }
      })
    }),
    './aiMetrics.service.js': synthetic(context, {
      createAiJob: async () => null,
      finishAiJob: async () => {},
      failAiJob: async () => {},
      logAiCall: async () => {}
    })
  };
  await service.link((specifier) => {
    if (!modules[specifier]) throw new Error(`Unexpected import: ${specifier}`);
    return modules[specifier];
  });
  await service.evaluate();
  return { api: service.namespace, timers, openAiCalls, logs };
}

function createClient(responder) {
  const calls = [];
  class Query {
    constructor(table) {
      this.table = table;
      this.action = 'select';
      this.payload = null;
      this.filters = [];
      this.columns = '*';
      calls.push({ type: 'from', table });
    }
    select(columns = '*') { this.columns = columns; return this; }
    insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
    update(payload) { this.action = 'update'; this.payload = payload; return this; }
    delete() { this.action = 'delete'; return this; }
    eq(field, value) { this.filters.push(['eq', field, value]); return this; }
    in(field, value) { this.filters.push(['in', field, value]); return this; }
    or() { return this; }
    order() { return this; }
    limit() { return this; }
    async maybeSingle() { return this.run('maybeSingle'); }
    async single() { return this.run('single'); }
    then(resolve, reject) { return this.run('many').then(resolve, reject); }
    async run(mode) {
      const call = { table: this.table, action: this.action, payload: this.payload, filters: this.filters, columns: this.columns, mode };
      calls.push(call);
      return responder(call);
    }
  }
  return { client: { from(table) { return new Query(table); } }, calls };
}

function generationResponder({
  batchOwner = IDS.userA,
  batchMissing = false,
  databaseError = false,
  planeacionBatch = IDS.batchA,
  planeaciones = null,
  itemInsertError = false,
  compensationError = false,
  temasById = null
} = {}) {
  return (call) => {
    if (databaseError && call.table === 'planeacion_batches') return { data: null, error: { code: 'synthetic_db' } };
    if (call.table === 'planeacion_batches') {
      const requestedOwner = call.filters.find((entry) => entry[1] === 'user_id')?.[2];
      const visible = !batchMissing && requestedOwner === batchOwner;
      return { data: visible ? { id: IDS.batchA, user_id: batchOwner, unidad_id: IDS.unidadA } : null, error: null };
    }
    if (call.table === 'temas' && call.filters.some((entry) => entry[0] === 'in')) {
      return { data: temasById || [{ id: IDS.temaA, user_id: IDS.userA, unidad_id: IDS.unidadA }], error: null };
    }
    if (call.table === 'temas') {
      return { data: [{ id: IDS.temaA, unidad_id: IDS.unidadA, titulo: 'Synthetic', duracion: 10, orden: 1 }], error: null };
    }
    if (call.table === 'planeaciones') {
      return { data: planeaciones || [{ id: IDS.planeacionA, tema_id: IDS.temaA, batch_id: planeacionBatch, tabla_ia: [], status: 'ready' }], error: null };
    }
    if (call.table === 'examen_generation_jobs' && call.action === 'insert') {
      return { data: { id: IDS.jobA, ...call.payload[0] }, error: null };
    }
    if (call.table === 'examen_generation_jobs' && call.action === 'update') {
      return compensationError
        ? { data: null, error: { code: 'synthetic_compensation_error', message: 'Bearer hidden' } }
        : { data: { id: IDS.jobA }, error: null };
    }
    if (call.table === 'examen_generation_items' && call.action === 'insert') {
      return itemInsertError
        ? { data: null, error: { code: 'synthetic_items_error', message: 'provider secret' } }
        : { data: null, error: null };
    }
    throw new Error(`Unexpected query ${call.table}:${call.action}`);
  };
}

function generationArgs(client, overrides = {}) {
  return {
    supabaseClient: client,
    userId: IDS.userA,
    unidadId: IDS.unidadA,
    tiposPregunta: ['opcion_multiple'],
    cantidadesPregunta: { opcion_multiple: 1 },
    temaIds: [IDS.temaA],
    planeacionIds: [],
    batchId: IDS.batchA,
    ...overrides
  };
}

test('own batch creates own job/items and schedules only after persistence', async () => {
  const { api, timers, openAiCalls } = await loadService();
  const { client, calls } = createClient(generationResponder());
  const job = await api.generarExamenUnidad(generationArgs(client));
  assert.equal(job.id, IDS.jobA);
  assert.equal(timers.length, 1);
  assert.equal(openAiCalls.length, 0);
  const jobInsert = calls.find((call) => call.table === 'examen_generation_jobs' && call.action === 'insert');
  assert.equal(jobInsert.payload[0].status, 'pending');
  assert.equal(jobInsert.payload[0].user_id, IDS.userA);
  assert.equal(jobInsert.payload[0].configuracion.batch_id, IDS.batchA);
  const itemInsert = calls.find((call) => call.table === 'examen_generation_items' && call.action === 'insert');
  assert.equal(itemInsert.payload[0].user_id, IDS.userA);
  assert.ok(calls.indexOf(itemInsert) > calls.indexOf(jobInsert));
});

test('item insert failure marks the pending job failed with user filters and never schedules', async () => {
  const { api, timers, openAiCalls, logs } = await loadService();
  const { client, calls } = createClient(generationResponder({ itemInsertError: true }));
  await assert.rejects(api.generarExamenUnidad(generationArgs(client)), (error) => error.code === 'synthetic_items_error');
  const compensation = calls.find((call) => call.table === 'examen_generation_jobs' && call.action === 'update');
  assert.deepEqual(compensation.filters.slice(0, 2), [['eq', 'id', IDS.jobA], ['eq', 'user_id', IDS.userA]]);
  assert.equal(JSON.stringify(compensation.filters[2]), JSON.stringify(['in', 'status', ['pending', 'processing']]));
  assert.equal(compensation.payload.status, 'failed');
  assert.equal(timers.length, 0);
  assert.equal(openAiCalls.length, 0);
  assert.equal(JSON.stringify(logs).includes('provider secret'), false);
});

test('synchronous scheduling failure compensates the job and does not return success', async () => {
  const { api, timers, openAiCalls, logs } = await loadService({ timerThrows: true });
  const { client, calls } = createClient(generationResponder());
  await assert.rejects(api.generarExamenUnidad(generationArgs(client)), /synthetic timer failure/);
  const compensation = calls.find((call) => call.table === 'examen_generation_jobs' && call.action === 'update');
  assert.ok(compensation);
  assert.equal(compensation.payload.status, 'failed');
  assert.deepEqual(compensation.filters.slice(0, 2), [['eq', 'id', IDS.jobA], ['eq', 'user_id', IDS.userA]]);
  assert.equal(timers.length, 0);
  assert.equal(openAiCalls.length, 0);
  assert.equal(JSON.stringify(logs).includes('Bearer secret'), false);
});

test('failed compensation preserves the original prepare error and emits only sanitized diagnostics', async () => {
  const { api, logs } = await loadService();
  const { client } = createClient(generationResponder({ itemInsertError: true, compensationError: true }));
  await assert.rejects(api.generarExamenUnidad(generationArgs(client)), (error) => error.code === 'synthetic_items_error');
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes('provider secret'), false);
  assert.equal(serializedLogs.includes('Bearer hidden'), false);
  assert.match(serializedLogs, /items_insert/);
  assert.match(serializedLogs, /false/);
});

test('direct topic selection requires every unique topic and accepts duplicates by deduplicating', async () => {
  const { api, timers } = await loadService();
  const complete = createClient(generationResponder());
  await api.generarExamenUnidad(generationArgs(complete.client, { temaIds: [IDS.temaA, IDS.temaA] }));
  const topicLookup = complete.calls.find((call) => call.table === 'temas' && Array.isArray(call.filters) && call.filters.some(([kind]) => kind === 'in'));
  assert.equal(JSON.stringify(topicLookup.filters.find(([kind]) => kind === 'in')[2]), JSON.stringify([IDS.temaA]));

  const incomplete = createClient(generationResponder({ temasById: [{ id: IDS.temaA, user_id: IDS.userA, unidad_id: IDS.unidadA }] }));
  await assert.rejects(
    api.generarExamenUnidad(generationArgs(incomplete.client, { temaIds: [IDS.temaA, IDS.temaB] })),
    (error) => error.status === 404 && error.message === 'Seleccion de temas no encontrada.'
  );
  assert.equal(incomplete.calls.some((call) => call.table === 'examen_generation_jobs'), false);
  assert.equal(timers.length, 1);
});

for (const [name, options] of [['foreign', { batchOwner: IDS.userB }], ['missing', { batchMissing: true }]]) {
  test(`${name} batch uses the same 404 and never creates or schedules`, async () => {
    const { api, timers } = await loadService();
    const { client, calls } = createClient(generationResponder(options));
    await assert.rejects(api.generarExamenUnidad(generationArgs(client)), (error) => error.status === 404 && error.message === 'Conjunto no encontrado.');
    assert.equal(calls.some((call) => call.table === 'examen_generation_jobs'), false);
    assert.equal(timers.length, 0);
  });
}

test('malformed batch and missing client fail before database access', async () => {
  const { api, timers } = await loadService();
  const { client, calls } = createClient(generationResponder());
  await assert.rejects(api.generarExamenUnidad(generationArgs(client, { batchId: 'not-a-uuid' })), (error) => error.status === 400);
  assert.equal(calls.length, 0);
  await assert.rejects(api.generarExamenUnidad(generationArgs(null)), (error) => error.status === 500);
  assert.equal(timers.length, 0);
});

test('batch database error is stable at the controller boundary and does not create a job', async () => {
  const { api, timers } = await loadService();
  const { client, calls } = createClient(generationResponder({ databaseError: true }));
  await assert.rejects(api.generarExamenUnidad(generationArgs(client)), (error) => !error.status);
  assert.equal(calls.some((call) => call.table === 'examen_generation_jobs'), false);
  assert.equal(timers.length, 0);
});

test('foreign/missing selected planeacion and mismatched owned batch fail before job creation', async () => {
  const { api, timers } = await loadService();
  for (const [options, expectedStatus] of [
    [{ planeaciones: [] }, 404],
    [{ planeacionBatch: IDS.batchB }, 400]
  ]) {
    const { client, calls } = createClient(generationResponder(options));
    await assert.rejects(
      api.generarExamenUnidad(generationArgs(client, { planeacionIds: [IDS.planeacionA], temaIds: [] })),
      (error) => error.status === expectedStatus
    );
    assert.equal(calls.some((call) => call.table === 'examen_generation_jobs'), false);
  }
  assert.equal(timers.length, 0);
});

function jobResponder({ visible = true, error = null } = {}) {
  return (call) => {
    if (call.table !== 'examen_generation_jobs') throw new Error('Items/results must not be queried by polling');
    return { data: visible ? { id: IDS.jobA, user_id: IDS.userA, status: 'completed', examen_id: null } : null, error };
  };
}

test('polling returns only an owned job using id and user filters', async () => {
  const { api } = await loadService();
  const { client, calls } = createClient(jobResponder());
  const result = await api.obtenerEstadoGeneracionExamen({ supabaseClient: client, userId: IDS.userA, jobId: IDS.jobA });
  assert.equal(result.job_id, IDS.jobA);
  const query = calls.find((call) => call.table === 'examen_generation_jobs' && call.mode === 'maybeSingle');
  assert.equal(JSON.stringify(query.filters), JSON.stringify([['eq', 'id', IDS.jobA], ['eq', 'user_id', IDS.userA]]));
});

for (const name of ['foreign', 'missing']) {
  test(`polling ${name} job has the same 404 and queries no items/results`, async () => {
    const { api } = await loadService();
    const { client, calls } = createClient(jobResponder({ visible: false }));
    await assert.rejects(
      api.obtenerEstadoGeneracionExamen({ supabaseClient: client, userId: IDS.userA, jobId: name === 'foreign' ? IDS.jobB : IDS.jobA }),
      (error) => error.status === 404 && error.message === 'Generacion de examen no encontrada'
    );
    assert.equal(calls.some((call) => call.table === 'examen_generation_items' || call.table === 'examenes'), false);
  });
}

test('polling rejects malformed job and missing client before database access', async () => {
  const { api } = await loadService();
  const { client, calls } = createClient(jobResponder());
  await assert.rejects(api.obtenerEstadoGeneracionExamen({ supabaseClient: client, userId: IDS.userA, jobId: 'bad' }), (error) => error.status === 400);
  assert.equal(calls.length, 0);
  await assert.rejects(api.obtenerEstadoGeneracionExamen({ userId: IDS.userA, jobId: IDS.jobA }), (error) => error.status === 500);
});

function workerRows(overrides = {}) {
  const job = {
    id: IDS.jobA,
    user_id: IDS.userA,
    plantel_id: IDS.plantelA,
    grado_id: IDS.gradoA,
    materia_id: IDS.materiaA,
    unidad_id: IDS.unidadA,
    status: 'processing',
    total_preguntas: 1,
    progress_total: 1,
    configuracion: { batch_id: IDS.batchA, tema_ids: [IDS.temaA], total_preguntas: 1 },
    contexto_temas: [{ tema_id: IDS.temaA, planeacion_id: IDS.planeacionA }],
    titulo: 'Synthetic exam',
    instrucciones: 'Synthetic instructions',
    tipos_pregunta: ['opcion_multiple'],
    ...overrides.job
  };
  return {
    examen_generation_jobs: job,
    planeacion_batches: { id: IDS.batchA, user_id: IDS.userA, unidad_id: IDS.unidadA, ...overrides.batch },
    unidades: { id: IDS.unidadA, user_id: IDS.userA, materia_id: IDS.materiaA, ...overrides.unidad },
    materias: { id: IDS.materiaA, user_id: IDS.userA, grado_id: IDS.gradoA, ...overrides.materia },
    grados: { id: IDS.gradoA, user_id: IDS.userA, plantel_id: IDS.plantelA, ...overrides.grado },
    planteles: { id: IDS.plantelA, user_id: IDS.userA, ...overrides.plantel },
    temas: [{ id: IDS.temaA, user_id: IDS.userA, unidad_id: IDS.unidadA, ...(overrides.tema || {}) }],
    planeaciones: overrides.planeaciones || [{ id: IDS.planeacionA, user_id: IDS.userA, tema_id: IDS.temaA, batch_id: IDS.batchA, ...(overrides.planeacion || {}) }],
    examen_generation_items: overrides.items || [{
      id: IDS.itemA,
      job_id: IDS.jobA,
      user_id: IDS.userA,
      tema_id: IDS.temaA,
      tema: 'Synthetic topic',
      tipo_pregunta: 'opcion_multiple',
      pregunta_numero: 1,
      status: 'pending',
      retry_count: 0,
      max_retries: 3,
      ...(overrides.item || {})
    }]
  };
}

function workerResponder(rows, { missingTable = null, errorTable = null } = {}) {
  return (call) => {
    if (call.table === errorTable) return { data: null, error: { code: 'synthetic_db' } };
    if (call.table === missingTable) return { data: call.mode === 'many' ? [] : null, error: null };
    return { data: rows[call.table], error: null };
  };
}

function statefulWorkerResponder(rows, { changeBatchOwnerOnSecondRead = false } = {}) {
  let batchReads = 0;
  const exam = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' };
  return (call) => {
    if (call.action === 'update' && call.table === 'examen_generation_jobs') {
      const current = rows.examen_generation_jobs;
      const expectedStatus = call.filters.find(([kind, field]) => kind === 'eq' && field === 'status')?.[2];
      const allowedStatuses = call.filters.find(([kind, field]) => kind === 'in' && field === 'status')?.[2];
      if ((expectedStatus && current.status !== expectedStatus) || (allowedStatuses && !allowedStatuses.includes(current.status))) {
        return { data: null, error: null };
      }
      Object.assign(current, call.payload);
      return { data: { id: current.id }, error: null };
    }
    if (call.action === 'update' && call.table === 'examen_generation_items') {
      const id = call.filters.find(([kind, field]) => kind === 'eq' && field === 'id')?.[2];
      const item = rows.examen_generation_items.find((candidate) => candidate.id === id);
      if (!item) return { data: null, error: null };
      Object.assign(item, call.payload);
      return { data: { id: item.id }, error: null };
    }
    if (call.action === 'insert' && call.table === 'examenes') {
      return { data: { ...exam, ...call.payload[0] }, error: null };
    }
    if (call.table === 'planeacion_batches') {
      batchReads += 1;
      if (changeBatchOwnerOnSecondRead && batchReads >= 2) {
        return { data: { ...rows.planeacion_batches, user_id: IDS.userB }, error: null };
      }
    }
    return { data: rows[call.table], error: null };
  };
}

function completedQuestion() {
  return {
    tema: 'Synthetic topic',
    tipo: 'opcion_multiple',
    pregunta: 'Selecciona la respuesta correcta para este caso sintetico completo',
    opciones: ['A', 'B', 'C', 'D'],
    respuesta_correcta: 'A',
    explicacion: 'Synthetic explanation',
    criterios_evaluacion: 'Synthetic criteria'
  };
}

test('worker authority accepts coherent job/batch/hierarchy/topics/items before OpenAI', async () => {
  const { api, openAiCalls } = await loadService();
  const rows = workerRows();
  const { client } = createClient(workerResponder(rows));
  const authority = await api.validateExamGenerationWorkerAuthority({ client, jobId: IDS.jobA });
  assert.equal(authority.job.user_id, IDS.userA);
  assert.equal(authority.batch.user_id, IDS.userA);
  assert.equal(authority.items.length, 1);
  assert.equal(openAiCalls.length, 0);
});

test('worker authority accepts the historical batchless contract with null planeacion batches', async () => {
  const { api, openAiCalls } = await loadService();
  const rows = workerRows({
    job: { configuracion: { batch_id: null, tema_ids: [IDS.temaA], total_preguntas: 1 } },
    planeacion: { batch_id: null }
  });
  const { client } = createClient(workerResponder(rows));
  const authority = await api.validateExamGenerationWorkerAuthority({ client, jobId: IDS.jobA });
  assert.equal(authority.batchId, null);
  assert.equal(authority.batch, null);
  assert.equal(authority.expectedItemCount, 1);
  assert.equal(openAiCalls.length, 0);
});

for (const [name, overrides] of [
  ['missing item', { items: [] }],
  ['extra item', {
    job: { total_preguntas: 1, progress_total: 1, configuracion: { batch_id: IDS.batchA, tema_ids: [IDS.temaA], total_preguntas: 1 } },
    items: [
      { id: IDS.itemA, job_id: IDS.jobA, user_id: IDS.userA, tema_id: IDS.temaA, pregunta_numero: 1, status: 'pending' },
      { id: IDS.itemB, job_id: IDS.jobA, user_id: IDS.userA, tema_id: IDS.temaA, pregunta_numero: 2, status: 'pending' }
    ]
  }],
  ['foreign job relation', { item: { job_id: IDS.jobB } }],
  ['foreign user relation', { item: { user_id: IDS.userB } }],
  ['foreign topic relation', { item: { tema_id: IDS.temaB } }],
  ['incompatible item state', { item: { status: 'failed' } }]
]) {
  test(`worker rejects ${name} with exact item cardinality and no OpenAI`, async () => {
    const { api, openAiCalls } = await loadService();
    const { client, calls } = createClient(workerResponder(workerRows(overrides)));
    await assert.rejects(
      api.validateExamGenerationWorkerAuthority({ client, jobId: IDS.jobA }),
      (error) => error.code === 'worker_authority_item_owner_mismatch'
    );
    assert.equal(openAiCalls.length, 0);
    assert.equal(calls.some((call) => call.action === 'insert' || call.action === 'update'), false);
  });
}

test('worker rejects an invalid job owner without attempting a failed-state mutation', async () => {
  const rows = workerRows({ job: { user_id: 'invalid-owner' } });
  const { client, calls } = createClient(workerResponder(rows));
  const { api, openAiCalls } = await loadService({ adminClient: client });
  const result = await api.processExamGenerationJob(IDS.jobA);
  assert.equal(result.reason, 'worker_authority_invalid_job');
  assert.equal(calls.some((call) => call.action === 'update'), false);
  assert.equal(openAiCalls.length, 0);
});

test('worker authority rejection marks a verified job failed with id and user filters', async () => {
  const rows = workerRows({ batch: { user_id: IDS.userB } });
  const { client, calls } = createClient(workerResponder(rows));
  const { api, openAiCalls } = await loadService({ adminClient: client });
  const result = await api.processExamGenerationJob(IDS.jobA);
  assert.equal(result.reason, 'worker_authority_batch_owner_mismatch');
  const failedUpdate = calls.find((call) => call.table === 'examen_generation_jobs' && call.action === 'update');
  assert.equal(failedUpdate.payload.status, 'failed');
  assert.deepEqual(failedUpdate.filters.slice(0, 2), [['eq', 'id', IDS.jobA], ['eq', 'user_id', IDS.userA]]);
  assert.equal(calls.some((call) => call.table === 'examenes' && call.action === 'insert'), false);
  assert.equal(openAiCalls.length, 0);
});

test('worker scopes progress and item mutations and completes only after final revalidation', async () => {
  const rows = workerRows();
  const { client, calls } = createClient(statefulWorkerResponder(rows));
  const completion = {
    choices: [{ message: { content: JSON.stringify(completedQuestion()) }, finish_reason: 'stop' }],
    usage: {}
  };
  const { api, openAiCalls, logs } = await loadService({ adminClient: client, openAiResponse: completion });
  const result = await api.processExamGenerationJob(IDS.jobA);
  assert.equal(result.ok, true, JSON.stringify({ result, logs, calls }));
  assert.equal(openAiCalls.length, 1);

  const itemUpdates = calls.filter((call) => call.table === 'examen_generation_items' && call.action === 'update');
  assert.ok(itemUpdates.length >= 2);
  for (const call of itemUpdates) {
    assert.ok(call.filters.some((filter) => JSON.stringify(filter) === JSON.stringify(['eq', 'id', IDS.itemA])));
    assert.ok(call.filters.some((filter) => JSON.stringify(filter) === JSON.stringify(['eq', 'job_id', IDS.jobA])));
    assert.ok(call.filters.some((filter) => JSON.stringify(filter) === JSON.stringify(['eq', 'user_id', IDS.userA])));
  }

  const jobUpdates = calls.filter((call) => call.table === 'examen_generation_jobs' && call.action === 'update');
  assert.ok(jobUpdates.length >= 3);
  for (const call of jobUpdates) {
    assert.ok(call.filters.some((filter) => JSON.stringify(filter) === JSON.stringify(['eq', 'id', IDS.jobA])));
    assert.ok(call.filters.some((filter) => JSON.stringify(filter) === JSON.stringify(['eq', 'user_id', IDS.userA])));
  }
  const completed = jobUpdates.find((call) => call.payload.status === 'completed');
  assert.deepEqual(completed.filters.find(([kind, field]) => kind === 'eq' && field === 'status'), ['eq', 'status', 'processing']);
  const examInsertIndex = calls.findIndex((call) => call.table === 'examenes' && call.action === 'insert');
  const batchReadsBeforeInsert = calls.slice(0, examInsertIndex)
    .filter((call) => call.table === 'planeacion_batches' && call.action === 'select').length;
  assert.equal(batchReadsBeforeInsert, 2);
});

test('changed authority on final revalidation prevents exam persistence and fails the verified job', async () => {
  const rows = workerRows({ item: { status: 'completed', pregunta_ia: completedQuestion() } });
  const { client, calls } = createClient(statefulWorkerResponder(rows, { changeBatchOwnerOnSecondRead: true }));
  const { api, openAiCalls } = await loadService({ adminClient: client });
  const result = await api.processExamGenerationJob(IDS.jobA);
  assert.equal(result.reason, 'worker_authority_batch_owner_mismatch');
  assert.equal(openAiCalls.length, 0);
  assert.equal(calls.some((call) => call.table === 'examenes' && call.action === 'insert'), false);
  const failed = calls.find((call) => call.table === 'examen_generation_jobs' && call.action === 'update' && call.payload.status === 'failed');
  assert.ok(failed);
  assert.deepEqual(failed.filters.slice(0, 2), [['eq', 'id', IDS.jobA], ['eq', 'user_id', IDS.userA]]);
});

for (const [name, rows, options, code] of [
  ['missing job', workerRows(), { missingTable: 'examen_generation_jobs' }, 'worker_authority_job_not_found'],
  ['missing batch', workerRows(), { missingTable: 'planeacion_batches' }, 'worker_authority_batch_not_found'],
  ['batch owner mismatch', workerRows({ batch: { user_id: IDS.userB } }), {}, 'worker_authority_batch_owner_mismatch'],
  ['unit owner mismatch', workerRows({ unidad: { user_id: IDS.userB } }), {}, 'worker_authority_unit_owner_mismatch'],
  ['child topic mismatch', workerRows({ tema: { user_id: IDS.userB } }), {}, 'worker_authority_topic_owner_mismatch'],
  ['child planeacion mismatch', workerRows({ planeacion: { user_id: IDS.userB } }), {}, 'worker_authority_planeacion_owner_mismatch'],
  ['child item mismatch', workerRows({ item: { user_id: IDS.userB } }), {}, 'worker_authority_item_owner_mismatch'],
  ['incompatible status', workerRows({ job: { status: 'completed' } }), {}, 'worker_authority_invalid_status']
]) {
  test(`worker rejects ${name} without OpenAI or result persistence`, async () => {
    const { api, openAiCalls } = await loadService();
    const { client, calls } = createClient(workerResponder(rows, options));
    await assert.rejects(api.validateExamGenerationWorkerAuthority({ client, jobId: IDS.jobA }), (error) => error.code === code);
    assert.equal(openAiCalls.length, 0);
    assert.equal(calls.some((call) => call.action === 'insert' || call.action === 'update'), false);
  });
}

test('worker database errors expose only a typed safe reason', async () => {
  const { api } = await loadService();
  const { client } = createClient(workerResponder(workerRows(), { errorTable: 'planeacion_batches' }));
  await assert.rejects(api.validateExamGenerationWorkerAuthority({ client, jobId: IDS.jobA }), (error) => {
    assert.equal(error.code, 'worker_authority_database');
    assert.equal(error.message, 'Worker authority validation failed');
    assert.equal(JSON.stringify(error).includes('synthetic_db'), false);
    return true;
  });
});

async function loadController({ createUserClient, serviceGenerate, logs = [] }) {
  const context = createContext({
    console: {
      info(...args) { logs.push(['info', ...args]); },
      warn(...args) { logs.push(['warn', ...args]); },
      error(...args) { logs.push(['error', ...args]); }
    },
    Object,
    Array,
    Set,
    Reflect,
    Error
  });
  const controller = new SourceTextModule(controllerSource, { context });
  const modules = {
    '../../supabaseClient.js': synthetic(context, { createUserClient }),
    '../services/examenes.service.js': synthetic(context, {
      generarExamenUnidad: serviceGenerate,
      obtenerEstadoGeneracionExamen: async () => ({}),
      listarExamenesPorUnidad: async () => [],
      obtenerExamenPorId: async () => ({}),
      eliminarExamen: async () => ({})
    })
  };
  await controller.link((specifier) => modules[specifier]);
  await controller.evaluate();
  return controller.namespace;
}

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
}

test('controller rejects malformed batch and client-supplied user_id before client/service', async () => {
  let clients = 0;
  let serviceCalls = 0;
  const controller = await loadController({
    createUserClient() { clients += 1; return {}; },
    async serviceGenerate() { serviceCalls += 1; }
  });
  for (const body of [
    { unidad_id: IDS.unidadA, tipos_pregunta: ['opcion_multiple'], batch_id: 'bad' },
    { unidad_id: IDS.unidadA, tipos_pregunta: ['opcion_multiple'], user_id: IDS.userB }
  ]) {
    const res = response();
    await controller.postGenerateExamen({ body, user: { id: IDS.userA }, accessToken: 'synthetic' }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(clients, 0);
  assert.equal(serviceCalls, 0);
});

test('controller derives owner/client and sanitizes unexpected database errors', async () => {
  const userClient = { synthetic: true };
  let received;
  const controller = await loadController({
    createUserClient(token) { assert.equal(token, 'synthetic-token'); return userClient; },
    async serviceGenerate(args) { received = args; const error = new Error('provider secret response'); throw error; }
  });
  const res = response();
  await controller.postGenerateExamen({
    body: { unidad_id: IDS.unidadA, tipos_pregunta: ['opcion_multiple'], cantidades_pregunta: { opcion_multiple: 1 }, batch_id: IDS.batchA },
    user: { id: IDS.userA },
    accessToken: 'synthetic-token'
  }, res);
  assert.equal(received.supabaseClient, userClient);
  assert.equal(received.userId, IDS.userA);
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error, 'Error al generar el examen');
  assert.equal(JSON.stringify(res.payload).includes('provider secret response'), false);
});

test('controller accepts the complete Biblioteca payload and logs only safe request metadata', async () => {
  const logs = [];
  let received;
  const controller = await loadController({
    logs,
    createUserClient() { return { synthetic: true }; },
    async serviceGenerate(args) { received = args; return { id: IDS.jobA, status: 'pending' }; }
  });
  const res = response();
  await controller.postGenerateExamen({
    body: {
      unidad_id: IDS.unidadA,
      batch_id: IDS.batchA,
      tipos_pregunta: ['opcion_multiple', 'respuesta_corta'],
      cantidades_pregunta: { opcion_multiple: 2, respuesta_corta: 1 },
      planeacion_ids: ['7', '8']
    },
    user: { id: IDS.userA },
    accessToken: 'synthetic-token'
  }, res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(received.planeacionIds, ['7', '8']);
  assert.equal(received.batchId, IDS.batchA);
  assert.equal(res.payload.status, 'pending');
  const requestLog = logs.find(([level, event]) => level === 'info' && event === '[examenes] generar examen recibido');
  assert.deepEqual(requestLog[1], '[examenes] generar examen recibido');
  assert.equal(requestLog[2].totalPlaneaciones, 2);
  assert.equal(requestLog[2].tieneBatch, true);
  const serialized = JSON.stringify(requestLog);
  assert.equal(serialized.includes(IDS.userA), false);
  assert.equal(serialized.includes(IDS.batchA), false);
  assert.equal(serialized.includes('7'), false);
});

test('generation and polling routes remain protected by requireAuth', () => {
  assert.match(routesSource, /router\.post\('\/generate',\s*requireAuth,\s*postGenerateExamen\)/);
  assert.match(routesSource, /router\.post\('\/generar',\s*requireAuth,\s*postGenerateExamen\)/);
  assert.match(routesSource, /router\.get\('\/generacion\/:jobId',\s*requireAuth,\s*getExamenGenerationJob\)/);
});
