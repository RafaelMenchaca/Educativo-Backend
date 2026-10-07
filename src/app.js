import express from 'express';
import cors from 'cors';
import { runtimeConfig } from './config/runtime.js';
import { createCorsOriginValidator } from './config/environment.js';
import routes from './routes/index.js';

const app = express();
app.use(cors({
  origin: createCorsOriginValidator(runtimeConfig)
}));

app.use(express.json({ limit: '1mb' }));


// rutas
app.use('/api', routes);

// healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// root
app.get('/', (_req, res) => {
  res.send('Servidor educativo-ia funcionando 🚀');
});


export default app;
