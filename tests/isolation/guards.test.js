import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, validateConfig, safeEvent, safeSummary, TEST_URL, API_URL } from './harness.js';
import { runSession } from './run.js';

const ids = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' };
const jwt = data => `synthetic.${Buffer.from(JSON.stringify(data)).toString('base64url')}.signature`;
function config() {
  const env = { APP_ENV: 'test', SUPABASE_URL: TEST_URL, EDUCATIVO_API_URL: API_URL,
    EDUCATIVO_PUBLIC_KEY: 'sb_publishable_synthetic', EDUCATIVO_SYNTHETIC_USERS: 'confirmed',
    EDUCATIVO_METADATA_REVIEWED: 'confirmed', EDUCATIVO_LOCAL_API_VERIFIED: 'confirmed' };
  for (const a of ['A', 'B']) {
    env[`EDUCATIVO_${a}_ID`] = ids[a];
    env[`EDUCATIVO_${a}_TOKEN`] = jwt({ sub: ids[a], role: 'authenticated', iss: `${TEST_URL}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600 });
  }
  return env;
}

const bad = [
  ['environment', { APP_ENV: 'production' }],
  ['production host', { SUPABASE_URL: 'https://bfnkaqmhcsyxdxoqnahk.supabase.co' }],
  ['unknown host', { SUPABASE_URL: 'https://invalid.example' }],
  ['URL suffix', { SUPABASE_URL: `${TEST_URL}/` }],
  ['userinfo', { SUPABASE_URL: 'https://user@gwdtlbisykzzplgzczzq.supabase.co' }],
  ['API remote', { EDUCATIVO_API_URL: 'https://api.educativoia.com' }],
  ['API alternate loopback', { EDUCATIVO_API_URL: 'http://localhost:3000' }],
  ['API query', { EDUCATIVO_API_URL: `${API_URL}?x=1` }],
  ['missing key', { EDUCATIVO_PUBLIC_KEY: '' }],
  ['missing token', { EDUCATIVO_A_TOKEN: '' }],
  ['unconfirmed synthetic users', { EDUCATIVO_SYNTHETIC_USERS: '' }],
  ['unreviewed metadata', { EDUCATIVO_METADATA_REVIEWED: '' }],
  ['unverified local API', { EDUCATIVO_LOCAL_API_VERIFIED: '' }],
  ['private key', { EDUCATIVO_PUBLIC_KEY: 'sb_secret_synthetic' }],
  ['service role key', { EDUCATIVO_PUBLIC_KEY: jwt({ role: 'service_role', ref: 'gwdtlbisykzzplgzczzq' }) }],
  ['expired user', { EDUCATIVO_A_TOKEN: jwt({ sub: ids.A, role: 'authenticated', iss: `${TEST_URL}/auth/v1`, exp: 1 }) }]
];
for (const [name, override] of bad) test(`fail closed without network: ${name}`, () => {
  let calls = 0;
  assert.throws(() => createHarness({ ...config(), ...override }, { fetchImpl: () => { calls++; } }), /03A:/);
  assert.equal(calls, 0);
});
test('same A/B identity and forged claims rejected before network', () => {
  const env = config();
  env.EDUCATIVO_B_ID = env.EDUCATIVO_A_ID;
  env.EDUCATIVO_B_TOKEN = env.EDUCATIVO_A_TOKEN;
  assert.throws(() => validateConfig(env), /03A:/);
  env.EDUCATIVO_B_ID = ids.B;
  assert.throws(() => validateConfig(env), /03A:/);
});

function fakeServer({ leak = false, redirect = false, lostInsert = false, child = false, wrongIdentity = false,
  failApiReads = 0, postDeleteReadFailures = 0, deleteFailures = 0 } = {}) {
  const rows = new Map();
  // A pre-existing resource must never be registered or deleted by the harness.
  rows.set('33333333-3333-4333-8333-333333333333', { id: '33333333-3333-4333-8333-333333333333', user_id: ids.A, nombre: 'preexisting' });
  const calls = [];
  const controls = { failApiReads, postDeleteReadFailures, deleteFailures };
  let deleteCompleted = false;
  const respond = (data, status = 200, extra = {}) => ({ data, status, ok: status >= 200 && status < 300, json: async () => data, ...extra });
  const fetchImpl = async (address, options) => {
    const url = new URL(address);
    calls.push({ url, method: options.method, redirect: options.redirect });
    assert.equal(options.redirect, 'error');
    assert.ok([TEST_URL, API_URL].includes(url.origin));
    if (redirect) return respond(null, 302, { url: 'https://invalid.example', redirected: true });
    const token = options.headers.Authorization?.slice(7);
    const actorId = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub : null;
    if (url.pathname === '/auth/v1/user') return respond({ id: wrongIdentity ? ids.B : actorId, is_anonymous: false });
    if (url.pathname === '/api/planteles' && controls.failApiReads > 0) { controls.failApiReads--; throw new Error('Bearer hidden-api-error'); }
    if (url.pathname === '/api/planteles' && !actorId) return respond({ error: 'Token requerido' }, 401);
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      rows.set(row.id, { ...row, created_at: 'synthetic', updated_at: 'synthetic' });
      if (lostInsert) throw new Error('Bearer synthetic-private-provider-error');
      return respond([rows.get(row.id)], 201);
    }
    if (!['/rest/v1/planteles', '/api/planteles'].includes(url.pathname)) return respond(child ? [{ id: 'child' }] : []);
    if (options.method === 'GET' && deleteCompleted && controls.postDeleteReadFailures > 0) {
      controls.postDeleteReadFailures--;
      throw new Error('Bearer hidden-post-delete-error');
    }
    const selectedId = url.searchParams.get('id')?.slice(3);
    const selected = [...rows.values()].filter(row => (!selectedId || row.id === selectedId) && (row.user_id === actorId || leak));
    if (options.method === 'DELETE') {
      if (controls.deleteFailures > 0) { controls.deleteFailures--; throw new Error('Bearer hidden-delete-error'); }
      for (const row of selected) rows.delete(row.id);
      deleteCompleted = true;
      return respond(null, 204);
    }
    return respond(selected);
  };
  return { fetchImpl, rows, calls, controls };
}

async function* commands(...values) { for (const value of values) yield value; }

function authDiagnosticServer(scenario) {
  const calls = [];
  const makeResponse = (data, status = 200, extra = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    redirected: false,
    url: `${TEST_URL}/auth/v1/user`,
    json: async () => data,
    ...extra
  });
  const fetchImpl = async (_address, options) => {
    calls.push({ method: options.method });
    const token = options.headers.Authorization?.slice(7);
    const actorId = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub : null;
    const actor = actorId === ids.A ? 'A' : 'B';
    if (scenario.network) throw new Error('Bearer provider-secret cookie=signed-url-secret https://secret.example/path?token=hidden');
    if (scenario.timeout) throw new Error('provider timeout with sb_secret_hidden');
    if (scenario.redirect) return makeResponse(null, 302, { redirected: true, url: 'https://secret.example/callback?token=hidden' });
    if (scenario.invalidJson && actor === (scenario.actor || 'A')) return makeResponse(null, 200, { json: async () => { throw new Error('Bearer invalid-json-secret'); } });
    if (scenario.status && actor === scenario.actor) return makeResponse({ error: 'Bearer hidden-provider-body' }, scenario.status);
    return makeResponse({
      id: scenario.identityMismatch && actor === (scenario.actor || 'A') ? ids.B : actorId,
      is_anonymous: scenario.anonymous === true && actor === (scenario.actor || 'A')
    });
  };
  return { fetchImpl, calls };
}

async function runAuthDiagnostic(scenario) {
  const server = authDiagnosticServer(scenario);
  const output = [];
  const timeoutControlFactory = scenario.timeout
    ? () => ({ signal: undefined, didTimeout: () => true, clear() {} })
    : undefined;
  const result = await runSession({
    env: config(),
    fetchImpl: server.fetchImpl,
    timeoutControlFactory,
    lines: commands('prepare', 'quit'),
    write: line => output.push(line)
  });
  return { ...result, output, calls: server.calls, parsed: output.filter(line => line.startsWith('{')).map(line => JSON.parse(line)) };
}
test('ordinary import and construction have no remote effects', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected network'); };
  try {
    const module = await import(`./harness.js?offline=${Date.now()}`);
    module.createHarness(config());
  } finally { globalThis.fetch = original; }
});
test('prepare, execute and cleanup are separate; delete only confirmed IDs', async () => {
  const server = fakeServer();
  const events = [];
  const h = createHarness(config(), { ...server, emit: e => events.push(e) });
  await assert.rejects(h.execute(), /03A:/);
  assert.equal(server.calls.length, 0);
  await h.prepare();
  assert.equal(server.rows.size, 3);
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 2);
  const start = server.calls.length;
  await h.execute();
  assert.ok(server.calls.slice(start).every(c => c.method === 'GET'));
  assert.equal(events.filter(e => e.result === 'PASS').length, 11);
  await h.cleanup('33333333-3333-4333-8333-333333333333');
  assert.equal(server.rows.size, 1);
  assert.ok(server.rows.has('33333333-3333-4333-8333-333333333333'));
  const deletes = server.calls.filter(c => c.method === 'DELETE');
  assert.equal(deletes.length, 2);
  for (const d of deletes) {
    assert.match(d.url.searchParams.get('id'), /^eq\.[0-9a-f-]{36}$/);
    assert.ok(d.url.searchParams.has('user_id'));
  }
});
test('leaked rows are FAIL even with HTTP 200', async () => {
  const server = fakeServer({ leak: true });
  const events = [];
  const h = createHarness(config(), { ...server, emit: e => events.push(e) });
  await h.prepare(); await h.execute();
  assert.equal(events.filter(e => e.result === 'FAIL').length, 6);
});
test('redirect rejection prevents any fixture write', async () => {
  const server = fakeServer({ redirect: true });
  const h = createHarness(config(), server);
  await assert.rejects(h.prepare(), /03A:/);
  assert.equal(server.calls.length, 1);
  assert.ok(server.calls.every(c => c.method === 'GET'));
});
test('server-verified identities required; JWT decode is not authentication', async () => {
  const server = fakeServer({ wrongIdentity: true });
  await assert.rejects(createHarness(config(), server).prepare(), /03A:/);
  assert.ok(server.calls.every(c => c.method === 'GET'));
});
test('lost insert response is uncertain, never enrolled for deletion', async () => {
  const server = fakeServer({ lostInsert: true });
  const events = [];
  const h = createHarness(config(), { ...server, emit: e => events.push(e) });
  await assert.rejects(h.prepare(), /03A:/);
  await h.cleanup(); h.residuals();
  assert.equal(server.rows.size, 2);
  assert.ok(!server.calls.some(c => c.method === 'DELETE'));
  assert.ok(events.some(e => e.caseId === 'UNCERTAIN'));
  assert.doesNotMatch(JSON.stringify(events), /Bearer|private-provider-error/);
});
test('cleanup fails closed if a dependent appeared', async () => {
  const server = fakeServer({ child: true });
  const h = createHarness(config(), server);
  await h.prepare();
  await assert.rejects(h.cleanup(), /03A:/);
  assert.equal(server.rows.size, 3);
  assert.ok(!server.calls.some(c => c.method === 'DELETE'));
});
test('reports allow only fixed labels, numeric status and UUIDs', () => {
  const secret = 'Bearer synthetic-secret-cookie-signed-url';
  const report = safeEvent({ caseId: secret, actor: secret, result: secret, status: secret, id: secret, config: config(), error: secret });
  assert.deepEqual(report, {});
});
test('run recovery tuple reconstructs exact fixture name without secrets', async () => {
  const server = fakeServer();
  const events = [];
  const h = createHarness(config(), { ...server, emit: event => events.push(event) });
  const run = events.find(event => event.caseId === 'RUN');
  assert.ok(run?.runId);
  await h.prepare();
  const created = events.filter(event => event.caseId === 'PREPARE');
  assert.equal(created.length, 2);
  for (const event of created) {
    const row = server.rows.get(event.id);
    assert.equal(row.nombre, `Educativo IA 03A ${event.runId} ${event.actor}`);
  }
  assert.doesNotMatch(JSON.stringify(events), /synthetic-access|sb_publishable_synthetic|Authorization/);
});
test('preventive UNCERTAIN resolved by confirmed insert does not make summary fail', async () => {
  const server = fakeServer();
  const output = [];
  const result = await runSession({ env: config(), fetchImpl: server.fetchImpl, lines: commands('prepare', 'execute', 'cleanup', 'quit'), write: line => output.push(line) });
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.inconclusive, 0);
  assert.equal(result.summary.uncertainPending.length, 0);
  assert.equal(result.summary.successful, true);
});
test('FAIL remains failed after successful cleanup', async () => {
  const server = fakeServer({ leak: true });
  const result = await runSession({ env: config(), fetchImpl: server.fetchImpl, lines: commands('prepare', 'execute', 'cleanup', 'quit'), write: () => {} });
  assert.ok(result.summary.fail > 0);
  assert.equal(result.summary.fixturesPending.length, 0);
  assert.equal(result.exitCode, 1);
});
test('command error permits cleanup and keeps failed exit', async () => {
  const server = fakeServer({ failApiReads: 1 });
  const result = await runSession({ env: config(), fetchImpl: server.fetchImpl, lines: commands('prepare', 'execute', 'cleanup', 'quit'), write: () => {} });
  assert.equal(result.summary.commandErrors, 1);
  assert.equal(result.summary.executeCompleted, false);
  assert.ok(result.summary.commandsCompleted.includes('cleanup'));
  assert.equal(result.summary.fixturesPending.length, 0);
  assert.equal(result.exitCode, 1);
});
test('pending fixtures, uncertain inserts and prepare without execute fail summary', async () => {
  const preparedServer = fakeServer();
  const prepared = await runSession({ env: config(), fetchImpl: preparedServer.fetchImpl, lines: commands('prepare', 'quit'), write: () => {} });
  assert.equal(prepared.summary.executeCompleted, false);
  assert.equal(prepared.summary.fixturesPending.length, 2);
  assert.equal(prepared.exitCode, 1);
  const uncertainServer = fakeServer({ lostInsert: true });
  const uncertain = await runSession({ env: config(), fetchImpl: uncertainServer.fetchImpl, lines: commands('prepare', 'quit'), write: () => {} });
  assert.equal(uncertain.summary.uncertainPending.length, 1);
  assert.equal(uncertain.exitCode, 1);
});
test('exit without prepare is successful no-op with explicit summary', async () => {
  const result = await runSession({ env: config(), fetchImpl: () => { throw new Error('no network'); }, lines: commands('quit'), write: () => {} });
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.prepared, false);
  assert.equal(result.summary.executeCompleted, false);
  assert.deepEqual(result.summary.commandsCompleted, []);
});
test('ambiguous completed DELETE can be retried and confirmed absent', async () => {
  const server = fakeServer({ postDeleteReadFailures: 1 });
  const h = createHarness(config(), server);
  await h.prepare();
  await assert.rejects(h.cleanup(), /03A:/);
  assert.ok(h.state().fixturesPending.some(entry => entry.fixtureState === 'delete_unverified'));
  await h.cleanup();
  assert.equal(h.state().fixturesPending.length, 0);
});
test('DELETE not completed is revalidated before safe retry', async () => {
  const server = fakeServer({ deleteFailures: 1 });
  const h = createHarness(config(), server);
  await h.prepare();
  await assert.rejects(h.cleanup(), /03A:/);
  assert.equal(server.rows.size, 3);
  await h.cleanup();
  assert.equal(server.rows.size, 1);
  assert.equal(h.state().fixturesPending.length, 0);
});
test('read errors after DELETE never count as absence', async () => {
  const server = fakeServer({ postDeleteReadFailures: 2 });
  const events = [];
  const h = createHarness(config(), { ...server, emit: event => events.push(event) });
  await h.prepare();
  await assert.rejects(h.cleanup(), /03A:/);
  await assert.rejects(h.cleanup(), /03A:/);
  assert.ok(h.state().fixturesPending.length > 0);
  assert.ok(!events.some(event => event.caseId === 'CLEANUP' && event.result === 'REMOVED'));
});
test('summary output is strictly sanitized', () => {
  const secret = 'Bearer synthetic-summary-secret';
  const summary = safeSummary({ commandsCompleted: ['prepare', secret], pass: 1, fail: 0, inconclusive: 0, commandErrors: 0,
    prepared: true, executeCompleted: true, fixturesPending: [{ runId: ids.A, actor: 'A', id: ids.B, fixtureState: 'pending_delete', secret }],
    uncertainPending: [], successful: false, secret });
  assert.doesNotMatch(JSON.stringify(summary), /Bearer|summary-secret/);
  assert.deepEqual(summary.commandsCompleted, ['prepare']);
});
test('invalidated environment blocks further writes and cleanup', async () => {
  const env = config(); const server = fakeServer(); const h = createHarness(env, server);
  await h.prepare(); env.APP_ENV = 'production';
  const count = server.calls.length;
  await assert.rejects(h.cleanup(), /03A:/);
  assert.equal(server.calls.length, count);
});

for (const scenario of [
  { name: 'Auth A HTTP 401', actor: 'A', status: 401, expected: { phase: 'auth', actor: 'A', reason: 'http', status: 401 } },
  { name: 'Auth B HTTP 403', actor: 'B', status: 403, expected: { phase: 'auth', actor: 'B', reason: 'http', status: 403 } },
  { name: 'identity mismatch', actor: 'A', identityMismatch: true, expected: { phase: 'auth', actor: 'A', reason: 'identity_mismatch', status: 200 } },
  { name: 'anonymous identity', actor: 'A', anonymous: true, expected: { phase: 'auth', actor: 'A', reason: 'anonymous_identity', status: 200 } },
  { name: 'invalid JSON', actor: 'A', invalidJson: true, expected: { phase: 'auth', actor: 'A', reason: 'invalid_json', status: 200 } },
  { name: 'redirect', redirect: true, expected: { phase: 'auth', actor: 'A', reason: 'redirect', status: 302 } },
  { name: 'typed timeout', timeout: true, expected: { phase: 'auth', actor: 'A', reason: 'timeout' } },
  { name: 'network error', network: true, expected: { phase: 'auth', actor: 'A', reason: 'network' } }
]) {
  test(`safe diagnostic: ${scenario.name}`, async () => {
    const result = await runAuthDiagnostic(scenario);
    const diagnostic = result.parsed.find(event => event.caseId === 'DIAGNOSTIC');
    assert.deepEqual(diagnostic, { caseId: 'DIAGNOSTIC', ...scenario.expected });
    assert.ok(result.calls.every(call => call.method === 'GET'));
    assert.equal(result.summary.commandErrors, 1);
    assert.equal(result.exitCode, 1);
    const serialized = result.output.join('\n');
    assert.doesNotMatch(serialized, /Bearer|sb_secret|cookie|signed-url|secret\.example|provider|token=|Authorization/);
    assert.deepEqual(Object.keys(diagnostic).sort(), Object.keys({ caseId: '', ...scenario.expected }).sort());
  });
}

test('diagnostic allowlist drops unknown fields and unsafe values', () => {
  const event = safeEvent({
    caseId: 'DIAGNOSTIC', phase: 'auth', actor: 'A', reason: 'http', status: 401,
    url: 'https://secret.example?token=hidden', headers: { Authorization: 'Bearer hidden' },
    body: 'cookie=signed-url', error: new Error('provider secret'), token: 'hidden'
  });
  assert.deepEqual(event, { caseId: 'DIAGNOSTIC', phase: 'auth', reason: 'http', actor: 'A', status: 401 });
});
