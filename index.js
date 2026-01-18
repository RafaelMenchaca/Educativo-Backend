import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './supabaseClient.js';
import OpenAI from "openai";
import ExcelJS from "exceljs";
import { randomUUID } from "crypto";



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


// Middleware: autenticar usuario Supabase
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


// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true, env: NODE_ENV });
});

// Ruta de prueba
app.get('/', (_req, res) => {
  res.send('Servidor educativo-ia funcionando 🚀');
});

// Listar planeaciones (paginación opcional)
app.get('/api/planeaciones', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .select('*')
      .eq('user_id', req.user.id)
      .order('fecha_creacion', { ascending: false });

    if (error) throw error;
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
});


// Obtener planeación por ID=
app.get('/api/planeaciones/:id', requireAuth, async (req, res) => {
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

// Actualizar planeación (PUT)
app.put('/api/planeaciones/:id', requireAuth, async (req, res) => {

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
app.delete('/api/planeaciones/:id', requireAuth, async (req, res) => {
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



// Exportar planeación a Excel
app.get('/api/planeaciones/:id/export/excel', requireAuth, async (req, res) => {


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
app.post('/api/planeaciones/generate', requireAuth, async (req, res) => {
  try {
    const { materia, nivel, unidad, temas } = req.body;

    if (
      !materia ||
      !nivel ||
      !Number.isInteger(unidad) ||
      unidad < 1 ||
      !Array.isArray(temas) ||
      temas.length === 0
    ) {
      return res.status(400).json({ error: "Datos inválidos" });
    }

    // Se creara id por submit, cada id tendra N planeaciones por N temas
    const batch_id = randomUUID();



    // Función para construir prompt adaptativo por nivel
    function buildPromptByLevel({ materia, nivel, unidad, tema, duracion }) {
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
    "tiempo_min": número (en minutos, ajustado al total de ${duracion}),
    "producto": "...",
    "instrumento": "...",
    "formativa": "...",
    "sumativa": número entero (ponderación, los tres valores deben sumar exactamente 10)
  }
]

Debe mantener exactamente tres objetos en el arreglo (uno por momento).
No incluyas texto fuera del JSON.
La columna "sumativa" debe ser un número entero entre 1 y 10.
Distribuye los valores entre las tres actividades según su importancia pedagógica.
La suma total de los tres valores debe ser exactamente 10.
No devuelvas texto en "sumativa".
Ajusta los tiempos para que sumen exactamente ${duracion} minutos.
La planeación debe estar pensada para una sola sesión completa.
`;


      // Adaptaciones según nivel educativo
      if (/primaria/i.test(nivel)) {
        return `
${base}
📘 Contexto: Nivel Primaria
Usa un lenguaje sencillo y alegre, con ejemplos concretos, visuales y actividades cortas (10–15 min).
Evita tecnicismos. Usa productos como dibujos, esquemas, dramatizaciones o explicaciones breves.
Materia: ${materia}
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
`;
      }

      if (/secundaria/i.test(nivel)) {
        return `
${base}
📗 Contexto: Nivel Secundaria
Usa un lenguaje intermedio, fomenta el trabajo colaborativo y la reflexión.
Incluye actividades de exploración, análisis, debates o resolución de problemas aplicados.
Materia: ${materia}
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
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
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
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
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
  `;
      }


      // Por defecto
      return `
      ${base}
      Materia: ${materia}
      Nivel: ${nivel}
      Unidad: ${unidad}
      Tema: ${tema}
      Duración total: ${duracion} minutos
      `;
}

    // Construir prompt adaptativo
    const planeacionesCreadas = [];

    for (const t of temas) {
      const { tema, duracion } = t;

      if (!tema || !Number.isInteger(duracion) || duracion < 10) {
        return res.status(400).json({ error: "Tema o duración inválida" });
      }

      const prompt = buildPromptByLevel({
        materia,
        nivel,
        unidad,
        tema,
        duracion
      });

      console.log("Prompt generado:\n", prompt);


      // --- Llamada a OpenAI ---
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Eres un experto diseñador instruccional en educación mexicana que genera planeaciones didácticas realistas y bien estructuradas."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.6, // regular entre 0.2 a 0.6 más consistencia, menos variabilidad
        max_tokens: 700
      });

      const usage = completion.usage || {};
      const tokens_prompt = usage.prompt_tokens || 0;
      const tokens_completion = usage.completion_tokens || 0;
      const tokens_total = usage.total_tokens || 0;

      const rawText = completion.choices[0].message.content?.trim() || "";

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
            tiempo_min: 10,
            producto: "Mapa mental",
            instrumento: "Lista de cotejo",
            formativa: "Diagnóstica",
            sumativa: 3
          },
          {
            tiempo_sesion: "Desarrollo",
            actividades: "Trabajo colaborativo",
            tiempo_min: duracion - 20,
            producto: "Ejercicios",
            instrumento: "Rúbrica",
            formativa: "Formativa",
            sumativa: 5
          },
          {
            tiempo_sesion: "Cierre",
            actividades: "Reflexión final",
            tiempo_min: 10,
            producto: "Conclusión",
            instrumento: "Lista de cotejo",
            formativa: "-",
            sumativa: 2
          }
        ];
      }



      // --- Guardar planeación ---
      const { data, error } = await supabase
        .from("planeaciones")
        .insert([
          {
            materia,
            nivel,
            unidad,
            tema,
            duracion,
            tabla_ia: tablaIa,
            user_id: req.user.id,
            batch_id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      planeacionesCreadas.push(data);


      // --- Métricas IA (por planeación) ---
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
    } // fin for temas



    res.json({
      batch_id,
      total: planeacionesCreadas.length,
      planeaciones: planeacionesCreadas
    });


  } // fin try del inicio del endpoint
  catch (err) {
    console.error("❌ Error al generar planeación con IA:", err);
    res.status(500).json({
      error: "Error al generar planeación con IA",
      details: err.message
    });
  }
});


// Listar creaciones (batches)
app.get('/api/planeaciones/batches', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planeaciones')
      .select('batch_id, materia, nivel, unidad, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Agrupar por batch_id
    const batchesMap = {};

    for (const row of data) {
      if (!batchesMap[row.batch_id]) {
        batchesMap[row.batch_id] = {
          batch_id: row.batch_id,
          materia: row.materia,
          nivel: row.nivel,
          unidad: row.unidad,
          total_planeaciones: 0,
          created_at: row.created_at
        };
      }
      batchesMap[row.batch_id].total_planeaciones += 1;
    }

    res.json(Object.values(batchesMap));
  } catch (err) {
    console.error('❌ Error listando batches:', err);
    res.status(500).json({ error: 'Error al obtener creaciones' });
  }
});

// Listar planeaciones por batch (VERSIÓN FINAL)
app.get("/api/planeaciones/batch/:batch_id", requireAuth, async (req, res) => {
  try {
    const { batch_id } = req.params;

    const { data, error } = await supabase
      .from("planeaciones")
      .select("*")
      .eq("batch_id", batch_id)
      .eq("user_id", req.user.id)
      .order("fecha_creacion", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        error: "No se encontraron planeaciones para este batch"
      });
    }

    res.json({
      batch_id,
      total: data.length,
      planeaciones: data
    });

  } catch (err) {
    console.error("❌ Error en batch endpoint:", err);
    res.status(500).json({
      error: "Error al obtener planeaciones",
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
