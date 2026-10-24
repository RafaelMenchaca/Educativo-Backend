// 03D3C1 runtime validation plan. Declarative only: importing performs no I/O.

export const OWNERSHIP_FUNCTIONS = Object.freeze([
  Object.freeze({ function: 'enforce_grado_ownership', table: 'grados', parentTable: 'planteles', relation: 'plantel_id', markerField: 'nombre' }),
  Object.freeze({ function: 'enforce_materia_ownership', table: 'materias', parentTable: 'grados', relation: 'grado_id', markerField: 'nombre' }),
  Object.freeze({ function: 'enforce_tema_ownership', table: 'temas', parentTable: 'unidades', relation: 'unidad_id', markerField: 'titulo' }),
  Object.freeze({ function: 'enforce_planeacion_tema_ownership', table: 'planeaciones', parentTable: 'temas', relation: 'tema_id', markerField: 'custom_title' })
]);

export const FIXTURE_ROLES = Object.freeze([
  'plantel-base', 'grado-base', 'materia-base', 'unidad-base', 'tema-base', 'planeacion-base'
]);

export const markerFor = (runId, actor, table, role) => `EIA-03D3C1-OWN:${runId}:${actor}:${table}:${role}`;

const cases = [];
for (const item of OWNERSHIP_FUNCTIONS) {
  const code = item.table === 'planeaciones' ? 'PLANEACION' : item.table.slice(0, -1).toUpperCase();
  for (const actor of ['A', 'B']) cases.push([`03D3C1-OWN-${code}-CREATE-${actor}`, 'prepare', actor, item.table, 'insert propio', 'PASS']);
  cases.push([`03D3C1-OWN-${code}-UPDATE-A`, 'execute', 'A', item.table, 'update propio conserva padre', 'PASS']);
  cases.push([`03D3C1-OWN-${code}-CREATE-CROSS-A`, 'execute', 'A', item.table, `insert con ${item.relation} de B`, 'PASS']);
  cases.push([`03D3C1-OWN-${code}-UPDATE-CROSS-A`, 'execute', 'A', item.table, `update hacia ${item.relation} de B`, 'PASS']);
}
cases.push(['03D3C1-UPDATED-PLANTEL-A', 'execute', 'A', 'planteles', 'updated_at propio', 'PASS']);
cases.push(['03D3C1-UPDATED-UNIDAD-A', 'execute', 'A', 'unidades', 'updated_at propio', 'PASS']);

export const OWNERSHIP_CASE_MANIFEST = Object.freeze(cases.map(([caseId, phase, actor, table, operation, expected]) =>
  Object.freeze({ caseId, phase, actor, table, operation, expected })));

export const CLEANUP_ORDER = Object.freeze(['planeaciones', 'temas', 'unidades', 'materias', 'grados', 'planteles']);
export const RECOVERY_MAX = Object.freeze({ planeaciones: 2, temas: 2, unidades: 2, materias: 2, grados: 2, planteles: 2 });

export const UPDATED_AT_EVIDENCE = Object.freeze({
  provenAfterRevoke: Object.freeze(['anexos', 'examenes', 'listas_cotejo', 'planeaciones']),
  coveredByOwnershipPlan: Object.freeze(['grados', 'materias', 'planteles', 'temas', 'unidades']),
  coveredByAuthPlan: Object.freeze(['profiles', 'user_settings'])
});

export const AUTH_PROVISIONING_CONTRACT = Object.freeze({
  authority: 'Supabase test Auth control plane',
  trigger: 'auth.users.on_auth_user_created',
  function: 'public.handle_new_user()',
  rows: Object.freeze({ profiles: 1, user_settings: 1 }),
  profile: Object.freeze({ idEqualsAuthUser: true, emailEqualsAuthUser: true, fullNameEqualsSyntheticMetadata: true }),
  settings: Object.freeze({ userIdEqualsAuthUser: true, settingsEqualsEmptyObject: true }),
  deleteCascades: Object.freeze(['profiles.id', 'user_settings.user_id']),
  forbidden: Object.freeze(['invite', 'magic_link', 'password_reset', 'real_email', 'service_role_in_harness'])
});

export function validateRuntimeValidationPlan() {
  const errors = [];
  const ids = OWNERSHIP_CASE_MANIFEST.map(x => x.caseId);
  if (ids.length !== 22 || new Set(ids).size !== 22) errors.push('case manifest must contain 22 unique cases');
  for (const item of OWNERSHIP_FUNCTIONS) {
    const related = OWNERSHIP_CASE_MANIFEST.filter(x => x.table === item.table);
    for (const fragment of ['CREATE-A', 'CREATE-B', 'UPDATE-A', 'CREATE-CROSS-A', 'UPDATE-CROSS-A']) {
      if (!related.some(x => x.caseId.endsWith(fragment))) errors.push(`${item.function}: missing ${fragment}`);
    }
  }
  if (CLEANUP_ORDER.join(',') !== 'planeaciones,temas,unidades,materias,grados,planteles') errors.push('cleanup order is not child-to-parent');
  if (Object.values(RECOVERY_MAX).some(value => value !== 2)) errors.push('recovery cardinality must be exactly two rows per table');
  const allUpdated = [...UPDATED_AT_EVIDENCE.provenAfterRevoke, ...UPDATED_AT_EVIDENCE.coveredByOwnershipPlan, ...UPDATED_AT_EVIDENCE.coveredByAuthPlan];
  if (allUpdated.length !== 11 || new Set(allUpdated).size !== 11) errors.push('updated_at coverage must partition all eleven tables');
  if (AUTH_PROVISIONING_CONTRACT.authority.includes('service_role')) errors.push('Auth authority must not expose service role to a harness');
  return errors;
}

