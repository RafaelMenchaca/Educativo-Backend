// node --experimental-vm-modules --test tests/client-configuration.test.js
// Link real configuration/client source to in-memory SDK/dotenv stubs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
const environmentSource = readFileSync(new URL('../src/config/environment.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../src/config/runtime.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../supabaseClient.js', import.meta.url), 'utf8');
async function load(overrides = {}) {
  const calls = [];
  const dotenvCalls = [];
  const env = { APP_ENV: 'test', NODE_ENV: 'development', SUPABASE_URL: 'https://gwdtlbisykzzplgzczzq.supabase.co', SUPABASE_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private', CORS_ORIGIN: 'http://127.0.0.1:5500', ...overrides };
  const context = createContext({ URL, process: { env } });
  const environment = new SourceTextModule(environmentSource, { context });
  const runtime = new SourceTextModule(runtimeSource, { context });
  const client = new SourceTextModule(clientSource, { context });
  const dotenv = new SyntheticModule(['default'], function () { this.setExport('default', { config: (...args) => { dotenvCalls.push(args); return {}; } }); }, { context });
  const sdk = new SyntheticModule(['createClient'], function () { this.setExport('createClient', (...args) => { calls.push(args); return { synthetic: true }; }); }, { context });
  await client.link(specifier => {
    if (specifier === '@supabase/supabase-js') return sdk;
    if (specifier === './src/config/runtime.js') return runtime;
    if (specifier === 'dotenv') return dotenv;
    if (specifier === './environment.js') return environment;
    throw new Error('Unexpected import in isolated harness');
  });
  let error;
  try { await client.evaluate(); } catch (e) { error = e; }
  return { calls, dotenvCalls, client, error };
}
for (const overrides of [{ APP_ENV: '' }, { SUPABASE_URL: 'https://bfnkaqmhcsyxdxoqnahk.supabase.co' }, { SUPABASE_KEY: '' }, { SUPABASE_SERVICE_ROLE_KEY: '' }, { CORS_ORIGIN: '*' }]) {
  test(`no clients before valid configuration: ${Object.keys(overrides)[0]}`, async () => {
    const result = await load(overrides);
    assert.ok(result.error);
    assert.equal(result.calls.length, 0);
    assert.doesNotMatch(result.error.message, /synthetic/);
  });
}
test('dotenv uses the normal default file without path overrides', async () => {
  const result = await load();
  assert.equal(result.error, undefined);
  assert.deepEqual(result.dotenvCalls, [[]]);
});
test('preserve admin alias, user Bearer and server session options', async () => {
  const result = await load();
  assert.equal(result.error, undefined);
  assert.deepEqual(result.dotenvCalls, [[]]);
  assert.equal(result.client.namespace.supabase, result.client.namespace.supabaseAdmin);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][1], 'synthetic-private');
  result.client.namespace.createUserClient('synthetic-access');
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[1][1], 'synthetic-public');
  assert.equal(result.calls[1][2].global.headers.Authorization, 'Bearer synthetic-access');
  for (const call of result.calls) {
    assert.equal(call[0], 'https://gwdtlbisykzzplgzczzq.supabase.co');
    assert.equal(call[2].auth.persistSession, false);
    assert.equal(call[2].auth.autoRefreshToken, false);
  }
  assert.throws(() => result.client.namespace.createUserClient(), /Access token is required/);
});
