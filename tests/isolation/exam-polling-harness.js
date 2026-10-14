// Educativo IA 03C. Importing this module performs no I/O.
import { randomUUID } from 'node:crypto';

export const EXAM_TEST_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co';
export const EXAM_API_URL = 'http://127.0.0.1:3000';
const PROJECT_REF = 'gwdtlbisykzzplgzczzq';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHASES = ['config', 'auth', 'prepare', 'execute', 'cleanup'];
const REASONS = ['http', 'identity_mismatch', 'anonymous_identity', 'invalid_json', 'redirect', 'timeout', 'network', 'unexpected_response', 'invalid_state', 'related_rows'];
const GENERIC_ERROR = 'No se pudo completar la generacion del examen. Intenta nuevamente.';

class ExamPollingDiagnosticError extends Error {
  constructor(diagnostic = {}) {
    super('03C polling: precondicion o respuesta insegura; revisar la guia local.');
    this.name = 'ExamPollingDiagnosticError';
    this.diagnostic = diagnostic;
  }
}
const fail = diagnostic => { throw new ExamPollingDiagnosticError(diagnostic); };

function jwtClaims(value) {
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()); }
  catch { return fail({ phase: 'config', reason: 'invalid_state' }); }
}

export function validateExamPollingConfig(env, now = Date.now()) {
  if (env.APP_ENV !== 'test' || env.SUPABASE_URL !== EXAM_TEST_URL || env.EDUCATIVO_API_URL !== EXAM_API_URL) fail({ phase: 'config', reason: 'invalid_state' });
  // The versioned schema does not require a hierarchy FK for a terminal job.
  // Refuse an operator-supplied reference instead of trusting an arbitrary ID.
  if (env.EDUCATIVO_EXAM_UNIT_ID) fail({ phase: 'config', reason: 'invalid_state' });
  if (env.EDUCATIVO_SYNTHETIC_USERS !== 'confirmed' || env.EDUCATIVO_LOCAL_API_VERIFIED !== 'confirmed') fail({ phase: 'config', reason: 'invalid_state' });
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
    if (claims.sub !== id || claims.role !== 'authenticated' || claims.iss !== `${EXAM_TEST_URL}/auth/v1` || !(claims.exp * 1000 > now)) fail({ phase: 'config', actor, reason: 'invalid_state' });
    actors[actor] = Object.freeze({ id: id.toLowerCase(), token });
  }
  if (actors.A.id === actors.B.id || actors.A.token === actors.B.token) fail({ phase: 'config', reason: 'invalid_state' });
  return Object.freeze({ key, actors: Object.freeze(actors) });
}

export function safeExamPollingEvent(event) {
  const out = {};
  if (/^(03C-POLL-[A-Z0-9-]+|RUN|UNCERTAIN|CREATED|REMOVED|RESIDUAL|DIAGNOSTIC|ERROR|SUMMARY)$/.test(event.caseId || '')) out.caseId = event.caseId;
  if (PHASES.includes(event.phase)) out.phase = event.phase;
  if (REASONS.includes(event.reason)) out.reason = event.reason;
  if (['A', 'B', 'anon'].includes(event.actor)) out.actor = event.actor;
  if (['PASS', 'FAIL', 'INCONCLUSIVE', 'PENDING', 'CREATED', 'REMOVED'].includes(event.result)) out.result = event.result;
  if (Number.isInteger(event.status) && event.status >= 100 && event.status <= 599) out.status = event.status;
  if (UUID.test(event.id || '')) out.id = event.id.toLowerCase();
  if (UUID.test(event.runId || '')) out.runId = event.runId.toLowerCase();
  if (['pending_delete', 'delete_unverified'].includes(event.fixtureState)) out.fixtureState = event.fixtureState;
  return out;
}

function safeRecord(entry) {
  if (!entry || !UUID.test(entry.runId || '') || !UUID.test(entry.id || '') || entry.actor !== 'A') return null;
  const out = { runId: entry.runId.toLowerCase(), actor: 'A', id: entry.id.toLowerCase() };
  if (['pending_delete', 'delete_unverified'].includes(entry.fixtureState)) out.fixtureState = entry.fixtureState;
  return out;
}

export function safeExamPollingSummary(summary) {
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

export function createExamPollingHarness(env, {
  fetchImpl = globalThis.fetch,
  emit = () => {},
  timeoutControlFactory = defaultTimeoutControl,
  uuid = randomUUID,
  now = () => new Date().toISOString()
} = {}) {
  let config;
  try { config = validateExamPollingConfig(env); }
  catch (error) {
    emit(safeExamPollingEvent({ caseId: 'DIAGNOSTIC', ...(error?.diagnostic || { phase: 'config', reason: 'invalid_state' }) }));
    throw error;
  }
  const runId = uuid().toLowerCase();
  const absentId = uuid().toLowerCase();
  if (!UUID.test(runId) || !UUID.test(absentId) || runId === absentId) fail({ phase: 'config', reason: 'invalid_state' });
  const ledger = new Map();
  const uncertain = new Map();
  let prepared = false;
  let executeAttempted = false;
  let executeCompleted = false;
  let cleanupCompleted = false;
  const results = { pass: 0, fail: 0, inconclusive: 0 };
  const report = event => emit(safeExamPollingEvent(event));
  report({ caseId: 'RUN', runId, result: 'PENDING' });

  function diagnose(diagnostic) {
    report({ caseId: 'DIAGNOSTIC', ...diagnostic });
    fail(diagnostic);
  }
  function reportCase(event) {
    if (event.result === 'PASS') results.pass++;
    else if (event.result === 'FAIL') results.fail++;
    else if (event.result === 'INCONCLUSIVE') results.inconclusive++;
    report(event);
  }
  async function request(layer, path, actor, method = 'GET', body, options = {}) {
    const phase = PHASES.includes(options.phase) ? options.phase : 'config';
    try { validateExamPollingConfig(env); }
    catch { diagnose({ phase: 'config', reason: 'invalid_state' }); }
    const base = layer === 'api' ? EXAM_API_URL : EXAM_TEST_URL;
    if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path)) diagnose({ phase, actor, reason: 'invalid_state' });
    const url = new URL(path, base);
    if (url.origin !== base || url.username || url.password) diagnose({ phase, actor, reason: 'invalid_state' });
    const headers = { 'Content-Type': 'application/json' };
    if (layer === 'supabase') headers.apikey = config.key;
    if (actor !== 'anon') headers.Authorization = `Bearer ${config.actors[actor].token}`;
    if (body !== undefined || method === 'DELETE') headers.Prefer = body !== undefined ? 'return=representation' : 'return=minimal';
    const timeout = timeoutControlFactory(15000);
    try {
      const response = await fetchImpl(url.href, { method, headers, redirect: 'error', signal: timeout.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      let changedOrigin = false;
      if (response.url) {
        try { changedOrigin = new URL(response.url).origin !== base; } catch { changedOrigin = true; }
      }
      if (response.redirected || changedOrigin || (response.status >= 300 && response.status < 400)) diagnose({ phase, actor, reason: 'redirect', status: response.status });
      let data = null;
      if (options.expectsJson !== false && (response.ok || options.jsonOnError !== false)) {
        try { data = await response.json(); }
        catch { diagnose({ phase, actor, reason: 'invalid_json', status: response.status }); }
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      if (error instanceof ExamPollingDiagnosticError) throw error;
      diagnose({ phase, actor, reason: timeout.didTimeout() ? 'timeout' : 'network' });
    } finally { timeout.clear(); }
  }

  async function authenticate() {
    for (const actor of ['A', 'B']) {
      const response = await request('supabase', '/auth/v1/user', actor, 'GET', undefined, { phase: 'auth', jsonOnError: false });
      if (!response.ok) diagnose({ phase: 'auth', actor, reason: 'http', status: response.status });
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data) || typeof response.data.id !== 'string' || typeof response.data.is_anonymous !== 'boolean') diagnose({ phase: 'auth', actor, reason: 'unexpected_response', status: response.status });
      if (response.data.id.toLowerCase() !== config.actors[actor].id) diagnose({ phase: 'auth', actor, reason: 'identity_mismatch', status: response.status });
      if (response.data.is_anonymous) diagnose({ phase: 'auth', actor, reason: 'anonymous_identity', status: response.status });
    }
  }

  const jobSelect = 'id,user_id,examen_id,plantel_id,grado_id,materia_id,unidad_id,titulo,instrucciones,tipos_pregunta,total_preguntas,contexto_temas,configuracion,status,progress_current,progress_total,current_step,error_message,prompt_version,started_at,completed_at,failed_at';
  const jobPath = id => `/rest/v1/examen_generation_jobs?id=eq.${id}&select=${jobSelect}`;
  const relatedPath = (table, column, id) => `/rest/v1/${table}?${column}=eq.${id}&select=id`;
  async function readRows(path, actor, phase) {
    const response = await request('supabase', path, actor, 'GET', undefined, { phase });
    if (!response.ok) diagnose({ phase, actor, reason: 'http', status: response.status });
    if (!Array.isArray(response.data)) diagnose({ phase, actor, reason: 'unexpected_response', status: response.status });
    return response.data;
  }
  function matches(entry, rows) {
    if (rows.length !== 1) return false;
    const row = rows[0];
    return row.id === entry.id && row.user_id === config.actors.A.id && row.titulo === entry.title
      && row.status === 'failed' && row.total_preguntas === 0 && row.progress_current === 0 && row.progress_total === 0
      && row.error_message === GENERIC_ERROR && Number.isFinite(Date.parse(row.failed_at)) && Date.parse(row.failed_at) === Date.parse(entry.failedAt)
      && row.examen_id === null && row.plantel_id === null && row.grado_id === null && row.materia_id === null && row.unidad_id === null
      && row.instrucciones === null && row.current_step === 'Fixture terminal sintetico.'
      && row.prompt_version === null && row.started_at === null && row.completed_at === null
      && Array.isArray(row.tipos_pregunta) && row.tipos_pregunta.length === 0
      && Array.isArray(row.contexto_temas) && row.contexto_temas.length === 0
      && row.configuracion && Object.keys(row.configuracion).length === 1 && row.configuracion.fixture_kind === 'exam_polling_03c';
  }
  async function assertNoRelated(entry, phase) {
    for (const actor of ['A', 'B']) {
      for (const [table, column] of [['examen_generation_items', 'job_id'], ['examenes', 'generation_job_id']]) {
        const rows = await readRows(relatedPath(table, column, entry.id), actor, phase);
        if (rows.length !== 0) diagnose({ phase, actor, reason: 'related_rows' });
      }
    }
  }

  async function prepare() {
    if (prepared || ledger.size || uncertain.size) diagnose({ phase: 'prepare', reason: 'invalid_state' });
    await authenticate();
    const id = uuid().toLowerCase();
    if (!UUID.test(id) || id === runId || id === absentId) diagnose({ phase: 'prepare', reason: 'invalid_state' });
    const entry = {
      id, actor: 'A', title: `Educativo IA 03C polling ${runId}`,
      failedAt: now(), fixtureState: 'pending_delete'
    };
    const payload = {
      id, user_id: config.actors.A.id, examen_id: null, plantel_id: null, grado_id: null, materia_id: null, unidad_id: null,
      titulo: entry.title, instrucciones: null, tipos_pregunta: [], total_preguntas: 0, contexto_temas: [],
      configuracion: { fixture_kind: 'exam_polling_03c' }, status: 'failed', progress_current: 0, progress_total: 0,
      current_step: 'Fixture terminal sintetico.', error_message: GENERIC_ERROR, prompt_version: null,
      started_at: null, completed_at: null, failed_at: entry.failedAt
    };
    uncertain.set(id, entry);
    report({ caseId: 'UNCERTAIN', runId, actor: 'A', id, result: 'PENDING' });
    const response = await request('supabase', '/rest/v1/examen_generation_jobs', 'A', 'POST', payload, { phase: 'prepare' });
    if (!response.ok) diagnose({ phase: 'prepare', actor: 'A', reason: 'http', status: response.status });
    if (response.status !== 201 || !Array.isArray(response.data) || !matches(entry, response.data)) diagnose({ phase: 'prepare', actor: 'A', reason: 'unexpected_response', status: response.status });
    ledger.set(id, entry);
    uncertain.delete(id);
    prepared = true;
    report({ caseId: 'CREATED', runId, actor: 'A', id, fixtureState: entry.fixtureState, result: 'CREATED', status: response.status });
  }

  async function execute() {
    if (!prepared || executeAttempted || ledger.size !== 1 || uncertain.size) diagnose({ phase: 'execute', reason: 'invalid_state' });
    executeAttempted = true;
    await authenticate();
    const entry = [...ledger.values()][0];
    const before = await readRows(jobPath(entry.id), 'A', 'execute');
    if (!matches(entry, before)) diagnose({ phase: 'execute', actor: 'A', reason: 'unexpected_response' });
    const cases = [
      ['03C-POLL-OWN-A', 'A', entry.id, 200],
      ['03C-POLL-CROSS-B', 'B', entry.id, 404],
      ['03C-POLL-MISSING-B', 'B', absentId, 404],
      ['03C-POLL-ANON', 'anon', entry.id, 401]
    ];
    for (const [caseId, actor, id, expected] of cases) {
      const response = await request('api', `/api/examenes/generacion/${id}`, actor, 'GET', undefined, { phase: 'execute' });
      let pass = response.status === expected;
      if (pass && expected === 200) pass = response.data?.ok === true && response.data?.job_id === entry.id && response.data?.status === 'failed' && response.data?.progress_current === 0 && response.data?.progress_total === 0 && response.data?.examen_id === null && response.data?.error_message === GENERIC_ERROR;
      if (pass && expected === 404) pass = response.data?.error === 'Generacion de examen no encontrada';
      if (pass && expected === 401) pass = response.data?.error === 'Token requerido';
      reportCase({ caseId, actor, status: response.status, result: pass ? 'PASS' : 'FAIL' });
    }
    const after = await readRows(jobPath(entry.id), 'A', 'execute');
    reportCase({ caseId: '03C-POLL-NO-EFFECT', actor: 'A', result: matches(entry, after) && JSON.stringify(before) === JSON.stringify(after) ? 'PASS' : 'FAIL' });
    executeCompleted = true;
  }

  async function confirmAbsent(entry) {
    const observations = {};
    for (const actor of ['A', 'B']) observations[actor] = await readRows(jobPath(entry.id), actor, 'cleanup');
    if (observations.A.length === 0 && observations.B.length === 0) return true;
    if (observations.B.length !== 0) diagnose({ phase: 'cleanup', actor: 'B', reason: 'unexpected_response' });
    return false;
  }
  async function cleanup() {
    await authenticate();
    if (ledger.size === 0) {
      if (uncertain.size) diagnose({ phase: 'cleanup', reason: 'invalid_state' });
      if (!prepared) diagnose({ phase: 'cleanup', reason: 'invalid_state' });
      cleanupCompleted = true;
      return;
    }
    for (const entry of [...ledger.values()]) {
      if (entry.fixtureState === 'delete_unverified' && await confirmAbsent(entry)) {
        await assertNoRelated(entry, 'cleanup');
        ledger.delete(entry.id);
        report({ caseId: 'REMOVED', runId, actor: 'A', id: entry.id, result: 'REMOVED' });
        continue;
      }
      const rows = await readRows(jobPath(entry.id), 'A', 'cleanup');
      if (!matches(entry, rows)) diagnose({ phase: 'cleanup', actor: 'A', reason: 'unexpected_response' });
      await assertNoRelated(entry, 'cleanup');
      entry.fixtureState = 'delete_unverified';
      report({ caseId: 'RESIDUAL', runId, actor: 'A', id: entry.id, fixtureState: entry.fixtureState, result: 'PENDING' });
      const path = `/rest/v1/examen_generation_jobs?id=eq.${entry.id}&user_id=eq.${config.actors.A.id}`;
      const response = await request('supabase', path, 'A', 'DELETE', undefined, { phase: 'cleanup', expectsJson: false });
      if (!response.ok) diagnose({ phase: 'cleanup', actor: 'A', reason: 'http', status: response.status });
      if (!await confirmAbsent(entry)) diagnose({ phase: 'cleanup', actor: 'A', reason: 'unexpected_response' });
      await assertNoRelated(entry, 'cleanup');
      ledger.delete(entry.id);
      report({ caseId: 'REMOVED', runId, actor: 'A', id: entry.id, result: 'REMOVED', status: response.status });
    }
    cleanupCompleted = ledger.size === 0 && uncertain.size === 0;
  }
  function residuals() {
    for (const entry of ledger.values()) report({ caseId: 'RESIDUAL', runId, actor: 'A', id: entry.id, fixtureState: entry.fixtureState, result: 'PENDING' });
    for (const entry of uncertain.values()) report({ caseId: 'UNCERTAIN', runId, actor: 'A', id: entry.id, result: 'PENDING' });
  }
  function state() {
    return {
      runId, prepared, executeCompleted, cleanupCompleted, ...results,
      fixturesPending: [...ledger.values()].map(entry => safeRecord({ ...entry, runId })),
      uncertainPending: [...uncertain.values()].map(entry => safeRecord({ ...entry, runId }))
    };
  }
  return Object.freeze({ prepare, execute, cleanup, residuals, state });
}
