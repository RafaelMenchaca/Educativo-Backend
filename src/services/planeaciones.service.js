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

function buildFallbackTablaIa(duracion) {
  return [
    {
      tiempo_sesion: 'Conocimientos previos',
      actividades: 'Discusion guiada',
      tiempo_min: 10,
      producto: 'Mapa mental',
      instrumento: 'Lista de cotejo',
      formativa: 'Diagnostica',
      sumativa: 3
    },
    {
      tiempo_sesion: 'Desarrollo',
      actividades: 'Trabajo colaborativo',
      tiempo_min: duracion - 20,
      producto: 'Ejercicios',
      instrumento: 'Rubrica',
      formativa: 'Formativa',
      sumativa: 5
    },
    {
      tiempo_sesion: 'Cierre',
      actividades: 'Reflexion final',
      tiempo_min: 10,
      producto: 'Conclusion',
      instrumento: 'Lista de cotejo',
      formativa: '-',
      sumativa: 2
    }
  ];
}

async function generarPlaneacionesIAInternal({
  materia,
  nivel,
  unidad,
  temas,
  userId,
  onEvent
}) {
  const batch_id = randomUUID();
  const planeacionesCreadas = [];

  for (let i = 0; i < temas.length; i += 1) {
    const t = temas[i];
    const { tema, duracion } = t;
    const index = i + 1;

    if (!tema || !Number.isInteger(duracion) || duracion < 10) {
      throw new Error('Tema o duracion invalida');
    }

    if (typeof onEvent === 'function') {
      onEvent({ type: 'item_started', index, tema });
    }

    try {
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
              'Actua como un docente experto en diseno de planeaciones didacticas, con experiencia en primaria, secundaria, bachillerato y nivel superior. Tus planeaciones deben reflejar criterio pedagogico, variedad metodologica y dominio del tema.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 700
      });

      const usage = completion.usage || {};
      const tokens_prompt = usage.prompt_tokens || 0;
      const tokens_completion = usage.completion_tokens || 0;
      const tokens_total = usage.total_tokens || 0;

      const rawText = completion.choices[0].message.content?.trim() || '';

      let jsonOk = true;
      let errorTipo = null;
      let tablaIa = [];

      try {
        tablaIa = JSON.parse(rawText);
      } catch {
        jsonOk = false;
        errorTipo = 'invalid_json';

        const match = rawText.match(/\[.*\]/s);
        if (match) {
          try {
            tablaIa = JSON.parse(match[0]);
            jsonOk = true;
            errorTipo = 'json_recovered';
          } catch {
            // noop
          }
        }
      }

      if (!Array.isArray(tablaIa) || tablaIa.length === 0) {
        jsonOk = false;
        errorTipo = 'fallback_used';
        tablaIa = buildFallbackTablaIa(duracion);
      }

      const { data, error } = await supabase
        .from('planeaciones')
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

      await supabase.from('ia_metrics').insert([
        {
          nivel,
          materia,
          prompt_version: 'v1_adaptativo_niveles',
          tokens_prompt,
          tokens_completion,
          tokens_total,
          json_ok: jsonOk,
          error_tipo: errorTipo
        }
      ]);

      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_completed',
          index,
          tema,
          planeacion_id: data.id
        });
      }
    } catch (error) {
      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_error',
          index,
          tema,
          error: error?.message || 'Error generando planeacion'
        });
      }
      throw error;
    }
  }

  return {
    batch_id,
    total: planeacionesCreadas.length,
    planeaciones: planeacionesCreadas
  };
}

export async function generarPlaneacionesIA(payload) {
  return generarPlaneacionesIAInternal(payload);
}

export async function generarPlaneacionesIAConProgreso(payload, onEvent) {
  return generarPlaneacionesIAInternal({
    ...payload,
    onEvent
  });
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
    map[row.batch_id].total_planeaciones += 1;
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
