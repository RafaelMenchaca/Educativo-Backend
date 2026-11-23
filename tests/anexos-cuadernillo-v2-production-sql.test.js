import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { splitSqlStatements } from '../scripts/validate-03d3c1-function-hardening-sql.js';
import { TIPO_CUADERNILLO_IDS } from '../src/domain/cuadernillos.js';

const PROD_ROOT = new URL('../docs/production/anexos-cuadernillo-v2/', import.meta.url);
const TEST_ROOT = new URL('../docs/test-environment/anexos-cuadernillo-v2/', import.meta.url);
const FILES = Object.freeze(['01_preflight.sql', '02_migration.sql', '03_postmigration.sql', '04_rollback.sql', 'README.md']);
const read = (root, name) => readFileSync(new URL(name, root), 'utf8');
const sql = Object.freeze({
  preflight: read(PROD_ROOT, '01_preflight.sql'),
  migration: read(PROD_ROOT, '02_migration.sql'),
  postmigration: read(PROD_ROOT, '03_postmigration.sql'),
  rollback: read(PROD_ROOT, '04_rollback.sql')
});

function executableWords(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ').replace(/'(?:''|[^'])*'/g, "''");
}

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

test('production package manifest is exact and physically separate from test', () => {
  assert.deepEqual(readdirSync(PROD_ROOT).sort(), [...FILES].sort());
  assert.deepEqual(readdirSync(TEST_ROOT).sort(), [...FILES].sort());
  assert.notEqual(PROD_ROOT.pathname, TEST_ROOT.pathname);
  assert.equal(existsSync(new URL('../docs/production-environment/anexos-cuadernillo-v2/', import.meta.url)), false);
});

test('every production SQL identifies production and forbids test', () => {
  for (const source of Object.values(sql)) {
    assert.match(source, /SOLO SUPABASE PRODUCCION/);
    assert.match(source, /Project ref esperado: bfnkaqmhcsyxdxoqnahk/);
    assert.match(source, /NO EJECUTAR EN TEST \(gwdtlbisykzzplgzczzq\)/);
    assert.match(source, /Verificar visualmente el project ref/);
    assert.ok(splitSqlStatements(source).length > 0);
  }
});

test('production README fixes identity, order, evidence and stop conditions', () => {
  const readme = read(PROD_ROOT, 'README.md');
  assert.match(readme, /preflight PASS, primera migracion PASS, segunda\s+ejecucion idempotente PASS y postmigration PASS/);
  assert.match(readme, /136[^\n]*anexos/);
  assert.match(readme, /136[^\n]*historicos[^\n]*tipo_cuadernillo IS NULL/);
  assert.match(readme, /unico CHECK canonico/);
  assert.match(readme, /Rollback no ejecutado/);
  assert.match(readme, /bfnkaqmhcsyxdxoqnahk/);
  assert.match(readme, /gwdtlbisykzzplgzczzq/);
  assert.match(readme, /Destino expresamente prohibido/);
  assert.match(readme, /comprobacion\s+no sustituye la identidad\s+visual/i);
  assert.match(readme, /No mostrar filas/);
  assert.match(readme, /Rollback conservado sin ejecutar/i);
  assert.match(readme, /no debe volver a ejecutarse como paso rutinario/i);
  assert.match(readme, /codigo[^\n]*pendiente de push, PR, merge y\s+deploy/i);
  const ordered = ['01_preflight.sql', '02_migration.sql', '02_migration.sql', '03_postmigration.sql', '04_rollback.sql'];
  let offset = -1;
  for (const name of ordered) {
    offset = readme.indexOf(name, offset + 1);
    assert.notEqual(offset, -1, `${name} must appear in operational order`);
  }
});

test('preflight and postmigration are read-only and fail closed', () => {
  for (const [name, source] of [['preflight', sql.preflight], ['postmigration', sql.postmigration]]) {
    assert.doesNotMatch(executableWords(source), /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|LOCK|COMMIT|ROLLBACK)\b/i, name);
    assert.match(source, /RAISE EXCEPTION/);
  }
  assert.match(sql.preflight, /PREFLIGHT PRODUCCION PASS/);
  assert.match(sql.postmigration, /POSTMIGRATION PRODUCCION PASS/);
  assert.match(sql.postmigration, /Comparar manualmente total_anexos y la metadata catalogal/);
  assert.match(sql.postmigration, /ORDER BY cols\.ordinal_position/);
});

test('preflight emits one final visible evidence row with every required field', () => {
  const statements = splitSqlStatements(sql.preflight);
  assert.equal(statements.length, 2);
  const finalStatement = statements.at(-1);
  for (const field of [
    'verdict', 'total_anexos', 'anexos_tipo_null', 'anexos_tipo_no_null',
    'tipo_cuadernillo_existe', 'tipo_cuadernillo_tipo',
    'tipo_cuadernillo_nullable', 'tipo_cuadernillo_default',
    'contenido_contrato', 'columnas', 'constraints', 'indices', 'rls',
    'policies', 'triggers', 'grants'
  ]) assert.match(finalStatement, new RegExp(`\\b${field}\\b`));
  assert.match(finalStatement, /'PREFLIGHT PRODUCCION PASS' AS verdict/);
  assert.equal((finalStatement.match(/FROM public\.anexos AS a/g) ?? []).length, 1);
});

test('postmigration emits one final visible evidence row with every required field', () => {
  const statements = splitSqlStatements(sql.postmigration);
  assert.equal(statements.length, 2);
  const finalStatement = statements.at(-1);
  for (const field of [
    'verdict', 'total_anexos', 'anexos_tipo_null', 'anexos_tipo_no_null',
    'tipo_cuadernillo_existe', 'tipo_cuadernillo_tipo',
    'tipo_cuadernillo_udt_name', 'tipo_cuadernillo_nullable',
    'tipo_cuadernillo_default', 'contenido_contrato', 'columnas',
    'constraints', 'tipo_cuadernillo_check', 'indices', 'rls', 'policies',
    'triggers', 'grants'
  ]) assert.match(finalStatement, new RegExp(`\\b${field}\\b`));
  assert.match(finalStatement, /'POSTMIGRATION PRODUCCION PASS' AS verdict/);
  assert.equal((finalStatement.match(/FROM public\.anexos AS a/g) ?? []).length, 1);
});

test('visible catalog evidence uses deterministic ordered JSON aggregation', () => {
  for (const source of [sql.preflight, sql.postmigration]) {
    const finalStatement = splitSqlStatements(source).at(-1);
    for (const order of [
      /jsonb_agg\([\s\S]*?ORDER BY cols\.ordinal_position\)/,
      /jsonb_agg\([\s\S]*?ORDER BY constraints\.conname\)/,
      /jsonb_agg\([\s\S]*?ORDER BY indexes\.indexname\)/,
      /jsonb_agg\([\s\S]*?ORDER BY policies\.policyname, policies\.cmd\)/,
      /jsonb_agg\([\s\S]*?ORDER BY triggers\.tgname\)/,
      /jsonb_agg\([\s\S]*?ORDER BY grants\.grantee, grants\.privilege_type\)/
    ]) assert.match(finalStatement, order);
    assert.doesNotMatch(finalStatement, /SELECT\s+\*/i);
  }
});

test('preflight evidence reads annex rows only through aggregate counts', () => {
  const finalStatement = splitSqlStatements(sql.preflight).at(-1);
  assert.match(finalStatement, /count\(\*\)::bigint AS total_anexos/);
  assert.match(finalStatement, /count\(\*\) FILTER \(WHERE to_jsonb\(a\)->>'tipo_cuadernillo' IS NULL\)/);
  assert.doesNotMatch(finalStatement, /a\.(?:id|titulo|tema|user_id|planeacion_id|contenido)\b/i);
  assert.doesNotMatch(finalStatement, /jsonb_agg\([^)]*a\./i);
});

test('postmigration evidence reads annex rows only through aggregate counts', () => {
  const finalStatement = splitSqlStatements(sql.postmigration).at(-1);
  assert.match(finalStatement, /count\(\*\)::bigint AS total_anexos/);
  assert.match(finalStatement, /count\(\*\) FILTER \(WHERE a\.tipo_cuadernillo IS NULL\)/);
  assert.doesNotMatch(finalStatement, /a\.(?:id|titulo|tema|user_id|planeacion_id|contenido)\b/i);
  assert.doesNotMatch(finalStatement, /jsonb_agg\([^)]*a\./i);
});

test('production preflight checks complete anexos structural fingerprint', () => {
  for (const token of [
    'contenido', 'anexos_pkey', 'unique_anexo_por_planeacion',
    'anexos_planeacion_id_fkey', 'educativo_ia_anexos_batch_owner_fkey',
    'idx_anexos_user_id', 'relrowsecurity', 'pg_policies',
    'set_anexos_updated_at', 'role_table_grants'
  ]) assert.match(sql.preflight, new RegExp(token));
  assert.match(sql.preflight, /invalid_type_count/);
  assert.doesNotMatch(sql.preflight, /\b(?:titulo|tema|email|full_name|authorization|access_token)\b/i);
});

test('production migration is transactional, idempotent and narrowly scoped', () => {
  const statements = splitSqlStatements(sql.migration);
  assert.equal(statements[0].trim(), 'BEGIN');
  assert.equal(statements.at(-1).trim(), 'COMMIT');
  assert.match(sql.migration, /ADD COLUMN IF NOT EXISTS tipo_cuadernillo text NULL/i);
  assert.match(sql.migration, /ADD CONSTRAINT anexos_tipo_cuadernillo_check/i);
  assert.match(sql.migration, /regexp_replace\(lower\(check_expression\), '::text\\\[\\\]\|::text'/);
  assert.match(sql.migration, /named_constraint_count = 0/);
  assert.doesNotMatch(executableWords(sql.migration), /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|CASCADE|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(sql.migration, /ADD COLUMN[^;]*\b(?:DEFAULT|NOT NULL)\b/i);
});

test('production allowlist equals the JavaScript domain owner', () => {
  const literals = [...sql.migration.matchAll(/'(ejercicios_aplicacion|actividades_integradoras|aprendizaje_guiado)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(literals)].sort(), [...TIPO_CUADERNILLO_IDS].sort());
  for (const source of [sql.preflight, sql.postmigration]) {
    for (const id of TIPO_CUADERNILLO_IDS) assert.match(source, new RegExp(`'${id}'`));
  }
});

test('rollback is transactional, v2-gated, narrow and has no CASCADE', () => {
  const statements = splitSqlStatements(sql.rollback);
  assert.equal(statements[0].trim(), 'BEGIN');
  assert.equal(statements.at(-1).trim(), 'COMMIT');
  assert.match(sql.rollback, /DESTRUCTIVO DE ESQUEMA/);
  assert.match(sql.rollback, /NO EJECUTAR SIN AUTORIZACION EXPRESA/);
  assert.match(sql.rollback, /tipo_cuadernillo IS NOT NULL/);
  assert.match(sql.rollback, /contenido->>'schema_version' = '2'/);
  assert.match(sql.rollback, /contenido \? 'secciones'/);
  assert.match(sql.rollback, /DROP CONSTRAINT IF EXISTS anexos_tipo_cuadernillo_check/);
  assert.match(sql.rollback, /DROP COLUMN IF EXISTS tipo_cuadernillo/);
  assert.doesNotMatch(sql.rollback, /\bCASCADE\b/i);
  assert.doesNotMatch(executableWords(sql.rollback), /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
});

test('correctives leave preflight, migration, rollback and every test SQL byte-identical', () => {
  const expected = new Map([
    ['01_preflight.sql', 'e289aadf919e979ee15cc692917a67f95e4a90f54595cd8444204b70a83d7ff3'],
    ['02_migration.sql', 'e64a8fcf9c86431cb847f1f602761cb5ecd6868aa7ab0eb68ac70229b9394dec'],
    ['04_rollback.sql', '1fbf667705ac1ebefe33d49ab7093e845b0ea31581083316f8aff56adb3fe0ee']
  ]);
  for (const [name, hash] of expected) assert.equal(sha256(read(PROD_ROOT, name)), hash, name);

  const expectedTest = new Map([
    ['01_preflight.sql', 'edab314c609bfcb2d7c68e0a0c2f38aaa504602bd74b47e07890d60c6a644483'],
    ['02_migration.sql', '590a0e197f232e14de94fa72732513deb8a404f0b755f0cb3009687fa8da2ec2'],
    ['03_postmigration.sql', '9957410e6c8facce9a0be34553d4b1380f4a9dd7b328f1b9dd74a81afe9e45c1'],
    ['04_rollback.sql', '98f8fcf6aa800830625a3c60799afa27c40b074d07527c60935f6e213d8bb75b']
  ]);
  for (const [name, hash] of expectedTest) assert.equal(sha256(read(TEST_ROOT, name)), hash, `test/${name}`);
});

test('documentation records final feature state and no obsolete checkpoint claims', () => {
  const docs = [
    readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../docs/03-backend-guide.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../docs/AI_GENERATION_CONTRACTS.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../docs/DATABASE_SCHEMA.md', import.meta.url), 'utf8')
  ].join('\n');
  assert.doesNotMatch(docs, /Renderer, Word y frontend v2 siguen pendientes/i);
  assert.doesNotMatch(docs, /generaci[oó]n real controlada a[uú]n est[aá] pendiente/i);
  assert.match(docs, /preview web|renderer web v2/i);
  assert.match(docs, /exportaci[oó]n Word v2|exportador Word v2/i);
  assert.match(docs, /docs\/production\/anexos-cuadernillo-v2/);
  assert.doesNotMatch(docs, /migraci[oó]n productiva[^.\n]*(?:pendiente|no ejecutada)|producci[oó]n permanece sin migrar/i);
  assert.match(docs, /test y producci[oó]n[^.\n]*(?:aplicad|postverificad)|aplicad[^.\n]*test y producci[oó]n/i);
  assert.match(docs, /c[oó]digo[^.\n]*(?:ramas `work\/features`|pendiente)[^.\n]*(?:push|deploy)/i);
  assert.match(docs, /rollback[^.\n]*(?:nunca|no fue) ejecutado/i);
});

test('offline suite contains no SQL executor or live client', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"](?:pg|postgres|@supabase\/|node:child_process|child_process)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
