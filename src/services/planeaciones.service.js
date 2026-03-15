import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { buildPromptByLevel } from '../utils/buildPromptByLevel.js';
import { crearTemas, obtenerContextoTema, obtenerContextoUnidad } from './jerarquia.service.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const TABLA_IA_PRIMARY_MAX_TOKENS = 1200;
const TABLA_IA_RETRY_MAX_TOKENS = 1600;

function buildHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function getClient(supabaseClient) {
  return supabaseClient || supabaseAdmin;
}

async function enriquecerPlaneacionConJerarquia(client, planeacion) {
  if (!planeacion?.tema_id) {
    return planeacion;
  }

  try {
    const contexto = await obtenerContextoTema(client, planeacion.tema_id);
    const ruta = [
      { nivel: 'plantel', id: contexto.plantel?.id || null, nombre: contexto.plantel?.nombre || '' },
      { nivel: 'grado', id: contexto.grado?.id || null, nombre: contexto.grado?.nombre || '' },
      { nivel: 'materia', id: contexto.materia?.id || null, nombre: contexto.materia?.nombre || '' },
      { nivel: 'unidad', id: contexto.unidad?.id || null, nombre: contexto.unidad?.nombre || '' },
      { nivel: 'tema', id: contexto.tema?.id || null, nombre: contexto.tema?.titulo || '' }
    ].filter((item) => item.nombre);

    return {
      ...planeacion,
      jerarquia: {
        plantel: contexto.plantel || null,
        grado: contexto.grado || null,
        materia: contexto.materia || null,
        unidad: contexto.unidad || null,
        tema: contexto.tema || null,
        ruta,
        ruta_label: ruta.map((item) => item.nombre).join(' / ')
      }
    };
  } catch {
    return planeacion;
  }
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

function normalizeTablaIaPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.tabla)) {
      return payload.tabla;
    }

    if (Array.isArray(payload.tabla_ia)) {
      return payload.tabla_ia;
    }
  }

  return [];
}

function extractJsonCandidates(rawText) {
  const candidates = [];

  function pushCandidate(value) {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate || candidates.includes(candidate)) {
      return;
    }
    candidates.push(candidate);
  }

  pushCandidate(rawText);
  pushCandidate(rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || '');
  pushCandidate(rawText.match(/\{[\s\S]*\}/)?.[0] || '');
  pushCandidate(rawText.match(/\[[\s\S]*\]/)?.[0] || '');

  return candidates;
}

function parseTablaIa(rawText, duracion) {
  const candidates = extractJsonCandidates(rawText);

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];

    try {
      const parsed = JSON.parse(candidate);
      const tablaIa = normalizeTablaIaPayload(parsed);

      if (Array.isArray(tablaIa) && tablaIa.length > 0) {
        return {
          tablaIa,
          jsonOk: true,
          errorTipo: index === 0 ? null : 'json_recovered'
        };
      }
    } catch {
      // Continue trying with other JSON-like candidates.
    }
  }

  return {
    tablaIa: buildFallbackTablaIa(duracion),
    jsonOk: false,
    errorTipo: 'fallback_used'
  };
}

async function solicitarTablaIaCompletion({ prompt, maxTokens, temperature }) {
  return openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Actua como un docente experto en diseno de planeaciones didacticas, con experiencia en primaria, secundaria, bachillerato y nivel superior. Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature,
    max_tokens: maxTokens
  });
}

async function generarTablaIa({ materia, nivel, unidad, tema, duracion }) {
  const basePrompt = buildPromptByLevel({
    materia,
    nivel,
    unidad,
    tema,
    duracion
  });

  const prompt = `${basePrompt}

Devuelve un objeto JSON valido con esta forma exacta:
{
  "tabla": [
    {
      "tiempo_sesion": "Conocimientos previos | Desarrollo | Cierre",
      "actividades": "texto",
      "tiempo_min": numero,
      "producto": "texto",
      "instrumento": "texto",
      "formativa": "texto",
      "sumativa": numero
    }
  ]
}

La propiedad "tabla" debe contener exactamente tres objetos. No uses markdown.`;

  const attempts = [
    { maxTokens: TABLA_IA_PRIMARY_MAX_TOKENS, temperature: 0.4 },
    { maxTokens: TABLA_IA_RETRY_MAX_TOKENS, temperature: 0.2 }
  ];

  let lastAttempt = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const completion = await solicitarTablaIaCompletion({
      prompt,
      maxTokens: attempt.maxTokens,
      temperature: attempt.temperature
    });

    const usage = completion.usage || {};
    const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
    const finishReason = completion.choices?.[0]?.finish_reason || null;
    const parsed = parseTablaIa(rawText, duracion);

    lastAttempt = {
      parsed,
      finishReason,
      usage
    };

    if (parsed.jsonOk) {
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
          prompt_version: 'v2_json_object_retry'
        }
      };
    }

    const hasMoreAttempts = index < attempts.length - 1;
    console.warn('Respuesta IA invalida para tabla_ia; reintentando.', {
      tema,
      materia,
      nivel,
      intento: index + 1,
      finish_reason: finishReason,
      tokens_completion: usage.completion_tokens || 0,
      error_tipo: parsed.errorTipo,
      reintentara: hasMoreAttempts
    });
  }

  console.warn('Se uso fallback para tabla_ia tras agotar reintentos.', {
    tema,
    materia,
    nivel,
    finish_reason: lastAttempt?.finishReason || null,
    tokens_completion: lastAttempt?.usage?.completion_tokens || 0
  });

  return {
    tablaIa: lastAttempt?.parsed?.tablaIa || buildFallbackTablaIa(duracion),
    metrics: {
      tokens_prompt: lastAttempt?.usage?.prompt_tokens || 0,
      tokens_completion: lastAttempt?.usage?.completion_tokens || 0,
      tokens_total: lastAttempt?.usage?.total_tokens || 0,
      json_ok: lastAttempt?.parsed?.jsonOk || false,
      error_tipo: lastAttempt?.parsed?.errorTipo || 'fallback_used',
      nivel,
      materia,
      prompt_version: 'v2_json_object_retry'
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
  return enriquecerPlaneacionConJerarquia(client, data);
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
  return enriquecerPlaneacionConJerarquia(client, data);
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
