// 03D3C2-B1-C2 declarative design. Importing performs no I/O.

export const B1_C2_OPERATIONS = Object.freeze([
  Object.freeze({ table: 'examen_generation_items', operation: 'UPDATE', use: 'execute', fixture: 'item A/B', caseIds: Object.freeze(['03D2C-SB-ITEM-EDIT-CROSS-A', '03D2C-SB-ITEM-EDIT-OWNER-A', '03D2C-SB-ITEM-EDIT-JOB-CROSS-A']), replacement: 'authenticated attempt becomes exact grant denial; no restore is then required' }),
  Object.freeze({ table: 'examen_generation_items', operation: 'DELETE', use: 'execute,cleanup,recovery', fixture: 'items base/delete/cross', caseIds: Object.freeze(['03D2C-SB-ITEM-DELETE-CROSS-A', '03D2C-SB-ITEM-DELETE-ANON', '03D2C-SB-ITEM-DELETE-OWN-A']), replacement: 'delete the closed run job through test-only authority and rely on the verified job->items cascade' }),
  Object.freeze({ table: 'examen_generation_jobs', operation: 'DELETE', use: 'execute,cleanup,recovery', fixture: 'jobs base/delete/target', caseIds: Object.freeze(['03D2C-SB-EJOB-DELETE-CROSS-A', '03D2C-SB-EJOB-DELETE-ANON', '03D2C-SB-EJOB-DELETE-OWN-A']), replacement: 'test-only authority deletes exact marked jobs after dependents and graph validation' }),
  Object.freeze({ table: 'examenes', operation: 'INSERT', use: 'prepare,execute', fixture: 'exams A/B and adversarial copies', caseIds: Object.freeze(['03D2B-SB-EXAMEN-CREATE-OWN-A', '03D2B-SB-EXAMEN-CREATE-OWN-B', '03D2B-SB-EXAMEN-CREATE-OWNER-A', '03D2B-SB-EXAMEN-CREATE-ANON', '03D2B-SB-EXAMEN-CREATE-REL-CROSS-A', '03D2B-SB-EXAMEN-CREATE-BATCH-CROSS-A', '03D2C-SB-EXAM-CREATE-JOB-CROSS-A']), replacement: 'test-only authority prepares valid base rows; authenticated adversarial INSERTs become exact grant-denial cases' }),
  Object.freeze({ table: 'examenes', operation: 'UPDATE', use: 'execute,restore', fixture: 'exam A/B', caseIds: Object.freeze(['03D2B-SB-EXAMEN-EDIT-OWN-A', '03D2B-SB-EXAMEN-EDIT-CROSS-A', '03D2B-SB-EXAMEN-EDIT-OWNER-A', '03D2B-SB-EXAMEN-EDIT-REL-CROSS-A', '03D2B-SB-EXAMEN-EDIT-BATCH-CROSS-A', '03D2B-SB-EXAMEN-EDIT-ANON', '03D2C-SB-EXAM-EDIT-JOB-CROSS-A']), replacement: 'authenticated attempts become grant-denial cases; a clean snapshot means restoration is unnecessary' }),
  Object.freeze({ table: 'planeacion_batches', operation: 'INSERT', use: 'prepare,execute', fixture: 'batches A/B and disposable copies', caseIds: Object.freeze(['03D2A-SB-BATCH-CREATE-OWN-A', '03D2A-SB-BATCH-CREATE-OWN-B', '03D2A-SB-BATCH-CREATE-OWNER-A', '03D2A-SB-BATCH-CREATE-ANON']), replacement: 'test-only authority prepares owned batches; authenticated/anonymous attempts test grant denial' }),
  Object.freeze({ table: 'planeacion_batches', operation: 'UPDATE', use: 'execute,restore', fixture: 'batches A/B', caseIds: Object.freeze(['03D2A-SB-BATCH-EDIT-CROSS-A', '03D2A-SB-BATCH-EDIT-OWNER-A', '03D2A-SB-BATCH-EDIT-ANON']), replacement: 'authenticated attempts become exact grant-denial cases with before/after snapshots' }),
  Object.freeze({ table: 'temas', operation: 'UPDATE', use: 'execute,restore', fixture: 'ownership tree A/B', caseIds: Object.freeze(['03D3C1-OWN-TEMA-UPDATE-A', '03D3C1-OWN-TEMA-UPDATE-CROSS-A']), replacement: 'retain historical trigger evidence; future authenticated attempts verify grant denial without mutating the fixture' })
]);

export const B1_C2_GRAPH = Object.freeze([
  Object.freeze({ child: 'planeaciones', parent: 'planeacion_batches', nullable: true, onDelete: 'SET NULL', ownerConstraint: true }),
  Object.freeze({ child: 'temas', parent: 'unidades', nullable: false, onDelete: 'CASCADE', ownerConstraint: true }),
  Object.freeze({ child: 'planeaciones', parent: 'temas', nullable: true, onDelete: 'SET NULL', ownerConstraint: true }),
  Object.freeze({ child: 'examenes', parent: 'unidades', nullable: false, onDelete: 'CASCADE', ownerConstraint: true }),
  Object.freeze({ child: 'examenes', parent: 'planeacion_batches', nullable: true, onDelete: 'SET NULL', ownerConstraint: true }),
  Object.freeze({ child: 'examen_generation_items', parent: 'examen_generation_jobs', nullable: false, onDelete: 'CASCADE', ownerConstraint: true }),
  Object.freeze({ child: 'examenes', parent: 'examen_generation_jobs', nullable: true, onDelete: 'SET NULL', ownerConstraint: true })
]);

export const B1_C2_DECISION = Object.freeze({
  status: 'DESIGN_ONLY',
  keepUntil: 'test-only fixture authority and recovery are implemented and validated before any revoke',
  authority: 'local test-only administrative fixture runner, separate from user harnesses and application runtime',
  allowedMutations: Object.freeze(['INSERT planeacion_batches', 'INSERT examenes', 'DELETE examen_generation_jobs']),
  forbidden: Object.freeze(['production target', 'persisted credential', 'arbitrary row id', 'runtime endpoint', 'public RPC', 'RLS bypass in user harness', 'best-effort cleanup']),
  waves: Object.freeze([
    Object.freeze({ id: 'T1', operations: Object.freeze(['examen_generation_items UPDATE', 'examen_generation_items DELETE', 'examen_generation_jobs DELETE', 'examenes INSERT', 'examenes UPDATE']) }),
    Object.freeze({ id: 'T2', operations: Object.freeze(['planeacion_batches INSERT', 'planeacion_batches UPDATE']) }),
    Object.freeze({ id: 'T3', operations: Object.freeze(['temas UPDATE']) })
  ])
});

export function validateB1C2Design() {
  const errors = [];
  const keys = B1_C2_OPERATIONS.map(x => `${x.table} ${x.operation}`);
  if (keys.length !== 8 || new Set(keys).size !== 8) errors.push('operations must contain exactly eight unique entries');
  if (B1_C2_OPERATIONS.some(x => !x.caseIds.length || new Set(x.caseIds).size !== x.caseIds.length)) errors.push('every operation needs unique caseIds');
  if (B1_C2_GRAPH.length !== 7 || B1_C2_GRAPH.filter(x => x.onDelete === 'CASCADE').length !== 3) errors.push('dependency graph mismatch');
  if (B1_C2_DECISION.allowedMutations.some(x => /UPDATE/.test(x))) errors.push('elevated fixture authority must not need UPDATE');
  if (B1_C2_DECISION.status !== 'DESIGN_ONLY') errors.push('design must not be executable');
  return errors;
}
