import dotenv from 'dotenv';
import { validateEnvironment } from './environment.js';

dotenv.config();
// All importers validate before creating clients or accepting traffic.
export const runtimeConfig = validateEnvironment(process.env);
