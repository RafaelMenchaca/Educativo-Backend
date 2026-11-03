import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { splitSqlStatements, scanSql, fingerprintVersionedFunctionBodies } from './validate-03d3c1-function-hardening-sql.js';

export const FILES = Object.freeze({
  source: 'docs/test-environment/initialize_application.sql',
  b0: 'docs/test-environment/03d3c2_b0_current_migration.sql',
  b2: 'docs/test-environment/03d3c2_b2_sequence_migration.sql',
  doc: 'docs/ISOLATION_03D3C2_B3.md',
  preflight: 'docs/test-environment/03d3c2_b3_policy_preflight.sql',
  immediate: 'docs/test-environment/03d3c2_b3_roles_preflight.sql',
  migration: 'docs/test-environment/03d3c2_b3_roles_migration.sql',
  postverify: 'docs/test-environment/03d3c2_b3_roles_postverify.sql',
  rollback: 'docs/test-environment/03d3c2_b3_roles_rollback.sql'
});
// Reviewed identities, not a predicate selecting all PUBLIC policies.
export const ALLOWLIST = Object.freeze([
  'public.anexos.Users can delete their own anexos',
  'public.anexos.Users can insert their own anexos',
  'public.anexos.Users can select their own anexos',
  'public.anexos.Users can update their own anexos',
  'public.examen_generation_items.Users can insert their own exam generation items',
  'public.examen_generation_items.Users can read their own exam generation items',
  'public.examen_generation_jobs.Users can insert their own exam generation jobs',
  'public.examen_generation_jobs.Users can read their own exam generation jobs',
  'public.examen_generation_jobs.Users can update their own exam generation jobs',
  'public.examenes.Users can delete their own examenes',
  'public.examenes.Users can view their own examenes',
  'public.grados.grados_owner',
  'public.listas_cotejo.Users can delete their own listas de cotejo',
  'public.listas_cotejo.Users can insert their own listas de cotejo',
  'public.listas_cotejo.Users can read their own listas de cotejo',
  'public.listas_cotejo.Users can update their own listas de cotejo',
  'public.materias.materias_owner',
  'public.planeacion_batches.Users can delete own planeacion batches',
  'public.planeacion_batches.Users can select own planeacion batches',
  'public.planeaciones.delete own planeaciones',
  'public.planeaciones.insert own planeaciones',
  'public.planeaciones.planeaciones_owner',
  'public.planeaciones.select own planeaciones',
  'public.planeaciones.update own planeaciones',
  'public.planteles.planteles_owner',
  'public.unidades.unidades_owner'
]);
export function priorClassification(p) {
  if (p.table === 'ai_model_prices') return 'ALREADY_AUTHENTICATED';
  if (ALLOWLIST.includes(`${p.schema}.${p.table}.${p.name}`)) {
    return p.command === 'INSERT' && ['examen_generation_jobs','examen_generation_items'].includes(p.table) ? 'NARROW_CANDIDATE' : 'DECISION_REQUIRED';
  }
  return 'LEGACY_OR_DEFERRED';
}
export const CLASSES = Object.freeze(['NARROW_CANDIDATE', 'KEEP_PUBLIC', 'ALREADY_AUTHENTICATED', 'DECISION_REQUIRED', 'LEGACY_OR_DEFERRED']);
const norm = s => s.replace(/\s+/g, ' ').trim();
const lf = s => s.replace(/\r\n/g, '\n');
const key = p => `${p.schema}.${p.table}.${p.name}`;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fields = ['schema', 'table', 'name', 'command', 'permissive', 'roles', 'using', 'check'];
const definition = p => fields.map(k => p[k]);
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const literal = s => s === null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;

// Deliberately bounded grammar: unsupported future policy syntax stops the audit.
export function parseOwners(source, b0, b2) {
  const statements = splitSqlStatements(source);
  const tables = statements.flatMap(s => {
    const m = s.match(/^CREATE TABLE "public"\."([a-z_]+)" /);
    return m ? [m[1]] : [];
  }).sort(cmp);
  const policies = [];
  for (const s of statements.filter(s => /^CREATE POLICY\b/i.test(s))) {
    const m = s.match(/^CREATE POLICY "([^"]+)" ON "([^"]+)"\."([^"]+)" AS (PERMISSIVE|RESTRICTIVE) FOR (ALL|SELECT|INSERT|UPDATE|DELETE) TO (PUBLIC|"authenticated")(.*)$/);
    if (!m) throw Error('Unsupported policy owner syntax');
    if (m[2] !== 'public') continue;
    let tail = m[7], using = null, check = null;
    for (const clause of ['USING', 'WITH CHECK']) {
      if (!tail.startsWith(` ${clause} (`)) continue;
      const start = clause.length + 2;
      let depth = 0, end = start;
      for (; end < tail.length; end++) {
        if (tail[end] === '(') depth++;
        if (tail[end] === ')' && --depth === 0) break;
      }
      if (depth !== 0) throw Error('Unbalanced policy expression');
      const expression = norm(tail.slice(start + 1, end));
      if (clause === 'USING') using = expression; else check = expression;
      tail = tail.slice(end + 1);
    }
    if (tail.trim()) throw Error('Unparsed policy expression');
    policies.push({schema: m[2], table: m[3], name: m[1], command: m[5], permissive: m[4], roles: [m[6] === 'PUBLIC' ? 'public' : 'authenticated'], using, check});
  }
  const grants = new Map();
  for (const s of statements) {
    const m = s.match(/^GRANT ([A-Z, ]+) ON TABLE "public"\."([a-z_]+)" TO "([a-z_]+)"$/);
    if (m) for (const op of m[1].split(', ')) grants.set(`${m[2]}|${m[3]}|${op}`, true);
  }
  for (const s of splitSqlStatements(b0)) {
    if (!/^REVOKE .*ON TABLE /s.test(s)) continue;
    const m = norm(s).match(/^REVOKE ([A-Z, ]+) ON TABLE (.+) FROM (anon|authenticated)$/);
    if (!m) throw Error('Unsupported B0 table revocation');
    for (const table of m[2].split(/,\s*/)) for (const op of m[1].split(', ')) {
      const id = `${table.replace(/^public\./, '')}|${m[3]}|${op}`;
      if (!grants.delete(id)) throw Error('B0 revoke has no source grant');
    }
  }
  const b2s = splitSqlStatements(b2).map(norm);
  if (JSON.stringify(b2s) !== JSON.stringify(['BEGIN', 'REVOKE SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq FROM authenticated', 'REVOKE SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq FROM service_role', 'COMMIT'])) throw Error('B2 owner changed');
  for (const table of tables) {
    for (const action of ['ENABLE', 'NO FORCE']) if (!source.includes(`ALTER TABLE "public"."${table}" ${action} ROW LEVEL SECURITY;`)) throw Error('RLS source changed');
  }
  return {tables, policies: policies.sort((a,b) => cmp(key(a),key(b))), grants: [...grants.keys()].sort(cmp)};
}

export function fingerprint(policies) {
  return md5([...policies].sort((a,b) => cmp(key(a), key(b))).map(p => definition(p).map(v => v === null ? '<NULL>' : Array.isArray(v) ? [...v].sort(cmp).join(',') : v).join('|')).join('\n'));
}

export function inventoryFromDoc(doc) {
  const matches = [...doc.matchAll(/<!-- B3-INVENTORY -->\s*```json\s*([\s\S]*?)```\s*<!-- \/B3-INVENTORY -->/g)];
  if (matches.length !== 1) throw Error('Exactly one declarative inventory required');
  return JSON.parse(matches[0][1]);
}

export function validateInventory(owner, rows) {
  const errors = [];
  if (owner.tables.length !== 19 || new Set(owner.tables).size !== 19) errors.push('19 unique source tables required');
  if (owner.policies.length !== 49 || new Set(owner.policies.map(key)).size !== 49) errors.push('49 unique source policies required');
  if (rows.length !== 49 || new Set(rows.map(key)).size !== 49) errors.push('49 unique inventory policies required');
  const source = new Map(owner.policies.map(p => [key(p),p]));
  for (const row of rows) {
    if (JSON.stringify(definition(row)) !== JSON.stringify(definition(source.get(key(row)) || {}))) errors.push(`Owner mismatch: ${key(row)}`);
    if (!CLASSES.includes(row.classification)) errors.push(`Invalid classification: ${key(row)}`);
    for (const field of ['operation', 'production', 'tests', 'authority', 'justification', 'role_effect', 'regression', 'conceptual_reversal']) if (typeof row[field] !== 'string' || !row[field].trim()) errors.push(`Missing ${field}: ${key(row)}`);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const expected = owner.grants.filter(g => g.startsWith(`${row.table}|${role}|`)).map(g => g.split('|')[2]);
      if (JSON.stringify(row.grants?.[role]) !== JSON.stringify(expected)) errors.push(`Grant mismatch: ${key(row)}:${role}`);
    }
    const eligible = ALLOWLIST.includes(key(row));
    if (row.previous_classification !== priorClassification(row)) errors.push(`Invalid previous classification: ${key(row)}`);
    const next = eligible ? 'NARROW_CANDIDATE' : row.table === 'ai_model_prices' ? 'ALREADY_AUTHENTICATED' : 'LEGACY_OR_DEFERRED';
    if (row.classification !== next || row.future_allowlist !== eligible) errors.push(`Invalid transition/allowlist: ${key(row)}`);
    for (const field of ['decision_reason','non_bypass_consumer','wave']) if (!row[field]?.trim()) errors.push(`Missing decision field ${field}: ${key(row)}`);
    if (eligible && (row.non_bypass_consumer !== 'authenticated' || row.anon_dependency !== false || !row.authority.includes('BYPASSRLS observado') || !row.regression.includes('03D'))) errors.push(`Insufficient candidate evidence: ${key(row)}`);
    if (row.classification === 'KEEP_PUBLIC' && !row.other_role_evidence) errors.push(`Missing other-role contract: ${key(row)}`);
    if (row.classification === 'ALREADY_AUTHENTICATED' && JSON.stringify(row.roles) !== '["authenticated"]') errors.push('Already-authenticated role mismatch');
  }
  if (rows.filter(p => JSON.stringify(p.roles) === '["public"]').length !== 48 || rows.filter(p => JSON.stringify(p.roles) === '["authenticated"]').length !== 1) errors.push('Expected 48 PUBLIC / 1 authenticated');
  for (const p of owner.policies) if (!rows.some(r => key(r) === key(p))) errors.push(`Missing policy: ${key(p)}`);
  if (ALLOWLIST.length !== 26 || new Set(ALLOWLIST).size !== 26 || ALLOWLIST.some(k => !source.has(k))) errors.push('Exact 26-policy allowlist required');
  return errors;
}

export function buildPreflight(owner, rows) {
  const tableValues = owner.tables.map(t => `    (${literal(t)})`).join(',\n');
  const policyValues = owner.policies.map(p => `    (${definition(p).map(v => Array.isArray(v) ? `ARRAY[${v.map(literal).join(',')}]::text[]` : literal(v)).join(',')})`).join(',\n');
  const grantValues = owner.grants.map(g => `    (${g.split('|').map(literal).join(',')})`).join(',\n');
  const classValues = rows.map(p => `    (${literal(p.table)},${literal(p.name)},${literal(p.classification)})`).join(',\n');
  return `-- 03D3C2-B3: catalog metadata only; offline preparation, no execution authorized.
-- Fingerprint includes schema, table, exact name, command, permissiveness, roles,
-- USING and WITH CHECK. NULL is distinct from an empty expression.
WITH RECURSIVE expected_tables(table_name) AS (VALUES
${tableValues}
), expected_policies(schema_name,table_name,policy_name,command,permissive,roles,using_expr,check_expr) AS (VALUES
${policyValues}
), proposed_classification(table_name,policy_name,classification) AS (VALUES
${classValues}
), expected_acl(table_name,role_name,privilege) AS (VALUES
${grantValues}
), tables AS (
  SELECT c.oid,c.relname::text AS table_name,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), policies AS (
  SELECT p.schemaname::text AS schema_name,p.tablename::text AS table_name,
    p.policyname::text AS policy_name,p.cmd::text AS command,p.permissive::text AS permissive,
    ARRAY(SELECT role_name::text FROM pg_catalog.unnest(p.roles) role_name ORDER BY role_name::text COLLATE "C") AS roles,
    btrim(regexp_replace(p.qual,'[[:space:]]+',' ','g')) AS using_expr,
    btrim(regexp_replace(p.with_check,'[[:space:]]+',' ','g')) AS check_expr
  FROM pg_catalog.pg_policies p WHERE p.schemaname='public'
), missing_policies AS (
  SELECT * FROM expected_policies EXCEPT SELECT * FROM policies
), additional_policies AS (
  SELECT * FROM policies EXCEPT SELECT * FROM expected_policies
), observed_fingerprint AS (
  SELECT md5(string_agg(schema_name||'|'||table_name||'|'||policy_name||'|'||command||'|'||permissive||'|'||
    array_to_string(roles,',')||'|'||coalesce(using_expr,'<NULL>')||'|'||coalesce(check_expr,'<NULL>'),E'\\n'
    ORDER BY schema_name COLLATE "C",table_name COLLATE "C",policy_name COLLATE "C")) AS full_md5 FROM policies
), acl AS (
  SELECT t.table_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,
    x.privilege_type::text AS privilege,g.rolname::text AS grantor,x.is_grantable
  FROM tables t CROSS JOIN LATERAL pg_catalog.aclexplode(t.relacl) x
  LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee LEFT JOIN pg_catalog.pg_roles g ON g.oid=x.grantor
), runtime_roles(role_name) AS (VALUES ('anon'),('authenticated'),('service_role')),
privileges(privilege) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')),
effective AS (
  SELECT t.table_name,r.role_name,p.privilege,
    EXISTS(SELECT 1 FROM acl a WHERE (a.table_name,a.role_name,a.privilege)=(t.table_name,r.role_name,p.privilege)) AS direct_grant,
    CASE WHEN p.privilege='MAINTAIN' AND current_setting('server_version_num')::integer<170000 THEN false
      ELSE pg_catalog.has_table_privilege(pr.oid,t.oid,p.privilege) END AS effective_grant,
    EXISTS(SELECT 1 FROM expected_acl e WHERE (e.table_name,e.role_name,e.privilege)=(t.table_name,r.role_name,p.privilege)) AS expected_grant
  FROM tables t CROSS JOIN runtime_roles r CROSS JOIN privileges p
  LEFT JOIN pg_catalog.pg_roles pr ON pr.rolname::text=r.role_name
), membership(root,member_oid,role_oid,depth,visited,admin_option) AS (
  SELECT r.rolname::text,m.member,m.roleid,1,ARRAY[m.member,m.roleid],m.admin_option
  FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
  WHERE r.rolname::text IN ('anon','authenticated','service_role')
  UNION ALL
  SELECT w.root,m.member,m.roleid,w.depth+1,w.visited||m.roleid,m.admin_option
  FROM membership w JOIN pg_catalog.pg_auth_members m ON m.member=w.role_oid
  WHERE NOT m.roleid=ANY(w.visited)
), role_attributes AS (
  SELECT r.rolname::text AS role_name,r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcanlogin
  FROM pg_catalog.pg_roles r WHERE r.rolname::text IN ('anon','authenticated','service_role','postgres',current_user,session_user)
    OR r.oid IN (SELECT relowner FROM tables UNION SELECT role_oid FROM membership)
), seq AS (
  SELECT c.oid,c.relowner,c.relacl,c.relname::text AS sequence_name
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='S'
), seq_acl AS (
  SELECT s.sequence_name,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname::text END AS role_name,
    x.privilege_type::text AS privilege,g.rolname::text AS grantor,x.is_grantable
  FROM seq s CROSS JOIN LATERAL pg_catalog.aclexplode(s.relacl) x
  LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee LEFT JOIN pg_catalog.pg_roles g ON g.oid=x.grantor
), expected_seq(role_name,privilege) AS (VALUES
  ('authenticated','USAGE'),('service_role','USAGE'),('postgres','SELECT'),('postgres','UPDATE'),('postgres','USAGE')
), predicates AS (
  SELECT
    current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS version_test_ok,
    current_user='postgres' AND session_user='postgres' AS session_authority_ok,
    (SELECT count(*)=19 FROM tables) AND NOT EXISTS(SELECT table_name FROM tables EXCEPT SELECT table_name FROM expected_tables)
      AND NOT EXISTS(SELECT table_name FROM expected_tables EXCEPT SELECT table_name FROM tables) AS tables_exact,
    (SELECT count(*)=49 FROM policies) AND NOT EXISTS(SELECT 1 FROM missing_policies)
      AND NOT EXISTS(SELECT 1 FROM additional_policies) AND (SELECT full_md5=${literal(fingerprint(owner.policies))} FROM observed_fingerprint) AS policies_exact,
    (SELECT count(*) FILTER(WHERE roles=ARRAY['public']::text[])=48 AND count(*) FILTER(WHERE roles=ARRAY['authenticated']::text[])=1 FROM policies) AS policy_roles_exact,
    (SELECT count(*)=19 AND bool_and(relrowsecurity) AND NOT bool_or(relforcerowsecurity) FROM tables) AS rls_and_force_exact,
    (SELECT count(*)=19 AND bool_and(pg_catalog.pg_get_userbyid(relowner)::text='postgres') FROM tables) AS table_owners_exact,
    NOT EXISTS(SELECT table_name,role_name,privilege FROM acl EXCEPT SELECT * FROM expected_acl)
      AND NOT EXISTS(SELECT * FROM expected_acl EXCEPT SELECT table_name,role_name,privilege FROM acl)
      AND NOT EXISTS(SELECT 1 FROM acl WHERE grantor IS DISTINCT FROM 'postgres' OR is_grantable)
      AND (SELECT count(*)=456 FROM effective)
      AND NOT EXISTS(SELECT 1 FROM effective WHERE direct_grant IS DISTINCT FROM expected_grant OR effective_grant IS DISTINCT FROM expected_grant) AS post_b0_grants_exact,
    NOT EXISTS(SELECT 1 FROM membership) AS runtime_memberships_absent,
    (SELECT count(*)=3 FROM role_attributes WHERE role_name IN ('anon','authenticated','service_role')) AS runtime_roles_present,
    (SELECT count(*)=2 AND bool_and(NOT rolsuper AND NOT rolbypassrls) FROM role_attributes WHERE role_name IN ('anon','authenticated')) AS user_roles_subject_to_rls,
    coalesce((SELECT rolbypassrls OR rolsuper FROM role_attributes WHERE role_name='service_role'),false) AS service_role_bypass_observed,
    (SELECT count(*)=1 AND bool_and(sequence_name='planeaciones_id_seq' AND pg_catalog.pg_get_userbyid(relowner)::text='postgres') FROM seq)
      AND NOT EXISTS(SELECT role_name,privilege FROM seq_acl EXCEPT SELECT * FROM expected_seq)
      AND NOT EXISTS(SELECT * FROM expected_seq EXCEPT SELECT role_name,privilege FROM seq_acl)
      AND NOT EXISTS(SELECT 1 FROM seq_acl WHERE grantor IS DISTINCT FROM 'postgres' OR is_grantable)
      AND NOT EXISTS(SELECT 1 FROM seq s CROSS JOIN runtime_roles r CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) p(privilege)
        LEFT JOIN pg_catalog.pg_roles pr ON pr.rolname::text=r.role_name
        WHERE pg_catalog.has_sequence_privilege(pr.oid,s.oid,p.privilege) IS DISTINCT FROM (r.role_name<>'anon' AND p.privilege='USAGE')) AS post_b2_sequence_exact
), classification_counts AS (
  SELECT c.classification,count(p.classification)::integer AS proposed_count
  FROM (VALUES ${CLASSES.map(c => `(${literal(c)})`).join(',')}) c(classification)
  LEFT JOIN proposed_classification p USING(classification) GROUP BY c.classification
)
SELECT jsonb_build_object(
  'session',jsonb_build_object('server_version_num',current_setting('server_version_num'),'current_user',current_user,'session_user',session_user),
  'policies',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity) ORDER BY p.table_name,p.policy_name) FROM policies p LEFT JOIN tables t USING(table_name)),'[]'::jsonb),
  'table_grants_direct',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY table_name,role_name,privilege) FROM acl a),'[]'::jsonb),
  'table_grants_effective',coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('inherited_or_public_effect',effective_grant AND NOT direct_grant) ORDER BY table_name,role_name,privilege) FROM effective e),'[]'::jsonb),
  'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('root',root,'member',pg_catalog.pg_get_userbyid(member_oid)::text,'role',pg_catalog.pg_get_userbyid(role_oid)::text,'depth',depth,'direct',depth=1,'admin_option',admin_option) ORDER BY root,depth,role_oid) FROM membership),'[]'::jsonb),
  'role_attributes',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY role_name) FROM role_attributes r),'[]'::jsonb),
  'table_owners',coalesce((SELECT jsonb_agg(jsonb_build_object('table',table_name,'owner',pg_catalog.pg_get_userbyid(relowner)::text,'rls',relrowsecurity,'force_rls',relforcerowsecurity) ORDER BY table_name) FROM tables),'[]'::jsonb),
  'sequence_grants',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY role_name,privilege) FROM seq_acl s),'[]'::jsonb),
  'summary',(SELECT to_jsonb(p)||jsonb_build_object('table_count',(SELECT count(*) FROM tables),'policy_count',(SELECT count(*) FROM policies),
    'public_policy_count',(SELECT count(*) FROM policies WHERE roles=ARRAY['public']::text[]),
    'authenticated_policy_count',(SELECT count(*) FROM policies WHERE roles=ARRAY['authenticated']::text[]),
    'rls_enabled_count',(SELECT count(*) FROM tables WHERE relrowsecurity),'force_rls_count',(SELECT count(*) FROM tables WHERE relforcerowsecurity),
    'missing_or_changed',(SELECT count(*) FROM missing_policies),'additional_or_changed',(SELECT count(*) FROM additional_policies),
    'expected_full_md5',${literal(fingerprint(owner.policies))},'observed_full_md5',(SELECT full_md5 FROM observed_fingerprint),
    'classification_counts',(SELECT jsonb_object_agg(classification,proposed_count) FROM classification_counts),
    'catalog_context_matches',coalesce(version_test_ok AND session_authority_ok AND tables_exact AND policies_exact AND policy_roles_exact AND rls_and_force_exact AND table_owners_exact AND post_b0_grants_exact AND runtime_memberships_absent AND runtime_roles_present AND user_roles_subject_to_rls AND service_role_bypass_observed AND post_b2_sequence_exact,false),
    'apt_to_apply',false) FROM predicates p)
) AS b3_readonly_audit;
`;
}

export function transitionPolicies(policies, direction = 'after') {
  if (!['after','rollback'].includes(direction)) throw Error('Unknown role transition');
  if (policies.length !== 49 || new Set(policies.map(key)).size !== 49 || ALLOWLIST.some(k => !policies.some(p => key(p) === k))) throw Error('Transition manifest mismatch');
  return policies.map(p => ({...p, roles: ALLOWLIST.includes(key(p)) ? [direction === 'after' ? 'authenticated' : 'public'] : [...p.roles]}));
}

export function buildMutation(owner, rollback = false) {
  const quote = s => `"${s.replace(/"/g, '""')}"`;
  const byKey = new Map(owner.policies.map(p => [key(p),p]));
  if (ALLOWLIST.some(k => !byKey.has(k))) throw Error('Missing allowlisted policy');
  return `-- B3 roles only; prepared offline, NOT EXECUTED. Test only after immediate preflight approval.\nBEGIN;\n${ALLOWLIST.map(k => {
    const p = byKey.get(k);
    return `ALTER POLICY ${quote(p.name)} ON ${quote(p.schema)}.${quote(p.table)} TO ${rollback ? 'PUBLIC' : 'authenticated'};`;
  }).join('\n')}\nCOMMIT;\n`;
}

export const IMMEDIATE_PREDICATES = Object.freeze([
  'version_test_ok','session_authority_ok','tables_exact','policies_exact','policy_roles_exact',
  'rls_and_force_exact','table_owners_exact','post_b0_grants_exact','runtime_memberships_absent',
  'runtime_roles_present','user_roles_subject_to_rls','service_role_bypass_observed',
  'post_b2_sequence_exact','sequence_structure_exact','functions_exact','triggers_exact','bypass_exact','allowlist_exact'
]);

// Pure interpretation of a future catalog result; does not obtain or execute SQL.
export function immediateApproval(result, owner) {
  try {
  const s=result?.summary;
  if (!s || !IMMEDIATE_PREDICATES.every(k=>s[k]===true) || s.catalog_context_matches!==true || s.apt_to_apply!==true) return false;
  if (s.table_count!==19 || s.policy_count!==49 || s.public_policy_count!==48 || s.authenticated_policy_count!==1 || s.rls_enabled_count!==19 || s.force_rls_count!==0 || s.missing_or_changed!==0 || s.additional_or_changed!==0) return false;
  if (s.expected_full_md5!==fingerprint(owner.policies) || s.observed_full_md5!==s.expected_full_md5) return false;
  const allow=result.allowlist?.map(p=>`${p.schema_name}.${p.table_name}.${p.policy_name}`).sort();
  if (JSON.stringify(allow)!==JSON.stringify([...ALLOWLIST].sort())) return false;
  if (!Array.isArray(result.policies)) return false;
  const policies=result.policies.map(p=>({schema:p.schema_name,table:p.table_name,name:p.policy_name,command:p.command,permissive:p.permissive,roles:p.roles,using:p.using_expr,check:p.check_expr}));
  if (policies.length!==49 || new Set(policies.map(key)).size!==49 || fingerprint(policies)!==fingerprint(owner.policies)) return false;
  const roles=result.role_attributes;
  if (!Array.isArray(roles) || !['anon','authenticated','service_role','postgres'].every(name=>{
    const found=roles.filter(r=>r.role_name===name);
    return found.length===1 && found[0].rolbypassrls===['service_role','postgres'].includes(name);
  })) return false;
  return Array.isArray(result.memberships) && result.memberships.length===0;
  } catch { return false; }
}

function replaceOnce(text, from, to) {
  if (text.split(from).length !== 2) throw Error('Read-only template anchor mismatch');
  return text.replace(from,to);
}

// Extends the preserved audit query with exact C1 invariants and the reviewed role delta.
export function buildRolePreflight(owner, rows, source, after = false) {
  const errors = validateInventory(owner, rows);
  if (errors.length) throw Error(errors.join('; '));
  const target = {...owner, policies: after ? transitionPolicies(owner.policies) : owner.policies};
  let sql = buildPreflight(target,rows);
  sql = replaceOnce(sql,'-- 03D3C2-B3: catalog metadata only; offline preparation, no execution authorized.',
    `-- B3 immediate ${after ? 'postverify' : 'preflight'}: catalog-only, PG17 TEST. Prepared offline, NOT EXECUTED.`);
  const hashes = fingerprintVersionedFunctionBodies(source);
  const funcs = Object.entries(hashes).map(([name,hash]) => `(${literal(name)},${literal(hash)},${name === 'handle_new_user'},${name === 'handle_new_user' ? "ARRAY['search_path=pg_catalog, public']::text[]" : 'NULL::text[]'})`).join(',\n');
  const triggers = [...source.matchAll(/^CREATE TRIGGER (\w+) (AFTER INSERT|BEFORE UPDATE|BEFORE INSERT OR UPDATE) ON (\w+)\.(\w+) FOR EACH ROW EXECUTE FUNCTION public\.(\w+)\(\);/gm)];
  if (triggers.length !== 16) throw Error('Expected 16 source triggers');
  const triggerValues = triggers.map(([,name,event,schema,table,fn]) => `(${[schema,table,name,fn].map(literal).join(',')},${event === 'AFTER INSERT' ? 5 : event === 'BEFORE UPDATE' ? 19 : 23})`).join(',\n');
  const allow = ALLOWLIST.map(k => {const p=owner.policies.find(p=>key(p)===k);return `(${literal(p.schema)},${literal(p.table)},${literal(p.name)})`;}).join(',\n');
  const extra = `), allowlist(schema_name,table_name,policy_name) AS (VALUES
${allow}
), expected_functions(name,body_md5,security_definer,config) AS (VALUES
${funcs}
), actual_functions AS (
  SELECT p.*,n.nspname::text AS schema_name,l.lanname::text AS language_name
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d
    WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
), functions_check AS (
  SELECT (SELECT count(*)=6 FROM actual_functions) AND count(*)=6 AND coalesce(bool_and(
    p.oid IS NOT NULL AND pg_catalog.pg_get_userbyid(p.proowner)::text='postgres'
    AND p.language_name='plpgsql' AND p.prorettype='pg_catalog.trigger'::regtype
    AND p.pronargs=0 AND p.pronargdefaults=0 AND p.provariadic=0 AND p.prosupport=0
    AND NOT p.proisstrict AND NOT p.proleakproof AND NOT p.proretset
    AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
    AND p.prosecdef=e.security_definer AND p.proconfig IS NOT DISTINCT FROM e.config AND md5(p.prosrc)=e.body_md5
    AND pg_catalog.has_function_privilege('postgres',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    AND (SELECT count(*)=1 AND bool_and(x.grantee=p.proowner AND x.grantor=p.proowner
      AND x.privilege_type='EXECUTE' AND NOT x.is_grantable) FROM pg_catalog.aclexplode(p.proacl) x)
  ),false) AS functions_exact
  FROM expected_functions e LEFT JOIN actual_functions p ON p.proname::text=e.name
), expected_triggers(schema_name,table_name,trigger_name,function_name,tgtype) AS (VALUES
${triggerValues}
), actual_triggers AS (
  SELECT n.nspname::text AS schema_name,c.relname::text AS table_name,t.tgname::text AS trigger_name,
    p.proname::text AS function_name,t.tgtype::integer AS tgtype,
    t.tgenabled='O' AND pn.nspname='public' AND p.pronargs=0 AND t.tgqual IS NULL
    AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgattr::text=''
    AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgconstraint=0 AND t.tgparentid=0
    AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS attributes_exact
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
  WHERE NOT t.tgisinternal AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users'))
), triggers_check AS (
  SELECT (SELECT count(*)=16 AND bool_and(attributes_exact) FROM actual_triggers)
    AND NOT EXISTS(SELECT * FROM expected_triggers EXCEPT SELECT schema_name,table_name,trigger_name,function_name,tgtype FROM actual_triggers)
    AND NOT EXISTS(SELECT schema_name,table_name,trigger_name,function_name,tgtype FROM actual_triggers EXCEPT SELECT * FROM expected_triggers) AS triggers_exact
), predicates AS (`;
  sql = replaceOnce(sql,'), predicates AS (',extra);
  const newPredicates = `
    (SELECT count(*)=1 AND bool_and(q.seqtypid='pg_catalog.int8'::regtype AND q.seqstart=1
      AND q.seqincrement=1 AND q.seqmin=1 AND q.seqmax=9223372036854775807 AND q.seqcache=1 AND NOT q.seqcycle)
      FROM seq s JOIN pg_catalog.pg_sequence q ON q.seqrelid=s.oid)
      AND (SELECT count(*)=1 AND bool_and(n.nspname='public' AND t.relname='planeaciones'
        AND a.attname='id' AND a.attidentity='d' AND a.atttypid='pg_catalog.int8'::regtype AND NOT a.attisdropped)
        FROM seq s JOIN pg_catalog.pg_depend d ON d.objid=s.oid AND d.classid='pg_catalog.pg_class'::regclass
          AND d.refclassid='pg_catalog.pg_class'::regclass AND d.deptype='i'
        JOIN pg_catalog.pg_class t ON t.oid=d.refobjid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid) AS sequence_structure_exact,
    (SELECT functions_exact FROM functions_check) AS functions_exact,
    (SELECT triggers_exact FROM triggers_check) AS triggers_exact,
    (SELECT count(*)=4 AND bool_and(rolbypassrls=(role_name IN ('postgres','service_role')))
      FROM role_attributes WHERE role_name IN ('anon','authenticated','service_role','postgres')) AS bypass_exact,
    (SELECT count(*)=26 FROM allowlist)
      AND NOT EXISTS(SELECT table_name,policy_name FROM allowlist EXCEPT SELECT table_name,policy_name FROM proposed_classification WHERE classification='NARROW_CANDIDATE')
      AND NOT EXISTS(SELECT table_name,policy_name FROM proposed_classification WHERE classification='NARROW_CANDIDATE' EXCEPT SELECT table_name,policy_name FROM allowlist)
      AND NOT EXISTS(SELECT 1 FROM proposed_classification WHERE classification='DECISION_REQUIRED') AS allowlist_exact,
`;
  sql = replaceOnce(sql,'), predicates AS (\n  SELECT\n',`), predicates AS (\n  SELECT${newPredicates}`);
  if (after) sql = replaceOnce(sql,"=48 AND count(*) FILTER(WHERE roles=ARRAY['authenticated']::text[])=1", "=22 AND count(*) FILTER(WHERE roles=ARRAY['authenticated']::text[])=27");
  sql = replaceOnce(sql,'AND post_b2_sequence_exact,false)', 'AND post_b2_sequence_exact AND sequence_structure_exact AND functions_exact AND triggers_exact AND bypass_exact AND allowlist_exact,false)');
  const gate = `coalesce(${IMMEDIATE_PREDICATES.join(' AND ')},false)`;
  sql = replaceOnce(sql,"'apt_to_apply',false",after ? `'postverify_ok',${gate},'apt_to_apply',false` : `'apt_to_apply',${gate}`);
  sql = replaceOnce(sql,"  'session',jsonb_build_object",`  'allowlist',(SELECT jsonb_agg(to_jsonb(a) ORDER BY table_name,policy_name) FROM allowlist a),
  'session',jsonb_build_object`);
  return sql;
}

export function validateAudit(files) {
  try {
    const owner = parseOwners(files.source, files.b0, files.b2), rows = inventoryFromDoc(files.doc);
    const errors = validateInventory(owner, rows);
    const historicalRows=rows.map(r=>({...r,classification:r.previous_classification}));
    if (lf(files.preflight) !== buildPreflight(owner, historicalRows)) errors.push('Historical audit preflight changed');
    const statements = splitSqlStatements(files.preflight);
    if (statements.length !== 1 || !/^WITH RECURSIVE\b/.test(statements[0])) errors.push('One catalog SELECT required');
    if (/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|DO|CALL|COPY|EXECUTE|SET|INTO|LOCK)\b/i.test(scanSql(files.preflight))) errors.push('Mutating SQL forbidden');
    if (!errors.length) {
      for (const [name,expected] of Object.entries({immediate:buildRolePreflight(owner,rows,files.source),postverify:buildRolePreflight(owner,rows,files.source,true),migration:buildMutation(owner),rollback:buildMutation(owner,true)})) {
        if (lf(files[name] || '') !== expected) errors.push(`Exact package mismatch: ${name}`);
      }
    }
    for (const name of ['immediate','postverify']) {
      const sql=files[name] || '';
      if (splitSqlStatements(sql).length !== 1 || /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|DO|CALL|COPY|EXECUTE|SET|INTO|LOCK)\b/i.test(scanSql(sql))) errors.push(`Read-only required: ${name}`);
    }
    return {errors, tables: owner.tables.length, policies: rows.length, fingerprint: fingerprint(owner.policies), afterFingerprint:fingerprint(transitionPolicies(owner.policies)), rollbackFingerprint:fingerprint(transitionPolicies(transitionPolicies(owner.policies),'rollback')), classifications: Object.fromEntries(CLASSES.map(c => [c, rows.filter(r => r.classification === c).length])), allowlistCount:ALLOWLIST.length, apt_to_apply: false};
  } catch (error) { return {errors: [error.message], apt_to_apply: false}; }
}

// Importing has no filesystem/network/environment/timer effects. Explicit CLI reads only.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = Object.fromEntries(Object.entries(FILES).map(([k,v]) => [k,fs.readFileSync(path.join(root,v),'utf8')]));
  const result = validateAudit(files);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.errors.length) process.exitCode = 1;
}
