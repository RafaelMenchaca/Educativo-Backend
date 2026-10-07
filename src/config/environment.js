// Pure validation: no dotenv, SDK, network, or credential values in errors/results.
const PROJECTS = Object.freeze({ test: 'gwdtlbisykzzplgzczzq', production: 'bfnkaqmhcsyxdxoqnahk' });
const fail = message => { throw new Error(`Configuración de entorno: ${message}`); };

function required(env, name) {
  if (typeof env[name] !== 'string' || !env[name].trim()) fail(`falta ${name}.`);
  return env[name].trim();
}

function originUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { fail(`${name} inválida.`); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || value.includes('*')) {
    fail(`${name} debe ser un origen exacto sin credenciales, rutas ni parámetros.`);
  }
  return url;
}

export function validateEnvironment(env) {
  const environment = required(env, 'APP_ENV');
  if (!Object.hasOwn(PROJECTS, environment)) fail('APP_ENV desconocido; usar test o production.');
  const nodeEnv = required(env, 'NODE_ENV');
  if (!['development', 'test', 'production'].includes(nodeEnv)) fail('NODE_ENV desconocido.');
  if (environment === 'production' && nodeEnv !== 'production') fail('APP_ENV production requiere NODE_ENV production.');
  const sb = originUrl(required(env, 'SUPABASE_URL'), 'SUPABASE_URL');
  if (sb.protocol !== 'https:' || sb.port || sb.hostname !== `${PROJECTS[environment]}.supabase.co`) {
    fail('SUPABASE_URL no coincide con el proyecto HTTPS autorizado para APP_ENV.');
  }
  // Only presence: do not decode, compare, log or infer roles from credential values.
  required(env, 'SUPABASE_KEY');
  required(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const allowedOrigins = required(env, 'CORS_ORIGIN').split(',').map(value => {
    const trimmed = value.trim();
    const url = originUrl(trimmed, 'CORS_ORIGIN');
    if (trimmed !== url.origin) fail('CORS_ORIGIN debe contener orígenes canónicos sin barra final.');
    if (environment === 'production' && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) fail('CORS_ORIGIN de producción requiere orígenes HTTPS no locales.');
    if (environment === 'test' && !['http://127.0.0.1:5500', 'http://localhost:5500'].includes(url.origin)) fail('CORS_ORIGIN test solo admite los frontends locales autorizados en 5500.');
    return url.origin;
  });
  const portValue = env.PORT === undefined ? '3000' : required(env, 'PORT');
  if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) fail('PORT inválido.');
  const port = Number(portValue);
  if (environment === 'test' && port !== 3000) fail('PORT de test debe ser 3000.');
  return Object.freeze({ environment, nodeEnv, projectId: PROJECTS[environment], supabaseUrl: sb.origin, allowedOrigins: Object.freeze([...new Set(allowedOrigins)]), port });
}

export function createCorsOriginValidator(config) {
  return (origin, callback) => {
    if (origin === undefined || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: Origin no permitido'));
  };
}
