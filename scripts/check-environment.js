// Validation only: no SDK, application routes or network are imported.
// runtime.js loads the normal .env via dotenv.config(); run from backend root.
import { runtimeConfig } from '../src/config/runtime.js';
console.log(JSON.stringify({
  environment: runtimeConfig.environment,
  projectId: runtimeConfig.projectId,
  port: runtimeConfig.port,
  allowedOrigins: runtimeConfig.allowedOrigins
}, null, 2));
