import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { createAiJob, finishAiJob, failAiJob, logAiCall } from './aiMetrics.service.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ANEXOS_SYSTEM_PROMPT =
  'Eres un asistente experto en diseño de materiales educativos para estudiantes. ' +
  'Tu tarea es generar anexos de trabajo para alumnos a partir de una planeacion docente ya existente. ' +
  'No debes crear una nueva planeacion. No debes cambiar el tema. No debes inventar actividades desconectadas. ' +
  'Debes convertir las actividades de la planeacion en materiales concretos para que los estudiantes puedan trabajar. ' +
  'Los anexos deben ser solo texto. No incluyas imagenes. No incluyas glosario. ' +
  'No incluyas informacion tecnica, JSON visible, tokens, prompt, ni notas para desarrolladores. ' +
  'El resultado debe ser claro, util, conciso y listo para entregar a estudiantes. ' +
  'Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';

const ANEXOS_PROMPT_VERSION = 'v1_anexos_desde_planeacion';
const ANEXOS_TIMEOUT_MS = 90000;

function buildHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getClient(supabaseClient) {
  return supabaseClient || supabaseAdmin;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeParseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatTablaIa(tablaIa) {
  if (!Array.isArray(tablaIa) || tablaIa.length === 0) return 'Sin tabla disponible.';
  return tablaIa
    .map((row) => {
      const momento = normalizeString(row?.tiempo_sesion || row?.momento || '');
      const actividad = normalizeString(row?.actividades || row?.actividad || '');
      const estrategia = normalizeString(row?.estrategia || '');
      const recursos = normalizeString(row?.recursos || '');
      const parts = [
        momento ? `Momento: ${momento}` : '',
        actividad ? `Actividad: ${actividad}` : '',
        estrategia ? `Estrategia: ${estrategia}` : '',
        recursos ? `Recursos: ${recursos}` : ''
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .filter(Boolean)
    .join('\n');
}

function formatActividadesMomentos(actividadesMomentos) {
  if (!actividadesMomentos || typeof actividadesMomentos !== 'object') return 'Sin actividades disponibles.';
  const LABELS = {
    conocimientos_previos: 'Conocimientos previos',
    desarrollo: 'Desarrollo',
    cierre: 'Cierre'
  };
  return Object.entries(actividadesMomentos)
    .filter(([key, val]) => LABELS[key] && normalizeString(val))
    .map(([key, val]) => `- ${LABELS[key]}: ${normalizeString(val)}`)
    .join('\n') || 'Sin actividades disponibles.';
}

function buildAnexosUserPrompt({ nivel, materia, tema, duracion, tablaIa, actividadesMomentos }) {
  const tablaTexto = formatTablaIa(tablaIa);
  const actividadesTexto = formatActividadesMomentos(actividadesMomentos);

  return `Genera anexos para estudiantes tomando como base la siguiente planeacion.

Datos de la planeacion:
Nivel: ${nivel || 'No especificado'}
Materia: ${materia || 'No especificada'}
Tema: ${tema || 'No especificado'}
Duracion: ${duracion ? `${duracion} minutos` : 'No especificada'}

Tabla de planeacion:
${tablaTexto}

Actividades por momentos:
${actividadesTexto}

Instrucciones:
- Genera entre 3 y 5 anexos.
- Cada anexo debe tener titulo, instrucciones y contenido.
- Los anexos deben servir directamente para realizar las actividades de la planeacion.
- Si la planeacion incluye reflexion inicial, crea preguntas o situaciones de analisis.
- Si la planeacion incluye lectura, caso o explicacion, crea una lectura breve de apoyo.
- Si la planeacion incluye analisis, crea preguntas, tabla o ejercicios.
- Si la planeacion incluye trabajo colaborativo, crea preguntas para equipo.
- Si la planeacion incluye producto final, crea una guia breve y concisa para elaborarlo.
- No incluyas glosario.
- No incluyas imagenes.
- No repitas informacion innecesaria.
- Usa lenguaje adecuado para el nivel educativo.
- Devuelve unicamente JSON valido con el formato obligatorio.

Formato obligatorio:
{
  "titulo_general": "string",
  "descripcion": "string",
  "anexos": [
    {
      "numero": 1,
      "titulo": "string",
      "tipo": "reflexion | lectura | analisis | tabla | colaborativo | producto_final | ejercicio",
      "instrucciones": "string",
      "contenido": [
        {
          "subtitulo": "string",
          "texto": "string",
          "preguntas": ["string"]
        }
      ],
      "tabla": {
        "columnas": ["string"],
        "filas": [["string"]]
      }
    }
  ]
}`;
}

function parseAnexosJson(rawText) {
  const candidates = [
    rawText.trim(),
    rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || '',
    rawText.match(/\{[\s\S]*\}/)?.[0] || ''
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function validateAnexosPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw buildHttpError(502, 'La IA no devolvio un JSON valido.');
  }
  if (!normalizeString(payload.titulo_general)) {
    throw buildHttpError(502, 'El JSON no contiene titulo_general.');
  }
  if (!Array.isArray(payload.anexos)) {
    throw buildHttpError(502, 'El campo anexos debe ser un arreglo.');
  }
  if (payload.anexos.length < 3 || payload.anexos.length > 5) {
    throw buildHttpError(502, `Se esperaban entre 3 y 5 anexos, se recibieron ${payload.anexos.length}.`);
  }
  for (const anexo of payload.anexos) {
    if (typeof anexo.numero !== 'number') {
      throw buildHttpError(502, 'Cada anexo debe tener un campo numero numerico.');
    }
    if (!normalizeString(anexo.titulo)) {
      throw buildHttpError(502, 'Cada anexo debe tener titulo.');
    }
    if (!normalizeString(anexo.tipo)) {
      throw buildHttpError(502, 'Cada anexo debe tener tipo.');
    }
    if (!normalizeString(anexo.instrucciones)) {
      throw buildHttpError(502, 'Cada anexo debe tener instrucciones.');
    }
    if (anexo.tabla) {
      if (!Array.isArray(anexo.tabla.columnas) || !Array.isArray(anexo.tabla.filas)) {
        throw buildHttpError(502, 'El campo tabla debe tener columnas y filas.');
      }
    }
  }
  return payload;
}

async function generateAnexosWithIa({ nivel, materia, tema, duracion, tablaIa, actividadesMomentos, jobId = null, userId = null }) {
  const userPrompt = buildAnexosUserPrompt({ nivel, materia, tema, duracion, tablaIa, actividadesMomentos });

  const callStart = Date.now();
  const completion = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ANEXOS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 3000
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(buildHttpError(504, 'La generacion de IA tardo demasiado.')), ANEXOS_TIMEOUT_MS)
    )
  ]);
  const callDurationMs = Date.now() - callStart;

  const rawText = completion.choices?.[0]?.message?.content || '';
  const tokensPrompt = completion.usage?.prompt_tokens ?? null;
  const tokensCompletion = completion.usage?.completion_tokens ?? null;
  const tokensTotal = completion.usage?.total_tokens ?? null;

  const parsed = parseAnexosJson(rawText);
  const validated = validateAnexosPayload(parsed);

  if (jobId && userId) {
    logAiCall({
      jobId,
      userId,
      artifactType:  'anexo',
      callPurpose:   'main_generation',
      model:         'gpt-4o-mini',
      promptVersion: ANEXOS_PROMPT_VERSION,
      usage:         completion.usage,
      status:        'success',
      jsonOk:        Boolean(parsed),
      durationMs:    callDurationMs,
      metadata:      {
        tema,
        anexos_count: Array.isArray(validated?.anexos) ? validated.anexos.length : 0
      }
    }).catch((err) => console.error('[aiMetrics] anexos logAiCall failed:', err?.message));
  }

  return { contenido: validated, tokensPrompt, tokensCompletion, tokensTotal };
}

export async function generarAnexo({ supabaseClient, userId, planeacionId }) {
  const startedAt = Date.now();
  const client = getClient(supabaseClient);
  const normalizedPlaneacionId = String(planeacionId || '').trim();

  if (!normalizedPlaneacionId) {
    throw buildHttpError(400, 'planeacion_id es requerido.');
  }

  console.info('[anexos] generate:start', { planeacionId: normalizedPlaneacionId });

  // Fetch planeacion validando que pertenezca al usuario
  const planeacionQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tema, materia, nivel, duracion, tabla_ia, actividades_momentos')
    .eq('id', normalizedPlaneacionId);

  if (userId) {
    planeacionQuery.eq('user_id', userId);
  }

  const { data: planeacion, error: planeacionError } = await planeacionQuery.maybeSingle();
  if (planeacionError) throw planeacionError;
  if (!planeacion) throw buildHttpError(404, 'Planeacion no encontrada.');

  // Verificar si ya existe un anexo para esta planeacion
  const existingQuery = client
    .from('anexos')
    .select('*')
    .eq('planeacion_id', normalizedPlaneacionId);

  if (userId) {
    existingQuery.eq('user_id', userId);
  }

  const { data: existingAnexo, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;

  if (existingAnexo) {
    return { ok: true, anexo_id: existingAnexo.id, status: 'already_exists', anexo: existingAnexo };
  }

  // Obtener contexto adicional del tema si existe
  let unidadId = null;
  if (planeacion.tema_id) {
    const { data: tema } = await client
      .from('temas')
      .select('unidad_id')
      .eq('id', planeacion.tema_id)
      .maybeSingle();
    unidadId = tema?.unidad_id || null;
  }

  const tablaIa = safeParseJson(planeacion.tabla_ia, []);
  const actividadesMomentos = safeParseJson(planeacion.actividades_momentos, {});

  // Create AI metrics job
  let aiJobId = null;
  if (userId) {
    try {
      aiJobId = await createAiJob({
        userId,
        artifactType: 'anexo',
        actionType:   'generate',
        nivel:        normalizeString(planeacion.nivel) || null,
        materia:      normalizeString(planeacion.materia) || null,
        tema:         normalizeString(planeacion.tema) || null,
        inputSummary: {
          planeacion_id: planeacion.id,
          planeaciones_count: 1
        }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (anexo) error:', err?.message);
    }
  }

  let contenido, tokensPrompt, tokensCompletion, tokensTotal;
  try {
    ({ contenido, tokensPrompt, tokensCompletion, tokensTotal } = await generateAnexosWithIa({
      nivel: normalizeString(planeacion.nivel),
      materia: normalizeString(planeacion.materia),
      tema: normalizeString(planeacion.tema),
      duracion: planeacion.duracion || null,
      tablaIa,
      actividadesMomentos,
      jobId: aiJobId,
      userId
    }));
  } catch (err) {
    if (aiJobId) {
      failAiJob(aiJobId, {
        errorType:        err?.status ? `http_${err.status}` : 'generation_error',
        errorMessageSafe: err?.message || 'Error generando anexo'
      }).catch(() => {});
    }
    console.error('[anexos] generate:error', {
      planeacionId: planeacion.id,
      errorType: err?.status ? `http_${err.status}` : 'generation_error',
      message: err?.message || 'Error generando anexo',
      durationMs: Date.now() - startedAt
    });
    throw err;
  }

  const titulo = normalizeString(contenido.titulo_general) || `Anexos: ${normalizeString(planeacion.tema) || 'Sin titulo'}`;

  const insertPayload = {
    user_id: userId,
    planeacion_id: planeacion.id,
    tema_id: planeacion.tema_id || null,
    unidad_id: unidadId,
    batch_id: planeacion.batch_id || null,
    titulo,
    materia: normalizeString(planeacion.materia) || null,
    nivel: normalizeString(planeacion.nivel) || null,
    tema: normalizeString(planeacion.tema) || null,
    contenido,
    prompt_version: ANEXOS_PROMPT_VERSION,
    status: 'generated',
    tokens_prompt: tokensPrompt,
    tokens_completion: tokensCompletion,
    tokens_total: tokensTotal,
    updated_at: new Date().toISOString()
  };

  const { data: nuevoAnexo, error: insertError } = await client
    .from('anexos')
    .insert(insertPayload)
    .select('id, planeacion_id, titulo, materia, nivel, tema, status, created_at')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      // Race condition — alguien ya lo genero; devolver el existente
      const { data: raceAnexo } = await client
        .from('anexos')
        .select('id, planeacion_id, titulo, status')
        .eq('planeacion_id', normalizedPlaneacionId)
        .maybeSingle();
      if (aiJobId) {
        finishAiJob(aiJobId, {
          outputSummary: { anexos_creados: 0, status: 'already_exists' }
        }).catch(() => {});
      }
      return { ok: true, anexo_id: raceAnexo?.id, status: 'already_exists' };
    }
    if (aiJobId) {
      failAiJob(aiJobId, {
        errorType: 'db_insert_error',
        errorMessageSafe: insertError.message
      }).catch(() => {});
    }
    throw insertError;
  }

  if (aiJobId) {
    finishAiJob(aiJobId, {
      anexoId:      nuevoAnexo.id,
      outputSummary: {
        anexos_creados: Array.isArray(contenido?.anexos) ? contenido.anexos.length : 0
      }
    }).catch(() => {});
  }

  console.info('[anexos] generate:success', {
    anexoId: nuevoAnexo?.id,
    planeacionId: planeacion.id,
    promptVersion: ANEXOS_PROMPT_VERSION,
    tokensTotal,
    durationMs: Date.now() - startedAt
  });

  return { ok: true, anexo_id: nuevoAnexo.id, status: 'generated' };
}

export async function regenerarAnexo({ supabaseClient, userId, id }) {
  const startedAt = Date.now();
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  console.info('[anexos] regenerate:start', { anexoId: normalizedId });

  // Obtener el anexo existente para saber su planeacion_id
  const anexoQuery = client.from('anexos').select('*').eq('id', normalizedId);
  if (userId) anexoQuery.eq('user_id', userId);
  const { data: anexo, error: anexoError } = await anexoQuery.maybeSingle();
  if (anexoError) throw anexoError;
  if (!anexo) throw buildHttpError(404, 'Anexo no encontrado.');

  // Re-obtener la planeacion original
  const planeacionQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tema, materia, nivel, duracion, tabla_ia, actividades_momentos')
    .eq('id', anexo.planeacion_id);

  if (userId) planeacionQuery.eq('user_id', userId);
  const { data: planeacion, error: planeacionError } = await planeacionQuery.maybeSingle();
  if (planeacionError) throw planeacionError;
  if (!planeacion) throw buildHttpError(404, 'Planeacion original no encontrada.');

  const tablaIa = safeParseJson(planeacion.tabla_ia, []);
  const actividadesMomentos = safeParseJson(planeacion.actividades_momentos, {});

  // Create AI metrics job for regeneration
  let aiJobId = null;
  if (userId) {
    try {
      aiJobId = await createAiJob({
        userId,
        artifactType: 'anexo',
        actionType:   'regenerate',
        nivel:        normalizeString(planeacion.nivel) || null,
        materia:      normalizeString(planeacion.materia) || null,
        tema:         normalizeString(planeacion.tema) || null,
        inputSummary: { planeacion_id: planeacion.id, planeaciones_count: 1 }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (anexo regenerar) error:', err?.message);
    }
  }

  let contenido, tokensPrompt, tokensCompletion, tokensTotal;
  try {
    ({ contenido, tokensPrompt, tokensCompletion, tokensTotal } = await generateAnexosWithIa({
      nivel: normalizeString(planeacion.nivel),
      materia: normalizeString(planeacion.materia),
      tema: normalizeString(planeacion.tema),
      duracion: planeacion.duracion || null,
      tablaIa,
      actividadesMomentos,
      jobId: aiJobId,
      userId
    }));
  } catch (err) {
    if (aiJobId) {
      failAiJob(aiJobId, {
        errorType:        err?.status ? `http_${err.status}` : 'generation_error',
        errorMessageSafe: err?.message || 'Error regenerando anexo'
      }).catch(() => {});
    }
    console.error('[anexos] regenerate:error', {
      anexoId: normalizedId,
      errorType: err?.status ? `http_${err.status}` : 'generation_error',
      message: err?.message || 'Error regenerando anexo',
      durationMs: Date.now() - startedAt
    });
    throw err;
  }

  const titulo = normalizeString(contenido.titulo_general) || `Anexos: ${normalizeString(planeacion.tema) || 'Sin titulo'}`;

  const { data: updated, error: updateError } = await client
    .from('anexos')
    .update({
      titulo,
      contenido,
      prompt_version: ANEXOS_PROMPT_VERSION,
      status: 'generated',
      tokens_prompt: tokensPrompt,
      tokens_completion: tokensCompletion,
      tokens_total: tokensTotal,
      updated_at: new Date().toISOString()
    })
    .eq('id', normalizedId)
    .select('id, planeacion_id, titulo, status, updated_at')
    .single();

  if (updateError) {
    if (aiJobId) {
      failAiJob(aiJobId, {
        errorType: 'db_update_error',
        errorMessageSafe: updateError.message
      }).catch(() => {});
    }
    throw updateError;
  }

  if (aiJobId) {
    finishAiJob(aiJobId, {
      anexoId:      updated.id,
      outputSummary: {
        anexos_creados: Array.isArray(contenido?.anexos) ? contenido.anexos.length : 0
      }
    }).catch(() => {});
  }

  console.info('[anexos] regenerate:success', {
    anexoId: updated?.id,
    planeacionId: planeacion.id,
    promptVersion: ANEXOS_PROMPT_VERSION,
    tokensTotal,
    durationMs: Date.now() - startedAt
  });

  return { ok: true, anexo: updated };
}

export async function obtenerAnexosPorBatch({ supabaseClient, userId, batchId }) {
  const client = getClient(supabaseClient);
  const normalizedBatchId = normalizeString(batchId);

  if (!normalizedBatchId) throw buildHttpError(400, 'batchId es requerido.');

  const query = client
    .from('anexos')
    .select('id, planeacion_id, titulo, materia, nivel, tema, status, created_at, updated_at')
    .eq('batch_id', normalizedBatchId)
    .order('created_at', { ascending: true });

  if (userId) query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function obtenerAnexoPorPlaneacion({ supabaseClient, userId, planeacionId }) {
  const client = getClient(supabaseClient);
  const normalizedId = String(planeacionId || '').trim();

  if (!normalizedId) throw buildHttpError(400, 'planeacion_id es requerido.');

  const query = client.from('anexos').select('*').eq('planeacion_id', normalizedId);
  if (userId) query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Anexo no encontrado para esta planeacion.');
  return data;
}

export async function eliminarAnexo({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!userId) throw buildHttpError(401, 'Usuario requerido.');
  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  const { data: anexo, error: fetchError } = await client
    .from('anexos')
    .select('id')
    .eq('id', normalizedId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!anexo) throw buildHttpError(404, 'Anexo no encontrado.');

  const { error: deleteError } = await client
    .from('anexos')
    .delete()
    .eq('id', normalizedId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  console.info('[anexos] delete:success', { anexoId: normalizedId });

  return { ok: true };
}

export async function obtenerAnexoPorId({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  const query = client.from('anexos').select('*').eq('id', normalizedId);
  if (userId) query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Anexo no encontrado.');
  return data;
}
