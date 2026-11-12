#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(currentDirectory, "../docs/test-environment/03d3c2a_acl_policy_preflight.sql");
const TABLES = Object.freeze([
  "ai_generation_calls", "ai_generation_jobs", "ai_model_prices", "anexos",
  "examen_generation_items", "examen_generation_jobs", "examenes", "grados",
  "ia_metrics_legacy", "listas_cotejo", "materias", "planeacion_batches",
  "planeaciones", "planteles", "profiles", "temas", "unidades", "user_profiles",
  "user_settings",
]);
const ROLES = Object.freeze(["PUBLIC", "anon", "authenticated", "service_role", "postgres"]);
const TABLE_PRIVILEGES = Object.freeze(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]);
const DEFAULT_GRANTORS = Object.freeze(["postgres", "supabase_admin"]);

function stripCommentsAndStrings(sql) {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
}

function splitStatements(sql) {
  const source = sql.replace(/--[^\r\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const out = [];
  let start = 0;
  let quote = false;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "'" && quote && source[i + 1] === "'") { i += 1; continue; }
    if (source[i] === "'") quote = !quote;
    if (source[i] === ";" && !quote) { out.push(source.slice(start, i + 1).trim()); start = i + 1; }
  }
  if (source.slice(start).trim()) out.push(source.slice(start).trim());
  return out.filter(Boolean);
}

function validateSql(sql) {
  const errors = [];
  const statements = splitStatements(sql);
  if (statements.length !== 7) errors.push(`expected 7 statements, found ${statements.length}`);
  const executable = stripCommentsAndStrings(sql);
  if (/\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|copy)\b/i.test(executable)) {
    errors.push("preflight contains a non-read-only command");
  }
  for (const table of TABLES) {
    if (!sql.includes(`('${table}')`)) errors.push(`missing table ${table}`);
  }
  for (const role of ROLES) {
    if (!sql.includes(`('${role}')`)) errors.push(`missing role ${role}`);
  }
  for (const privilege of TABLE_PRIVILEGES) {
    if (!sql.includes(`('${privilege}')`) && !sql.includes(`         ('${privilege}')`)) errors.push(`missing privilege ${privilege}`);
  }
  const aggregations = [...sql.matchAll(/array_agg\s*\(([\s\S]*?)\)/gi)].map((m) => m[1]);
  if (aggregations.length < 2) errors.push("catalog arrays are not inventoried");
  for (const expression of aggregations) {
    if (/rolname|attname|proname|nspname|relname|tgname/i.test(expression) && !/::text/i.test(expression)) {
      errors.push("catalog name is aggregated without an element-level ::text cast");
    }
  }
  if (/array_agg\s*\([^)]*(?:rolname|attname|proname|nspname|relname|tgname)[^)]*\)\s*=\s*array\s*\[/i.test(sql)) {
    errors.push("possible name[] = text[] comparison");
  }
  if (!/ARRAY\(SELECT role_name::text FROM unnest\(roles\)/.test(sql)) {
    errors.push("policy roles are not converted element-by-element to text");
  }
  if (!/server_version_num/.test(sql) || !/pg15_supported/.test(sql) || !/pg17_supported/.test(sql)) {
    errors.push("version gate is incomplete");
  }
  if (!/maintain_status/.test(sql) || !/not_supported/.test(sql) || !/privilege_type::text\s*=\s*'MAINTAIN'/.test(sql)) {
    errors.push("MAINTAIN inventory is incomplete");
  }
  if (/has_table_privilege\s*\([^)]*MAINTAIN/is.test(sql)) {
    errors.push("PG15-unsafe MAINTAIN privilege call");
  }
  for (const grantor of DEFAULT_GRANTORS) {
    if (!sql.includes(`('${grantor}')`)) errors.push(`missing default grantor ${grantor}`);
  }
  if (!/current_user_can_alter_defaults/.test(sql) || !/current_user::text=t\.role_name/.test(sql)
      || !/pg_catalog\.pg_has_role\(current_user,t\.role_name,'MEMBER'\)/.test(sql)) {
    errors.push("default privilege authority is not verified");
  }
  if (!/pg_catalog\.pg_auth_members/.test(sql) || !/pg_maintain/.test(sql)) {
    errors.push("predefined-role membership is not inventoried");
  }
  if (/pg_get_functiondef|\bprosrc\b|auth\.users|storage\.objects/i.test(sql)) {
    errors.push("preflight exposes an out-of-scope or sensitive catalog surface");
  }
  return { errors, statements: statements.length, tables: TABLES.length, roles: ROLES.length, privileges: TABLE_PRIVILEGES.length };
}

function expectedMatrixForVersion(serverVersionNum) {
  if (serverVersionNum >= 170000 && serverVersionNum < 180000) {
    return { supported: true, baseRows: 665, maintainRows: 95, totalPrivilegeRows: 760 };
  }
  if (serverVersionNum >= 150000 && serverVersionNum < 160000) {
    return { supported: true, baseRows: 665, maintainRows: 95, totalPrivilegeRows: 665, maintainStatus: "not_supported" };
  }
  return { supported: false, baseRows: 0, maintainRows: 0, totalPrivilegeRows: 0 };
}

function assessLiveEvidence(evidence) {
  const blockers = [];
  const expected = expectedMatrixForVersion(evidence.serverVersionNum);
  if (!expected.supported) blockers.push("unsupported_version");
  if (evidence.basePrivilegeRows !== 665) blockers.push("unexpected_base_matrix");
  if (evidence.maintainRows !== 95) blockers.push("maintain_not_inventoried");
  if (evidence.policyRows !== 49 || evidence.uniquePolicies !== 49) blockers.push("policy_drift");
  if (evidence.sequenceCount !== 1) blockers.push("sequence_drift");
  const grantors = [...new Set(evidence.defaultGrantors)].sort();
  if (JSON.stringify(grantors) !== JSON.stringify([...DEFAULT_GRANTORS].sort())) blockers.push("unexpected_default_grantor");
  if (evidence.defaultPrivilegeRows !== 96) blockers.push("default_privilege_drift");
  if (!evidence.canAlterSupabaseAdminDefaults) blockers.push("supabase_admin_authority_unproven");
  if (evidence.anonOrAuthenticatedInPgMaintain) blockers.push("runtime_role_has_pg_maintain");
  if (!evidence.futureFunctionExecuteInventoried) blockers.push("default_function_execute_uninventoried");
  return Object.freeze({ aptForB0: blockers.length === 0, blockers: Object.freeze(blockers) });
}

function main() {
  const result = validateSql(fs.readFileSync(SQL_PATH, "utf8"));
  if (result.errors.length) {
    for (const error of result.errors) process.stderr.write(`ERROR ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`PASS statements=${result.statements} tables=${result.tables} roles=${result.roles} privileges=${result.privileges}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { DEFAULT_GRANTORS, SQL_PATH, TABLES, ROLES, TABLE_PRIVILEGES, assessLiveEvidence, expectedMatrixForVersion, splitStatements, validateSql };
