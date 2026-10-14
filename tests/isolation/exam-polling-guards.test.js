import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_API_URL, EXAM_TEST_URL, createExamPollingHarness,
  safeExamPollingEvent, validateExamPollingConfig
} from './exam-polling-harness.js';
import { runExamPollingSession } from './exam-polling-run.js';

const ids = {
  A: '11111111-1111-4111-8111-111111111111',
  B: '22222222-2222-4222-8222-222222222222',
  run: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  absent: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  fixture: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  preexisting: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
};
const jwt = payload => `synthetic.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
function config() {
  const env = {
    APP_ENV: 'test', SUPABASE_URL: EXAM_TEST_URL, EDUCATIVO_API_URL: EXAM_API_URL,
    EDUCATIVO_PUBLIC_KEY: 'sb_publishable_synthetic', EDUCATIVO_SYNTHETIC_USERS: 'confirmed',
    EDUCATIVO_LOCAL_API_VERIFIED: 'confirmed'
  };
  for (const actor of ['A', 'B']) {
    env[`EDUCATIVO_${actor}_ID`] = ids[actor];
    env[`EDUCATIVO_${actor}_TOKEN`] = jwt({ sub: ids[actor], role: 'authenticated', iss: `${EXAM_TEST_URL}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600 });
  }
  return env;
}
function uuidFactory() {
  const values = [ids.run, ids.absent, ids.fixture];
  return () => values.shift();
}
function noTimerControl() { return { signal: undefined, didTimeout: () => false, clear() {} }; }
async function* commands(...values) { for (const value of values) yield value; }

function fakeServer({ leak = false, lostInsert = false, deleteAmbiguous = false, readAfterDeleteError = false, wrongActor } = {}) {
  const rows = new Map([[ids.preexisting, {
    id: ids.preexisting, user_id: ids.A, titulo: 'preexisting', status: 'failed'
  }]]);
  const items = [];
  const exams = [];
  const calls = [];
  let deleted = false;
  const response = (data, status = 200) => ({ data, status, ok: status >= 200 && status < 300, redirected: false, url: '', json: async () => data });
  const actorFrom = options => {
    const token = options.headers.Authorization?.slice(7);
    if (!token) return null;
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
  };
  const fetchImpl = async (address, options) => {
    const url = new URL(address);
    const actorId = actorFrom(options);
    calls.push({ origin: url.origin, path: url.pathname, method: options.method, query: url.search, actorId, body: options.body });
    assert.equal(options.redirect, 'error');
    assert.ok([EXAM_TEST_URL, EXAM_API_URL].includes(url.origin));
    if (url.pathname === '/auth/v1/user') {
      return response({ id: wrongActor === actorId ? ids.B : actorId, is_anonymous: false });
    }
    if (url.pathname.startsWith('/api/examenes/generacion/')) {
      if (!actorId) return response({ error: 'Token requerido' }, 401);
      const id = url.pathname.split('/').at(-1);
      const row = rows.get(id);
      if (!row || (!leak && row.user_id !== actorId)) return response({ error: 'Generacion de examen no encontrada' }, 404);
      return response({ ok: true, job_id: row.id, status: row.status, progress_current: row.progress_current, progress_total: row.progress_total, current_step: row.current_step, examen_id: null, error_message: row.error_message });
    }
    if (url.pathname === '/rest/v1/examen_generation_jobs' && options.method === 'POST') {
      const row = JSON.parse(options.body);
      rows.set(row.id, structuredClone(row));
      if (lostInsert) throw new Error('Bearer hidden lost response https://signed.example/?token=secret');
      return response([structuredClone(row)], 201);
    }
    if (url.pathname === '/rest/v1/examen_generation_jobs') {
      const selectedId = url.searchParams.get('id')?.slice(3);
      if (options.method === 'DELETE') {
        const owner = url.searchParams.get('user_id')?.slice(3);
        if (selectedId === ids.fixture && owner === ids.A && actorId === ids.A) rows.delete(selectedId);
        deleted = true;
        if (deleteAmbiguous) { deleteAmbiguous = false; throw new Error('cookie=hidden delete response lost'); }
        return response(null, 204);
      }
      if (deleted && readAfterDeleteError) { readAfterDeleteError = false; throw new Error('Bearer hidden read failure'); }
      const selected = [...rows.values()].filter(row => (!selectedId || row.id === selectedId) && (leak || row.user_id === actorId));
      return response(structuredClone(selected));
    }
    if (url.pathname === '/rest/v1/examen_generation_items') {
      const jobId = url.searchParams.get('job_id')?.slice(3);
      return response(items.filter(row => row.job_id === jobId && (leak || row.user_id === actorId)));
    }
    if (url.pathname === '/rest/v1/examenes') {
      const jobId = url.searchParams.get('generation_job_id')?.slice(3);
      return response(exams.filter(row => row.generation_job_id === jobId && (leak || row.user_id === actorId)));
    }
    throw new Error('unexpected fake route');
  };
  return { fetchImpl, calls, rows, items, exams };
}

test('import and construction perform no I/O', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = () => { calls++; throw new Error('network forbidden'); };
  try {
    const module = await import(`./exam-polling-harness.js?offline=${Date.now()}`);
    module.createExamPollingHarness(config(), { uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

for (const [name, override] of [
  ['production Supabase', { SUPABASE_URL: 'https://bfnkaqmhcsyxdxoqnahk.supabase.co' }],
  ['unknown Supabase', { SUPABASE_URL: 'https://example.invalid' }],
  ['production API', { EDUCATIVO_API_URL: 'https://api.educativoia.com' }],
  ['alternate local API', { EDUCATIVO_API_URL: 'http://localhost:3000' }],
  ['service-role key', { EDUCATIVO_PUBLIC_KEY: jwt({ role: 'service_role', ref: 'gwdtlbisykzzplgzczzq' }) }],
  ['secret key', { EDUCATIVO_PUBLIC_KEY: 'sb_secret_hidden' }],
  ['operator supplied unit FK', { EDUCATIVO_EXAM_UNIT_ID: '33333333-3333-4333-8333-333333333333' }]
]) test(`guard rejects ${name} before I/O`, () => {
  let calls = 0;
  assert.throws(() => createExamPollingHarness({ ...config(), ...override }, { fetchImpl: () => { calls++; }, uuid: uuidFactory() }), /03C polling/);
  assert.equal(calls, 0);
});

test('guard rejects equal actors and incompatible token claims', () => {
  const equal = config();
  equal.EDUCATIVO_B_ID = equal.EDUCATIVO_A_ID;
  equal.EDUCATIVO_B_TOKEN = equal.EDUCATIVO_A_TOKEN;
  assert.throws(() => validateExamPollingConfig(equal), /03C polling/);
  const mismatch = config();
  mismatch.EDUCATIVO_A_TOKEN = jwt({ sub: ids.B, role: 'authenticated', iss: `${EXAM_TEST_URL}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600 });
  assert.throws(() => validateExamPollingConfig(mismatch), /03C polling/);
});

test('server authentication mismatch prevents the fixture POST', async () => {
  const server = fakeServer({ wrongActor: ids.A });
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await assert.rejects(harness.prepare(), /03C polling/);
  assert.ok(server.calls.every(call => call.method === 'GET'));
});

test('redirect, timeout and invalid JSON fail closed before any POST', async () => {
  const scenarios = [
    {
      fetchImpl: async () => ({ status: 302, ok: false, redirected: true, url: 'https://example.invalid', json: async () => ({}) }),
      timeoutControlFactory: noTimerControl
    },
    {
      fetchImpl: async () => { throw new Error('Bearer hidden timeout'); },
      timeoutControlFactory: () => ({ signal: undefined, didTimeout: () => true, clear() {} })
    },
    {
      fetchImpl: async () => ({ status: 200, ok: true, redirected: false, url: '', json: async () => { throw new Error('cookie=hidden'); } }),
      timeoutControlFactory: noTimerControl
    }
  ];
  for (const scenario of scenarios) {
    const harness = createExamPollingHarness(config(), { ...scenario, uuid: uuidFactory() });
    await assert.rejects(harness.prepare(), /03C polling/);
    assert.equal(harness.state().fixturesPending.length, 0);
    assert.equal(harness.state().uncertainPending.length, 0);
  }
});

test('prepare creates one exact terminal job without FK, items, timer or generation route', async () => {
  const server = fakeServer();
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), now: () => '2026-10-13T12:00:00.000Z', timeoutControlFactory: noTimerControl });
  await harness.prepare();
  const post = server.calls.find(call => call.method === 'POST');
  const row = JSON.parse(post.body);
  assert.equal(post.path, '/rest/v1/examen_generation_jobs');
  assert.deepEqual([row.plantel_id, row.grado_id, row.materia_id, row.unidad_id, row.examen_id], [null, null, null, null, null]);
  assert.equal(row.status, 'failed');
  assert.equal(row.progress_current, 0);
  assert.equal(row.progress_total, 0);
  assert.equal(row.total_preguntas, 0);
  assert.deepEqual(server.items, []);
  assert.deepEqual(server.exams, []);
  assert.ok(!server.calls.some(call => ['/api/examenes/generate', '/api/examenes/generar'].includes(call.path)));
});

test('execute proves own/cross/missing/anonymous polling and uses only GET', async () => {
  const server = fakeServer();
  const events = [];
  const harness = createExamPollingHarness(config(), { ...server, emit: event => events.push(event), uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await harness.prepare();
  const start = server.calls.length;
  await harness.execute();
  assert.ok(server.calls.slice(start).every(call => call.method === 'GET'));
  assert.equal(events.filter(event => event.result === 'PASS').length, 5);
  const state = harness.state();
  assert.equal(state.pass, 5);
  assert.equal(state.fail, 0);
  assert.equal(state.inconclusive, 0);
  assert.equal(state.executeCompleted, true);
});

test('cross-user visibility is a FAIL rather than accepted HTTP', async () => {
  const server = fakeServer({ leak: true });
  const events = [];
  const harness = createExamPollingHarness(config(), { ...server, emit: event => events.push(event), uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await harness.prepare();
  await harness.execute();
  assert.ok(events.some(event => event.caseId === '03C-POLL-CROSS-B' && event.result === 'FAIL'));
});

test('cleanup deletes only the confirmed ID with id and user_id and preserves preexisting rows', async () => {
  const server = fakeServer();
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await harness.prepare(); await harness.execute(); await harness.cleanup();
  assert.ok(server.rows.has(ids.preexisting));
  assert.ok(!server.rows.has(ids.fixture));
  const deletes = server.calls.filter(call => call.method === 'DELETE');
  assert.equal(deletes.length, 1);
  assert.match(deletes[0].query, new RegExp(`id=eq\\.${ids.fixture}`));
  assert.match(deletes[0].query, new RegExp(`user_id=eq\\.${ids.A}`));
  assert.deepEqual(harness.state().fixturesPending, []);
});

test('cleanup fails closed when an associated item exists', async () => {
  const server = fakeServer();
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await harness.prepare();
  server.items.push({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', job_id: ids.fixture, user_id: ids.A });
  await assert.rejects(harness.cleanup(), /03C polling/);
  assert.ok(server.rows.has(ids.fixture));
  assert.ok(!server.calls.some(call => call.method === 'DELETE'));
});

test('lost INSERT stays uncertain and is never automatically deleted', async () => {
  const server = fakeServer({ lostInsert: true });
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await assert.rejects(harness.prepare(), /03C polling/);
  await assert.rejects(harness.cleanup(), /03C polling/);
  assert.equal(harness.state().uncertainPending.length, 1);
  assert.ok(!server.calls.some(call => call.method === 'DELETE'));
});

test('ambiguous DELETE is revalidated safely on retry', async () => {
  const server = fakeServer({ deleteAmbiguous: true });
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await harness.prepare(); await harness.execute();
  await assert.rejects(harness.cleanup(), /03C polling/);
  assert.equal(harness.state().fixturesPending[0].fixtureState, 'delete_unverified');
  await harness.cleanup();
  assert.deepEqual(harness.state().fixturesPending, []);
  assert.equal(server.calls.filter(call => call.method === 'DELETE').length, 1);
});

test('read error after DELETE never counts as absence and remains retryable', async () => {
  const server = fakeServer({ readAfterDeleteError: true });
  const harness = createExamPollingHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimerControl });
  await harness.prepare(); await harness.execute();
  await assert.rejects(harness.cleanup(), /03C polling/);
  assert.equal(harness.state().fixturesPending.length, 1);
  await harness.cleanup();
  assert.equal(harness.state().fixturesPending.length, 0);
});

test('successful session requires five PASS, execute and cleanup', async () => {
  const server = fakeServer();
  const result = await runExamPollingSession({ env: config(), fetchImpl: server.fetchImpl, timeoutControlFactory: noTimerControl, uuid: uuidFactory(), lines: commands('prepare', 'execute', 'cleanup', 'quit'), write: () => {} });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.summary.commandsCompleted, ['prepare', 'execute', 'cleanup']);
  assert.equal(result.summary.pass, 5);
  assert.equal(result.summary.successful, true);
});

test('quit without full workflow and residuals return failure', async () => {
  const empty = await runExamPollingSession({ env: config(), fetchImpl: fakeServer().fetchImpl, timeoutControlFactory: noTimerControl, uuid: uuidFactory(), lines: commands('quit'), write: () => {} });
  assert.equal(empty.exitCode, 1);
  const server = fakeServer();
  const pending = await runExamPollingSession({ env: config(), fetchImpl: server.fetchImpl, timeoutControlFactory: noTimerControl, uuid: uuidFactory(), lines: commands('prepare', 'quit'), write: () => {} });
  assert.equal(pending.exitCode, 1);
  assert.equal(pending.summary.fixturesPending.length, 1);
});

test('allowlisted output cannot serialize secrets or raw provider errors', async () => {
  const secret = 'Bearer abc sb_secret_hidden cookie=x https://signed.example/?token=x';
  assert.deepEqual(safeExamPollingEvent({ caseId: secret, phase: secret, reason: secret, actor: secret, result: secret, status: secret, error: secret, body: secret, headers: secret }), {});
  const server = fakeServer({ lostInsert: true });
  const output = [];
  await runExamPollingSession({ env: config(), fetchImpl: server.fetchImpl, timeoutControlFactory: noTimerControl, uuid: uuidFactory(), lines: commands('prepare', 'quit'), write: line => output.push(line) });
  const serialized = output.join('\n');
  assert.doesNotMatch(serialized, /Bearer|sb_secret|cookie|signed\.example|provider|EDUCATIVO_|Authorization/);
});
