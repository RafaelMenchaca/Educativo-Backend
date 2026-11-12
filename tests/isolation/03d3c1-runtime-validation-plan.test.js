import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_PROVISIONING_CONTRACT, CLEANUP_ORDER, FIXTURE_ROLES, OWNERSHIP_CASE_MANIFEST,
  OWNERSHIP_FUNCTIONS, RECOVERY_MAX, UPDATED_AT_EVIDENCE, markerFor, validateRuntimeValidationPlan
} from './03d3c1-runtime-validation-plan.js';

const RUN = '11111111-1111-4111-8111-111111111111';

test('runtime plan is internally complete', () => assert.deepEqual(validateRuntimeValidationPlan(), []));
test('manifest contains 22 unique prepare/execute cases', () => {
  assert.equal(OWNERSHIP_CASE_MANIFEST.length, 22);
  assert.equal(new Set(OWNERSHIP_CASE_MANIFEST.map(x => x.caseId)).size, 22);
  assert.deepEqual([...new Set(OWNERSHIP_CASE_MANIFEST.map(x => x.phase))], ['prepare', 'execute']);
});
test('each trigger has own A/B inserts, own update and cross insert/update', () => {
  for (const item of OWNERSHIP_FUNCTIONS) {
    const rows = OWNERSHIP_CASE_MANIFEST.filter(x => x.table === item.table);
    assert.equal(rows.length, 5);
    assert.deepEqual(rows.map(x => x.actor).sort(), ['A', 'A', 'A', 'A', 'B']);
  }
});
test('marker grammar is exact and carries no user or parent ID', () => {
  const marker = markerFor(RUN, 'A', 'grados', 'grado-base');
  assert.equal(marker, `EIA-03D3C1-OWN:${RUN}:A:grados:grado-base`);
  assert.ok(FIXTURE_ROLES.includes('grado-base'));
  assert.doesNotMatch(marker, /22222222-2222/);
});
test('cleanup and recovery are closed over the twelve run fixtures', () => {
  assert.deepEqual(CLEANUP_ORDER, ['planeaciones', 'temas', 'unidades', 'materias', 'grados', 'planteles']);
  assert.equal(Object.values(RECOVERY_MAX).reduce((a, b) => a + b, 0), 12);
});
test('updated_at evidence partitions exactly eleven trigger tables', () => {
  const all = Object.values(UPDATED_AT_EVIDENCE).flat();
  assert.equal(all.length, 11);assert.equal(new Set(all).size, 11);
  assert.deepEqual(UPDATED_AT_EVIDENCE.provenAfterRevoke, ['anexos', 'examenes', 'listas_cotejo', 'planeaciones']);
});
test('Auth contract requires two rows and cascade cleanup without harness service role', () => {
  assert.deepEqual(AUTH_PROVISIONING_CONTRACT.rows, { profiles: 1, user_settings: 1 });
  assert.deepEqual(AUTH_PROVISIONING_CONTRACT.deleteCascades, ['profiles.id', 'user_settings.user_id']);
  assert.ok(AUTH_PROVISIONING_CONTRACT.forbidden.includes('service_role_in_harness'));
});
test('module is declarative and imports without I/O', async () => {
  const original = globalThis.fetch;let calls = 0;globalThis.fetch = () => { calls++; };
  try { await import(`./03d3c1-runtime-validation-plan.js?noio=${Date.now()}`); }
  finally { globalThis.fetch = original; }
  assert.equal(calls, 0);
});

