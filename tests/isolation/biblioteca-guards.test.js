import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIB_TEST_URL, BIB_API_URL, createBibliotecaHarness, validateBibliotecaConfig,
  safeBibliotecaEvent, BIBLIOTECA_CASE_MANIFEST, MAX_PLANEACION_ID,
  normalizePlaneacionId, planeacionIdFromUuid, isPlaneacionRestorationValid
} from './biblioteca-harness.js';
import { runBibliotecaSession } from './biblioteca-run.js';

const ids = {
  A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222',
  run: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', absent: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  batchA: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', batchB: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  forgedBatch: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', anonBatch: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  deleteBatch: '12345678-1234-4234-8234-123456789abc'
};
const NOW = Date.UTC(2030, 0, 1);
function jwt(payload) { return `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.x`; }
function config(overrides = {}) {
  const env = { APP_ENV: 'test', SUPABASE_URL: BIB_TEST_URL, EDUCATIVO_API_URL: BIB_API_URL,
    EDUCATIVO_PUBLIC_KEY: 'sb_publishable_synthetic', EDUCATIVO_SYNTHETIC_USERS: 'confirmed', EDUCATIVO_LOCAL_API_VERIFIED: 'confirmed' };
  for (const actor of ['A', 'B']) {
    env[`EDUCATIVO_${actor}_ID`] = ids[actor];
    env[`EDUCATIVO_${actor}_TOKEN`] = jwt({ sub: ids[actor], role: 'authenticated', iss: `${BIB_TEST_URL}/auth/v1`, exp: Math.floor(NOW / 1000) + 3600 });
  }
  return { ...env, ...overrides };
}
function uuidFactory() {
  const values = [ids.run, ids.batchA, ids.batchB, ids.forgedBatch, ids.anonBatch, ids.deleteBatch];
  let counter = 0x90000000;
  return () => values.shift() || `${(++counter).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}
function noTimer() { return { signal: undefined, didTimeout: () => false, clear() {} }; }
async function* commands(...values) { for (const value of values) yield value; }

function fakeServer({ crossParentAllowed = false, forgedOwnerAllowed = false, dualForgedVisibility = false, mutateTargetBatch = false,
  restorationMutation = null, leak = false, lostInsert = false, ambiguousDelete = false, ambiguousDeleteAt = null,
  successfulNoEffect = false, authMismatch = null, incompatibleAuth = null } = {}) {
  const batches = new Map(); const plans = new Map(); const calls = []; let loseNext = lostInsert; let deleteCount = 0;
  const ambiguousAt = ambiguousDeleteAt ?? (ambiguousDelete ? 1 : null);
  let tick = Date.parse('2030-01-01T00:00:00.000Z');
  const timestamp = () => new Date(tick += 1000).toISOString();
  const response = (data, status = 200) => ({ data, status, ok: status >= 200 && status < 300, redirected: false, url: '', json: async () => data });
  const actorId = options => {
    const token = options.headers.Authorization?.slice(7); if (!token) return null;
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
  };
  const visible = (row, actor) => row && (leak || row.user_id === actor || (dualForgedVisibility && String(row.titulo || row.tema || '').includes(' forged')));
  const tableFor = name => name === 'planeacion_batches' ? batches : plans;
  const fetchImpl = async (address, options) => {
    const url = new URL(address); const actor = actorId(options); const method = options.method || 'GET';
    calls.push({ origin: url.origin, path: url.pathname, method, query: url.search, actor, body: options.body });
    assert.equal(options.redirect, 'error'); assert.ok([BIB_TEST_URL, BIB_API_URL].includes(url.origin));
    if (url.pathname === '/auth/v1/user') {
      if (incompatibleAuth === actor) return response({ user: actor });
      return response({ id: authMismatch === actor ? ids[actor === ids.A ? 'B' : 'A'] : actor, is_anonymous: false });
    }
    if (url.pathname.startsWith('/api/biblioteca/conjuntos')) {
      if (!actor) return response({ error: 'Token requerido' }, 401);
      const id = url.pathname.split('/')[4];
      if (id) {
        const batch = batches.get(id);
        if (!visible(batch, actor)) return response({ error: 'Conjunto no encontrado.' }, 404);
        const ownPlans = [...plans.values()].filter(p => p.batch_id === id && visible(p, actor));
        return response({ ...structuredClone(batch), total_planeaciones: ownPlans.length, total_examenes: 0, total_listas_cotejo: 0, total_anexos: 0,
          planeaciones: ownPlans.map(p => ({ id: p.id, tema: p.tema, custom_title: p.custom_title, duracion: p.duracion, status: p.status })), examenes: [], listas_cotejo: [], anexos: [] });
      }
      return response([...batches.values()].filter(row => visible(row, actor)).map(batch => {
        const ownPlans = [...plans.values()].filter(p => p.batch_id === batch.id && visible(p, actor));
        return { ...structuredClone(batch), total_planeaciones: ownPlans.length, total_examenes: 0, total_listas_cotejo: 0, total_anexos: 0,
          planeaciones: ownPlans.map(p => ({ id: p.id, tema: p.tema, custom_title: p.custom_title, duracion: p.duracion, status: p.status })), examenes: [], listas_cotejo: [], anexos: [] };
      }));
    }
    const match = url.pathname.match(/^\/rest\/v1\/(planeacion_batches|planeaciones)$/);
    if (!match) {
      if (/^\/rest\/v1\/(anexos|listas_cotejo|examenes)$/.test(url.pathname)) return response([]);
      throw new Error('unexpected fake route');
    }
    const table = match[1]; const store = tableFor(table); const id = url.searchParams.get('id')?.slice(3);
    if (method === 'GET') {
      const selected = [...store.values()].filter(row => (!id || String(row.id) === id) && visible(row, actor));
      return response(structuredClone(selected));
    }
    if (method === 'POST') {
      if (!actor) return response({ message: 'denied' }, 401);
      const row = JSON.parse(options.body);
      if (row.user_id !== actor && !forgedOwnerAllowed) return response({ message: 'denied' }, 403);
      if (table === 'planeaciones' && row.batch_id && !crossParentAllowed && batches.get(row.batch_id)?.user_id !== actor) return response({ code:'23503', message:'insert or update on table "planeaciones" violates foreign key constraint "educativo_ia_planeaciones_batch_owner_fkey"' }, 409);
      row.created_at ??= timestamp(); row.updated_at ??= row.created_at;
      if (table === 'planeaciones') row.fecha_creacion ??= row.created_at;
      store.set(String(row.id), structuredClone(row));
      if (loseNext) { loseNext = false; throw new Error('Bearer secret signed-url cookie provider'); }
      return response([structuredClone(row)], 201);
    }
    const row = store.get(id);
    if (!actor || !visible(row, actor)) return response(successfulNoEffect ? [] : { message: 'denied' }, successfulNoEffect ? 200 : 403);
    if (method === 'PATCH') {
      const update = JSON.parse(options.body);
      if (update.user_id && update.user_id !== actor) return response({ message: 'denied' }, 403);
      if (table === 'planeaciones' && update.batch_id && !crossParentAllowed && batches.get(update.batch_id)?.user_id !== actor) return response({ code:'23503', message:'insert or update on table "planeaciones" violates foreign key constraint "educativo_ia_planeaciones_batch_owner_fkey"' }, 409);
      const previousBatch = row.batch_id;
      Object.assign(row, update); row.updated_at = timestamp();
      const isRestoration = table === 'planeaciones' && update.batch_id && previousBatch !== update.batch_id && batches.get(update.batch_id)?.user_id === actor;
      if (isRestoration) {
        if (restorationMutation === 'batch_id') row.batch_id = previousBatch;
        if (restorationMutation === 'user_id') row.user_id = ids.B;
        if (restorationMutation === 'marker') row.tema = 'changed';
        if (restorationMutation === 'functional') row.duracion = 999;
        if (restorationMutation === 'timestamp_invalid') row.updated_at = 'invalid';
        if (restorationMutation === 'timestamp_backwards') row.updated_at = '2020-01-01T00:00:00.000Z';
      }
      if (mutateTargetBatch && table === 'planeaciones' && update.batch_id && batches.get(update.batch_id)?.user_id !== actor) batches.get(update.batch_id).titulo = 'changed';
      return response([structuredClone(row)]);
    }
    if (method === 'DELETE') {
      store.delete(id);
      deleteCount++;
      if (deleteCount === ambiguousAt) throw new Error('cookie hidden ambiguous');
      return response(null, 204);
    }
    throw new Error('unsupported fake method');
  };
  return { fetchImpl, calls, batches, plans };
}

test('import and construction perform no I/O', async () => {
  let calls = 0; const original = globalThis.fetch; globalThis.fetch = () => { calls++; throw new Error('network'); };
  try { const mod = await import(`./biblioteca-harness.js?offline=${Date.now()}`); mod.createBibliotecaHarness(config(), { uuid: uuidFactory(), timeoutControlFactory: noTimer }); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
});

for (const [name, override] of [
  ['production Supabase', { SUPABASE_URL: 'https://bfnkaqmhcsyxdxoqnahk.supabase.co' }],
  ['unknown Supabase', { SUPABASE_URL: 'https://example.invalid' }],
  ['production API', { EDUCATIVO_API_URL: 'https://api.educativoia.com' }],
  ['localhost alias', { EDUCATIVO_API_URL: 'http://localhost:3000' }],
  ['service role', { EDUCATIVO_PUBLIC_KEY: jwt({ role: 'service_role', ref: 'gwdtlbisykzzplgzczzq' }) }],
  ['secret key', { EDUCATIVO_PUBLIC_KEY: 'sb_secret_hidden' }],
  ['hierarchy input', { EDUCATIVO_UNIDAD_ID: ids.batchA }]
]) test(`guard rejects ${name} before I/O`, () => {
  let calls = 0; assert.throws(() => createBibliotecaHarness(config(override), { fetchImpl: () => { calls++; }, uuid: uuidFactory() }), /03D2A Biblioteca/); assert.equal(calls, 0);
});

test('guard rejects equal actors and incompatible claims', () => {
  assert.throws(() => validateBibliotecaConfig(config({ EDUCATIVO_B_ID: ids.A, EDUCATIVO_B_TOKEN: config().EDUCATIVO_A_TOKEN })), /03D2A Biblioteca/);
  assert.throws(() => validateBibliotecaConfig(config({ EDUCATIVO_A_TOKEN: jwt({ sub: ids.B, role: 'authenticated', iss: `${BIB_TEST_URL}/auth/v1`, exp: Math.floor(NOW/1000)+3600 }) }), NOW), /03D2A Biblioteca/);
});

test('planeacion bigint boundary is canonical, safe and stable through JSON', () => {
  for (const valid of [1, MAX_PLANEACION_ID, '1', String(MAX_PLANEACION_ID)]) {
    const canonical = normalizePlaneacionId(valid);
    assert.match(canonical, /^[1-9][0-9]{0,14}$/);
    assert.equal(JSON.parse(JSON.stringify({ id: canonical })).id, canonical);
  }
  for (const invalid of [MAX_PLANEACION_ID + 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
    '9999999999999999', '01', '1e3', '-1', '0', '1.5', 1.5, NaN, Infinity, -Infinity, ' 1']) {
    assert.throws(() => normalizePlaneacionId(invalid), /03D2A Biblioteca/);
  }
  const generated = [0, 1, 2, 101, 201, 301, 401].map(offset => planeacionIdFromUuid(ids.run, offset));
  assert.equal(new Set(generated).size, generated.length);
  assert.ok(generated.every(id => id.length <= 15 && Number(id) <= MAX_PLANEACION_ID));
});

test('semantic restoration permits only coherent updated_at advancement', () => {
  const before = { id:'123', user_id:ids.A, tema:'marker', custom_title:'marker', batch_id:ids.batchA, tema_id:null,
    created_at:'2030-01-01T00:00:00.000Z', fecha_creacion:'2030-01-01T00:00:00.000Z', updated_at:'2030-01-01T00:00:01.000Z', duracion:1, status:'ready' };
  const valid = { ...before, updated_at:'2030-01-01T00:00:03.000Z' };
  assert.equal(isPlaneacionRestorationValid(before, valid), true);
  for (const changed of [
    { ...valid, batch_id:ids.batchB }, { ...valid, user_id:ids.B }, { ...valid, tema:'changed' },
    { ...valid, duracion:2 }, { ...valid, updated_at:'invalid' },
    { ...valid, updated_at:'2029-12-31T23:59:59.000Z' }, { ...valid, unexpected:'field' }
  ]) assert.equal(isPlaneacionRestorationValid(before, changed), false);
});

test('case manifest is immutable, exact, unique and structurally complete', () => {
  assert.equal(BIBLIOTECA_CASE_MANIFEST.length, 42);
  assert.equal(new Set(BIBLIOTECA_CASE_MANIFEST.map(entry => entry.caseId)).size, 42);
  assert.deepEqual(BIBLIOTECA_CASE_MANIFEST.reduce((out, entry) => ({ ...out, [entry.phase]: (out[entry.phase] || 0) + 1 }), {}), { prepare: 4, execute: 38 });
  for (const entry of BIBLIOTECA_CASE_MANIFEST) {
    assert.ok(Object.isFrozen(entry));
    assert.match(entry.caseId, /^03D2A-(SB|API)-/);
    assert.ok(['A','B','anon'].includes(entry.actor));
    assert.ok(entry.surface && entry.operation && entry.expected);
  }
  assert.ok(Object.isFrozen(BIBLIOTECA_CASE_MANIFEST));
  assert.equal(BIBLIOTECA_CASE_MANIFEST.filter(entry => entry.surface === 'api_biblioteca').length, 5);
});

test('live Auth mismatch and incompatible responses fail before any POST', async () => {
  for (const option of [{ authMismatch: ids.A }, { incompatibleAuth: ids.B }]) {
    const server = fakeServer(option);
    const harness = createBibliotecaHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimer, now: () => NOW });
    await assert.rejects(harness.prepare(), /03D2A Biblioteca/);
    assert.ok(!server.calls.some(call => call.method === 'POST'));
  }
});

test('prepare creates only batches then planeaciones with null hierarchy', async () => {
  const server = fakeServer(); const harness = createBibliotecaHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimer });
  await harness.prepare();
  const posts = server.calls.filter(c => c.method === 'POST');
  assert.deepEqual(posts.map(c => c.path), ['/rest/v1/planeacion_batches','/rest/v1/planeacion_batches','/rest/v1/planeaciones','/rest/v1/planeaciones']);
  for (const call of posts) {
    const row = JSON.parse(call.body);
    if (call.path.endsWith('planeacion_batches')) assert.deepEqual([row.plantel_id,row.grado_id,row.materia_id,row.unidad_id],[null,null,null,null]);
    else assert.equal(row.tema_id, null);
  }
  assert.equal(harness.state().fixturesPending.length, 4);
  for (const post of posts) {
    const index = server.calls.indexOf(post);
    const candidate = JSON.parse(post.body).id;
    const preflight = server.calls.slice(0, index).filter(call => call.method === 'GET' && new URLSearchParams(call.query).get('id') === `eq.${candidate}`);
    assert.deepEqual(new Set(preflight.map(call => call.actor)), new Set([ids.A, ids.B]));
  }
  assert.ok(server.calls.every(c => !/gener|unidades|temas|storage/.test(c.path)));
});

test('preflight collision or unreadable response fails closed before POST', async () => {
  const occupied = fakeServer();
  occupied.batches.set(ids.batchA, { id:ids.batchA, user_id:ids.A });
  const occupiedHarness = createBibliotecaHarness(config(), { ...occupied, uuid:uuidFactory(), timeoutControlFactory:noTimer, now:()=>NOW });
  await assert.rejects(occupiedHarness.prepare(), /03D2A Biblioteca/);
  assert.ok(!occupied.calls.some(call => call.method === 'POST'));

  const base = fakeServer();
  const unreadableHarness = createBibliotecaHarness(config(), { uuid:uuidFactory(), timeoutControlFactory:noTimer, now:()=>NOW,
    fetchImpl: async (address, options) => {
      const url = new URL(address);
      if (url.pathname.startsWith('/rest/v1/') && url.searchParams.has('id')) return { status:403, ok:false, redirected:false, url:'', json:async()=>({ hidden:'provider' }) };
      return base.fetchImpl(address, options);
    } });
  await assert.rejects(unreadableHarness.prepare(), /03D2A Biblioteca/);
  assert.ok(!base.calls.some(call => call.method === 'POST'));
});

test('execute covers own, cross, anonymous, lists, before/after and API contract', async () => {
  const server = fakeServer({ successfulNoEffect: true }); const events = [];
  const harness = createBibliotecaHarness(config(), { ...server, emit: e => events.push(e), uuid: uuidFactory(), timeoutControlFactory: noTimer });
  await harness.prepare(); await harness.execute();
  assert.equal(harness.state().fail, 0); assert.equal(harness.state().inconclusive, 0); assert.equal(harness.state().executeCompleted, true);
  const emitted = events.filter(event => /^03D2A-/.test(event.caseId || ''));
  assert.equal(emitted.length, 42);
  assert.deepEqual(new Set(emitted.map(event => event.caseId)), new Set(BIBLIOTECA_CASE_MANIFEST.map(entry => entry.caseId)));
  assert.ok(events.some(e => e.caseId === '03D2A-API-LIST-A' && e.result === 'PASS'));
  assert.ok(events.some(e => e.caseId === '03D2A-SB-PLAN-EDIT-CROSS-A' && e.result === 'PASS'));
  assert.ok(server.calls.every(c => !/\/generate|\/generar|storage/.test(c.path)));
});

test('full safe runner emits exactly 42 PASS and performs only allowlisted routes', async () => {
  const server = fakeServer({ successfulNoEffect: true }); const output = [];
  const result = await runBibliotecaSession({ env:config(), fetchImpl:server.fetchImpl, timeoutControlFactory:noTimer, uuid:uuidFactory(), now:()=>NOW,
    lines:commands('prepare','execute','cleanup','quit'), write:value=>output.push(JSON.parse(value)) });
  assert.equal(result.exitCode, 0);
  assert.deepEqual({ pass:result.summary.pass, fail:result.summary.fail, inconclusive:result.summary.inconclusive }, { pass:42, fail:0, inconclusive:0 });
  assert.deepEqual(result.summary.commandsCompleted, ['prepare','execute','cleanup']);
  assert.deepEqual(result.summary.fixturesPending, []); assert.deepEqual(result.summary.uncertainPending, []);
  const cases = output.filter(event => /^03D2A-/.test(event.caseId || ''));
  assert.equal(cases.length, 42); assert.ok(cases.every(event => event.result === 'PASS'));
  for (const post of server.calls.filter(call => call.method === 'POST')) {
    const index = server.calls.indexOf(post); const id = JSON.parse(post.body).id;
    const checkedBy = server.calls.slice(0,index).filter(call => call.method === 'GET' && new URLSearchParams(call.query).get('id') === `eq.${id}`).map(call => call.actor);
    assert.ok(checkedBy.includes(ids.A) && checkedBy.includes(ids.B));
  }
  assert.ok(server.calls.every(call => /^\/auth\/v1\/user$|^\/rest\/v1\/(planeacion_batches|planeaciones|anexos|listas_cotejo|examenes)$|^\/api\/biblioteca\/conjuntos(?:\/[^/]+)?$/.test(call.path)));
});

test('cross-owner batch relation is a preserved FAIL even when cleanup can succeed', async () => {
  const server = fakeServer({ crossParentAllowed: true }); const events = [];
  const harness = createBibliotecaHarness(config(), { ...server, emit: e => events.push(e), uuid: uuidFactory(), timeoutControlFactory: noTimer });
  await harness.prepare(); await harness.execute();
  assert.ok(events.some(e => e.caseId === '03D2A-SB-PLAN-CREATE-CROSS-BATCH-A' && e.result === 'FAIL'));
  assert.ok(events.some(e => e.caseId === '03D2A-SB-PLAN-EDIT-CROSS-BATCH-A' && e.result === 'FAIL'));
  await harness.cleanup(); assert.ok(harness.state().fail > 0); assert.equal(harness.state().fixturesPending.length, 0);
});

test('changed foreign batch aborts instead of weakening the confirmed FAIL', async () => {
  const server = fakeServer({ crossParentAllowed:true, mutateTargetBatch:true });
  const harness = createBibliotecaHarness(config(), { ...server, uuid:uuidFactory(), timeoutControlFactory:noTimer, now:()=>NOW });
  await harness.prepare();
  await assert.rejects(harness.execute(), /03D2A Biblioteca/);
  assert.ok(harness.state().fail >= 2); assert.equal(harness.state().executeCompleted,false);
});

test('unverifiable restoration aborts execute while cleanup remains available', async () => {
  const server = fakeServer({ crossParentAllowed:true, restorationMutation:'timestamp_invalid' });
  const harness = createBibliotecaHarness(config(), { ...server, uuid:uuidFactory(), timeoutControlFactory:noTimer, now:()=>NOW });
  await harness.prepare(); await assert.rejects(harness.execute(), /03D2A Biblioteca/);
  assert.equal(harness.state().executeCompleted,false); assert.ok(harness.state().fail >= 3);
  await harness.cleanup(); assert.deepEqual(harness.state().fixturesPending,[]); assert.deepEqual(harness.state().uncertainPending,[]);
});

test('accepted forged owner is attributed by visibility and deleted only as observed owner', async () => {
  const server = fakeServer({ forgedOwnerAllowed: true }); const events = [];
  const result = await runBibliotecaSession({ env:config(), fetchImpl:server.fetchImpl, timeoutControlFactory:noTimer, uuid:uuidFactory(), now:()=>NOW,
    lines:commands('prepare','execute','cleanup','quit'), write:value=>events.push(JSON.parse(value)) });
  assert.ok(events.some(event => event.caseId === '03D2A-SB-BATCH-CREATE-OWNER-A' && event.result === 'FAIL'));
  assert.ok(events.some(event => event.caseId === '03D2A-SB-PLAN-CREATE-OWNER-A' && event.result === 'FAIL'));
  const forgedIds = events.filter(event => event.caseId === 'CREATED' && event.actor === 'B').map(event => event.id);
  assert.ok(forgedIds.length >= 2);
  for (const id of forgedIds) assert.ok(server.calls.some(call => call.method === 'DELETE' && call.actor === ids.B && new URLSearchParams(call.query).get('id') === `eq.${id}`));
  assert.equal(result.exitCode,1); assert.ok(result.summary.fail >= 2); assert.deepEqual(result.summary.fixturesPending, []);
  assert.deepEqual(result.summary.uncertainPending, []);
});

test('ambiguous forged owner remains uncertain and is never auto-deleted', async () => {
  const server = fakeServer({ forgedOwnerAllowed:true, dualForgedVisibility:true });
  const harness = createBibliotecaHarness(config(), { ...server, uuid:uuidFactory(), timeoutControlFactory:noTimer, now:()=>NOW });
  await harness.prepare(); await harness.execute();
  assert.ok(harness.state().inconclusive > 0); assert.ok(harness.state().uncertainPending.length > 0);
  const beforeCleanup = server.calls.length;
  await assert.rejects(harness.cleanup(), /03D2A Biblioteca/);
  assert.ok(!server.calls.slice(beforeCleanup).some(call => call.method === 'DELETE'));
});

test('HTTP success with zero affected rows passes only after exact owner snapshot', async () => {
  const server = fakeServer({ successfulNoEffect: true }); const harness = createBibliotecaHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimer });
  await harness.prepare(); await harness.execute();
  assert.equal(harness.state().fail, 0);
  assert.ok(server.calls.some(c => c.method === 'PATCH' && c.actor === ids.A));
});

test('lost INSERT remains uncertain and cleanup refuses it', async () => {
  const server = fakeServer({ lostInsert: true }); const harness = createBibliotecaHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimer });
  await assert.rejects(harness.prepare(), /03D2A Biblioteca/); assert.equal(harness.state().uncertainPending.length, 1);
  await assert.rejects(harness.cleanup(), /03D2A Biblioteca/); assert.ok(!server.calls.some(c => c.method === 'DELETE'));
});

test('runner reports timeout-after-POST as failed with uncertain residue and no automatic DELETE', async () => {
  const server = fakeServer({ lostInsert:true });
  const result = await runBibliotecaSession({ env:config(), fetchImpl:server.fetchImpl, timeoutControlFactory:()=>({signal:undefined,didTimeout:()=>true,clear(){}}),
    uuid:uuidFactory(), now:()=>NOW, lines:commands('prepare','cleanup','quit'), write:()=>{} });
  assert.equal(result.exitCode,1); assert.equal(result.summary.successful,false); assert.equal(result.summary.uncertainPending.length,1);
  assert.ok(!server.calls.some(call => call.method === 'DELETE'));
});

test('ambiguous DELETE is retryable and never treated as absence from an error', async () => {
  const server = fakeServer({ ambiguousDeleteAt: 3 }); const harness = createBibliotecaHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimer });
  await harness.prepare(); await harness.execute(); await assert.rejects(harness.cleanup(), /03D2A Biblioteca/);
  assert.ok(harness.state().fixturesPending.some(e => e.fixtureState === 'delete_unverified'));
  await harness.cleanup(); assert.equal(harness.state().fixturesPending.length, 0);
});

test('cleanup deletes disposable planeaciones before bases, then batches, and accepts empty 204 bodies', async () => {
  const server = fakeServer({ crossParentAllowed: true });
  const harness = createBibliotecaHarness(config(), { ...server, uuid: uuidFactory(), timeoutControlFactory: noTimer, now: () => NOW });
  await harness.prepare();
  const basePlanIds = [...server.plans.keys()];
  await harness.execute();
  const cleanupCallStart = server.calls.length;
  await harness.cleanup();
  const deletes = server.calls.slice(cleanupCallStart).filter(call => call.method === 'DELETE');
  const tables = deletes.map(call => call.path.split('/').at(-1));
  const firstBatch = tables.indexOf('planeacion_batches');
  assert.ok(firstBatch > 0);
  assert.ok(tables.slice(0, firstBatch).every(table => table === 'planeaciones'));
  assert.ok(tables.slice(firstBatch).every(table => table === 'planeacion_batches'));
  const planDeleteIds = deletes.filter(call => call.path.endsWith('planeaciones')).map(call => new URLSearchParams(call.query).get('id')?.slice(3));
  assert.ok(basePlanIds.every(id => planDeleteIds.indexOf(id) >= 0));
  assert.ok(planDeleteIds.slice(-basePlanIds.length).every(id => basePlanIds.includes(id)));
  assert.equal(harness.state().fixturesPending.length, 0);
});

test('redirect, timeout and invalid JSON fail closed', async () => {
  const cases = [
    { fetchImpl: async () => ({ status:302, ok:false, redirected:true, url:'https://example.invalid', json:async()=>({}) }), timeoutControlFactory:noTimer },
    { fetchImpl: async () => { throw new Error('hidden'); }, timeoutControlFactory: () => ({ signal:undefined, didTimeout:()=>true, clear(){} }) },
    { fetchImpl: async () => ({ status:200, ok:true, redirected:false, url:'', json:async()=>{throw new Error('hidden');} }), timeoutControlFactory:noTimer }
  ];
  for (const scenario of cases) { const harness=createBibliotecaHarness(config(),{...scenario,uuid:uuidFactory()}); await assert.rejects(harness.prepare(),/03D2A Biblioteca/); }
});

test('runner exit code requires full successful workflow and empty ledgers', async () => {
  const server = fakeServer({ successfulNoEffect: true });
  const result = await runBibliotecaSession({ env:config(), fetchImpl:server.fetchImpl, timeoutControlFactory:noTimer, uuid:uuidFactory(), lines:commands('prepare','execute','cleanup','quit'), write:()=>{} });
  assert.equal(result.exitCode,0); assert.equal(result.summary.successful,true); assert.deepEqual(result.summary.fixturesPending,[]);
  const empty = await runBibliotecaSession({ env:config(), fetchImpl:fakeServer().fetchImpl, timeoutControlFactory:noTimer, uuid:uuidFactory(), lines:commands('quit'), write:()=>{} });
  assert.equal(empty.exitCode,1);
});

test('runner preserves FAIL after cleanup', async () => {
  const server=fakeServer({crossParentAllowed:true}); const output=[];
  const result=await runBibliotecaSession({env:config(),fetchImpl:server.fetchImpl,timeoutControlFactory:noTimer,uuid:uuidFactory(),now:()=>NOW,lines:commands('prepare','execute','cleanup','quit'),write:value=>output.push(JSON.parse(value))});
  assert.equal(result.exitCode,1); assert.deepEqual({pass:result.summary.pass,fail:result.summary.fail,inconclusive:result.summary.inconclusive},{pass:39,fail:3,inconclusive:0});
  assert.equal(result.summary.executeCompleted,true); assert.equal(result.summary.cleanupCompleted,true); assert.deepEqual(result.summary.fixturesPending,[]);
  assert.deepEqual(result.summary.uncertainPending,[]); assert.equal(server.plans.size,0); assert.equal(server.batches.size,0);
  assert.equal(output.filter(event=>/^03D2A-/.test(event.caseId||'')).length,42);
});

test('allowlisted output removes secret canaries and raw fields', async () => {
  const secret='Bearer abc sb_secret_hidden cookie=x https://signed.example/?token=x';
  assert.deepEqual(safeBibliotecaEvent({caseId:secret,phase:secret,reason:secret,actor:secret,table:secret,result:secret,status:secret,error:secret,body:secret,headers:secret}),{});
  const server=fakeServer({lostInsert:true}); const output=[];
  await runBibliotecaSession({env:config(),fetchImpl:server.fetchImpl,timeoutControlFactory:noTimer,uuid:uuidFactory(),lines:commands('prepare','quit'),write:x=>output.push(x)});
  assert.doesNotMatch(output.join('\n'),/Bearer|sb_secret|cookie|signed\.example|provider|Authorization|EDUCATIVO_/);
});
