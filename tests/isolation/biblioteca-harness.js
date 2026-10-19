// Educativo IA 03D2A. Importing this module performs no I/O.
import { randomUUID } from 'node:crypto';

export const BIB_TEST_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co';
export const BIB_API_URL = 'http://127.0.0.1:3000';
const PROJECT_REF = 'gwdtlbisykzzplgzczzq';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_ID = /^[1-9][0-9]{0,14}$/;
export const MAX_PLANEACION_ID = 999999999999999;
const PHASES = ['config', 'auth', 'prepare', 'execute', 'cleanup'];
const REASONS = ['http', 'identity_mismatch', 'anonymous_identity', 'invalid_json', 'redirect', 'timeout', 'network', 'unexpected_response', 'invalid_state', 'related_rows'];
const TABLES = ['planeacion_batches', 'planeaciones'];

const caseRows = [
  ['03D2A-SB-BATCH-CREATE-OWN-A','prepare','A','planeacion_batches','insert propio','aceptado'],
  ['03D2A-SB-BATCH-CREATE-OWN-B','prepare','B','planeacion_batches','insert propio','aceptado'],
  ['03D2A-SB-BATCH-READ-OWN-A','execute','A','planeacion_batches','lectura propia','visible'],
  ['03D2A-SB-BATCH-READ-CROSS-A','execute','A','planeacion_batches','lectura ajena B','sin filas'],
  ['03D2A-SB-BATCH-READ-CROSS-B','execute','B','planeacion_batches','lectura ajena A','sin filas'],
  ['03D2A-SB-BATCH-ANON','execute','anon','planeacion_batches','lectura A','sin filas'],
  ['03D2A-SB-BATCH-ANON-B','execute','anon','planeacion_batches','lectura B','sin filas'],
  ['03D2A-SB-BATCH-LIST-A','execute','A','planeacion_batches','listado','solo fixture A'],
  ['03D2A-SB-BATCH-LIST-B','execute','B','planeacion_batches','listado','solo fixture B'],
  ['03D2A-SB-BATCH-CREATE-OWNER-A','execute','A','planeacion_batches','insert owner B','rechazado sin efecto'],
  ['03D2A-SB-BATCH-CREATE-ANON','execute','anon','planeacion_batches','insert','rechazado sin efecto'],
  ['03D2A-SB-BATCH-EDIT-CROSS-A','execute','A','planeacion_batches','update batch B','sin efecto'],
  ['03D2A-SB-BATCH-EDIT-OWNER-A','execute','A','planeacion_batches','cambiar owner A a B','sin efecto'],
  ['03D2A-SB-BATCH-DELETE-CROSS-A','execute','A','planeacion_batches','delete batch B','sin efecto'],
  ['03D2A-SB-BATCH-EDIT-ANON','execute','anon','planeacion_batches','update batch A','sin efecto'],
  ['03D2A-SB-BATCH-DELETE-ANON','execute','anon','planeacion_batches','delete batch A','sin efecto'],
  ['03D2A-SB-BATCH-DELETE-OWN-A','execute','A','planeacion_batches','delete copia propia','eliminada'],
  ['03D2A-SB-PLAN-CREATE-OWN-A','prepare','A','planeaciones','insert propio','aceptado'],
  ['03D2A-SB-PLAN-CREATE-OWN-B','prepare','B','planeaciones','insert propio','aceptado'],
  ['03D2A-SB-PLAN-READ-OWN-A','execute','A','planeaciones','lectura propia','visible'],
  ['03D2A-SB-PLAN-READ-CROSS-A','execute','A','planeaciones','lectura ajena B','sin filas'],
  ['03D2A-SB-PLAN-READ-CROSS-B','execute','B','planeaciones','lectura ajena A','sin filas'],
  ['03D2A-SB-PLAN-ANON','execute','anon','planeaciones','lectura A','sin filas'],
  ['03D2A-SB-PLAN-ANON-B','execute','anon','planeaciones','lectura B','sin filas'],
  ['03D2A-SB-PLAN-LIST-A','execute','A','planeaciones','listado','solo fixture A'],
  ['03D2A-SB-PLAN-LIST-B','execute','B','planeaciones','listado','solo fixture B'],
  ['03D2A-SB-PLAN-CREATE-OWNER-A','execute','A','planeaciones','insert owner B','rechazado sin efecto'],
  ['03D2A-SB-PLAN-CREATE-CROSS-BATCH-A','execute','A','planeaciones','insert batch B','rechazado sin efecto'],
  ['03D2A-SB-PLAN-CREATE-CROSS-BATCH-B','execute','B','planeaciones','insert batch A','rechazado sin efecto'],
  ['03D2A-SB-PLAN-EDIT-CROSS-BATCH-A','execute','A','planeaciones','update hacia batch B','rechazado sin efecto'],
  ['03D2A-SB-PLAN-EDIT-CROSS-A','execute','A','planeaciones','update planeacion B','sin efecto'],
  ['03D2A-SB-PLAN-EDIT-OWNER-A','execute','A','planeaciones','cambiar owner A a B','sin efecto'],
  ['03D2A-SB-PLAN-CREATE-ANON','execute','anon','planeaciones','insert','rechazado sin efecto'],
  ['03D2A-SB-PLAN-EDIT-ANON','execute','anon','planeaciones','update planeacion A','sin efecto'],
  ['03D2A-SB-PLAN-DELETE-ANON','execute','anon','planeaciones','delete planeacion A','sin efecto'],
  ['03D2A-SB-PLAN-DELETE-CROSS-A','execute','A','planeaciones','delete planeacion B','sin efecto'],
  ['03D2A-SB-PLAN-DELETE-OWN-A','execute','A','planeaciones','delete copia propia','eliminada'],
  ['03D2A-API-LIST-A','execute','A','api_biblioteca','GET /conjuntos','solo fixture A renderizable'],
  ['03D2A-API-LIST-B','execute','B','api_biblioteca','GET /conjuntos','solo fixture B renderizable'],
  ['03D2A-API-BATCH-OWN-A','execute','A','api_biblioteca','GET /conjuntos/:batchId propio','renderizable'],
  ['03D2A-API-BATCH-CROSS-A','execute','A','api_biblioteca','GET /conjuntos/:batchId ajeno','404'],
  ['03D2A-API-ANON','execute','anon','api_biblioteca','GET /conjuntos','401']
];
export const BIBLIOTECA_CASE_MANIFEST = Object.freeze(caseRows.map(([caseId, phase, actor, surface, operation, expected]) =>
  Object.freeze({ caseId, phase, actor, surface, operation, expected })));
const CASE_BY_ID = new Map(BIBLIOTECA_CASE_MANIFEST.map(entry => [entry.caseId, entry]));

class BibliotecaDiagnosticError extends Error {
  constructor(diagnostic = {}) {
    super('03D2A Biblioteca: precondicion o respuesta insegura; revisar la guia local.');
    this.name = 'BibliotecaDiagnosticError';
    this.diagnostic = diagnostic;
  }
}
const fail = diagnostic => { throw new BibliotecaDiagnosticError(diagnostic); };

function jwtClaims(value) {
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()); }
  catch { return fail({ phase: 'config', reason: 'invalid_state' }); }
}

export function validateBibliotecaConfig(env, now = Date.now()) {
  if (env.APP_ENV !== 'test' || env.SUPABASE_URL !== BIB_TEST_URL || env.EDUCATIVO_API_URL !== BIB_API_URL) fail({ phase: 'config', reason: 'invalid_state' });
  if (env.EDUCATIVO_SYNTHETIC_USERS !== 'confirmed' || env.EDUCATIVO_LOCAL_API_VERIFIED !== 'confirmed') fail({ phase: 'config', reason: 'invalid_state' });
  for (const forbidden of ['EDUCATIVO_PLANTEL_ID', 'EDUCATIVO_GRADO_ID', 'EDUCATIVO_MATERIA_ID', 'EDUCATIVO_UNIDAD_ID', 'EDUCATIVO_TEMA_ID']) {
    if (env[forbidden]) fail({ phase: 'config', reason: 'invalid_state' });
  }
  const key = env.EDUCATIVO_PUBLIC_KEY;
  if (typeof key !== 'string' || !key.trim() || /\s/.test(key) || /^sb_secret_/i.test(key)) fail({ phase: 'config', reason: 'invalid_state' });
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    const claims = jwtClaims(key);
    if (claims.role !== 'anon' || claims.ref !== PROJECT_REF) fail({ phase: 'config', reason: 'invalid_state' });
  }
  const actors = {};
  for (const actor of ['A', 'B']) {
    const id = env[`EDUCATIVO_${actor}_ID`];
    const token = env[`EDUCATIVO_${actor}_TOKEN`];
    if (!UUID.test(id || '') || typeof token !== 'string' || !token || /\s/.test(token)) fail({ phase: 'config', actor, reason: 'invalid_state' });
    const claims = jwtClaims(token);
    if (claims.sub !== id || claims.role !== 'authenticated' || claims.iss !== `${BIB_TEST_URL}/auth/v1` || !(claims.exp * 1000 > now)) fail({ phase: 'config', actor, reason: 'invalid_state' });
    actors[actor] = Object.freeze({ id: id.toLowerCase(), token });
  }
  if (actors.A.id === actors.B.id || actors.A.token === actors.B.token) fail({ phase: 'config', reason: 'invalid_state' });
  return Object.freeze({ key, actors: Object.freeze(actors) });
}

export function safeBibliotecaEvent(event) {
  const out = {};
  if (/^(03D2A-[A-Z0-9-]+|RUN|UNCERTAIN|CREATED|REMOVED|RESIDUAL|DIAGNOSTIC|ERROR|SUMMARY)$/.test(event.caseId || '')) out.caseId = event.caseId;
  if (PHASES.includes(event.phase)) out.phase = event.phase;
  if (REASONS.includes(event.reason)) out.reason = event.reason;
  if (['A', 'B', 'anon'].includes(event.actor)) out.actor = event.actor;
  if (TABLES.includes(event.table)) out.table = event.table;
  if (['PASS', 'FAIL', 'INCONCLUSIVE', 'PENDING', 'CREATED', 'REMOVED'].includes(event.result)) out.result = event.result;
  if (Number.isInteger(event.status) && event.status >= 100 && event.status <= 599) out.status = event.status;
  if (UUID.test(event.runId || '')) out.runId = event.runId.toLowerCase();
  if (UUID.test(event.id || '') || DECIMAL_ID.test(String(event.id || ''))) out.id = String(event.id).toLowerCase();
  if (['pending_delete', 'delete_unverified'].includes(event.fixtureState)) out.fixtureState = event.fixtureState;
  return out;
}

function safeRecord(entry) {
  if (!entry || !UUID.test(entry.runId || '') || !['A', 'B'].includes(entry.actor) || !TABLES.includes(entry.table)) return null;
  if (!(UUID.test(entry.id || '') || DECIMAL_ID.test(String(entry.id || '')))) return null;
  const out = { runId: entry.runId.toLowerCase(), actor: entry.actor, table: entry.table, id: String(entry.id).toLowerCase() };
  if (['pending_delete', 'delete_unverified'].includes(entry.fixtureState)) out.fixtureState = entry.fixtureState;
  return out;
}

export function safeBibliotecaSummary(summary) {
  return {
    caseId: 'SUMMARY',
    commandsCompleted: (summary.commandsCompleted || []).filter(value => ['prepare', 'execute', 'cleanup'].includes(value)),
    pass: Number.isInteger(summary.pass) && summary.pass >= 0 ? summary.pass : 0,
    fail: Number.isInteger(summary.fail) && summary.fail >= 0 ? summary.fail : 0,
    inconclusive: Number.isInteger(summary.inconclusive) && summary.inconclusive >= 0 ? summary.inconclusive : 0,
    commandErrors: Number.isInteger(summary.commandErrors) && summary.commandErrors >= 0 ? summary.commandErrors : 0,
    prepared: summary.prepared === true,
    executeCompleted: summary.executeCompleted === true,
    cleanupCompleted: summary.cleanupCompleted === true,
    fixturesPending: (summary.fixturesPending || []).map(safeRecord).filter(Boolean),
    uncertainPending: (summary.uncertainPending || []).map(safeRecord).filter(Boolean),
    successful: summary.successful === true
  };
}

function defaultTimeoutControl(ms) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  return { signal: controller.signal, didTimeout: () => timedOut, clear: () => clearTimeout(timer) };
}

export function normalizePlaneacionId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PLANEACION_ID) fail({ phase: 'config', reason: 'invalid_state' });
    return String(value);
  }
  if (typeof value !== 'string' || !DECIMAL_ID.test(value)) fail({ phase: 'config', reason: 'invalid_state' });
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > MAX_PLANEACION_ID || String(numeric) !== value) fail({ phase: 'config', reason: 'invalid_state' });
  return value;
}

export function planeacionIdFromUuid(value, offset = 0) {
  if (!UUID.test(value || '') || !Number.isSafeInteger(offset) || offset < 0 || offset > 999) fail({ phase: 'config', reason: 'invalid_state' });
  let hash = 0;
  for (const char of value.replace(/-/g, '')) hash = (hash * 7 + char.charCodeAt(0)) % 800000000000000;
  return normalizePlaneacionId(100000000000000 + hash + offset);
}

function validTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function isPlaneacionRestorationValid(before, after) {
  if (!before || typeof before !== 'object' || Array.isArray(before) || !after || typeof after !== 'object' || Array.isArray(after)) return false;
  if (!validTimestamp(before.updated_at) || !validTimestamp(after.updated_at) || Date.parse(after.updated_at) < Date.parse(before.updated_at)) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === 'updated_at') continue;
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) return false;
  }
  return true;
}

export function createBibliotecaHarness(env, {
  fetchImpl = globalThis.fetch,
  emit = () => {},
  timeoutControlFactory = defaultTimeoutControl,
  uuid = randomUUID,
  now = Date.now
} = {}) {
  let config;
  try { config = validateBibliotecaConfig(env, now()); }
  catch (error) {
    emit(safeBibliotecaEvent({ caseId: 'DIAGNOSTIC', ...(error?.diagnostic || { phase: 'config', reason: 'invalid_state' }) }));
    throw error;
  }
  const runId = uuid().toLowerCase();
  if (!UUID.test(runId)) fail({ phase: 'config', reason: 'invalid_state' });
  const ledger = new Map();
  const uncertain = new Map();
  const reserved = new Set();
  const reportedCases = new Map();
  let prepared = false;
  let executeAttempted = false;
  let executeCompleted = false;
  let cleanupCompleted = false;
  let activeCasePhase = null;
  const results = { pass: 0, fail: 0, inconclusive: 0 };
  const report = event => emit(safeBibliotecaEvent(event));
  report({ caseId: 'RUN', runId, result: 'PENDING' });

  function diagnose(diagnostic) { report({ caseId: 'DIAGNOSTIC', ...diagnostic }); fail(diagnostic); }
  function reportCase(event) {
    const definition = CASE_BY_ID.get(event.caseId);
    if (!definition || definition.actor !== event.actor || definition.phase !== activeCasePhase || reportedCases.has(event.caseId)) diagnose({ phase: definition?.phase || 'execute', reason: 'invalid_state' });
    if (event.result === 'PASS') results.pass++;
    else if (event.result === 'FAIL') results.fail++;
    else if (event.result === 'INCONCLUSIVE') results.inconclusive++;
    else diagnose({ phase: definition.phase, actor: definition.actor, reason: 'invalid_state' });
    reportedCases.set(event.caseId, event.result);
    report(event);
  }
  async function request(layer, path, actor, method = 'GET', body, options = {}) {
    const phase = PHASES.includes(options.phase) ? options.phase : 'config';
    try { validateBibliotecaConfig(env, now()); } catch { diagnose({ phase: 'config', reason: 'invalid_state' }); }
    const base = layer === 'api' ? BIB_API_URL : BIB_TEST_URL;
    if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path)) diagnose({ phase, actor, reason: 'invalid_state' });
    const url = new URL(path, base);
    if (url.origin !== base || url.username || url.password) diagnose({ phase, actor, reason: 'invalid_state' });
    const headers = { 'Content-Type': 'application/json' };
    if (layer === 'supabase') headers.apikey = config.key;
    if (actor !== 'anon') headers.Authorization = `Bearer ${config.actors[actor].token}`;
    if (body !== undefined || method === 'DELETE' || method === 'PATCH') headers.Prefer = body !== undefined ? 'return=representation' : 'return=minimal';
    const timeout = timeoutControlFactory(15000);
    try {
      const response = await fetchImpl(url.href, { method, headers, redirect: 'error', signal: timeout.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      let changedOrigin = false;
      if (response.url) { try { changedOrigin = new URL(response.url).origin !== base; } catch { changedOrigin = true; } }
      if (response.redirected || changedOrigin || (response.status >= 300 && response.status < 400)) diagnose({ phase, actor, reason: 'redirect', status: response.status });
      let data = null;
      if (response.status !== 204 && options.expectsJson !== false && (response.ok || options.jsonOnError !== false)) {
        try { data = await response.json(); } catch { diagnose({ phase, actor, reason: 'invalid_json', status: response.status }); }
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      if (error instanceof BibliotecaDiagnosticError) throw error;
      diagnose({ phase, actor, reason: timeout.didTimeout() ? 'timeout' : 'network' });
    } finally { timeout.clear(); }
  }
  async function authenticate() {
    for (const actor of ['A', 'B']) {
      const response = await request('supabase', '/auth/v1/user', actor, 'GET', undefined, { phase: 'auth', jsonOnError: false });
      if (!response.ok) diagnose({ phase: 'auth', actor, reason: 'http', status: response.status });
      if (!response.data || typeof response.data.id !== 'string' || typeof response.data.is_anonymous !== 'boolean') diagnose({ phase: 'auth', actor, reason: 'unexpected_response', status: response.status });
      if (response.data.id.toLowerCase() !== config.actors[actor].id) diagnose({ phase: 'auth', actor, reason: 'identity_mismatch', status: response.status });
      if (response.data.is_anonymous) diagnose({ phase: 'auth', actor, reason: 'anonymous_identity', status: response.status });
    }
  }
  const enc = value => encodeURIComponent(String(value));
  const rowPath = (table, id) => `/rest/v1/${table}?id=eq.${enc(id)}&select=*`;
  async function rows(table, id, actor, phase) {
    const response = await request('supabase', rowPath(table, id), actor, 'GET', undefined, { phase });
    if (!response.ok) diagnose({ phase, actor, reason: 'http', status: response.status });
    if (!Array.isArray(response.data)) diagnose({ phase, actor, reason: 'unexpected_response', status: response.status });
    return response.data;
  }
  function marker(table, actor, suffix = 'base') { return `Educativo IA 03D2A ${runId} ${actor} ${table} ${suffix}`; }
  function batchPayload(id, actor, suffix = 'base', userId = config.actors[actor].id) {
    return { id, user_id: userId, titulo: marker('batch', actor, suffix), descripcion: marker('batch', actor, suffix), nivel: 'sintetico', materia: 'sintetica', unidad: null, plantel_id: null, grado_id: null, materia_id: null, unidad_id: null, status: 'ready', is_archived: false, archived_at: null };
  }
  function planeacionPayload(id, actor, batchId, suffix = 'base', userId = config.actors[actor].id) {
    const value = marker('planeacion', actor, suffix);
    return { id: normalizePlaneacionId(id), user_id: userId, batch_id: batchId, tema_id: null, materia: 'sintetica', nivel: 'sintetico', tema: value, duracion: 1, subtema: null, sesiones: 1, tabla_ia: null, unidad: null, status: 'ready', is_archived: false, archived_at: null, custom_title: value, actividad_cierre: '', actividades_momentos: {} };
  }
  function sameId(table, left, right) {
    try { return table === 'planeaciones' ? normalizePlaneacionId(left) === normalizePlaneacionId(right) : String(left).toLowerCase() === String(right).toLowerCase(); }
    catch { return false; }
  }
  function exact(entry, row) {
    if (!row || !sameId(entry.table, row.id, entry.id) || row.user_id !== config.actors[entry.actor].id) return false;
    if (entry.table === 'planeacion_batches') return row.titulo === entry.marker && row.descripcion === entry.marker && row.status === 'ready' && row.is_archived === false && [row.plantel_id, row.grado_id, row.materia_id, row.unidad_id].every(v => v === null);
    return row.tema === entry.marker && row.custom_title === entry.marker && row.batch_id === entry.batchId && row.tema_id === null && row.status === 'ready' && row.is_archived === false;
  }
  function addUncertain(entry) { uncertain.set(`${entry.table}:${entry.id}`, entry); report({ caseId: 'UNCERTAIN', runId, actor: entry.actor, table: entry.table, id: entry.id, result: 'PENDING' }); }
  function confirm(entry) { uncertain.delete(`${entry.table}:${entry.id}`); ledger.set(`${entry.table}:${entry.id}`, entry); report({ caseId: 'CREATED', runId, actor: entry.actor, table: entry.table, id: entry.id, fixtureState: entry.fixtureState, result: 'CREATED', status: 201 }); }
  async function preflight(entry, phase) {
    const canonicalId = entry.table === 'planeaciones' ? normalizePlaneacionId(entry.id) : String(entry.id).toLowerCase();
    const key = `${entry.table}:${canonicalId}`;
    if ((entry.table === 'planeacion_batches' && !UUID.test(canonicalId)) || reserved.has(key)) diagnose({ phase, actor: entry.actor, reason: 'invalid_state' });
    reserved.add(key);
    for (const actor of ['A', 'B']) {
      const found = await rows(entry.table, canonicalId, actor, phase);
      if (found.length !== 0) diagnose({ phase, actor, reason: 'invalid_state' });
    }
  }
  async function createFixture(entry, payload) {
    await preflight(entry, 'prepare');
    addUncertain(entry);
    const response = await request('supabase', `/rest/v1/${entry.table}`, entry.actor, 'POST', payload, { phase: 'prepare' });
    if (!response.ok) diagnose({ phase: 'prepare', actor: entry.actor, reason: 'http', status: response.status });
    if (response.status !== 201 || !Array.isArray(response.data) || response.data.length !== 1 || !exact(entry, response.data[0])) diagnose({ phase: 'prepare', actor: entry.actor, reason: 'unexpected_response', status: response.status });
    confirm(entry);
  }
  async function prepare() {
    if (prepared || ledger.size || uncertain.size) diagnose({ phase: 'prepare', reason: 'invalid_state' });
    activeCasePhase = 'prepare';
    await authenticate();
    const ids = { batchA: uuid().toLowerCase(), batchB: uuid().toLowerCase() };
    if (!UUID.test(ids.batchA) || !UUID.test(ids.batchB) || ids.batchA === ids.batchB) diagnose({ phase: 'prepare', reason: 'invalid_state' });
    ids.planA = planeacionIdFromUuid(runId, 1); ids.planB = planeacionIdFromUuid(runId, 2);
    const fixtures = [
      { table: 'planeacion_batches', id: ids.batchA, actor: 'A', marker: marker('batch', 'A'), fixtureState: 'pending_delete' },
      { table: 'planeacion_batches', id: ids.batchB, actor: 'B', marker: marker('batch', 'B'), fixtureState: 'pending_delete' },
      { table: 'planeaciones', id: ids.planA, actor: 'A', marker: marker('planeacion', 'A'), batchId: ids.batchA, fixtureState: 'pending_delete' },
      { table: 'planeaciones', id: ids.planB, actor: 'B', marker: marker('planeacion', 'B'), batchId: ids.batchB, fixtureState: 'pending_delete' }
    ];
    await createFixture(fixtures[0], batchPayload(ids.batchA, 'A'));
    reportCase({ caseId: '03D2A-SB-BATCH-CREATE-OWN-A', actor: 'A', table: 'planeacion_batches', result: 'PASS', status: 201 });
    await createFixture(fixtures[1], batchPayload(ids.batchB, 'B'));
    reportCase({ caseId: '03D2A-SB-BATCH-CREATE-OWN-B', actor: 'B', table: 'planeacion_batches', result: 'PASS', status: 201 });
    await createFixture(fixtures[2], planeacionPayload(ids.planA, 'A', ids.batchA));
    reportCase({ caseId: '03D2A-SB-PLAN-CREATE-OWN-A', actor: 'A', table: 'planeaciones', result: 'PASS', status: 201 });
    await createFixture(fixtures[3], planeacionPayload(ids.planB, 'B', ids.batchB));
    reportCase({ caseId: '03D2A-SB-PLAN-CREATE-OWN-B', actor: 'B', table: 'planeaciones', result: 'PASS', status: 201 });
    if (BIBLIOTECA_CASE_MANIFEST.filter(entry => entry.phase === 'prepare').some(entry => !reportedCases.has(entry.caseId))) diagnose({ phase: 'prepare', reason: 'invalid_state' });
    prepared = true;
    activeCasePhase = null;
  }
  function fixture(table, actor, suffix = 'base') { return [...ledger.values()].find(e => e.table === table && e.actor === actor && e.suffix === suffix) || [...ledger.values()].find(e => e.table === table && e.actor === actor && !e.suffix); }
  async function visibleCase(caseId, table, owner, viewer, shouldSee) {
    const entry = fixture(table, owner);
    const data = await rows(table, entry.id, viewer, 'execute');
    reportCase({ caseId, actor: viewer, table, result: (shouldSee ? data.length === 1 && exact(entry, data[0]) : data.length === 0) ? 'PASS' : 'FAIL' });
  }
  async function snapshot(entry) {
    const data = await rows(entry.table, entry.id, entry.actor, 'execute');
    if (data.length !== 1 || !exact(entry, data[0])) diagnose({ phase: 'execute', actor: entry.actor, reason: 'unexpected_response' });
    return structuredClone(data[0]);
  }
  async function negativeMutation(caseId, entry, attacker, method, body) {
    const before = await snapshot(entry);
    const response = await request('supabase', rowPath(entry.table, entry.id).replace('&select=*', ''), attacker, method, body, { phase: 'execute' });
    const afterRows = await rows(entry.table, entry.id, entry.actor, 'execute');
    const unchanged = afterRows.length === 1 && exact(entry, afterRows[0]) && JSON.stringify(afterRows[0]) === JSON.stringify(before);
    reportCase({ caseId, actor: attacker, table: entry.table, status: response.status, result: unchanged ? 'PASS' : 'FAIL' });
  }
  async function listCase(caseId, table, actor) {
    const own = fixture(table, actor); const other = fixture(table, actor === 'A' ? 'B' : 'A');
    const response = await request('supabase', `/rest/v1/${table}?select=id`, actor, 'GET', undefined, { phase: 'execute' });
    const ids = Array.isArray(response.data) ? response.data.map(row => String(row.id)) : [];
    reportCase({ caseId, actor, table, status: response.status, result: response.ok && ids.includes(String(own.id)) && !ids.includes(String(other.id)) ? 'PASS' : 'FAIL' });
  }
  async function rejectedInsert(caseId, table, actor, payload, possibleOwner) {
    const recoveryActor = possibleOwner || (actor === 'anon' ? 'A' : actor);
    const entry = { table, id: table === 'planeaciones' ? normalizePlaneacionId(payload.id) : String(payload.id).toLowerCase(), actor: recoveryActor,
      marker: table === 'planeacion_batches' ? payload.titulo : payload.tema, batchId: payload.batch_id, suffix: 'adversarial', fixtureState: 'pending_delete' };
    await preflight(entry, 'execute');
    addUncertain(entry);
    const response = await request('supabase', `/rest/v1/${table}`, actor, 'POST', payload, { phase: 'execute' });
    const observations = {};
    for (const who of ['A', 'B']) observations[who] = await rows(table, entry.id, who, 'execute');
    const visibleActors = ['A', 'B'].filter(who => observations[who].length === 1);
    if (visibleActors.length === 1) {
      entry.actor = visibleActors[0];
      if (!exact(entry, observations[entry.actor][0])) {
        reportCase({ caseId, actor, table, status: response.status, result: 'INCONCLUSIVE' });
        return;
      }
      confirm(entry);
      reportCase({ caseId, actor, table, status: response.status, result: 'FAIL' });
    } else if (visibleActors.length === 0 && observations.A.length === 0 && observations.B.length === 0 && !response.ok) {
      uncertain.delete(`${table}:${entry.id}`);
      reportCase({ caseId, actor, table, status: response.status, result: 'PASS' });
    } else reportCase({ caseId, actor, table, status: response.status, result: 'INCONCLUSIVE' });
  }
  async function ownerDeleteCopy(caseId, table, actor, parentBatchId = null) {
    const id = table === 'planeacion_batches' ? uuid().toLowerCase() : planeacionIdFromUuid(runId, 401);
    const suffix = 'delete-copy';
    const payload = table === 'planeacion_batches' ? batchPayload(id, actor, suffix) : planeacionPayload(id, actor, parentBatchId, suffix);
    const entry = { table, id: table === 'planeaciones' ? normalizePlaneacionId(id) : String(id).toLowerCase(), actor, marker: table === 'planeacion_batches' ? payload.titulo : payload.tema, batchId: payload.batch_id, suffix, fixtureState: 'pending_delete' };
    await preflight(entry, 'execute');
    addUncertain(entry);
    const created = await request('supabase', `/rest/v1/${table}`, actor, 'POST', payload, { phase: 'execute' });
    if (!created.ok || created.status !== 201 || !Array.isArray(created.data) || created.data.length !== 1 || !exact(entry, created.data[0])) {
      reportCase({ caseId, actor, table, status: created.status, result: 'INCONCLUSIVE' });
      return;
    }
    confirm(entry);
    entry.fixtureState = 'delete_unverified';
    const removed = await request('supabase', `/rest/v1/${table}?id=eq.${id}&user_id=eq.${config.actors[actor].id}`, actor, 'DELETE', undefined, { phase: 'execute', expectsJson: false });
    if (removed.ok && await absent(entry)) { ledger.delete(`${table}:${id}`); reportCase({ caseId, actor, table, status: removed.status, result: 'PASS' }); }
    else reportCase({ caseId, actor, table, status: removed.status, result: 'INCONCLUSIVE' });
  }
  async function crossBatchRelation(caseId, actor, targetBatchActor, mode) {
    const ownPlan = fixture('planeaciones', actor); const targetBatch = fixture('planeacion_batches', targetBatchActor);
    const targetBeforeRows = await rows('planeacion_batches', targetBatch.id, targetBatchActor, 'execute');
    if (targetBeforeRows.length !== 1 || !exact(targetBatch, targetBeforeRows[0])) diagnose({ phase: 'execute', actor: targetBatchActor, reason: 'unexpected_response' });
    const targetBefore = JSON.stringify(targetBeforeRows[0]);
    if (mode === 'insert') {
      const id = planeacionIdFromUuid(runId, actor === 'A' ? 101 : 102);
      const payload = planeacionPayload(id, actor, targetBatch.id, 'cross');
      const entry = { table: 'planeaciones', id, actor, marker: payload.tema, batchId: targetBatch.id, suffix: 'cross', fixtureState: 'pending_delete' };
      await preflight(entry, 'execute');
      addUncertain(entry);
      const response = await request('supabase', '/rest/v1/planeaciones', actor, 'POST', payload, { phase: 'execute' });
      const observed = await rows('planeaciones', id, actor, 'execute');
      const batchAfter = await rows('planeacion_batches', targetBatch.id, targetBatchActor, 'execute');
      const batchUnchanged = batchAfter.length === 1 && exact(targetBatch, batchAfter[0]) && JSON.stringify(batchAfter[0]) === targetBefore;
      if (observed.length === 1 && exact(entry, observed[0])) {
        confirm(entry);
        reportCase({ caseId, actor, table: 'planeaciones', status: response.status, result: batchUnchanged ? 'FAIL' : 'INCONCLUSIVE' });
      } else if (observed.length === 0 && !response.ok && batchUnchanged) {
        uncertain.delete(`planeaciones:${id}`);
        reportCase({ caseId, actor, table: 'planeaciones', status: response.status, result: 'PASS' });
      } else reportCase({ caseId, actor, table: 'planeaciones', status: response.status, result: 'INCONCLUSIVE' });
      return;
    }
    const before = await snapshot(ownPlan);
    const response = await request('supabase', `/rest/v1/planeaciones?id=eq.${ownPlan.id}`, actor, 'PATCH', { batch_id: targetBatch.id }, { phase: 'execute' });
    const changed = await rows('planeaciones', ownPlan.id, actor, 'execute');
    const targetAfter = await rows('planeacion_batches', targetBatch.id, targetBatchActor, 'execute');
    const batchUnchanged = targetAfter.length === 1 && exact(targetBatch, targetAfter[0]) && JSON.stringify(targetAfter[0]) === targetBefore;
    if (changed.length === 1 && changed[0].batch_id === targetBatch.id && batchUnchanged) {
      reportCase({ caseId, actor, table: 'planeaciones', status: response.status, result: 'FAIL' });
      const restoration = await request('supabase', `/rest/v1/planeaciones?id=eq.${ownPlan.id}&user_id=eq.${config.actors[actor].id}`, actor, 'PATCH', { batch_id: ownPlan.batchId }, { phase: 'execute' });
      const restored = await rows('planeaciones', ownPlan.id, actor, 'execute');
      if (!restoration.ok || !Array.isArray(restoration.data) || restoration.data.length !== 1 ||
          !isPlaneacionRestorationValid(before, restoration.data[0]) || restored.length !== 1 ||
          !isPlaneacionRestorationValid(before, restored[0]) || !exact(ownPlan, restored[0])) {
        diagnose({ phase: 'execute', actor, reason: 'unexpected_response' });
      }
    } else if (changed.length === 1 && JSON.stringify(changed[0]) === JSON.stringify(before) && batchUnchanged) {
      reportCase({ caseId, actor, table: 'planeaciones', status: response.status, result: 'PASS' });
    } else reportCase({ caseId, actor, table: 'planeaciones', status: response.status, result: 'INCONCLUSIVE' });
  }
  async function apiCases() {
    const aBatch = fixture('planeacion_batches', 'A'); const bBatch = fixture('planeacion_batches', 'B');
    const renderable = (value, expectedBatch, expectedPlan) => value && value.id === expectedBatch.id && typeof value.titulo === 'string' &&
      value.is_archived === false && ['total_planeaciones','total_examenes','total_listas_cotejo','total_anexos'].every(key => Number.isInteger(value[key]) && value[key] >= 0) &&
      ['planeaciones','examenes','listas_cotejo','anexos'].every(key => Array.isArray(value[key])) &&
      (!expectedPlan || value.planeaciones.some(plan => sameId('planeaciones', plan.id, expectedPlan.id) && typeof (plan.tema || plan.custom_title) === 'string'));
    for (const [caseId, actor, path, expected] of [
      ['03D2A-API-LIST-A', 'A', '/api/biblioteca/conjuntos', 200],
      ['03D2A-API-LIST-B', 'B', '/api/biblioteca/conjuntos', 200],
      ['03D2A-API-BATCH-OWN-A', 'A', `/api/biblioteca/conjuntos/${aBatch.id}`, 200],
      ['03D2A-API-BATCH-CROSS-A', 'A', `/api/biblioteca/conjuntos/${bBatch.id}`, 404],
      ['03D2A-API-ANON', 'anon', '/api/biblioteca/conjuntos', 401]
    ]) {
      const response = await request('api', path, actor, 'GET', undefined, { phase: 'execute' });
      let ok = response.status === expected;
      if (ok && caseId.includes('LIST-')) {
        const ids = Array.isArray(response.data) ? response.data.map(row => row.id) : [];
        const own = actor === 'A' ? aBatch.id : bBatch.id; const other = actor === 'A' ? bBatch.id : aBatch.id;
        const ownPlan = fixture('planeaciones', actor);
        const ownRow = Array.isArray(response.data) ? response.data.find(row => row.id === own) : null;
        ok = ids.includes(own) && !ids.includes(other) && renderable(ownRow, actor === 'A' ? aBatch : bBatch, ownPlan);
      }
      if (ok && expected === 200 && path.endsWith(aBatch.id)) ok = renderable(response.data, aBatch, fixture('planeaciones', 'A')) && response.data.total_planeaciones === 1;
      reportCase({ caseId, actor, status: response.status, result: ok ? 'PASS' : 'FAIL' });
    }
  }
  async function execute() {
    if (!prepared || executeAttempted || uncertain.size) diagnose({ phase: 'execute', reason: 'invalid_state' });
    executeAttempted = true; activeCasePhase = 'execute'; await authenticate();
    await visibleCase('03D2A-SB-BATCH-READ-OWN-A', 'planeacion_batches', 'A', 'A', true);
    await visibleCase('03D2A-SB-BATCH-READ-CROSS-A', 'planeacion_batches', 'B', 'A', false);
    await visibleCase('03D2A-SB-BATCH-READ-CROSS-B', 'planeacion_batches', 'A', 'B', false);
    await visibleCase('03D2A-SB-BATCH-ANON', 'planeacion_batches', 'A', 'anon', false);
    await visibleCase('03D2A-SB-BATCH-ANON-B', 'planeacion_batches', 'B', 'anon', false);
    await listCase('03D2A-SB-BATCH-LIST-A', 'planeacion_batches', 'A'); await listCase('03D2A-SB-BATCH-LIST-B', 'planeacion_batches', 'B');
    const batchA = fixture('planeacion_batches', 'A'); const batchB = fixture('planeacion_batches', 'B');
    await rejectedInsert('03D2A-SB-BATCH-CREATE-OWNER-A', 'planeacion_batches', 'A', batchPayload(uuid().toLowerCase(), 'A', 'forged', config.actors.B.id), 'B');
    await rejectedInsert('03D2A-SB-BATCH-CREATE-ANON', 'planeacion_batches', 'anon', batchPayload(uuid().toLowerCase(), 'A', 'anon', config.actors.A.id));
    await negativeMutation('03D2A-SB-BATCH-EDIT-CROSS-A', batchB, 'A', 'PATCH', { titulo: marker('batch', 'A', 'attempt') });
    await negativeMutation('03D2A-SB-BATCH-EDIT-OWNER-A', batchA, 'A', 'PATCH', { user_id: config.actors.B.id });
    await negativeMutation('03D2A-SB-BATCH-DELETE-CROSS-A', batchB, 'A', 'DELETE');
    await negativeMutation('03D2A-SB-BATCH-EDIT-ANON', batchA, 'anon', 'PATCH', { titulo: marker('batch', 'A', 'anon') });
    await negativeMutation('03D2A-SB-BATCH-DELETE-ANON', batchA, 'anon', 'DELETE');
    await ownerDeleteCopy('03D2A-SB-BATCH-DELETE-OWN-A', 'planeacion_batches', 'A');
    await visibleCase('03D2A-SB-PLAN-READ-OWN-A', 'planeaciones', 'A', 'A', true);
    await visibleCase('03D2A-SB-PLAN-READ-CROSS-A', 'planeaciones', 'B', 'A', false);
    await visibleCase('03D2A-SB-PLAN-READ-CROSS-B', 'planeaciones', 'A', 'B', false);
    await visibleCase('03D2A-SB-PLAN-ANON', 'planeaciones', 'A', 'anon', false);
    await visibleCase('03D2A-SB-PLAN-ANON-B', 'planeaciones', 'B', 'anon', false);
    await listCase('03D2A-SB-PLAN-LIST-A', 'planeaciones', 'A'); await listCase('03D2A-SB-PLAN-LIST-B', 'planeaciones', 'B');
    const planA = fixture('planeaciones', 'A'); const planB = fixture('planeaciones', 'B');
    await rejectedInsert('03D2A-SB-PLAN-CREATE-OWNER-A', 'planeaciones', 'A', planeacionPayload(planeacionIdFromUuid(runId, 201), 'A', batchA.id, 'forged', config.actors.B.id), 'B');
    await crossBatchRelation('03D2A-SB-PLAN-CREATE-CROSS-BATCH-A', 'A', 'B', 'insert');
    await crossBatchRelation('03D2A-SB-PLAN-CREATE-CROSS-BATCH-B', 'B', 'A', 'insert');
    await crossBatchRelation('03D2A-SB-PLAN-EDIT-CROSS-BATCH-A', 'A', 'B', 'update');
    await negativeMutation('03D2A-SB-PLAN-EDIT-CROSS-A', planB, 'A', 'PATCH', { custom_title: marker('planeacion', 'A', 'attempt') });
    await negativeMutation('03D2A-SB-PLAN-EDIT-OWNER-A', planA, 'A', 'PATCH', { user_id: config.actors.B.id });
    await rejectedInsert('03D2A-SB-PLAN-CREATE-ANON', 'planeaciones', 'anon', planeacionPayload(planeacionIdFromUuid(runId, 301), 'A', batchA.id, 'anon', config.actors.A.id));
    await negativeMutation('03D2A-SB-PLAN-EDIT-ANON', planA, 'anon', 'PATCH', { custom_title: marker('planeacion', 'A', 'anon') });
    await negativeMutation('03D2A-SB-PLAN-DELETE-ANON', planA, 'anon', 'DELETE');
    await negativeMutation('03D2A-SB-PLAN-DELETE-CROSS-A', planB, 'A', 'DELETE');
    await ownerDeleteCopy('03D2A-SB-PLAN-DELETE-OWN-A', 'planeaciones', 'A', batchA.id);
    await apiCases();
    if (BIBLIOTECA_CASE_MANIFEST.filter(entry => entry.phase === 'execute').some(entry => !reportedCases.has(entry.caseId))) diagnose({ phase: 'execute', reason: 'invalid_state' });
    executeCompleted = true;
    activeCasePhase = null;
  }
  async function absent(entry) {
    const seen = {};
    for (const actor of ['A', 'B']) seen[actor] = await rows(entry.table, entry.id, actor, 'cleanup');
    if (seen.A.length === 0 && seen.B.length === 0) return true;
    return false;
  }
  async function noDerived(entry) {
    if (entry.table !== 'planeacion_batches') return true;
    for (const table of ['planeaciones', 'anexos', 'listas_cotejo', 'examenes']) {
      for (const actor of ['A', 'B']) {
        const response = await request('supabase', `/rest/v1/${table}?batch_id=eq.${entry.id}&select=id`, actor, 'GET', undefined, { phase: 'cleanup' });
        if (!response.ok || !Array.isArray(response.data)) diagnose({ phase: 'cleanup', actor, reason: 'unexpected_response', status: response.status });
        if (response.data.length) return false;
      }
    }
    return true;
  }
  async function cleanup() {
    await authenticate();
    if (!prepared || uncertain.size) diagnose({ phase: 'cleanup', reason: 'invalid_state' });
    const cleanupRank = entry => (entry.table === 'planeaciones' ? 0 : 2) + (entry.suffix ? 0 : 1);
    const order = [...ledger.values()].sort((a, b) => cleanupRank(a) - cleanupRank(b));
    for (const entry of order) {
      const key = `${entry.table}:${entry.id}`;
      if (!ledger.has(key)) continue;
      if (entry.fixtureState === 'delete_unverified' && await absent(entry)) { ledger.delete(key); report({ caseId: 'REMOVED', runId, actor: entry.actor, table: entry.table, id: entry.id, result: 'REMOVED' }); continue; }
      const current = await rows(entry.table, entry.id, entry.actor, 'cleanup');
      if (current.length !== 1 || !exact(entry, current[0])) diagnose({ phase: 'cleanup', actor: entry.actor, reason: 'unexpected_response' });
      if (!await noDerived(entry)) diagnose({ phase: 'cleanup', actor: entry.actor, reason: 'related_rows' });
      entry.fixtureState = 'delete_unverified'; report({ caseId: 'RESIDUAL', runId, actor: entry.actor, table: entry.table, id: entry.id, fixtureState: entry.fixtureState, result: 'PENDING' });
      const response = await request('supabase', `/rest/v1/${entry.table}?id=eq.${entry.id}&user_id=eq.${config.actors[entry.actor].id}`, entry.actor, 'DELETE', undefined, { phase: 'cleanup', expectsJson: false });
      if (!response.ok) diagnose({ phase: 'cleanup', actor: entry.actor, reason: 'http', status: response.status });
      if (!await absent(entry)) diagnose({ phase: 'cleanup', actor: entry.actor, reason: 'unexpected_response' });
      ledger.delete(key); report({ caseId: 'REMOVED', runId, actor: entry.actor, table: entry.table, id: entry.id, result: 'REMOVED', status: response.status });
    }
    cleanupCompleted = ledger.size === 0 && uncertain.size === 0;
  }
  function residuals() {
    for (const entry of ledger.values()) report({ caseId: 'RESIDUAL', runId, actor: entry.actor, table: entry.table, id: entry.id, fixtureState: entry.fixtureState, result: 'PENDING' });
    for (const entry of uncertain.values()) report({ caseId: 'UNCERTAIN', runId, actor: entry.actor, table: entry.table, id: entry.id, result: 'PENDING' });
  }
  function state() {
    return { runId, prepared, executeCompleted, cleanupCompleted, ...results,
      fixturesPending: [...ledger.values()].map(entry => safeRecord({ ...entry, runId })),
      uncertainPending: [...uncertain.values()].map(entry => safeRecord({ ...entry, runId })) };
  }
  return Object.freeze({ prepare, execute, cleanup, residuals, state });
}
