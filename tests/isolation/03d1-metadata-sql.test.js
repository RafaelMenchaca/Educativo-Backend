import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SQL_PATH, SQL_MANIFEST, scanSql, validateFile, validateMetadataSql } from '../../scripts/validate-03d1-metadata-sql.js';

const sourcePromise = readFile(DEFAULT_SQL_PATH, 'utf8');
const errorsFor = sql => validateMetadataSql(sql).errors;

test('el paquete versionado coincide exactamente con el manifiesto', async () => {
  const result = await validateFile();
  assert.equal(result.statementCount, 17);
  assert.deepEqual(result.markers, SQL_MANIFEST.map(({id,block,result,maxRows}) => ({id,block,result,maxRows})));
});

test('sentencia 10 declara columnas WITH ORDINALITY explícitas y preserva correlación y orden', async () => {
  const source = await sourcePromise;
  const statement10 = source.match(/-- AUDIT_STATEMENT 10[\s\S]*?(?=-- AUDIT_STATEMENT 11)/)?.[0];
  assert.ok(statement10, 'la prueba inspecciona texto; no ejecuta PostgreSQL');
  assert.equal((statement10.match(/WITH ORDINALITY AS k\(attnum, position\)/g) || []).length, 2);
  assert.doesNotMatch(statement10, /k\.unnest|k\.ordinality/);
  assert.match(statement10, /a\.attrelid = c\.oid AND a\.attnum = k\.attnum/);
  assert.match(statement10, /a\.attrelid = rc\.oid AND a\.attnum = k\.attnum/);
  assert.equal((statement10.match(/ORDER BY k\.position/g) || []).length, 2);
  assert.deepEqual(SQL_MANIFEST[9], {
    id: 10,
    block: '04',
    result: 'metadata',
    maxRows: 76,
    sources: ['pg_constraint','pg_class','pg_namespace','relevant_tables','unnest','pg_attribute']
  });
  assert.equal(SQL_MANIFEST.length, 17);
});

test('otros unnest del paquete también declaran su columna de salida', async () => {
  const source = await sourcePromise;
  assert.match(source, /AS config\(setting\)/);
  assert.doesNotMatch(source, /config\.unnest/);
});

for (const keyword of ['INSERT','UPDATE','DELETE','MERGE','TRUNCATE','ALTER','CREATE','DROP','GRANT','REVOKE','COPY','CALL','DO']) {
  test(`rechaza escritura o control ${keyword}`, () => assert.ok(errorsFor(`${keyword} unsafe;`).length));
}

test('rechaza DML dentro de un CTE', () => {
  assert.ok(errorsFor('WITH changed AS (DELETE FROM public.planteles RETURNING id) SELECT count(*) FROM changed;').some(value => value.includes('DELETE')));
});

test('rechaza SELECT INTO', () => {
  assert.ok(errorsFor('SELECT 1 INTO temporary_result;').some(value => value.includes('SELECT INTO')));
});

test('rechaza transacciones, locks y cambios de sesión', () => {
  for (const sql of ['COMMIT;', 'LOCK TABLE public.planteles;', 'SELECT 1 FOR UPDATE;', 'SET ROLE authenticated;', 'RESET ROLE;']) assert.ok(errorsFor(sql).length, sql);
});

const dangerousFunctions = [
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'lo_import', 'lo_export',
  'nextval', 'setval', 'set_config', 'pg_sleep', 'pg_terminate_backend',
  'pg_cancel_backend', 'pg_advisory_lock', 'dblink_connect', 'http_get',
  'net.http_get', 'vault.get_secret', 'public.custom_side_effect'
];
for (const functionName of dangerousFunctions) {
  test(`rechaza función peligrosa ${functionName}`, () => {
    assert.ok(errorsFor(`SELECT ${functionName}('synthetic');`).some(value => value.includes('función no permitida')));
  });
}

test('rechaza función peligrosa calificada con pg_catalog', () => {
  assert.ok(errorsFor("SELECT pg_catalog.pg_read_file('synthetic');").some(value => value.includes('pg_catalog.pg_read_file')));
});

for (const source of ['auth.users','"auth"."users"','storage.objects','"storage"."objects"','vault.secrets']) {
  test(`rechaza fuente prohibida o no autorizada ${source}`, () => {
    assert.ok(errorsFor(`SELECT count(*) FROM ${source};`).some(value => value.includes('fuente no autorizada')));
  });
}

test('maneja comentarios de bloque anidados', () => {
  const clean = scanSql('SELECT 1 /* outer DELETE /* inner INSERT */ still comment */;');
  assert.doesNotMatch(clean, /DELETE|INSERT/);
});

test('maneja dollar quote sin tag', () => {
  assert.doesNotMatch(scanSql("SELECT $$DELETE FROM auth.users$$;"), /DELETE|auth\.users/);
});

test('maneja dollar quote con tag', () => {
  assert.doesNotMatch(scanSql("SELECT $body$storage.objects UPDATE$body$;"), /storage\.objects|UPDATE/);
});

test('conserva identificadores entre comillas para validarlos', () => {
  assert.match(scanSql('SELECT count(*) FROM "Auth"."Users";'), /auth\.users/i);
});

test('rechaza una sentencia adicional fuera del manifiesto', async () => {
  const source = await sourcePromise;
  assert.ok(errorsFor(`${source}\nSELECT 1;`).some(value => value.includes('Conteo de sentencias')));
});

test('rechaza una fuente no autorizada para una sentencia', async () => {
  const source = await sourcePromise;
  const changed = source.replace('version() AS postgres_version,', 'version() AS postgres_version FROM pg_authid,');
  assert.ok(errorsFor(changed).some(value => value.includes('Sentencia 1 usa fuente no autorizada: pg_authid')));
});

test('rechaza una segunda fuente separada por coma', () => {
  assert.ok(errorsFor('SELECT count(*) FROM pg_class, auth.users;').some(value => value.includes('fuentes separadas por coma')));
});

test('rechaza una función public aunque imite un nombre permitido', () => {
  assert.ok(errorsFor('SELECT public.count(1);').some(value => value.includes('función no permitida')));
});

test('rechaza pg_get_functiondef como salida', async () => {
  const source = await sourcePromise;
  const changed = source.replace('version() AS postgres_version', 'pg_get_functiondef(1) AS function_definition');
  assert.ok(errorsFor(changed).some(value => value.includes('cuerpos de funciones')));
});

test('rechaza referencia directa ejecutable a ia_metrics_legacy', async () => {
  const source = await sourcePromise;
  const changed = source.replace('FROM public.ai_generation_calls\nUNION ALL', 'FROM public.ia_metrics_legacy\nUNION ALL');
  assert.ok(errorsFor(changed).some(value => value.includes('ia_metrics_legacy solo puede')));
});

test('permite las funciones catalogales del paquete final', async () => {
  assert.deepEqual(errorsFor(await sourcePromise), []);
});

test('permite mencionar auth.users como valor catalogal sin leer filas', async () => {
  const source = await sourcePromise;
  assert.match(source, /n\.nspname = 'auth'.*c\.relname = 'users'/s);
  assert.doesNotMatch(scanSql(source), /(?:from|join)\s+auth\.users/i);
});

test('ia_metrics_legacy se informa como objeto esperado sin lectura directa', async () => {
  const source = await sourcePromise;
  assert.match(source, /\('ia_metrics_legacy'\)/);
  assert.doesNotMatch(scanSql(source), /(?:from|join)\s+public\.ia_metrics_legacy/i);
});

test('no devuelve cuerpos de funciones ni definiciones textuales amplias', async () => {
  const source = await sourcePromise;
  assert.doesNotMatch(source, /pg_get_functiondef/i);
  assert.doesNotMatch(source, /AS function_definition\b/i);
});

test('el paquete no contiene credenciales, UUID ni URL', async () => {
  const source = await sourcePromise;
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i);
  assert.doesNotMatch(source, /Bearer|service[_ -]?role[_ -]?key|anon[_ -]?key|password|jwt/i);
});
