import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { splitSqlStatements } from '../scripts/validate-03d3c1-function-hardening-sql.js';

const ROOT = new URL('../docs/test-environment/anexos-cuadernillo-v2/', import.meta.url);
const FILES = Object.freeze([
  '01_preflight.sql',
  '02_migration.sql',
  '03_postmigration.sql',
  '04_rollback.sql',
  'README.md'
]);

const read = (name) => readFileSync(new URL(name, ROOT), 'utf8');
const sql = Object.freeze({
  preflight: read('01_preflight.sql'),
  migration: read('02_migration.sql'),
  postmigration: read('03_postmigration.sql'),
  rollback: read('04_rollback.sql')
});

function executableWords(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

const CANONICAL_CHECK_EXPRESSION = "tipo_cuadernilloisnullortipo_cuadernillo=anyarray['ejercicios_aplicacion','actividades_integradoras','aprendizaje_guiado']";

function normalizePostgresCheckExpression(source) {
  return source
    .toLowerCase()
    .replace(/::text\[\]|::text/g, '')
    .replace(/[\s()]/g, '');
}

test('package manifest contains exactly four SQL stages and README', () => {
  assert.deepEqual(readdirSync(ROOT).sort(), [...FILES].sort());
  assert.equal(existsSync(new URL('../2b_anexos_tipo_cuadernillo_migration.sql', ROOT)), false);
});

test('existing SQL parser recognizes every package as separate statements', () => {
  for (const source of Object.values(sql)) assert.ok(splitSqlStatements(source).length > 0);
});

test('PL/pgSQL catalog column checks use explicit aliases', () => {
  for (const [stage, source] of Object.entries(sql)) {
    const blocks = source.match(/DO\s+\$[^$]+\$[\s\S]*?\$[^$]+\$;/gi) ?? [];
    for (const block of blocks) {
      const catalogQueries = block.match(/FROM\s+information_schema\.columns\s+AS\s+cols[\s\S]*?(?:;|\n\s*\))/gi) ?? [];
      for (const query of catalogQueries) {
        for (const column of ['table_schema', 'table_name', 'column_name', 'data_type', 'is_nullable', 'column_default']) {
          const unqualified = new RegExp(`(?<![.\\w])${column}\\b`, 'i');
          assert.doesNotMatch(query, unqualified, `${stage}: ${column} must be qualified in PL/pgSQL catalog queries`);
        }
      }
      const catalogReferenceCount = block.match(/FROM\s+information_schema\.columns\b/gi)?.length ?? 0;
      const aliasedReferenceCount = block.match(/FROM\s+information_schema\.columns\s+AS\s+cols\b/gi)?.length ?? 0;
      assert.equal(
        aliasedReferenceCount,
        catalogReferenceCount,
        `${stage}: information_schema.columns must use the cols alias inside PL/pgSQL`
      );
    }
  }

  for (const stage of ['preflight', 'migration']) {
    assert.match(sql[stage], /max\(cols\.data_type\)/i);
    assert.match(sql[stage], /max\(cols\.is_nullable\)/i);
    assert.match(sql[stage], /max\(cols\.column_default\)/i);
  }
});

test('canonical CHECK comparison accepts PostgreSQL serialization without weakening the allowlist', () => {
  const compatible = [
    "tipo_cuadernillo IS NULL OR tipo_cuadernillo = ANY (ARRAY['ejercicios_aplicacion', 'actividades_integradoras', 'aprendizaje_guiado'])",
    "((tipo_cuadernillo IS NULL) OR (tipo_cuadernillo = ANY (ARRAY['ejercicios_aplicacion'::text, 'actividades_integradoras'::text, 'aprendizaje_guiado'::text])))",
    "( tipo_cuadernillo IS NULL ) OR ( tipo_cuadernillo = ANY ( ARRAY [ 'ejercicios_aplicacion'::text, 'actividades_integradoras'::text, 'aprendizaje_guiado'::text ]::text[] ) )"
  ];
  const incompatible = [
    "tipo_cuadernillo IS NULL OR tipo_cuadernillo = ANY (ARRAY['ejercicios_aplicacion', 'actividades_integradoras', 'aprendizaje_guiado', 'otro'])",
    "tipo_cuadernillo IS NULL OR tipo_cuadernillo = ANY (ARRAY['ejercicios_aplicacion', 'aprendizaje_guiado'])",
    "tipo_cuadernillo IS NOT NULL OR tipo_cuadernillo = 'ejercicios_aplicacion'"
  ];

  for (const fixture of compatible) {
    assert.equal(normalizePostgresCheckExpression(fixture), CANONICAL_CHECK_EXPRESSION);
  }
  for (const fixture of incompatible) {
    assert.notEqual(normalizePostgresCheckExpression(fixture), CANONICAL_CHECK_EXPRESSION);
  }

  assert.match(sql.migration, /CHECK\s*\(\s*tipo_cuadernillo IS NULL\s*OR tipo_cuadernillo IN\s*\(/i);
  for (const stage of ['preflight', 'migration', 'postmigration']) {
    assert.match(sql[stage], /regexp_replace\(lower\(check_expression\), '::text\\\[\\\]\|::text', '', 'g'\)/);
    assert.match(sql[stage], /constraints\.conkey = ARRAY\[type_column_attnum\]::smallint\[\]/);
    assert.doesNotMatch(sql[stage], /replace\(lower\(check_expression\),\s*'::text'/);
  }
});

test('conceptual second migration run recognizes the existing CHECK and creates no duplicate', () => {
  assert.equal(
    normalizePostgresCheckExpression("((tipo_cuadernillo IS NULL) OR (tipo_cuadernillo = ANY (ARRAY['ejercicios_aplicacion'::text, 'actividades_integradoras'::text, 'aprendizaje_guiado'::text])))"),
    CANONICAL_CHECK_EXPRESSION
  );
  assert.match(sql.migration, /IF named_constraint_count = 0 THEN[\s\S]*?ADD CONSTRAINT anexos_tipo_cuadernillo_check/);
  assert.match(sql.migration, /ELSIF named_constraint_count <> 1 THEN/);
  assert.equal((sql.migration.match(/ADD CONSTRAINT anexos_tipo_cuadernillo_check/g) ?? []).length, 1);
});

test('preflight is read-only, fail-closed and emits safe metadata plus verdict', () => {
  const words = executableWords(sql.preflight);
  assert.doesNotMatch(words, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|LOCK|COMMIT|ROLLBACK)\b/i);
  assert.match(sql.preflight, /RAISE EXCEPTION/);
  for (const required of ['total_anexos', 'anexos_tipo_null', 'anexos_tipo_no_null', 'information_schema.columns', 'pg_constraint', 'pg_indexes', 'relrowsecurity', 'pg_policies', 'pg_trigger', 'role_table_grants', 'PREFLIGHT PASS']) {
    assert.match(sql.preflight, new RegExp(required.replace('.', '\\.')));
  }
  assert.doesNotMatch(sql.preflight, /\b(?:titulo|tema|email|full_name|access_token|authorization)\b/i);
});

test('migration is atomic, idempotent and changes only column plus canonical CHECK', () => {
  const statements = splitSqlStatements(sql.migration);
  assert.equal(statements[0].trim(), 'BEGIN');
  assert.equal(statements.at(-1).trim(), 'COMMIT');
  assert.match(sql.migration, /ADD COLUMN IF NOT EXISTS tipo_cuadernillo text NULL/i);
  assert.match(sql.migration, /ADD CONSTRAINT anexos_tipo_cuadernillo_check/i);
  assert.match(sql.migration, /constraint homonimo tiene definicion incompatible/i);
  assert.doesNotMatch(executableWords(sql.migration), /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|CASCADE|CREATE POLICY|ALTER POLICY|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(sql.migration, /ADD COLUMN[^;]*\b(?:DEFAULT|NOT NULL)\b/i);
});

test('migration and JavaScript owner share the exact canonical IDs', () => {
  const owner = readFileSync(new URL('../src/domain/cuadernillos.js', import.meta.url), 'utf8');
  const ids = ['ejercicios_aplicacion', 'actividades_integradoras', 'aprendizaje_guiado'];
  for (const id of ids) {
    assert.match(sql.migration, new RegExp(`'${id}'`));
    assert.match(owner, new RegExp(`'${id}'`));
  }
});

test('postmigration is read-only, fail-closed and cannot emit a false PASS', () => {
  const words = executableWords(sql.postmigration);
  assert.doesNotMatch(words, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|LOCK|COMMIT|ROLLBACK)\b/i);
  assert.match(sql.postmigration, /RAISE EXCEPTION/);
  assert.ok(sql.postmigration.indexOf('RAISE EXCEPTION') < sql.postmigration.indexOf("SELECT 'POSTMIGRATION PASS'"));
  for (const invariant of ['anexos_pkey', 'unique_anexo_por_planeacion', 'educativo_ia_anexos_batch_owner_fkey', 'educativo_ia_anexos_planeacion_owner_fkey', 'idx_anexos_user_id', 'set_anexos_updated_at', 'relrowsecurity']) {
    assert.match(sql.postmigration, new RegExp(invariant));
  }
});

test('rollback is explicit, atomic, v2-gated, idempotent and has no CASCADE', () => {
  const statements = splitSqlStatements(sql.rollback);
  assert.equal(statements[0].trim(), 'BEGIN');
  assert.equal(statements.at(-1).trim(), 'COMMIT');
  assert.match(sql.rollback, /SOLO SUPABASE TEST/);
  assert.match(sql.rollback, /NO EJECUTAR EN PRODUCCION/);
  assert.match(sql.rollback, /EJECUTAR UNICAMENTE CON AUTORIZACION EXPRESA/);
  assert.match(sql.rollback, /tipo_cuadernillo' IS NOT NULL/);
  assert.match(sql.rollback, /contenido->>'schema_version' = '2'/);
  assert.match(sql.rollback, /contenido \? 'secciones'/);
  assert.match(sql.rollback, /DROP CONSTRAINT IF EXISTS anexos_tipo_cuadernillo_check/);
  assert.match(sql.rollback, /DROP COLUMN IF EXISTS tipo_cuadernillo/);
  assert.doesNotMatch(sql.rollback, /\bCASCADE\b/i);
  assert.doesNotMatch(executableWords(sql.rollback), /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
});

test('README records the completed test execution without authorizing production', () => {
  const readme = read('README.md');
  const ordered = ['01_preflight.sql', '02_migration.sql', '02_migration.sql', '03_postmigration.sql', '04_rollback.sql'];
  let offset = -1;
  for (const name of ordered) {
    offset = readme.indexOf(name, offset + 1);
    assert.notEqual(offset, -1);
  }
  assert.match(readme, /gwdtlbisykzzplgzczzq/);
  assert.match(readme, /bfnkaqmhcsyxdxoqnahk/);
  assert.match(readme, /Estado aplicado en test/);
  assert.match(readme, /segunda ejecución idempotente: `PASS`/);
  assert.match(readme, /rollback: nunca ejecutado/);
  assert.match(readme, /exclusivamente de test/);
});

test('direct documentation and tests no longer reference the old migration path', () => {
  for (const path of ['../docs/DATABASE_SCHEMA.md', '../tests/cuadernillos-v2.test.js']) {
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /2b_anexos_tipo_cuadernillo_migration\.sql/);
  }
});
