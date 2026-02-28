import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { buildPromptByLevel } from '../utils/buildPromptByLevel.js';
import { crearTemas, obtenerContextoUnidad } from './jerarquia.service.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function buildHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function getClient(supabaseClient) {
  return supabaseClient || supabaseAdmin;
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

function parseTablaIa(rawText, duracion) {
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

  return {
    tablaIa,
    jsonOk,
    errorTipo
  };
}

async function generarTablaIa({ materia, nivel, unidad, tema, duracion }) {
  const prompt = buildPromptByLevel({
    materia,
    nivel,
    unidad,
    tema,
    duracion
  });

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
  const rawText = completion.choices?.[0]?.message?.content?.trim() || '';

  const parsed = parseTablaIa(rawText, duracion);

  return {
    tablaIa: parsed.tablaIa,
    metrics: {
      tokens_prompt: usage.prompt_tokens || 0,
      tokens_completion: usage.completion_tokens || 0,
      tokens_total: usage.total_tokens || 0,
      json_ok: parsed.jsonOk,
      error_tipo: parsed.errorTipo,
      nivel,
      materia,
      prompt_version: 'v1_adaptativo_niveles'
    }
  };
}

async function guardarMetricasIa(client, metrics) {
  const { error } = await client.from('ia_metrics').insert([metrics]);
  if (error) {
    console.warn('No se pudo guardar ia_metrics:', error.message || error);
  }
}

export async function listarPlaneaciones({ supabaseClient, userId }) {
  const client = getClient(supabaseClient);

  const query = client
    .from('planeaciones')
    .select('*')
    .order('fecha_creacion', { ascending: false });

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

export async function obtenerPlaneacionPorId({ supabaseClient, id, userId }) {
  const client = getClient(supabaseClient);

  const query = client.from('planeaciones').select('*').eq('id', id);
  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function actualizarPlaneacion({
  supabaseClient,
  id,
  update,
  userId
}) {
  const client = getClient(supabaseClient);
  const safeUpdate = { ...(update || {}) };
  delete safeUpdate.user_id;

  const query = client.from('planeaciones').update(safeUpdate).eq('id', id);
  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.select().maybeSingle();

  if (error) throw error;
  return data;
}

export async function eliminarPlaneacion({ supabaseClient, id, userId }) {
  const client = getClient(supabaseClient);

  const query = client.from('planeaciones').delete().eq('id', id);
  if (userId) {
    query.eq('user_id', userId);
  }

  const { error } = await query;

  if (error) throw error;
}

async function generarPlaneacionesIAInternal({
  supabaseClient,
  materia,
  nivel,
  unidad,
  temas,
  userId,
  onEvent,
  continueOnError = false
}) {
  const client = getClient(supabaseClient);
  const batch_id = randomUUID();
  const planeacionesCreadas = [];

  for (let i = 0; i < temas.length; i += 1) {
    const t = temas[i];
    const temaNombre = typeof t?.tema === 'string' ? t.tema.trim() : '';
    const duracion = Number.parseInt(t?.duracion, 10);
    const index = i + 1;

    if (!temaNombre || !Number.isInteger(duracion) || duracion < 10) {
      throw new Error('Tema o duracion invalida');
    }

    if (typeof onEvent === 'function') {
      onEvent({ type: 'item_started', index, tema: temaNombre });
    }

    try {
      const { tablaIa, metrics } = await generarTablaIa({
        materia,
        nivel,
        unidad,
        tema: temaNombre,
        duracion
      });

      const insertPayload = {
        materia,
        nivel,
        unidad,
        tema: temaNombre,
        duracion,
        tabla_ia: tablaIa,
        batch_id
      };

      if (userId) {
        insertPayload.user_id = userId;
      }

      const { data, error } = await client
        .from('planeaciones')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;

      planeacionesCreadas.push(data);

      await guardarMetricasIa(client, metrics);

      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_completed',
          index,
          tema: temaNombre,
          planeacion_id: data.id
        });
      }
    } catch (error) {
      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_error',
          index,
          tema: temaNombre,
          error: error?.message || 'Error generando planeacion'
        });
      }

      if (!continueOnError) {
        throw error;
      }
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

function normalizeTemaUnidadInput(item) {
  const titulo = typeof item?.titulo === 'string' ? item.titulo.trim() : '';
  const duracion = Number.parseInt(item?.duracion, 10);
  const orden = Number.isInteger(item?.orden) ? item.orden : Number.parseInt(item?.orden, 10);

  if (!titulo) {
    throw buildHttpError(400, 'Tema invalido: titulo requerido');
  }

  if (!Number.isInteger(duracion) || duracion < 10) {
    throw buildHttpError(400, 'Tema invalido: duracion minima 10');
  }

  const normalized = {
    titulo,
    duracion
  };

  if (Number.isInteger(orden) && orden > 0) {
    normalized.orden = orden;
  }

  return normalized;
}

async function createPendingPlaneacion({
  client,
  tema,
  batchId,
  materia,
  nivel,
  unidadLegacy
}) {
  const { data, error } = await client
    .from('planeaciones')
    .insert([
      {
        tema_id: tema.id,
        tema: tema.titulo,
        duracion: tema.duracion,
        unidad: unidadLegacy,
        materia,
        nivel,
        batch_id: batchId,
        status: 'pending'
      }
    ])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function generarPlaneacionesIAPorUnidad(payload, onEvent) {
  const client = getClient(payload?.supabaseClient);
  const unidadId = payload?.unidadId;

  if (!unidadId) {
    throw buildHttpError(400, 'unidadId es requerido');
  }

  if (!Array.isArray(payload?.temas) || payload.temas.length === 0) {
    throw buildHttpError(400, 'Debes enviar al menos un tema');
  }

  const normalizedTemas = payload.temas.map(normalizeTemaUnidadInput);
  const contexto = await obtenerContextoUnidad(client, unidadId);

  const materia =
    typeof payload?.materia === 'string' && payload.materia.trim()
      ? payload.materia.trim()
      : contexto.materia.nombre;

  const nivel =
    typeof payload?.nivel === 'string' && payload.nivel.trim()
      ? payload.nivel.trim()
      : contexto.grado.nombre;

  const unidadLegacy = Number.isInteger(contexto.unidad?.orden)
    ? contexto.unidad.orden
    : null;

  const batch_id = randomUUID();

  const temasCreados = await crearTemas(client, {
    unidadId,
    temas: normalizedTemas
  });

  const results = [];
  const planeacionIds = [];

  for (let i = 0; i < temasCreados.temas.length; i += 1) {
    const tema = temasCreados.temas[i];
    const index = i + 1;

    let planeacion = null;

    try {
      planeacion = await createPendingPlaneacion({
        client,
        tema,
        batchId: batch_id,
        materia,
        nivel,
        unidadLegacy
      });

      const planeacionId = planeacion.id;
      planeacionIds.push(planeacionId);

      const { error: generatingError } = await client
        .from('planeaciones')
        .update({ status: 'generating' })
        .eq('id', planeacionId)
        .eq('tema_id', tema.id);

      if (generatingError) {
        throw generatingError;
      }

      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_started',
          index,
          tema: tema.titulo,
          tema_id: tema.id,
          planeacion_id: planeacionId,
          status: 'generating'
        });
      }

      const { tablaIa, metrics } = await generarTablaIa({
        materia,
        nivel,
        unidad: unidadLegacy,
        tema: tema.titulo,
        duracion: tema.duracion
      });

      const { data: updatedPlaneacion, error: readyError } = await client
        .from('planeaciones')
        .update({
          tabla_ia: tablaIa,
          status: 'ready',
          tema: tema.titulo,
          duracion: tema.duracion,
          unidad: unidadLegacy,
          materia,
          nivel
        })
        .eq('id', planeacionId)
        .eq('tema_id', tema.id)
        .select('*')
        .single();

      if (readyError) {
        throw readyError;
      }

      await guardarMetricasIa(client, metrics);

      results.push({
        index,
        tema_id: tema.id,
        planeacion_id: planeacionId,
        status: 'ready'
      });

      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_completed',
          index,
          tema: tema.titulo,
          tema_id: tema.id,
          planeacion_id: planeacionId,
          status: 'ready'
        });
      }

      planeacion = updatedPlaneacion;
    } catch (error) {
      if (planeacion?.id) {
        await client
          .from('planeaciones')
          .update({ status: 'error' })
          .eq('id', planeacion.id)
          .eq('tema_id', tema.id);
      }

      results.push({
        index,
        tema_id: tema.id,
        planeacion_id: planeacion?.id || null,
        status: 'error',
        error: error?.message || 'Error generando planeacion'
      });

      if (typeof onEvent === 'function') {
        onEvent({
          type: 'item_error',
          index,
          tema: tema.titulo,
          tema_id: tema.id,
          planeacion_id: planeacion?.id || null,
          status: 'error',
          error: error?.message || 'Error generando planeacion'
        });
      }
    }
  }

  let planeaciones = [];

  if (planeacionIds.length > 0) {
    const { data, error } = await client
      .from('planeaciones')
      .select('*')
      .in('id', planeacionIds)
      .order('id', { ascending: true });

    if (error) throw error;
    planeaciones = data;
  }

  const success_count = results.filter((result) => result.status === 'ready').length;
  const error_count = results.filter((result) => result.status === 'error').length;

  return {
    batch_id,
    unidad_id: unidadId,
    total: temasCreados.total,
    success_count,
    error_count,
    results,
    planeaciones
  };
}

export async function listarBatches({ supabaseClient, userId }) {
  const client = getClient(supabaseClient);

  const query = client
    .from('planeaciones')
    .select('batch_id, materia, nivel, unidad, created_at')
    .order('created_at', { ascending: false });

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query;

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

export async function listarPlaneacionesPorBatch({
  supabaseClient,
  batchId,
  userId
}) {
  const client = getClient(supabaseClient);

  const query = client
    .from('planeaciones')
    .select('*')
    .eq('batch_id', batchId)
    .order('fecha_creacion', { ascending: true });

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}
