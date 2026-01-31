import { supabase } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { buildPromptByLevel } from '../utils/buildPromptByLevel.js';


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function listarPlaneaciones(userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('user_id', userId)
    .order('fecha_creacion', { ascending: false });

  if (error) throw error;
  return data;
}

export async function obtenerPlaneacionPorId(id, userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function actualizarPlaneacion(id, update, userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function eliminarPlaneacion(id, userId) {
  const { error } = await supabase
    .from('planeaciones')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}


// aqui se genera la planeacion con ia y el prompt base viene de utils/buildPormptByLevel.js
export async function generarPlaneacionesIA({
  materia,
  nivel,
  unidad,
  temas,
  userId
}) {
  const batch_id = randomUUID();
  const planeacionesCreadas = [];

  for (const t of temas) {
    const { tema, duracion } = t;

    if (!tema || !Number.isInteger(duracion) || duracion < 10) {
      throw new Error('Tema o duración inválida');
    }

    const prompt = buildPromptByLevel({
      materia,
      nivel,
      unidad,
      tema,
      duracion
    });

    // ver prompt generado
    console.log("Prompt generado:\n", prompt);

    // llamada a openai
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Actúa como un docente experto en diseño de planeaciones didácticas, con experiencia en todos los niveles educativos (primaria, secundaria, bachillerato y nivel superior). Tus planeaciones deben reflejar criterio pedagógico, variedad metodológica y dominio del tema.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6, // regular entre 0.2 a 0.6 más consistencia, menos variabilidad
      max_tokens: 700
    });

    // esto se usara para las metricas y medirlas para calculos de gatos, etc
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

    // fallback si la ia no devuelve un json valido
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

    // Guardar planeacion en db
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
          user_id: userId,
          batch_id
        }
      ])
      .select()
      .single();

    if (error) throw error;

    planeacionesCreadas.push(data);

    // metricas ia por planeacion
    await supabase.from("ia_metrics").insert([
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
  } 

  
  return {
    batch_id,
    total: planeacionesCreadas.length,
    planeaciones: planeacionesCreadas
  };
}



export async function listarBatches(userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .select('batch_id, materia, nivel, unidad, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const map = {};
  for (const row of data) {
    if (!map[row.batch_id]) {
      map[row.batch_id] = {
        batch_id: row.batch_id,
        materia: row.materia,
        nivel: row.nivel,
        unidad: row.unidad,
        total_planeaciones: 0,
        created_at: row.created_at
      };
    }
    map[row.batch_id].total_planeaciones++;
  }

  return Object.values(map);
}

export async function listarPlaneacionesPorBatch(batchId, userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('batch_id', batchId)
    .eq('user_id', userId)
    .order('fecha_creacion', { ascending: true });

  if (error) throw error;
  return data;
}
