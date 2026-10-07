// Pure tests: do not import runtime.js/app.js, read .env, or construct real SDKs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment, createCorsOriginValidator } from '../src/config/environment.js';
const valid = (environment = 'test') => ({
  APP_ENV: environment, NODE_ENV: environment === 'production' ? 'production' : 'development',
  SUPABASE_URL: `https://${environment === 'production' ? 'bfnkaqmhcsyxdxoqnahk' : 'gwdtlbisykzzplgzczzq'}.supabase.co`,
  SUPABASE_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private',
  CORS_ORIGIN: environment === 'production' ? 'https://educativoia.com,https://www.educativoia.com' : 'http://127.0.0.1:5500,http://localhost:5500', PORT: '3000'
});
for (const environment of ['test', 'production']) test(`valid ${environment}`, () => {
  const config = validateEnvironment(valid(environment));
  assert.equal(config.environment, environment);
  assert.equal(config.projectId, environment === 'test' ? 'gwdtlbisykzzplgzczzq' : 'bfnkaqmhcsyxdxoqnahk');
  assert.doesNotMatch(JSON.stringify(config), /synthetic/);
});
const cases = [
  ['test-production cross', { ...valid(), SUPABASE_URL: valid('production').SUPABASE_URL }],
  ['production-test cross', { ...valid('production'), SUPABASE_URL: valid().SUPABASE_URL }],
  ['unknown environment', { ...valid(), APP_ENV: 'unknown' }],
  ['inherited property environment', { ...valid(), APP_ENV: 'toString' }],
  ['unknown NODE_ENV', { ...valid(), NODE_ENV: 'other' }],
  ['production in development', { ...valid('production'), NODE_ENV: 'development' }],
  ['invalid URL', { ...valid(), SUPABASE_URL: 'synthetic-private' }],
  ['HTTP Supabase', { ...valid(), SUPABASE_URL: valid().SUPABASE_URL.replace('https:', 'http:') }],
  ['URL credential', { ...valid(), SUPABASE_URL: 'https://synthetic-private@gwdtlbisykzzplgzczzq.supabase.co' }],
  ['URL query', { ...valid(), SUPABASE_URL: `${valid().SUPABASE_URL}?key=synthetic-private` }],
  ['URL suffix spoof', { ...valid(), SUPABASE_URL: `${valid().SUPABASE_URL}.example` }],
  ['wildcard CORS', { ...valid(), CORS_ORIGIN: '*' }],
  ['CORS trailing comma', { ...valid(), CORS_ORIGIN: 'http://localhost:5500,' }],
  ['CORS path', { ...valid('production'), CORS_ORIGIN: 'https://educativoia.com/login' }],
  ['production local CORS', { ...valid('production'), CORS_ORIGIN: 'http://localhost:5500' }],
  ['production local HTTPS CORS', { ...valid('production'), CORS_ORIGIN: 'https://localhost:5500' }],
  ['test production CORS', { ...valid(), CORS_ORIGIN: 'https://educativoia.com' }],
  ['invalid port', { ...valid(), PORT: 'NaN' }],
  ['test wrong port', { ...valid(), PORT: '4000' }]
];
for (const key of ['APP_ENV', 'NODE_ENV', 'SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CORS_ORIGIN']) cases.push([`missing ${key}`, { ...valid(), [key]: '' }]);
for (const [name, env] of cases) test(`reject ${name} with sanitized error`, () => {
  assert.throws(() => validateEnvironment(env), error => {
    assert.match(error.message, /Configuración de entorno/);
    assert.doesNotMatch(error.message, /synthetic|https?:\/\//);
    return true;
  });
});
for (const environment of ['test', 'production']) test(`CORS exact allowlist ${environment}`, () => {
  const config = validateEnvironment(valid(environment));
  const check = origin => { let result; createCorsOriginValidator(config)(origin, (error, allowed) => { result = { error, allowed }; }); return result; };
  assert.equal(check(undefined).allowed, true);
  for (const origin of config.allowedOrigins) assert.equal(check(origin).allowed, true);
  for (const origin of ['null', '', 'https://unknown.example', 'https://person.github.io', 'https://branch.vercel.app', 'http://localhost:9999']) assert.ok(check(origin).error);
  if (environment === 'production') assert.ok(check('http://localhost:5500').error);
});
