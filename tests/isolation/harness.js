// Educativo IA 03A. Importing this module performs no I/O.
import { randomUUID } from 'node:crypto';

export const TEST_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co';
export const API_URL = 'http://127.0.0.1:3000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASES = ['config', 'auth', 'prepare', 'execute', 'cleanup'];
const REASONS = ['http', 'identity_mismatch', 'anonymous_identity', 'invalid_json', 'redirect', 'timeout', 'network', 'unexpected_response', 'invalid_state'];
class HarnessDiagnosticError extends Error {
  constructor(diagnostic = {}) {
    super('03A: precondicion o respuesta insegura; revisar guia local.');
    this.name = 'HarnessDiagnosticError';
    this.diagnostic = diagnostic;
  }
}
const fail = (diagnostic) => { throw new HarnessDiagnosticError(diagnostic); };
function claims(value) {
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()); }
  catch { return fail(); }
}

export function validateConfig(env, now = Date.now()) {
  if (env.APP_ENV !== 'test' || env.SUPABASE_URL !== TEST_URL || env.EDUCATIVO_API_URL !== API_URL) fail();
  if (env.EDUCATIVO_SYNTHETIC_USERS !== 'confirmed' || env.EDUCATIVO_METADATA_REVIEWED !== 'confirmed' || env.EDUCATIVO_LOCAL_API_VERIFIED !== 'confirmed') fail();
  const key = env.EDUCATIVO_PUBLIC_KEY;
  if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) fail();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    const c = claims(key);
    if (c.role !== 'anon' || c.ref !== 'gwdtlbisykzzplgzczzq') fail();
  }
  const actors = {};
  for (const actor of ['A', 'B']) {
    const id = env[`EDUCATIVO_${actor}_ID`];
    const token = env[`EDUCATIVO_${actor}_TOKEN`];
    if (!UUID.test(id || '') || typeof token !== 'string' || /\s/.test(token)) fail();
    const c = claims(token);
    if (c.sub !== id || c.role !== 'authenticated' || c.iss !== `${TEST_URL}/auth/v1` || !(c.exp * 1000 > now)) fail();
    actors[actor] = Object.freeze({ id, token });
  }
  if (actors.A.id === actors.B.id || actors.A.token === actors.B.token) fail();
  return Object.freeze({ key, actors: Object.freeze(actors) });
}

// Output allowlist: never serialize provider errors, response bodies or config.
export function safeEvent(event) {
  const out = {};
  if (/^(03A-[A-Z0-9-]+|RUN|PREPARE|CLEANUP|RESIDUAL|UNCERTAIN|ERROR|SUMMARY|DIAGNOSTIC)$/.test(event.caseId || '')) out.caseId = event.caseId;
  if (PHASES.includes(event.phase)) out.phase = event.phase;
  if (REASONS.includes(event.reason)) out.reason = event.reason;
  if (['A', 'B', 'anon'].includes(event.actor)) out.actor = event.actor;
  if (['PASS', 'FAIL', 'CREATED', 'REMOVED', 'PENDING', 'INCONCLUSIVE'].includes(event.result)) out.result = event.result;
  if (Number.isInteger(event.status) && event.status >= 100 && event.status <= 599) out.status = event.status;
  if (UUID.test(event.id || '')) out.id = event.id;
  if (UUID.test(event.runId || '')) out.runId = event.runId;
  if (['pending_delete', 'delete_unverified'].includes(event.fixtureState)) out.fixtureState = event.fixtureState;
  return out;
}

export function safeSummary(summary) {
  return {
    caseId: 'SUMMARY',
    commandsCompleted: (summary.commandsCompleted || []).filter(command => ['prepare', 'execute', 'cleanup'].includes(command)),
    pass: Number.isInteger(summary.pass) && summary.pass >= 0 ? summary.pass : 0,
    fail: Number.isInteger(summary.fail) && summary.fail >= 0 ? summary.fail : 0,
    inconclusive: Number.isInteger(summary.inconclusive) && summary.inconclusive >= 0 ? summary.inconclusive : 0,
    commandErrors: Number.isInteger(summary.commandErrors) && summary.commandErrors >= 0 ? summary.commandErrors : 0,
    prepared: summary.prepared === true,
    executeCompleted: summary.executeCompleted === true,
    fixturesPending: (summary.fixturesPending || []).map(safeRecoveryRecord).filter(Boolean),
    uncertainPending: (summary.uncertainPending || []).map(safeRecoveryRecord).filter(Boolean),
    successful: summary.successful === true
  };
}

function safeRecoveryRecord(entry) {
  if (!entry || !UUID.test(entry.runId || '') || !UUID.test(entry.id || '') || !['A', 'B'].includes(entry.actor)) return null;
  const out = { runId: entry.runId, actor: entry.actor, id: entry.id };
  if (['pending_delete', 'delete_unverified'].includes(entry.fixtureState)) out.fixtureState = entry.fixtureState;
  return out;
}

function defaultTimeoutControl(ms) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  return { signal: controller.signal, didTimeout: () => timedOut, clear: () => clearTimeout(timer) };
}

export function createHarness(env, { fetchImpl = globalThis.fetch, emit = () => {}, timeoutControlFactory = defaultTimeoutControl } = {}) {
  let config;
  try { config = validateConfig(env); }
  catch {
    emit(safeEvent({ caseId: 'DIAGNOSTIC', phase: 'config', reason: 'invalid_state' }));
    throw new HarnessDiagnosticError({ phase: 'config', reason: 'invalid_state' });
  }
  const runId = randomUUID();
  const ledger = new Map(); // Only confirmed inserts; callers cannot add IDs.
  const uncertain = new Map(); // Attempted IDs, never automatically deleted.
  let prepared = false;
  let executeAttempted = false;
  let executed = false;
  const results = { pass: 0, fail: 0, inconclusive: 0 };
  const report = event => emit(safeEvent(event));

  report({ caseId: 'RUN', runId, result: 'PENDING' });

  function reportCase(event) {
    if (event.result === 'PASS') results.pass++;
    if (event.result === 'FAIL') results.fail++;
    if (event.result === 'INCONCLUSIVE') results.inconclusive++;
    report(event);
  }

  function diagnoseAndFail(diagnostic) {
    report({ caseId: 'DIAGNOSTIC', ...diagnostic });
    fail(diagnostic);
  }

  async function request(layer, path, actor, method = 'GET', body, options = {}) {
    const phase = PHASES.includes(options.phase) ? options.phase : 'config';
    try { validateConfig(env); }
    catch { diagnoseAndFail({ phase: 'config', reason: 'invalid_state' }); }
    const base = layer === 'api' ? API_URL : TEST_URL;
    if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path)) diagnoseAndFail({ phase, actor, reason: 'invalid_state' });
    const url = new URL(path, base);
    if (url.origin !== base || url.username || url.password) diagnoseAndFail({ phase, actor, reason: 'invalid_state' });
    const headers = { 'Content-Type': 'application/json' };
    if (layer !== 'api') headers.apikey = config.key;
    if (actor !== 'anon') headers.Authorization = `Bearer ${config.actors[actor].token}`;
    if (body) headers.Prefer = 'return=representation';
    const timeout = timeoutControlFactory(15000);
    try {
      const response = await fetchImpl(url.href, { method, headers, redirect: 'error', signal: timeout.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
      let responseOriginChanged = false;
      if (response.url) {
        try { responseOriginChanged = new URL(response.url).origin !== base; }
        catch { responseOriginChanged = true; }
      }
      if (response.redirected || responseOriginChanged || (response.status >= 300 && response.status < 400)) {
        diagnoseAndFail({ phase, actor, reason: 'redirect', status: response.status });
      }
      let data = null;
      const expectsJson = options.expectsJson !== false;
      const jsonOnError = options.jsonOnError !== false;
      if (expectsJson && (response.ok || jsonOnError)) {
        try { data = await response.json(); }
        catch { diagnoseAndFail({ phase, actor, reason: 'invalid_json', status: response.status }); }
      }
      return { status: response.status, ok: response.ok, data };
    } catch (error) {
      if (error instanceof HarnessDiagnosticError) throw error;
      diagnoseAndFail({ phase, actor, reason: timeout.didTimeout() ? 'timeout' : 'network' });
    } finally {
      timeout.clear();
    }
  }

  async function authenticate() {
    for (const actor of ['A', 'B']) {
      const r = await request('supabase', '/auth/v1/user', actor, 'GET', undefined, { phase: 'auth', jsonOnError: false });
      if (!r.ok) diagnoseAndFail({ phase: 'auth', actor, reason: 'http', status: r.status });
      if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data) || typeof r.data.id !== 'string' || typeof r.data.is_anonymous !== 'boolean') {
        diagnoseAndFail({ phase: 'auth', actor, reason: 'unexpected_response', status: r.status });
      }
      if (r.data.id !== config.actors[actor].id) diagnoseAndFail({ phase: 'auth', actor, reason: 'identity_mismatch', status: r.status });
      if (r.data.is_anonymous === true) diagnoseAndFail({ phase: 'auth', actor, reason: 'anonymous_identity', status: r.status });
    }
  }
  const rowPath = id => `/rest/v1/planteles?id=eq.${id}&select=id,user_id,nombre,created_at,updated_at`;
  async function ownRow(entry, phase) {
    const r = await request('supabase', rowPath(entry.id), entry.actor, 'GET', undefined, { phase });
    if (!r.ok) diagnoseAndFail({ phase, actor: entry.actor, reason: 'http', status: r.status });
    if (!Array.isArray(r.data)) diagnoseAndFail({ phase, actor: entry.actor, reason: 'unexpected_response', status: r.status });
    return r.data;
  }
  function matches(entry, rows) {
    return rows.length === 1 && rows[0].id === entry.id && rows[0].user_id === config.actors[entry.actor].id && rows[0].nombre === entry.name;
  }
  function residuals() {
    for (const e of ledger.values()) report({ caseId: 'RESIDUAL', runId, actor: e.actor, id: e.id, fixtureState: e.fixtureState, result: 'PENDING' });
    for (const e of uncertain.values()) report({ caseId: 'UNCERTAIN', runId, actor: e.actor, id: e.id, result: 'PENDING' });
  }
  function state() {
    return {
      runId,
      prepared,
      executeCompleted: executed,
      ...results,
      fixturesPending: [...ledger.values()].map(entry => safeRecoveryRecord({ ...entry, runId })),
      uncertainPending: [...uncertain.values()].map(entry => safeRecoveryRecord({ ...entry, runId }))
    };
  }

  async function prepare() {
    if (prepared || ledger.size || uncertain.size) diagnoseAndFail({ phase: 'prepare', reason: 'invalid_state' });
    await authenticate();
    for (const actor of ['A', 'B']) {
      const entry = { id: randomUUID(), actor, name: `Educativo IA 03A ${runId} ${actor}`, fixtureState: 'pending_delete' };
      // Preassigned unique ID makes a lost response recoverable without prefix deletion.
      uncertain.set(entry.id, entry);
      report({ caseId: 'UNCERTAIN', runId, actor, id: entry.id, result: 'PENDING' });
      const r = await request('supabase', '/rest/v1/planteles', actor, 'POST', { id: entry.id, nombre: entry.name, user_id: config.actors[actor].id }, { phase: 'prepare' });
      if (!r.ok) diagnoseAndFail({ phase: 'prepare', actor, reason: 'http', status: r.status });
      if (r.status !== 201 || !Array.isArray(r.data) || !matches(entry, r.data)) diagnoseAndFail({ phase: 'prepare', actor, reason: 'unexpected_response', status: r.status });
      ledger.set(entry.id, entry);
      uncertain.delete(entry.id);
      report({ caseId: 'PREPARE', runId, actor, id: entry.id, fixtureState: entry.fixtureState, result: 'CREATED', status: r.status });
    }
    prepared = true;
  }

  async function execute() {
    if (!prepared || executeAttempted || ledger.size !== 2 || uncertain.size) diagnoseAndFail({ phase: 'execute', reason: 'invalid_state' });
    executeAttempted = true;
    await authenticate();
    const entries = [...ledger.values()];
    const before = new Map();
    for (const entry of entries) {
      const rows = await ownRow(entry, 'execute');
      if (!matches(entry, rows)) diagnoseAndFail({ phase: 'execute', actor: entry.actor, reason: 'unexpected_response' });
      before.set(entry.id, JSON.stringify(rows));
    }
    // No writes in execute: separate from prepare and cleanup by explicit command.
    for (const entry of entries) {
      for (const actor of ['A', 'B', 'anon']) {
        const r = await request('supabase', rowPath(entry.id), actor, 'GET', undefined, { phase: 'execute' });
        const own = actor === entry.actor;
        const pass = own ? r.ok && Array.isArray(r.data) && matches(entry, r.data)
          : (r.ok && Array.isArray(r.data) && r.data.length === 0);
        // A forbidden response alone is inconclusive, not proof of isolation.
        reportCase({ caseId: `03A-SB-PL-ID-${entry.actor}`, actor, status: r.status, result: pass ? 'PASS' : r.ok ? 'FAIL' : 'INCONCLUSIVE' });
      }
    }
    for (const actor of ['A', 'B', 'anon']) {
      const r = await request('api', '/api/planteles', actor, 'GET', undefined, { phase: 'execute' });
      let result = 'INCONCLUSIVE';
      if (actor === 'anon') result = r.status === 401 && r.data?.error === 'Token requerido' ? 'PASS' : 'FAIL';
      else if (r.ok && Array.isArray(r.data)) {
        const own = entries.find(e => e.actor === actor);
        const other = entries.find(e => e.actor !== actor);
        result = r.data.some(row => row.id === own.id && row.nombre === own.name) && !r.data.some(row => row.id === other.id) ? 'PASS' : 'FAIL';
      }
      reportCase({ caseId: '03A-API-PL-LIST', actor, status: r.status, result });
    }
    for (const entry of entries) {
      const rows = await ownRow(entry, 'execute');
      reportCase({ caseId: '03A-PL-NO-EFFECT', actor: entry.actor, result: JSON.stringify(rows) === before.get(entry.id) ? 'PASS' : 'FAIL' });
    }
    executed = true;
  }

  async function readAsBoth(entry) {
    const observations = {};
    for (const actor of ['A', 'B']) {
      const r = await request('supabase', rowPath(entry.id), actor, 'GET', undefined, { phase: 'cleanup' });
      if (!r.ok) diagnoseAndFail({ phase: 'cleanup', actor, reason: 'http', status: r.status });
      if (!Array.isArray(r.data)) diagnoseAndFail({ phase: 'cleanup', actor, reason: 'unexpected_response', status: r.status });
      observations[actor] = r.data;
    }
    return observations;
  }

  function confirmedAbsent(observations) {
    return observations.A.length === 0 && observations.B.length === 0;
  }

  async function verifyDependentsAbsent(entry) {
    for (const table of ['grados', 'planeacion_batches', 'examenes', 'examen_generation_jobs']) {
      for (const actor of ['A', 'B']) {
        const r = await request('supabase', `/rest/v1/${table}?plantel_id=eq.${entry.id}&select=id&limit=1`, actor, 'GET', undefined, { phase: 'cleanup' });
        if (!r.ok) diagnoseAndFail({ phase: 'cleanup', actor, reason: 'http', status: r.status });
        if (!Array.isArray(r.data) || r.data.length) diagnoseAndFail({ phase: 'cleanup', actor, reason: 'unexpected_response', status: r.status });
      }
    }
  }

  async function cleanup() {
    await authenticate();
    // Only our two leaf planteles. No imported manifest or arbitrary ID input.
    for (const entry of [...ledger.values()].reverse()) {
      if (entry.fixtureState === 'delete_unverified') {
        const observations = await readAsBoth(entry);
        if (confirmedAbsent(observations)) {
          ledger.delete(entry.id);
          report({ caseId: 'CLEANUP', runId, actor: entry.actor, id: entry.id, result: 'REMOVED' });
          continue;
        }
        if (!matches(entry, observations[entry.actor]) || observations[entry.actor === 'A' ? 'B' : 'A'].length !== 0) diagnoseAndFail({ phase: 'cleanup', actor: entry.actor, reason: 'unexpected_response' });
      }
      const rows = await ownRow(entry, 'cleanup');
      if (!matches(entry, rows)) diagnoseAndFail({ phase: 'cleanup', actor: entry.actor, reason: 'unexpected_response' });
      await verifyDependentsAbsent(entry);
      entry.fixtureState = 'delete_unverified';
      const r = await request('supabase', `/rest/v1/planteles?id=eq.${entry.id}&user_id=eq.${config.actors[entry.actor].id}`, entry.actor, 'DELETE', undefined, { phase: 'cleanup', expectsJson: false });
      if (!r.ok) diagnoseAndFail({ phase: 'cleanup', actor: entry.actor, reason: 'http', status: r.status });
      const observations = await readAsBoth(entry);
      if (!confirmedAbsent(observations)) diagnoseAndFail({ phase: 'cleanup', actor: entry.actor, reason: 'unexpected_response' });
      ledger.delete(entry.id);
      report({ caseId: 'CLEANUP', runId, actor: entry.actor, id: entry.id, result: 'REMOVED', status: r.status });
    }
    residuals();
  }
  return Object.freeze({ prepare, execute, cleanup, residuals, state });
}
