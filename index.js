import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './supabaseClient.js';
import OpenAI from "openai";
import ExcelJS from "exceljs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper de logs para errores de Supabase

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

const logSbError = (label, error) => {
  console.error(label, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
};

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


// Auth middleware 
async function requireUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  req.user = data.user;
  next();
}

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true, env: NODE_ENV });
});

// Listar planeaciones (paginación opcional)
app.get('/api/planeaciones', requireUser, async (req, res) => {
  const page = parseInt(req.query.page ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize ?? '50', 10);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, error, count } = await supabase
      .from('planeaciones')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('fecha_creacion', { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({ items: data, page, pageSize, total: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
});

// Obtener planeación por ID=
app.get('/api/planeaciones/:id', requireUser, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isPositiveInt(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No encontrado' });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener planeación' });
  }
});

// Actualizar planeación (PUT)
app.put('/api/planeaciones/:id', requireUser, async (req, res) => {
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
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar planeación' });
  }
});


// Eliminar planeación
app.delete('/api/planeaciones/:id', requireUser, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isPositiveInt(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    res.json({ id: data[0].id, message: 'Planeación eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar planeación' });
  }
});


// Exportar planeación a Excel
app.get('/api/planeaciones/:id/export/excel', requireUser, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Planeación no encontrada' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Planeación');

  sheet.addRow(['Planeación Didáctica']);
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').font = { bold: true, size: 16 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.addRow([]);
  sheet.addRow(['Materia:', data.materia]);
  sheet.addRow(['Nivel:', data.nivel]);
  sheet.addRow(['Tema:', data.tema]);
  sheet.addRow(['Subtema:', data.subtema || '-']);
  sheet.addRow(['Duración:', data.duracion]);
  sheet.addRow(['Sesiones:', data.sesiones]);
  sheet.addRow([]);

  sheet.addRow([
    'Momento',
    'Actividades',
    'PAEC',
    'Tiempo',
    'Producto',
    'Instrumento',
    'Formativa',
    'Sumativa'
  ]);

  data.tabla_ia.forEach(r => {
    sheet.addRow([
      r.tiempo_sesion,
      r.actividades,
      r.paec,
      r.tiempo_min,
      r.producto,
      r.instrumento,
      r.formativa,
      r.sumativa
    ]);
  });

  sheet.columns.forEach(col => {
    col.width = 25;
    col.alignment = { wrapText: true, vertical: 'top' };
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=Planeacion_${data.materia}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
});


// --- Generar planeación con IA real (usando gpt-4o-mini) ---
app.post('/api/planeaciones/generate', async (req, res) => {
  try {
    const { materia, nivel, tema, subtema, duracion, sesiones } = req.body;

    if (!materia || !nivel || !tema) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Función para construir prompt adaptativo por nivel
    function buildPromptByLevel({ materia, nivel, tema, subtema, duracion, sesiones }) {
      const base = `
Genera una planeación didáctica estructurada en tres momentos:
1️⃣ Conocimientos previos
2️⃣ Desarrollo
3️⃣ Cierre

Usa el formato JSON siguiente:
[
  {
    "tiempo_sesion": "Conocimientos previos | Desarrollo | Cierre",
    "actividades": "...",
    "paec": "Previo | Aplicación | Reflexión",
    "tiempo_min": número (en minutos, ajustado al total de ${duracion}),
    "producto": "...",
    "instrumento": "...",
    "formativa": "...",
    "sumativa": "..."
  }
]

Debe mantener exactamente tres objetos en el arreglo (uno por momento).
No incluyas texto fuera del JSON.
`;

      // Adaptaciones según nivel educativo
      if (/primaria/i.test(nivel)) {
        return `
${base}
📘 Contexto: Nivel Primaria
Usa un lenguaje sencillo y alegre, con ejemplos concretos, visuales y actividades cortas (10–15 min).
Evita tecnicismos. Usa productos como dibujos, esquemas, dramatizaciones o explicaciones breves.
Materia: ${materia}
Tema: ${tema}
Subtema: ${subtema}
Duración total: ${duracion} minutos
Sesiones: ${sesiones}
`;
      }

      if (/secundaria/i.test(nivel)) {
        return `
${base}
📗 Contexto: Nivel Secundaria
Usa un lenguaje intermedio, fomenta el trabajo colaborativo y la reflexión.
Incluye actividades de exploración, análisis, debates o resolución de problemas aplicados.
Materia: ${materia}
Tema: ${tema}
Subtema: ${subtema}
Duración total: ${duracion} minutos
Sesiones: ${sesiones}
`;
      }

      if (/prepa|preparatoria|bachiller/i.test(nivel)) {
        return `
${base}
📙 Contexto: Nivel Preparatoria
Usa un lenguaje formal y técnico.
Promueve el pensamiento crítico, el trabajo autónomo y la aplicación de conocimientos.
Las actividades deben incluir análisis, exposición oral o proyectos escritos.
Materia: ${materia}
Tema: ${tema}
Subtema: ${subtema}
Duración total: ${duracion} minutos
Sesiones: ${sesiones}
`;
      }

      if (/universidad|licenciatura|ingenier|posgrado/i.test(nivel)) {
  return `
${base}
📘 Contexto: Nivel Universitario
Usa un lenguaje académico, formal y técnico.
Fomenta la investigación, la argumentación y la aplicación práctica de conceptos teóricos.
Las actividades deben incluir análisis de casos, debates, proyectos integradores o exposiciones.
Promueve la autonomía y la evaluación por competencias.
Materia: ${materia}
Tema: ${tema}
Subtema: ${subtema}
Duración total: ${duracion} minutos
Sesiones: ${sesiones}
`;
}


      // Por defecto
      return `
${base}
Nivel educativo: ${nivel}
Materia: ${materia}
Tema: ${tema}
Subtema: ${subtema}
Duración total: ${duracion} minutos
Sesiones: ${sesiones}
`;
    }

    // Construir prompt adaptativo
    const prompt = buildPromptByLevel({ materia, nivel, tema, subtema, duracion, sesiones });
    console.log("Prompt generado:\n", prompt);

    // --- Llamada a OpenAI ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto diseñador instruccional en educación mexicana que genera planeaciones didácticas realistas y bien estructuradas."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.5, // regular entre 0.2 a 0.6 más consistencia, menos variabilidad
      max_tokens: 700
    });

    const usage = completion.usage || {};
    const tokens_prompt = usage.prompt_tokens || 0;
    const tokens_completion = usage.completion_tokens || 0;
    const tokens_total = usage.total_tokens || 0;

    const rawText = completion.choices[0].message.content?.trim() || "";

    // JSON 
    let jsonOk = true;
    let errorTipo = null;
    let tablaIa = [];

    try {
      tablaIa = JSON.parse(rawText);
    } catch {
      jsonOk = false;
      errorTipo = "invalid_json";

      const match = rawText.match(/\[.*\]/s);
      if (match) {
        try {
          tablaIa = JSON.parse(match[0]);
          jsonOk = true;
          errorTipo = "json_recovered";
        } catch {}
      }
    }

    if (!Array.isArray(tablaIa) || tablaIa.length === 0) {
      jsonOk = false;
      errorTipo = "fallback_used";

      tablaIa = [
        {
          tiempo_sesion: "Conocimientos previos",
          actividades: "Discusión guiada",
          paec: "Previo",
          tiempo_min: 10,
          producto: "Mapa mental",
          instrumento: "Lista de cotejo",
          formativa: "Diagnóstica",
          sumativa: "-"
        },
        {
          tiempo_sesion: "Desarrollo",
          actividades: "Trabajo colaborativo",
          paec: "Aplicación",
          tiempo_min: duracion - 20,
          producto: "Ejercicios",
          instrumento: "Rúbrica",
          formativa: "Formativa",
          sumativa: "-"
        },
        {
          tiempo_sesion: "Cierre",
          actividades: "Reflexión final",
          paec: "Reflexión",
          tiempo_min: 10,
          producto: "Conclusión",
          instrumento: "Lista de cotejo",
          formativa: "-",
          sumativa: "Sumativa"
        }
      ];
    }

    // DB PLANEACIONES 
    const { data, error } = await supabase
      .from("planeaciones")
      .insert([
        {
          materia,
          nivel,
          tema,
          subtema,
          duracion,
          sesiones,
          tabla_ia: tablaIa
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // MÉTRICAS IA (NO BLOQUEANTE)
    const { error: metricsError } = await supabase
      .from("ia_metrics")
      .insert([
        {
          nivel,
          materia,
          prompt_version: "v1_adaptativo_niveles",
          tokens_prompt,
          tokens_completion,
          tokens_total,
          json_ok: jsonOk,
          error_tipo: errorTipo
        }
      ]);

    if (metricsError) {
      console.warn("⚠️ Error guardando métricas IA:", metricsError);
    }



    res.json(data);

  } catch (err) {
    console.error("❌ Error al generar planeación con IA:", err);
    res.status(500).json({
      error: "Error al generar planeación con IA",
      details: err.message
    });
  }
});

// Error handling
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
