// 03E1: direct Storage surface. Importing performs no I/O.
import { randomUUID } from 'node:crypto';

export const TEST_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co';
export const BUCKET = 'planeacion-actividades';
export const CASES = Object.freeze(['UP-A', 'UP-B', 'OWN-READ', 'OWN-LIST', 'OWN-SIGN', 'OWN-UPDATE',
  'B-READ', 'B-LIST', 'B-SIGN', 'B-UPDATE', 'B-DELETE', 'A-UP-B',
  'ANON-READ', 'ANON-PUBLIC-READ', 'ANON-LIST', 'ANON-UP', 'ANON-SIGN', 'ANON-UPDATE', 'ANON-DELETE', 'CLEANUP']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASONS = ['invalid_state', 'invalid_config', 'invalid_signed_url', 'unexpected_error', 'input_error', 'invalid_command',
  'http_error', 'unexpected_response', 'timeout', 'network', 'redirect', 'bytes_match', 'previous_bytes', 'bytes_mismatch',
  'object_present', 'absence_confirmed', 'cleanup_pending', 'write_uncertain', 'case_failed', 'case_inconclusive'];
const OPERATIONS = ['config', 'input', 'command', 'prepare', 'execute', 'cleanup', 'upload', 'update', 'read', 'list', 'sign', 'delete', 'verify_bytes', 'verify_absence'];
const CODES = ['NoSuchKey', 'NoSuchBucket', 'AccessDenied', 'InvalidJWT', 'not_found', 'Unauthorized'];
// Strict output vocabulary: no provider messages, URLs, headers or identifiers.
export function safeStorageDiagnostic(value = {}) {
  const out = {};
  for (const [key, allowed] of Object.entries({ reason: REASONS, operation: OPERATIONS, code: CODES,
    phase: ['config', 'prepare', 'execute', 'cleanup', 'input', 'command'], actor: ['A', 'B', 'anon'],
    fixture: ['A', 'B', 'cross', 'anon'], tracking: ['pending_delete', 'write_uncertain', 'absent'] })) {
    if (allowed.includes(value[key])) out[key] = value[key];
  }
  if (typeof value.failedCase === 'string' && CASES.includes(value.failedCase.replace(/^03E1-/, ''))) out.failedCase = value.failedCase;
  if (Number.isInteger(value.status) && value.status >= 0 && value.status <= 599) out.status = value.status;
  if (typeof value.timeout === 'boolean') out.timeout = value.timeout;
  return out;
}
export class StorageHarnessError extends Error {
  constructor(diagnostic) { super('03E1: operacion no completada; consulte diagnostico sanitizado.'); this.diagnostic = safeStorageDiagnostic(diagnostic); }
}
const stop = (reason = 'invalid_state', details = {}) => { throw new StorageHarnessError({ ...details, reason }); };
function responseDiagnostic(r, operation) {
  return safeStorageDiagnostic({ operation, status: r.status, timeout: r.timeout === true,
    code: r.json?.code || r.json?.error, reason: r.timeout ? 'timeout' : r.network ? 'network' : r.redirect ? 'redirect' :
      !ok(r) ? 'http_error' : 'unexpected_response' });
}
const png = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const replacement = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
function claims(token) {
  try {
    if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) stop();
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch { return stop(); }
}
export function validateStorageConfig(env, now = Date.now()) {
  if (env.APP_ENV !== 'test' || env.SUPABASE_URL !== TEST_URL ||
      env.EDUCATIVO_STORAGE_TEST !== 'educativo-backend-test' || env.EDUCATIVO_SYNTHETIC_USERS !== 'confirmed') stop();
  const key = env.EDUCATIVO_PUBLIC_KEY;
  if (typeof key !== 'string' || !key || /\s/.test(key)) stop();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    const c = claims(key);
    if (c.role !== 'anon' || c.ref !== 'gwdtlbisykzzplgzczzq' || !(c.exp * 1000 > now)) stop();
  }
  const actors = {};
  for (const actor of ['A', 'B']) {
    const id = env[`EDUCATIVO_${actor}_ID`], token = env[`EDUCATIVO_${actor}_TOKEN`];
    const c = claims(token);
    if (!UUID.test(id || '') || c.sub !== id || c.role !== 'authenticated' || c.is_anonymous === true ||
        c.iss !== `${TEST_URL}/auth/v1` || !(c.exp * 1000 > now + 60000) || (c.nbf && c.nbf * 1000 > now)) stop();
    actors[actor] = { id, token };
  }
  if (actors.A.id === actors.B.id || actors.A.token === actors.B.token) stop();
  return { key, actors };
}

const ok = r => r.status >= 200 && r.status < 300;
// A generic 400/404/500, token failure or timeout is NOT evidence of isolation.
export function storageDenial(r, actor, publicRoute = false) {
  if (r.network || r.redirect || ![400, 401, 403, 404].includes(r.status)) return false;
  const j = r.json;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  const message = String(j.message || j.error || '').toLowerCase();
  const code = String(j.code || j.error || '').toLowerCase();
  if (/jwt|token|expired|signature|api.?key/.test(message + code)) return actor === 'anon' && r.status === 401;
  return (publicRoute && (/bucket not found/.test(message) || code === 'nosuchbucket')) ||
    (actor === 'anon' && r.status === 401 && /authorization/.test(message)) ||
    /row.level security|permission denied|not authorized|unauthorized|access denied|object not found/.test(message) ||
    ['nosuchkey', 'accessdenied', 'not_found'].includes(code);
}

export function signedStorageUrl(value, objectPath) {
  if (typeof value !== 'string') stop('invalid_signed_url', { operation: 'sign' });
  let url;
  try { url = new URL(value.startsWith('/object/') ? `/storage/v1${value}` : value, TEST_URL); }
  catch { stop('invalid_signed_url', { operation: 'sign' }); }
  if (url.origin !== TEST_URL || url.username || url.password || url.hash ||
      url.pathname !== `/storage/v1/object/sign/${BUCKET}/${objectPath}` ||
      !url.searchParams.get('token') || [...url.searchParams.keys()].some(k => k !== 'token')) stop('invalid_signed_url', { operation: 'sign' });
  return url.href;
}

export function createStorageHarness(env, { fetchImpl = globalThis.fetch, emit = () => {}, uuid = randomUUID, now = Date.now,
  timeoutMs = 15000 } = {}) {
  const config = validateStorageConfig(env, now());
  const runId = uuid();
  if (!UUID.test(runId)) stop();
  let prepared = false, executeCompleted = false, cleanupCompleted = false, started = false, executed = false;
  const results = new Map(), ledger = new Map(), uncertain = new Set();
  // 0 is a path-only synthetic bigint segment: no database planeacion is created or claimed.
  const paths = {
    A: `${config.actors.A.id}/0/desarrollo/03e1-${runId}-a.png`,
    B: `${config.actors.B.id}/0/desarrollo/03e1-${runId}-b.png`,
    cross: `${config.actors.B.id}/0/desarrollo/03e1-${runId}-cross.png`,
    anon: `${config.actors.A.id}/0/desarrollo/03e1-${runId}-anon.png`
  };
  const expected = { A: png(), B: png() };
  let phase = 'config', lastDiagnostic = {}, readSequence = 0;
  const failures = new Map();
  const fixture = p => Object.keys(paths).find(k => paths[k] === p);
  function record(id, result, detail = lastDiagnostic) {
    if (!CASES.includes(id) || !['PASS', 'FAIL', 'INCONCLUSIVE'].includes(result)) stop();
    // Retrying cleanup may resolve absence, but never erases a failed observation.
    const diagnostic = safeStorageDiagnostic({ ...detail, phase, failedCase: `03E1-${id}`,
      reason: detail.reason || (result === 'FAIL' ? 'case_failed' : 'case_inconclusive') });
    if (!results.has(id)) {
      results.set(id, result);
      emit({ caseId: `03E1-${id}`, result, ...(result === 'PASS' ? {} : diagnostic) });
    }
    if (result !== 'PASS') { failures.set(id, diagnostic); throw new StorageHarnessError(diagnostic); }
  }
  async function request(actor, method, route, body, { binary = false, mutation, signed = false } = {}) {
    const operation = method === 'PUT' ? 'update' : method === 'DELETE' ? 'delete' : method === 'GET' ? 'read' :
      Buffer.isBuffer(body) ? 'upload' : route.includes('/list/') ? 'list' : 'sign';
    try { validateStorageConfig(env, now()); } catch { stop('invalid_config', { phase, operation, actor }); }
    let url = signed ? route : `${TEST_URL}/storage/v1${route}`;
    if (new URL(url).origin !== TEST_URL) stop();
    const headers = signed ? {} : { apikey: config.key };
    if (!signed && actor !== 'anon') headers.Authorization = `Bearer ${config.actors[actor].token}`;
    if (!signed && actor === 'anon' && !config.key.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${config.key}`;
    if (body !== undefined) headers['Content-Type'] = Buffer.isBuffer(body) ? 'image/png' : 'application/json';
    if (Buffer.isBuffer(body)) {
      if (method === 'POST') headers['x-upsert'] = 'false'; // PUT follows StorageFileApi.update, not upsert.
      headers['Cache-Control'] = 'max-age=0';
    }
    if (method === 'GET' && !signed) {
      // Same object, distinct cache key per observation; never change the object path or auth.
      url += `?__eia_probe=${runId}-${++readSequence}`;
      headers['Cache-Control'] = 'no-cache, no-store, max-age=0';
      headers.Pragma = 'no-cache';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { method, headers, redirect: 'manual', signal: controller.signal, cache: 'no-store',
        ...(body !== undefined ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}) });
      if (r.status >= 300 && r.status < 400) {
        if (mutation) uncertain.add(mutation);
        const result = { status: r.status, redirect: true };
        lastDiagnostic = responseDiagnostic(result, operation); return result;
      }
      const bytes = Buffer.from(await r.arrayBuffer());
      let json;
      if (!binary || r.status >= 300) { try { json = JSON.parse(bytes.toString()); } catch { /* fail closed at verifier */ } }
      const result = { status: r.status, json, bytes };
      lastDiagnostic = responseDiagnostic(result, operation); return result;
    } catch {
      if (mutation) uncertain.add(mutation);
      const result = { status: 0, network: true, timeout: controller.signal.aborted };
      lastDiagnostic = responseDiagnostic(result, operation); return result;
    } finally { clearTimeout(timer); }
  }
  const read = (actor, p, publicRoute = false) => request(actor, 'GET', `/object/${publicRoute ? 'public/' : ''}${BUCKET}/${p}`, undefined, { binary: true });
  const list = (actor, p) => request(actor, 'POST', `/object/list/${BUCKET}`, {
    prefix: p.slice(0, p.lastIndexOf('/')), search: p.slice(p.lastIndexOf('/') + 1), limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' }
  });
  const sign = (actor, p) => request(actor, 'POST', `/object/sign/${BUCKET}/${p}`, { expiresIn: 3600 });
  const remove = (actor, p) => request(actor, 'DELETE', `/object/${BUCKET}`, { prefixes: [p] }, { mutation: p });
  async function matches(actor) {
    const r = await read(actor, paths[actor]);
    if (ok(r)) {
      const match = r.bytes.equals(expected[actor]);
      lastDiagnostic = { operation: 'verify_bytes', actor, status: r.status, timeout: false, reason: match ? 'bytes_match' : 'bytes_mismatch' };
      return match;
    }
    return storageDenial(r, actor) ? false : null;
  }
  async function absence(actor, p) {
    const l = await list(actor, p), r = await read(actor, p);
    if (!ok(l) || !Array.isArray(l.json)) { lastDiagnostic = responseDiagnostic(l, 'list'); return null; }
    if (l.json.length || ok(r)) {
      lastDiagnostic = { operation: 'verify_absence', actor, fixture: fixture(p), status: r.status, reason: 'object_present' }; return false;
    }
    // Absence needs not-found, not merely a permission denial or expired identity.
    const absent = [400, 404].includes(r.status) &&
      (/^object not found$/i.test(r.json?.message || '') || ['NoSuchKey', 'not_found'].includes(r.json?.code || r.json?.error));
    if (absent) lastDiagnostic = { operation: 'verify_absence', actor, fixture: fixture(p), status: r.status, reason: 'absence_confirmed' };
    return absent ? true : null;
  }
  async function upload(actor, label, owner) {
    const p = paths[label];
    if (!(await absence(owner, p))) stop(lastDiagnostic.reason, lastDiagnostic);
    ledger.set(p, owner); // Before sending: also covers timeout or lost response after commit.
    cleanupCompleted = false;
    return request(actor, 'POST', `/object/${BUCKET}/${p}`, png(), { mutation: p });
  }
  async function prepare() {
    phase = 'prepare';
    if (started) stop();
    started = true;
    for (const actor of ['A', 'B']) {
      const r = await upload(actor, actor, actor);
      record(`UP-${actor}`, ok(r) && await matches(actor) ? 'PASS' : 'INCONCLUSIVE');
    }
    prepared = true;
  }
  async function denied(id, actor, operation, verify = async () => true, allowEmpty = false, publicRoute = false) {
    if (actor !== 'anon' && !(await matches(actor))) { record(id, 'INCONCLUSIVE'); return; }
    const r = await operation();
    const operationDiagnostic = { ...lastDiagnostic };
    const empty = allowEmpty && ok(r) && Array.isArray(r.json) && r.json.length === 0;
    const unchanged = await verify();
    const verificationDiagnostic = { ...lastDiagnostic };
    const control = actor === 'anon' || await matches(actor);
    const result = (empty || storageDenial(r, actor, publicRoute)) && unchanged === true && control === true ? 'PASS' :
      (ok(r) && !empty) || unchanged === false ? 'FAIL' : 'INCONCLUSIVE';
    record(id, result, unchanged !== true ? verificationDiagnostic : control !== true ? lastDiagnostic : operationDiagnostic);
  }
  async function execute() {
    phase = 'execute';
    if (!prepared || executed || cleanupCompleted) stop();
    executed = true;
    record('OWN-READ', await matches('A') ? 'PASS' : 'INCONCLUSIVE');
    const l = await list('A', paths.A);
    record('OWN-LIST', ok(l) && Array.isArray(l.json) && l.json.length === 1 &&
      l.json[0].name === paths.A.split('/').at(-1) ? 'PASS' : 'INCONCLUSIVE');
    const s = await sign('A', paths.A);
    let usable = false;
    if (ok(s)) {
      const url = signedStorageUrl(s.json?.signedURL, paths.A);
      const r = await request('anon', 'GET', url, undefined, { signed: true, binary: true });
      usable = ok(r) && r.bytes.equals(expected.A);
    }
    record('OWN-SIGN', usable ? 'PASS' : 'INCONCLUSIVE');
    const u = await request('A', 'PUT', `/object/${BUCKET}/${paths.A}`, replacement(), { mutation: paths.A });
    const updateDetail = { ...responseDiagnostic(u, 'update'), phase, actor: 'A', fixture: 'A',
      tracking: uncertain.has(paths.A) ? 'write_uncertain' : 'pending_delete' };
    emit({ caseId: 'DIAGNOSTIC', ...safeStorageDiagnostic({ ...updateDetail, ...(ok(u) ? { reason: undefined } : {}) }) });
    if (!ok(u)) record('OWN-UPDATE', 'INCONCLUSIVE', updateDetail);
    const after = await read('A', paths.A);
    const changed = ok(after) && after.bytes.equals(replacement());
    const detail = { ...responseDiagnostic(after, 'verify_bytes'), phase, actor: 'A', fixture: 'A', tracking: 'pending_delete',
      ...(ok(after) ? { reason: changed ? 'bytes_match' : after.bytes.equals(expected.A) ? 'previous_bytes' : 'bytes_mismatch' } : {}) };
    emit({ caseId: 'DIAGNOSTIC', ...safeStorageDiagnostic(detail) });
    if (changed) expected.A = replacement(); // Commit expectation only after observed new bytes.
    record('OWN-UPDATE', changed ? 'PASS' : 'INCONCLUSIVE', detail);
    await denied('B-READ', 'B', () => read('B', paths.A), () => matches('A'));
    await denied('B-LIST', 'B', () => list('B', paths.A), () => matches('A'), true);
    await denied('B-SIGN', 'B', () => sign('B', paths.A), () => matches('A'));
    await denied('B-UPDATE', 'B', () => request('B', 'PUT', `/object/${BUCKET}/${paths.A}`, png(), { mutation: paths.A }), () => matches('A'));
    await denied('B-DELETE', 'B', () => remove('B', paths.A), () => matches('A'), true);
    await denied('A-UP-B', 'A', () => upload('A', 'cross', 'B'), () => absence('B', paths.cross));
    await denied('ANON-READ', 'anon', () => read('anon', paths.A), () => matches('A'));
    await denied('ANON-PUBLIC-READ', 'anon', () => read('anon', paths.A, true), () => matches('A'), false, true);
    await denied('ANON-LIST', 'anon', () => list('anon', paths.A), () => matches('A'), true);
    await denied('ANON-UP', 'anon', () => upload('anon', 'anon', 'A'), () => absence('A', paths.anon));
    await denied('ANON-SIGN', 'anon', () => sign('anon', paths.A), () => matches('A'));
    await denied('ANON-UPDATE', 'anon', () => request('anon', 'PUT', `/object/${BUCKET}/${paths.A}`, png(), { mutation: paths.A }), () => matches('A'));
    await denied('ANON-DELETE', 'anon', () => remove('anon', paths.A), () => matches('A'), true);
    executeCompleted = true;
  }
  async function cleanup() {
    phase = 'cleanup';
    let pendingDiagnostic;
    // Attempt every exact attempted path, even after a preceding delete or check failed.
    for (const [p, actor] of [...ledger]) {
      try {
        // Already absent is idempotent: no new DELETE, hence no artificial uncertain mutation.
        let absent = await absence(actor, p);
        if (absent !== true) {
          const deletion = await remove(actor, p);
          if (!ok(deletion)) emit({ caseId: 'DIAGNOSTIC', ...safeStorageDiagnostic({ ...responseDiagnostic(deletion, 'delete'),
            phase, actor, fixture: fixture(p), tracking: uncertain.has(p) ? 'write_uncertain' : 'pending_delete' }) });
          absent = await absence(actor, p);
        }
        if (absent === true) ledger.delete(p);
        else pendingDiagnostic = { ...lastDiagnostic, actor, fixture: fixture(p) };
        emit({ caseId: 'DIAGNOSTIC', ...safeStorageDiagnostic({ ...(absent === true ? lastDiagnostic : pendingDiagnostic), phase,
          actor, fixture: fixture(p), tracking: uncertain.has(p) ? 'write_uncertain' : absent === true ? 'absent' : 'pending_delete' }) });
      } catch (error) {
        // A local validation failure did not send a mutation: keep pending, don't invent uncertainty.
        pendingDiagnostic = error instanceof StorageHarnessError ? error.diagnostic : { reason: 'unexpected_error', operation: 'cleanup' };
        emit({ caseId: 'DIAGNOSTIC', ...safeStorageDiagnostic({ ...pendingDiagnostic, phase, actor, fixture: fixture(p), tracking: 'pending_delete' }) });
      }
    }
    cleanupCompleted = started && ledger.size === 0 && uncertain.size === 0;
    if (cleanupCompleted) record('CLEANUP', 'PASS');
    else if (started) stop(uncertain.size ? 'write_uncertain' : 'cleanup_pending', { phase, operation: 'cleanup',
      ...pendingDiagnostic, tracking: uncertain.size ? 'write_uncertain' : 'pending_delete' });
  }
  function state() {
    const count = value => [...results.values()].filter(x => x === value).length;
    return { prepared, executeCompleted, cleanupCompleted, pass: count('PASS'), fail: count('FAIL'), inconclusive: count('INCONCLUSIVE'),
      fixturesPending: [...ledger].map(([p, actor]) => ({ fixture: fixture(p), actor, tracking: 'pending_delete' })),
      uncertainPending: [...uncertain].map(p => ({ fixture: fixture(p), tracking: 'write_uncertain' })),
      failures: [...failures.values()], runTag: runId.slice(0, 8) };
  }
  return { prepare, execute, cleanup, state };
}
