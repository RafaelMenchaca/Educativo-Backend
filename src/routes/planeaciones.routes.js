import { Router } from 'express';
import { supabase } from '../../supabaseClient.js';
import OpenAI from 'openai';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';

const router = Router();

// ---------- helpers ----------
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

// ---------- OpenAI ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------- auth middleware ----------
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token requerido" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Token inválido" });
  }

  req.user = data.user;
  next();
}

// ---------- rutas ----------

// Listar planeaciones
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .select('*')
      .eq('user_id', req.user.id)
      .order('fecha_creacion', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
});

// Obtener por ID
router.get('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'No encontrado' });
  }

  res.json(data);
});

// Actualizar
router.put('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isPositiveInt(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const update = req.body || {};

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .update(update)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No encontrado' });

    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al actualizar planeación' });
  }
});

// Eliminar
router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  const { error } = await supabase
    .from('planeaciones')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(500).json({ error: 'Error al eliminar' });
  }

  res.json({ ok: true });
});

export default router;
