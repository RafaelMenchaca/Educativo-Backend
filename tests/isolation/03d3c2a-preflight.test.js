import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_GRANTORS, SQL_PATH, TABLES, ROLES, TABLE_PRIVILEGES,
  assessLiveEvidence, expectedMatrixForVersion, validateSql,
} from "../../scripts/validate-03d3c2a-preflight.js";

const sql = fs.readFileSync(SQL_PATH, "utf8");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const initializer = fs.readFileSync(path.join(root, "docs/test-environment/initialize_application.sql"), "utf8");
const scope = fs.readFileSync(path.join(root, "docs/ISOLATION_03D3C2A.md"), "utf8");

test("preflight covers seven read-only statements and the portable matrix", () => {
  const result = validateSql(sql);
  assert.deepEqual(result.errors, []);
  assert.equal(result.statements, 7);
  assert.equal(TABLES.length, 19);
  assert.deepEqual(ROLES, ["PUBLIC", "anon", "authenticated", "service_role", "postgres"]);
  assert.equal(TABLE_PRIVILEGES.length, 7);
});

test("preflight is read-only and imports do not perform I/O", () => {
  const executable = sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
  assert.doesNotMatch(executable, /\b(?:ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|CALL|DO)\b/i);
  assert.doesNotMatch(sql, /pg_get_functiondef|\bprosrc\b|auth\.users|storage\.objects/i);
});

test("catalog name arrays use element-level text conversion", () => {
  assert.match(sql, /array_agg\(DISTINCT grantor\.rolname::text ORDER BY grantor\.rolname::text\)/);
  assert.match(sql, /ARRAY\(SELECT role_name::text FROM unnest\(roles\)/);
  assert.doesNotMatch(sql, /array_agg\([^)]*rolname(?!::text)[^)]*\)/i);
});

test("validator rejects name-array regressions and mutation", () => {
  const vulnerable = sql.replace(/grantor\.rolname::text/g, "grantor.rolname");
  assert.ok(validateSql(vulnerable).errors.some((error) => error.includes("without an element-level")));
  const mutating = `${sql}\nREVOKE TRUNCATE ON public.planeaciones FROM anon;`;
  const result = validateSql(mutating);
  assert.ok(result.errors.some((error) => error.includes("non-read-only")));
  assert.ok(result.errors.some((error) => error.includes("expected 7")));
});

test("PG17 inventories MAINTAIN and PG15 reports it unsupported without invoking it", () => {
  assert.deepEqual(expectedMatrixForVersion(170006), {
    supported: true, baseRows: 665, maintainRows: 95, totalPrivilegeRows: 760,
  });
  assert.deepEqual(expectedMatrixForVersion(150008), {
    supported: true, baseRows: 665, maintainRows: 95, totalPrivilegeRows: 665, maintainStatus: "not_supported",
  });
  assert.doesNotMatch(sql, /has_table_privilege\s*\([^)]*MAINTAIN/is);
  assert.match(sql, /privilege_type::text='MAINTAIN'/);
  assert.match(sql, /THEN 'supported' ELSE 'not_supported'/);
});

test("unsupported versions and incomplete MAINTAIN fail closed", () => {
  assert.equal(expectedMatrixForVersion(160000).supported, false);
  const missing = sql.replace("privilege_type::text='MAINTAIN'", "privilege_type::text='OTHER'");
  assert.ok(validateSql(missing).errors.some((error) => error.includes("MAINTAIN")));
});

const completeEvidence = Object.freeze({
  serverVersionNum: 170006,
  basePrivilegeRows: 665,
  maintainRows: 95,
  policyRows: 49,
  uniquePolicies: 49,
  sequenceCount: 1,
  defaultPrivilegeRows: 96,
  defaultGrantors: ["postgres", "supabase_admin"],
  canAlterSupabaseAdminDefaults: true,
  anonOrAuthenticatedInPgMaintain: false,
  futureFunctionExecuteInventoried: true,
});

test("live-evidence posture blocks pg_maintain, extra grantors and missing authority", () => {
  assert.equal(assessLiveEvidence(completeEvidence).aptForB0, true);
  assert.deepEqual(
    assessLiveEvidence({ ...completeEvidence, anonOrAuthenticatedInPgMaintain: true }).blockers,
    ["runtime_role_has_pg_maintain"],
  );
  assert.deepEqual(
    assessLiveEvidence({ ...completeEvidence, defaultGrantors: [...DEFAULT_GRANTORS, "unexpected"] }).blockers,
    ["unexpected_default_grantor"],
  );
  assert.deepEqual(
    assessLiveEvidence({ ...completeEvidence, canAlterSupabaseAdminDefaults: false }).blockers,
    ["supabase_admin_authority_unproven"],
  );
});

test("default EXECUTE and the four consolidated live surfaces remain explicit", () => {
  assert.deepEqual(
    assessLiveEvidence({ ...completeEvidence, futureFunctionExecuteInventoried: false }).blockers,
    ["default_function_execute_uninventoried"],
  );
  assert.match(sql, /defaclobjtype::text AS object_type/);
  assert.match(sql, /current_user_can_alter_defaults/);
  assert.match(sql, /pg_catalog\.pg_auth_members/);
  assert.match(sql, /pg_maintain/);
});

test("versioned schema has 19 tables, 49 unique public policies and one public sequence", () => {
  const tables = [...initializer.matchAll(/CREATE TABLE "public"\."([^"]+)"/g)].map((match) => match[1]);
  const policies = [...initializer.matchAll(/CREATE POLICY "([^"]+)" ON "public"\."([^"]+)"/g)]
    .map((match) => `${match[2]}:${match[1]}`);
  const sequences = [...initializer.matchAll(/SEQUENCE NAME public\.([a-z0-9_]+)/g)].map((match) => match[1]);
  assert.equal(tables.length, 19);
  assert.deepEqual(new Set(tables), new Set(TABLES));
  assert.equal(policies.length, 49);
  assert.equal(new Set(policies).size, 49);
  assert.deepEqual(sequences, ["planeaciones_id_seq"]);
});

test("scope separates every package and decision class", () => {
  for (const packageId of ["B0", "B1", "B2", "B3", "B4"]) assert.match(scope, new RegExp(`03D3C2-${packageId}`));
  for (const decision of ["C1", "C2", "C3", "C4", "KEEP"]) assert.match(scope, new RegExp(`\\b${decision}\\b`));
  for (const table of TABLES) assert.ok(scope.includes(`\`${table}\``), `scope missing ${table}`);
});
