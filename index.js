// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './supabaseClient.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// --- CORS: en dev permite todo, en prod solo orígenes listados ---
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // curl/postman o file://
  if (allowedOrigins.includes(origin)) return true;
  // permite dev locales aunque NODE_ENV sea production (útil para debug)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // opcional: permitir *.github.io (si usas GitHub Pages)
  if (/^https?:\/\/([a-z0-9-]+\.)?github\.io$/.test(origin)) return true;
  return false;
};

app.use(cors({
  origin: NODE_ENV === 'development' ? true : (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('CORS: Origin no permitido'));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: false,
}));


app.use(express.json({ limit: '1mb' }));

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true, env: NODE_ENV });
});

// Ruta de prueba
app.get('/', (_req, res) => {
  res.send('Servidor educativo-ia funcionando 🚀');
});

// Helpers
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

// Crear planeación
app.post('/api/planeaciones', async (req, res) => {
  const { materia, grado, tema, duracion, detalles_completos } = req.body || {};

  if (!materia || !grado || !tema) {
    return res.status(400).json({ error: 'materia, grado y tema son requeridos' });
  }
  if (duracion === undefined) {
    return res.status(400).json({ error: 'duracion es requerida' });
  }
  const dur = parseInt(duracion, 10);
  if (!Number.isFinite(dur) || dur < 0 || dur > 10000) {
    return res.status(400).json({ error: 'duracion debe ser un número válido' });
  }

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .insert([{ materia, grado, tema, duracion: dur, detalles_completos }])
      .select();

    if (error) throw error;
    if (!data || !data[0]) return res.status(500).json({ error: 'No se recibió ID de inserción' });

    res.status(201).json({ id: data[0].id });
  } catch (err) {
    console.error('❌ Error al insertar:', err.message);
    res.status(500).json({ error: 'Error al insertar planeación' });
  }
});

// Listar planeaciones (paginación opcional)
app.get('/api/planeaciones', async (req, res) => {
  const page = parseInt(req.query.page ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize ?? '50', 10);

  const from = (isPositiveInt(page) ? (page - 1) : 0) * (isPositiveInt(pageSize) ? pageSize : 50);
  const to = from + (isPositiveInt(pageSize) ? pageSize : 50) - 1;

  try {
    const { data, error, count } = await supabase
      .from('planeaciones')
      .select('*', { count: 'exact' })
      .order('fecha_creacion', { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({
      items: data ?? [],
      page,
      pageSize,
      total: count ?? 0
    });
  } catch (err) {
    console.error('❌ Error al obtener planeaciones:', err.message);
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
});

// Obtener planeación por ID
app.get('/api/planeaciones/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isPositiveInt(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No encontrado' });

    res.json(data);
  } catch (err) {
    console.error('❌ Error al obtener planeación:', err.message);
    res.status(500).json({ error: 'Error al obtener planeación' });
  }
});

// Actualizar planeación (PUT)
app.put('/api/planeaciones/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isPositiveInt(id)) return res.status(400).json({ error: 'ID inválido' });

  const { materia, grado, tema, duracion, detalles_completos } = req.body || {};

  const update = {};
  if (materia !== undefined) update.materia = materia;
  if (grado !== undefined) update.grado = grado;
  if (tema !== undefined) update.tema = tema;
  if (duracion !== undefined) {
    const dur = parseInt(duracion, 10);
    if (!Number.isFinite(dur) || dur < 0 || dur > 10000) {
      return res.status(400).json({ error: 'duracion debe ser un número válido' });
    }
    update.duracion = dur;
  }
  if (detalles_completos !== undefined) update.detalles_completos = detalles_completos;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .update(update)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No encontrado' });

    res.json(data);
  } catch (err) {
    console.error('❌ Error al actualizar planeación:', err.message);
    res.status(500).json({ error: 'Error al actualizar planeación' });
  }
});

// Eliminar planeación
app.delete('/api/planeaciones/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isPositiveInt(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrado' });

    return res.status(204).send(); // No Content
  } catch (err) {
    console.error('❌ Error al eliminar planeación:', err.message);
    res.status(500).json({ error: 'Error al eliminar planeación' });
  }
});

// Middleware de errores (incluye CORS)
app.use((err, _req, res, _next) => {
  if (err?.message?.includes('CORS')) {
    return res.status(403).json({ error: 'CORS: Origin no permitido' });
  }
  console.error('⚠️ Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 404 por defecto
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
