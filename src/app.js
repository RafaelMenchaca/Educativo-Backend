import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.js';

dotenv.config();

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';

// --- CORS: en dev permite todo, en prod solo orígenes listados ---
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: NODE_ENV === 'development'
    ? true
    : (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        // permite dev locales aunque NODE_ENV sea production (útil para debug)
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
        // opcional: permitir *.github.io (si usas GitHub Pages)
        if (/^https?:\/\/([a-z0-9-]+\.)?github\.io$/.test(origin)) return cb(null, true);
        cb(new Error('CORS: Origin no permitido'));
      }
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
