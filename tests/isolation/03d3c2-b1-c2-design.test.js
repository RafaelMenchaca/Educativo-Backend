import test from 'node:test';
import assert from 'node:assert/strict';
import { B1_C2_OPERATIONS, B1_C2_GRAPH, B1_C2_DECISION, validateB1C2Design } from './03d3c2-b1-c2-design.js';
import { BIBLIOTECA_CASE_MANIFEST } from './biblioteca-harness.js';
import { DERIVED_CASE_MANIFEST } from './derived-resources-harness.js';
import { TECHNICAL_CASE_MANIFEST } from './technical-jobs-harness.js';
import { OWNERSHIP_CASE_MANIFEST } from './03d3c1-runtime-validation-plan.js';

const expected = [
  'examen_generation_items UPDATE', 'examen_generation_items DELETE', 'examen_generation_jobs DELETE',
  'examenes INSERT', 'examenes UPDATE', 'planeacion_batches INSERT', 'planeacion_batches UPDATE', 'temas UPDATE'
];

test('manifest contains exactly the eight B1-C2 operations', () => {
  assert.deepEqual(B1_C2_OPERATIONS.map(x => `${x.table} ${x.operation}`), expected);
  assert.deepEqual(validateB1C2Design(), []);
});

test('every operation maps cases and a lifecycle phase', () => {
  const actualCases = new Set([
    ...BIBLIOTECA_CASE_MANIFEST, ...DERIVED_CASE_MANIFEST,
    ...TECHNICAL_CASE_MANIFEST, ...OWNERSHIP_CASE_MANIFEST
  ].map(x => x.caseId));
  for (const item of B1_C2_OPERATIONS) {
    assert.ok(item.caseIds.length > 0);
    assert.ok(item.caseIds.every(caseId => actualCases.has(caseId)), `${item.table} ${item.operation} has an unknown caseId`);
    assert.match(item.use, /prepare|execute|restore|cleanup|recovery/);
    assert.match(item.replacement, /grant denial|grant-denial|test-only authority/);
  }
});

test('graph records only demonstrated CASCADE and SET NULL actions', () => {
  assert.deepEqual(B1_C2_GRAPH.filter(x => x.onDelete === 'CASCADE').map(x => `${x.child}->${x.parent}`), [
    'temas->unidades', 'examenes->unidades', 'examen_generation_items->examen_generation_jobs'
  ]);
  assert.ok(B1_C2_GRAPH.filter(x => x.onDelete === 'SET NULL').every(x => x.nullable));
  assert.ok(B1_C2_GRAPH.every(x => x.ownerConstraint));
});

test('recommended authority is design-only, narrow and absent from runtime', () => {
  assert.equal(B1_C2_DECISION.status, 'DESIGN_ONLY');
  assert.deepEqual(B1_C2_DECISION.allowedMutations, ['INSERT planeacion_batches', 'INSERT examenes', 'DELETE examen_generation_jobs']);
  assert.ok(B1_C2_DECISION.forbidden.includes('production target'));
  assert.ok(B1_C2_DECISION.forbidden.includes('runtime endpoint'));
  assert.ok(B1_C2_DECISION.forbidden.includes('arbitrary row id'));
  assert.equal(B1_C2_DECISION.waves.flatMap(x => x.operations).length, 8);
});

test('module contains no credential or network surface', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('./03d3c2-b1-c2-design.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /fetch\s*\(|sb_secret_|SUPABASE_(?:URL|KEY)|https?:\/\//i);
  assert.doesNotMatch(source, /PLANEA/);
});
