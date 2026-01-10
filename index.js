// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './supabaseClient.js';
import OpenAI from "openai";
import ExcelJS from "exceljs";


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Helper de logs para errores de Supabase
const logSbError = (label, error) => {
  console.error(`${label}:`, {
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
app.post("/api/planeaciones", async (req, res) => {
  try {
    const { materia, nivel, tema, subtema, duracion, sesiones, tabla_ia } = req.body;

    if (!materia || !nivel || !tema) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const { data, error } = await supabase
      .from("planeaciones")
      .insert([{ materia, nivel, tema, subtema, duracion, sesiones, tabla_ia }])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("❌ Error insertando planeación:", err);
    res.status(500).json({ error: "Error al guardar planeación" });
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

    if (error) { logSbError('Supabase insert error', error); throw error; }

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

    if (error) { logSbError('Supabase insert error', error); throw error; }
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

  // Agregamos tabla_ia a la desestructuración
  const { materia, grado, tema, duracion, detalles_completos, tabla_ia } = req.body || {};


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

  if (tabla_ia !== undefined) update.tabla_ia = tabla_ia;

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

    if (error) { logSbError('Supabase insert error', error); throw error; }
    if (!data) return res.status(404).json({ error: 'No encontrado' });

    res.json(data);
  } catch (err) {
    console.error('❌ Error al actualizar planeación:', err.message);
    res.status(500).json({ error: 'Error al actualizar planeación' });
  }
});

// habilita respuestas a preflights de todos los endpoints
app.options('*', cors({
  origin: NODE_ENV === 'development'
    ? true
    : (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('CORS: Origin no permitido'));
      },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: false,
}));

// Eliminar planeación (mejor logging y respuesta)
app.delete('/api/planeaciones/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    console.log(`[DELETE] /api/planeaciones/${id} origin=${req.headers.origin || 'n/a'}`);

    const { data, error } = await supabase
      .from('planeaciones')
      .delete()
      .eq('id', id)
      .select('id'); // importante: necesitamos SELECT para saber si borró algo

    if (error) {
      // log detallado
      console.error('[SB_DELETE_ERROR]', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return res.status(500).json({ error: 'Error al eliminar planeación' });
    }

    if (!data || data.length === 0) {
      // No existía (o políticas impiden devolver fila)
      return res.status(404).json({ error: 'No encontrado' });
    }

    // ok
    return res.status(200).json({ id: data[0].id, message: 'Planeación eliminada' });
  } catch (err) {
    console.error('❌ Error al eliminar planeación (catch):', err);
    return res.status(500).json({ error: 'Error al eliminar planeación' });
  }
});

// exportar a excel (CSV) GET /api/planeaciones/:id/export/excel
app.get("/api/planeaciones/:id/export/excel", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Obtener planeación
    const { data, error } = await supabase
      .from("planeaciones")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Planeación no encontrada" });
    }

    const {
      materia,
      nivel,
      tema,
      subtema,
      duracion,
      sesiones,
      tabla_ia
    } = data;

    // 2. Crear workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Planeación");

    // 3. Encabezado institucional
    sheet.addRow(["Planeación Didáctica"]);
    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").font = { bold: true, size: 16 };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.addRow([]);
    sheet.addRow(["Materia:", materia]);
    sheet.addRow(["Nivel:", nivel]);
    sheet.addRow(["Tema:", tema]);
    sheet.addRow(["Subtema:", subtema || "-"]);
    sheet.addRow(["Duración (min):", duracion]);
    sheet.addRow(["Sesiones:", sesiones]);
    sheet.addRow([]);

    // 4. Encabezados de tabla
    sheet.addRow([
      "Momento",
      "Actividades",
      "PAEC",
      "Tiempo (min)",
      "Producto",
      "Instrumento",
      "Formativa",
      "Sumativa"
    ]);

    const headerRow = sheet.lastRow;
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center" };

    // 5. Filas IA
    tabla_ia.forEach(row => {
      sheet.addRow([
        row.tiempo_sesion,
        row.actividades,
        row.paec,
        row.tiempo_min,
        row.producto,
        row.instrumento,
        row.formativa,
        row.sumativa
      ]);
    });

    // 6. Ajustes visuales
    sheet.columns.forEach(col => {
      col.width = 25;
      col.alignment = { vertical: "top", wrapText: true };
    });

    // 7. Enviar archivo
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Planeacion_${materia}_${nivel}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("❌ Error exportando Excel:", err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
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
