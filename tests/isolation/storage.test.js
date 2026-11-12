import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { TEST_URL, BUCKET, CASES, validateStorageConfig, storageDenial, signedStorageUrl, createStorageHarness, safeStorageDiagnostic } from './storage-harness.js';
import { runStorageSession } from './storage-run.js';

const A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const RUN = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const NOW = 1800000000000;
// Deliberately unsigned local mock claims, never usable against a service.
const jwt = c => `test.${Buffer.from(JSON.stringify(c)).toString('base64url')}.test`;
function env() {
  return { APP_ENV: 'test', SUPABASE_URL: TEST_URL, EDUCATIVO_STORAGE_TEST: 'educativo-backend-test',
    EDUCATIVO_SYNTHETIC_USERS: 'confirmed', EDUCATIVO_PUBLIC_KEY: 'sb_publishable_offline_mock',
    EDUCATIVO_A_ID: A, EDUCATIVO_B_ID: B,
    EDUCATIVO_A_TOKEN: jwt({ sub: A, role: 'authenticated', iss: `${TEST_URL}/auth/v1`, exp: NOW / 1000 + 7200 }),
    EDUCATIVO_B_TOKEN: jwt({ sub: B, role: 'authenticated', iss: `${TEST_URL}/auth/v1`, exp: NOW / 1000 + 7200 }) };
}
const response = (status, data) => new Response(Buffer.isBuffer(data) ? data : JSON.stringify(data), { status });
const no = () => response(400, { statusCode: '403', message: 'new row violates row-level security policy' });
const missing = () => response(400, { statusCode: '404', message: 'Object not found' });
function server(config = env(), intercept) {
  const objects = new Map(), calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input), route = url.pathname.slice('/storage/v1'.length), method = options.method;
    assert.equal(url.origin, TEST_URL);
    assert.equal(options.redirect, 'manual');
    const auth = options.headers.Authorization;
    const actor = auth === `Bearer ${config.EDUCATIVO_A_TOKEN}` ? A : auth === `Bearer ${config.EDUCATIVO_B_TOKEN}` ? B : null;
    const body = options.body === undefined || Buffer.isBuffer(options.body) ? options.body : JSON.parse(options.body);
    const call = { url, route, method, actor, body, options, objects };
    calls.push(call);
    if (intercept) { const r = await intercept(call); if (r) return r; }
    if (route.startsWith(`/object/sign/${BUCKET}/`)) {
      const path = route.slice(`/object/sign/${BUCKET}/`.length);
      if (method === 'GET') {
        assert.deepEqual(options.headers, {}); // Signed bearer capability: no user credentials forwarded.
        return objects.has(path) && url.searchParams.get('token') === 'offline-signature' ? response(200, objects.get(path)) : missing();
      }
      assert.deepEqual(body, { expiresIn: 3600 });
      return actor && path.startsWith(`${actor}/`) && objects.has(path) ?
        response(200, { signedURL: `/object/sign/${BUCKET}/${path}?token=offline-signature` }) : no();
    }
    if (route === `/object/list/${BUCKET}`) {
      assert.equal(method, 'POST');
      const names = [...objects.keys()].filter(p => actor && p.startsWith(`${actor}/`) &&
        p.startsWith(`${body.prefix}/`) && p.split('/').at(-1).includes(body.search));
      return response(200, names.map(p => ({ name: p.split('/').at(-1) })));
    }
    if (route.startsWith(`/object/public/${BUCKET}/`)) return response(404, { message: 'Bucket not found' });
    if (method === 'DELETE') {
      assert.equal(route, `/object/${BUCKET}`);
      assert.equal(body.prefixes.length, 1);
      const removed = [];
      for (const p of body.prefixes) if (actor && p.startsWith(`${actor}/`) && objects.delete(p)) removed.push({ name: p });
      return response(200, removed);
    }
    assert.ok(route.startsWith(`/object/${BUCKET}/`));
    const path = route.slice(`/object/${BUCKET}/`.length);
    if (method === 'GET') return actor && path.startsWith(`${actor}/`) && objects.has(path) ? response(200, objects.get(path)) : missing();
    if (!actor || !path.startsWith(`${actor}/`)) return no();
    if (method === 'POST' || method === 'PUT') {
      assert.equal(options.headers['x-upsert'], method === 'POST' ? 'false' : undefined);
      assert.equal(options.headers['Content-Type'], 'image/png');
      if (method === 'POST' && objects.has(path)) return response(409, { message: 'Already exists' });
      if (method === 'PUT' && !objects.has(path)) return missing();
      objects.set(path, Buffer.from(body)); return response(200, { Key: `${BUCKET}/${path}` });
    }
    throw Error('unexpected operation');
  };
  return { fetchImpl, objects, calls };
}
async function session(intercept, commands = ['prepare', 'execute', 'cleanup', 'quit']) {
  const config = env(), mock = server(config, intercept), output = [];
  const result = await runStorageSession({ env: config, lines: commands, fetchImpl: mock.fetchImpl,
    now: () => NOW, uuid: () => RUN, write: x => output.push(x) });
  return { ...result, ...mock, output };
}

test('configuration fails closed for production, ambiguous confirmation, service role, same or expired users', () => {
  assert.ok(validateStorageConfig(env(), NOW));
  const variants = [
    { APP_ENV: 'production' }, { SUPABASE_URL: 'https://example.invalid' }, { EDUCATIVO_STORAGE_TEST: 'confirmed' },
    { EDUCATIVO_SYNTHETIC_USERS: '' }, { EDUCATIVO_PUBLIC_KEY: 'sb_secret_invalid' },
    { EDUCATIVO_PUBLIC_KEY: jwt({ role: 'service_role', ref: 'gwdtlbisykzzplgzczzq', exp: NOW / 1000 + 7200 }) },
    { EDUCATIVO_PUBLIC_KEY: jwt({ role: 'anon', ref: 'wrong', exp: NOW / 1000 + 7200 }) },
    { EDUCATIVO_B_ID: A, EDUCATIVO_B_TOKEN: env().EDUCATIVO_A_TOKEN }
  ];
  for (const change of variants) assert.throws(() => validateStorageConfig({ ...env(), ...change }, NOW));
  const valid = { sub: A, role: 'authenticated', iss: `${TEST_URL}/auth/v1`, exp: NOW / 1000 + 7200 };
  for (const change of [{ role: 'service_role' }, { sub: B }, { iss: 'https://example.invalid/auth/v1' }, { exp: 1 }, { is_anonymous: true }]) {
    assert.throws(() => validateStorageConfig({ ...env(), EDUCATIVO_A_TOKEN: jwt({ ...valid, ...change }) }, NOW));
  }
});

test('20 distinct cases, complete lifecycle, exact Storage endpoints and zero residues', async () => {
  const r = await session();
  assert.equal(CASES.length, new Set(CASES).size);
  assert.equal(CASES.length, 20);
  assert.equal(r.exitCode, 0, JSON.stringify(r.summary));
  assert.deepEqual([r.summary.pass, r.summary.fail, r.summary.inconclusive, r.summary.commandErrors], [20, 0, 0, 0]);
  assert.ok(r.summary.prepared && r.summary.executeCompleted && r.summary.cleanupCompleted && r.summary.successful);
  assert.deepEqual(r.summary.fixturesPending, []); assert.deepEqual(r.summary.uncertainPending, []);
  assert.equal(r.objects.size, 0);
  assert.ok(r.calls.every(c => c.url.pathname.startsWith('/storage/v1/object/')));
  assert.equal(r.calls.filter(c => c.method === 'POST' && Buffer.isBuffer(c.body)).length, 4);
  assert.ok(!r.output.join('').includes(env().EDUCATIVO_A_TOKEN));
  assert.ok(!r.output.join('').includes('offline-signature'));
  const images = r.calls.filter(c => Buffer.isBuffer(c.body)).map(c => c.body);
  assert.equal(new Set(images.map(b => b.toString('base64'))).size, 2);
  for (const b of images) {
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    for (let p = 8; p < b.length;) {
      const n = b.readUInt32BE(p), chunk = b.subarray(p + 4, p + 8 + n);
      let crc = 0xffffffff;
      for (const byte of chunk) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      assert.equal((crc ^ 0xffffffff) >>> 0, b.readUInt32BE(p + 8 + n));
      if (chunk.subarray(0, 4).toString() === 'IDAT') assert.ok(inflateSync(chunk.subarray(4)).length > 0);
      p += n + 12;
    }
  }
});

test('legacy public key uses anon bearer; authenticated users always use their own JWT', async () => {
  const config = env(); config.EDUCATIVO_PUBLIC_KEY = jwt({ role: 'anon', ref: 'gwdtlbisykzzplgzczzq', exp: NOW / 1000 + 7200 });
  const mock = server(config);
  const r = await runStorageSession({ env: config, lines: ['prepare', 'execute', 'quit'], fetchImpl: mock.fetchImpl,
    now: () => NOW, uuid: () => RUN, write: () => {} });
  assert.equal(r.exitCode, 0);
  assert.ok(mock.calls.some(c => c.options.headers.Authorization === `Bearer ${config.EDUCATIVO_PUBLIC_KEY}`));
});

test('cross read/list/sign leakage fails and automatic cleanup still runs', async () => {
  for (const surface of ['read', 'list', 'sign']) {
    const r = await session(c => {
      if (c.actor !== B) return;
      if (surface === 'read' && c.method === 'GET' && c.route.includes(`/${A}/`)) return response(200, Buffer.from('leaked'));
      if (surface === 'list' && c.route.includes('/object/list/') && c.body.prefix.startsWith(A)) return response(200, [{ name: 'leaked' }]);
      if (surface === 'sign' && c.route.includes(`/object/sign/${BUCKET}/${A}/`)) return response(200, { signedURL: 'do-not-print' });
    });
    assert.equal(r.exitCode, 1); assert.equal(r.summary.fail, 1);
    assert.equal(r.summary.cleanupCompleted, true); assert.equal(r.objects.size, 0);
    assert.equal(r.output.join('').includes('do-not-print'), false);
  }
});

test('200 empty delete cannot hide deletion; denial cannot hide overwritten owner bytes', async () => {
  for (const method of ['PUT', 'DELETE']) {
    const r = await session(c => {
      if (c.actor !== B || c.method !== method) return;
      const p = method === 'PUT' ? c.route.slice(`/object/${BUCKET}/`.length) : c.body.prefixes[0];
      if (!p.startsWith(A)) return;
      if (method === 'PUT') { c.objects.set(p, Buffer.from('tampered')); return no(); }
      c.objects.delete(p); return response(200, []);
    });
    assert.equal(r.summary.fail, 1); assert.equal(r.summary.successful, false);
    assert.equal(r.summary.cleanupCompleted, true); assert.equal(r.objects.size, 0);
    if (method === 'PUT') {
      assert.equal(r.summary.failures[0].reason, 'bytes_mismatch');
      assert.equal(r.summary.failures[0].actor, 'A');
    }
  }
});

test('wrong-prefix and anon uploads that slip through are cleaned as prefix owner', async () => {
  for (const suffix of ['cross.png', 'anon.png']) {
    const r = await session(c => {
      if (c.method === 'POST' && Buffer.isBuffer(c.body) && c.route.endsWith(suffix)) {
        c.objects.set(c.route.slice(`/object/${BUCKET}/`.length), c.body); return response(200, {});
      }
    });
    assert.equal(r.summary.fail, 1); assert.equal(r.summary.cleanupCompleted, true); assert.equal(r.objects.size, 0);
  }
});

test('anon leaks on every protected surface fail including a public bucket', async () => {
  for (const surface of ['read', 'public', 'list', 'sign', 'update', 'delete']) {
    const r = await session(c => {
      if (c.actor) return;
      if (surface === 'read' && c.method === 'GET' && c.route.startsWith(`/object/${BUCKET}/`)) return response(200, Buffer.from('leak'));
      if (surface === 'public' && c.route.startsWith('/object/public/')) return response(200, Buffer.from('leak'));
      if (surface === 'list' && c.route.includes('/object/list/')) return response(200, [{ name: 'leak' }]);
      if (surface === 'sign' && c.method === 'POST' && c.route.includes('/object/sign/')) return response(200, { signedURL: 'leak' });
      if (surface === 'update' && c.method === 'PUT') { c.objects.set(c.route.slice(`/object/${BUCKET}/`.length), c.body); return no(); }
      if (surface === 'delete' && c.method === 'DELETE') { c.objects.delete(c.body.prefixes[0]); return response(200, []); }
    });
    assert.equal(r.summary.fail, 1, surface); assert.equal(r.summary.cleanupCompleted, true); assert.equal(r.objects.size, 0);
  }
});

test('HTTP errors, JWT failures, redirects and malformed responses are never negative PASS', async () => {
  for (const bad of [() => response(500, { message: 'internal' }), () => response(400, { message: 'Invalid JWT' }),
    () => response(404, { message: 'Route not found' }), () => response(302, {}), () => response(400, Buffer.from('not json'))]) {
    const r = await session(c => c.actor === B && c.method === 'GET' && c.route.includes(`/${A}/`) ? bad() : undefined);
    assert.equal(r.summary.inconclusive, 1); assert.equal(r.summary.fail, 0);
    assert.equal(r.summary.successful, false); assert.equal(r.summary.cleanupCompleted, true);
  }
  assert.equal(storageDenial({ status: 401, json: { message: 'Invalid JWT' } }, 'B'), false);
  assert.equal(storageDenial({ status: 404, json: { message: 'Bucket not found' } }, 'anon'), false);
});

test('lost upload response retains uncertainty even if later cleanup sees absence', async () => {
  let lost = false;
  const r = await session(c => {
    if (!lost && c.method === 'POST' && Buffer.isBuffer(c.body)) {
      lost = true; c.objects.set(c.route.slice(`/object/${BUCKET}/`.length), c.body);
      throw Error('provider credential must never escape');
    }
  }, ['prepare', 'quit']);
  assert.equal(r.objects.size, 0); assert.equal(r.summary.successful, false);
  assert.equal(r.summary.cleanupCompleted, false); assert.equal(r.summary.uncertainPending.length, 1);
  assert.equal(r.output.join('').includes('provider credential'), false);
});

test('mutation timeout aborts, attempts cleanup and cannot report successful', async () => {
  const config = env(); let once = false;
  const mock = server(config, c => {
    if (!once && c.method === 'POST' && Buffer.isBuffer(c.body)) {
      once = true;
      return new Promise((resolve, reject) => c.options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true }));
    }
  });
  const r = await runStorageSession({ env: config, lines: ['prepare', 'quit'], fetchImpl: mock.fetchImpl,
    now: () => NOW, uuid: () => RUN, timeoutMs: 5, write: () => {} });
  assert.equal(r.summary.successful, false); assert.equal(r.summary.uncertainPending.length, 1);
  assert.ok(mock.calls.some(c => c.method === 'GET')); assert.equal(mock.objects.size, 0);
});

test('cleanup attempts all objects after one failure and masks pending paths', async () => {
  const r = await session(c => c.method === 'DELETE' && c.actor === A ? no() : undefined, ['prepare', 'cleanup', 'quit']);
  assert.equal(r.summary.cleanupCompleted, false); assert.equal(r.summary.fixturesPending.length, 1);
  assert.equal(r.summary.fixturesPending[0].fixture, 'A');
  assert.equal(r.summary.fixturesPending[0].path, undefined);
  assert.ok(r.calls.some(c => c.method === 'DELETE' && c.actor === B));
  assert.equal(r.objects.size, 1);
});

test('quit, EOF and broken input all clean prepared fixtures; incomplete execute is not success', async () => {
  for (const commands of [['prepare', 'quit'], ['prepare']]) {
    const r = await session(undefined, commands);
    assert.equal(r.objects.size, 0); assert.equal(r.summary.cleanupCompleted, true);
    assert.equal(r.summary.successful, false);
  }
  async function* broken() { yield 'prepare'; throw Error('input-secret'); }
  const r = await session(undefined, broken());
  assert.equal(r.objects.size, 0); assert.equal(r.summary.commandErrors, 1);
  assert.equal(r.output.join('').includes('input-secret'), false);
});

test('signed capability must match test origin, exact object and sole token parameter', async () => {
  const p = `${A}/0/desarrollo/03e1-${RUN}-a.png`;
  assert.ok(signedStorageUrl(`/object/sign/${BUCKET}/${p}?token=mock`, p).startsWith(TEST_URL));
  for (const value of ['https://example.invalid/?token=x', `${TEST_URL}/storage/v1/object/sign/${BUCKET}/${p}?token=x&redirect=y`,
    `/object/sign/${BUCKET}/${p}?token=x#fragment`, `/object/sign/${BUCKET}/${p}`]) assert.throws(() => signedStorageUrl(value, p));
  const r = await session(c => c.method === 'POST' && c.route.includes('/object/sign/') ? response(200, { signedURL: 'https://example.invalid/?token=sensitive' }) : undefined);
  assert.equal(r.summary.successful, false); assert.equal(r.summary.cleanupCompleted, true);
  assert.equal(r.output.join('').includes('sensitive'), false);
});

test('state machine rejects execute before prepare, repeated prepare and execute after cleanup', async () => {
  const config = env(), mock = server(config);
  const h = createStorageHarness(config, { fetchImpl: mock.fetchImpl, now: () => NOW, uuid: () => RUN });
  await assert.rejects(h.execute); await h.prepare(); await assert.rejects(h.prepare);
  await h.cleanup(); await assert.rejects(h.execute); assert.equal(mock.objects.size, 0);
  const collision = server(config);
  const existingPath = `${A}/0/desarrollo/03e1-${RUN}-a.png`;
  collision.objects.set(existingPath, Buffer.from('preexisting'));
  const r = await runStorageSession({ env: config, lines: ['prepare', 'quit'], fetchImpl: collision.fetchImpl,
    now: () => NOW, uuid: () => RUN, write: () => {} });
  assert.equal(r.summary.successful, false);
  assert.equal(collision.objects.get(existingPath).toString(), 'preexisting');
  assert.equal(collision.calls.some(c => c.method === 'DELETE'), false);
});

test('launcher masks all values, requires exact confirmations, uses process env and clears it', () => {
  const text = fs.readFileSync(new URL('./start-storage.ps1', import.meta.url), 'utf8');
  assert.match(text, /Read-Host \$Label -AsSecureString/);
  assert.match(text, /-cne 'educativo-backend-test'/); assert.match(text, /-cne 'confirmed'/);
  assert.match(text, /ZeroFreeBSTR/); assert.match(text, /\$storageSecure.Dispose\(\)/);
  assert.match(text, /SetEnvironmentVariable\(\$storageName, \$null, 'Process'\)/);
  assert.doesNotMatch(text, /Start-Transcript|Set-Content|Out-File|\.env|Write-Host \$_|service_role/);
});

test('versioned activity policies cover four authenticated operations and only the user prefix', () => {
  const sql = fs.readFileSync(new URL('../../docs/test-environment/initialize_application.sql', import.meta.url), 'utf8');
  const policies = sql.split(/\r?\n/).filter(l => l.startsWith('CREATE POLICY') && l.includes("'planeacion-actividades'"));
  assert.equal(policies.length, 4);
  for (const command of ['INSERT', 'SELECT', 'UPDATE', 'DELETE']) assert.equal(policies.filter(p => p.includes(`FOR ${command} TO "authenticated"`)).length, 1);
  for (const policy of policies) {
    assert.match(policy, /storage\.foldername\(name\)\)\[1\]/);
    assert.match(policy, /auth\.uid\(\)/);
    assert.doesNotMatch(policy, /planeaciones|user_id|foldername\(name\)\)\[2\]/);
  }
});

test('both modules import without I/O, environment reads, network or timers', () => {
  const harness = fs.readFileSync(new URL('./storage-harness.js', import.meta.url), 'utf8');
  const runner = fs.readFileSync(new URL('./storage-run.js', import.meta.url), 'utf8');
  const input = `import vm from 'node:vm';
const deny=()=>{throw Error('side effect')};
const context=vm.createContext({process:{argv:[],env:new Proxy({},{get:deny})},console:{log:deny},fetch:deny,setTimeout:deny,setInterval:deny});
const modules=new Map();
for(const [name,values]of Object.entries({'node:crypto':{randomUUID:deny},'node:url':{pathToFileURL:deny},'node:readline':{default:{createInterface:deny}}})) {
modules.set(name,new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context}));}
const h=new vm.SourceTextModule(${JSON.stringify(harness)},{context});
const r=new vm.SourceTextModule(${JSON.stringify(runner)},{context});modules.set('./storage-harness.js',h);
await r.link(n=>{if(!modules.has(n))throw Error('unexpected import');return modules.get(n)});await r.evaluate();`;
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module'], { input, encoding: 'utf8', env: {} });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '');
});

test('fresh GET keys and no-store avoid stale object reads after PUT and DELETE', async () => {
  const cached = new Map();
  const r = await session(c => {
    if (c.method !== 'GET' || !c.route.startsWith(`/object/${BUCKET}/`)) return;
    const p = c.route.slice(`/object/${BUCKET}/`.length);
    // Model a shared cache: a distinct query key bypasses an earlier cached body.
    if (!cached.has(c.route) && c.objects.has(p)) cached.set(c.route, Buffer.from(c.objects.get(p)));
    if (!c.url.searchParams.has('__eia_probe') && cached.has(c.route)) return response(200, cached.get(c.route));
  });
  assert.equal(r.summary.successful, true);
  const reads = r.calls.filter(c => c.method === 'GET' && !c.route.includes('/sign/'));
  assert.equal(new Set(reads.map(c => c.url.href)).size, reads.length);
  for (const c of reads) {
    assert.ok(c.url.searchParams.has('__eia_probe'));
    assert.equal(c.options.cache, 'no-store'); assert.match(c.options.headers['Cache-Control'], /no-cache, no-store/);
  }
  const events = r.output.map(x => JSON.parse(x));
  assert.ok(events.some(e => e.operation === 'update' && e.status === 200));
  assert.ok(events.some(e => e.operation === 'verify_bytes' && e.reason === 'bytes_match'));
});

test('persistent stale bytes stay INCONCLUSIVE, abort execute and allow clean summary without secondary errors', async () => {
  let previous;
  const r = await session(c => {
    if (c.actor === A && c.method === 'PUT') previous = Buffer.from(c.objects.get(c.route.slice(`/object/${BUCKET}/`.length)));
    if (previous && c.actor === A && c.method === 'GET' && c.objects.has(c.route.slice(`/object/${BUCKET}/`.length))) return response(200, previous);
  }, ['prepare', 'execute', 'cleanup', 'cleanup', 'quit']);
  assert.deepEqual([r.summary.pass, r.summary.fail, r.summary.inconclusive, r.summary.commandErrors], [6, 0, 1, 1]);
  assert.equal(r.summary.executeCompleted, false); assert.equal(r.summary.cleanupCompleted, true);
  assert.equal(r.summary.successful, false); assert.equal(r.objects.size, 0);
  assert.equal(r.summary.failures[0].failedCase, '03E1-OWN-UPDATE');
  assert.equal(r.summary.failures[0].reason, 'previous_bytes');
  assert.equal(r.output.map(JSON.parse).filter(e => e.caseId === 'ERROR').length, 1);
  assert.equal(r.calls.some(c => c.actor === B && c.method === 'PUT'), false);
});

test('PUT error, malformed content and failed verification read have distinct safe diagnostics', async () => {
  for (const mode of ['http', 'bytes', 'read_network']) {
    let updated = false;
    const r = await session(c => {
      if (c.actor === A && c.method === 'PUT') {
        updated = true;
        if (mode === 'http') return response(403, { code: 'AccessDenied', message: 'sensitive-provider-content' });
      }
      if (updated && c.actor === A && c.method === 'GET' && c.objects.has(c.route.slice(`/object/${BUCKET}/`.length))) {
        if (mode === 'bytes') return response(200, Buffer.from('unexpected-content'));
        if (mode === 'read_network') { updated = false; throw Error('sensitive-provider-content'); }
      }
    });
    assert.equal(r.summary.inconclusive, 1); assert.equal(r.summary.commandErrors, 1);
    assert.equal(r.summary.cleanupCompleted, true); assert.equal(r.summary.successful, false);
    assert.equal(r.summary.failures[0].reason, { http: 'http_error', bytes: 'bytes_mismatch', read_network: 'network' }[mode]);
    assert.equal(r.summary.failures[0].operation, mode === 'http' ? 'update' : 'verify_bytes');
    assert.equal(r.output.join('').includes('sensitive-provider-content'), false);
  }
});

test('PUT timeout after persistence keeps write uncertainty even after deletion and repeated cleanup', async () => {
  const config = env(); let lost = false;
  const mock = server(config, c => {
    if (!lost && c.actor === A && c.method === 'PUT') {
      lost = true; c.objects.set(c.route.slice(`/object/${BUCKET}/`.length), c.body);
      return new Promise((resolve, reject) => c.options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true }));
    }
  });
  const r = await runStorageSession({ env: config, lines: ['prepare', 'execute', 'cleanup', 'quit'], fetchImpl: mock.fetchImpl,
    uuid: () => RUN, now: () => NOW, timeoutMs: 5, write: () => {} });
  assert.equal(r.summary.failures[0].reason, 'timeout'); assert.equal(r.summary.failures[0].operation, 'update');
  assert.equal(r.summary.failures[0].timeout, true);
  assert.equal(r.summary.executeCompleted, false); assert.equal(r.summary.cleanupCompleted, false);
  assert.equal(r.summary.uncertainPending.length, 1); assert.equal(mock.objects.size, 0);
  assert.equal(r.summary.commandErrors, 3); // execute + auto cleanup + one explicit cleanup; no recursive/final retry.
});

test('DELETE timeout remains uncertain and does not become successful on a later empty list', async () => {
  const config = env(); let lost = false;
  const mock = server(config, c => {
    if (!lost && c.actor === A && c.method === 'DELETE') {
      lost = true; c.objects.delete(c.body.prefixes[0]);
      return new Promise((resolve, reject) => c.options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true }));
    }
  });
  const r = await runStorageSession({ env: config, lines: ['prepare', 'cleanup', 'cleanup', 'quit'], fetchImpl: mock.fetchImpl,
    uuid: () => RUN, now: () => NOW, timeoutMs: 5, write: () => {} });
  assert.equal(r.summary.uncertainPending.length, 1); assert.equal(r.summary.cleanupCompleted, false);
  assert.equal(r.summary.commandErrors, 2); assert.equal(mock.objects.size, 0);
});

test('partial cleanup has one error per command, retries remaining object and is idempotent afterwards', async () => {
  let blocked = true;
  async function* commands() {
    yield 'prepare'; yield 'cleanup'; blocked = false; yield 'cleanup'; yield 'cleanup'; yield 'quit';
  }
  const r = await session(c => c.method === 'DELETE' && c.actor === A && blocked ? no() : undefined, commands());
  assert.equal(r.summary.cleanupCompleted, true); assert.equal(r.summary.commandErrors, 1);
  assert.deepEqual(r.summary.fixturesPending, []); assert.deepEqual(r.summary.uncertainPending, []);
  assert.equal(r.calls.filter(c => c.method === 'DELETE' && c.actor === A).length, 2);
  assert.equal(r.calls.filter(c => c.method === 'DELETE' && c.actor === B).length, 1);
  assert.equal(r.output.map(JSON.parse).filter(e => e.caseId === '03E1-CLEANUP').length, 1);
});

test('already absent object skips DELETE and local credential failure does not invent uncertain write', async () => {
  const config = env(), mock = server(config);
  const h = createStorageHarness(config, { fetchImpl: mock.fetchImpl, uuid: () => RUN, now: () => NOW });
  await h.prepare(); mock.objects.clear();
  await h.cleanup(); await h.cleanup();
  assert.equal(mock.calls.some(c => c.method === 'DELETE'), false);
  assert.equal(h.state().cleanupCompleted, true);
  const second = createStorageHarness(config, { fetchImpl: mock.fetchImpl, uuid: () => RUN, now: () => NOW });
  await second.prepare(); config.EDUCATIVO_A_TOKEN = 'invalid';
  await assert.rejects(second.cleanup);
  assert.equal(second.state().fixturesPending.length, 2);
  assert.deepEqual(second.state().uncertainPending, []);
});

test('diagnostics and SUMMARY never expose raw identifiers, paths, URLs, tokens or provider fields', async () => {
  const config = env();
  const sensitive = [A, B, RUN, config.EDUCATIVO_PUBLIC_KEY, config.EDUCATIVO_A_TOKEN, config.EDUCATIVO_B_TOKEN,
    'https://example.invalid/object/sign?token=private', 'provider-sensitive'];
  const r = await session(c => {
    if (c.method === 'PUT' || c.method === 'DELETE') return response(403, { code: sensitive.join(' '), message: 'provider-sensitive' });
  });
  const output = r.output.join('\n');
  for (const text of sensitive) assert.equal(output.includes(text), false);
  assert.ok(r.summary.fixturesPending.length > 0);
  assert.ok(r.output.map(JSON.parse).filter(e => e.caseId === 'ERROR').every(e => e.reason && e.operation && e.phase));
  assert.deepEqual(safeStorageDiagnostic({ reason: sensitive[0], operation: sensitive[1], status: sensitive[2],
    code: sensitive[3], actor: sensitive[4], fixture: sensitive[5], failedCase: sensitive[6], raw: sensitive[7] }), {});
});
