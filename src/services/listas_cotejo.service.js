import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { obtenerContextoUnidad } from './jerarquia.service.js';
import { createAiJob, finishAiJob, failAiJob, logAiCall } from './aiMetrics.service.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LISTA_COTEJO_SYSTEM_PROMPT =
  'Actua como un docente experto en evaluacion por competencias. Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';
const LISTA_COTEJO_PROMPT_VERSION = 'v2_lista_cotejo_actividades_momentos';
const LISTA_COTEJO_ATTEMPT_TIMEOUT_MS = 60000;

const MOMENTO_LABEL_MAP = {
  conocimientos_previos: 'Conocimientos previos',
  desarrollo: 'Desarrollo',
  cierre: 'Cierre'
};

const FALLBACK_PRIORITY = ['cierre', 'desarrollo', 'conocimientos_previos'];

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

function getActividadesEvaluadas(planeacion) {
  const actividadesMomentos = safeParseJson(planeacion.actividades_momentos, {});
  const tablaIa = safeParseJson(planeacion.tabla_ia, []);

  const momentosKeys = Object.keys(actividadesMomentos || {}).filter(
    (k) => MOMENTO_LABEL_MAP[k] && normalizeString(actividadesMomentos[k])
  );

  if (momentosKeys.length > 0) {
    return momentosKeys.map((key) => {
      const label = MOMENTO_LABEL_MAP[key];
      const actividadSeleccionada = normalizeString(actividadesMomentos[key]);
      const filaIa = Array.isArray(tablaIa)
        ? tablaIa.find((row) => normalizeString(row?.tiempo_sesion).toLowerCase() === label.toLowerCase())
        : null;
      const actividadTexto = normalizeString(filaIa?.actividades || filaIa?.actividad || '') || actividadSeleccionada;
      return { momento_key: key, momento_label: label, actividad_seleccionada: actividadSeleccionada, actividad_texto: actividadTexto };
    });
  }

  const actividadCierreLegacy = normalizeString(planeacion.actividad_cierre);
  if (actividadCierreLegacy) {
    const filaIa = Array.isArray(tablaIa)
      ? tablaIa.find((row) => normalizeString(row?.tiempo_sesion).toLowerCase() === 'cierre')
      : null;
    return [{
      momento_key: 'cierre',
      momento_label: 'Cierre',
      actividad_seleccionada: actividadCierreLegacy,
      actividad_texto: normalizeString(filaIa?.actividades || '') || actividadCierreLegacy
    }];
  }

  if (Array.isArray(tablaIa) && tablaIa.length > 0) {
    for (const fallbackKey of FALLBACK_PRIORITY) {
      const label = MOMENTO_LABEL_MAP[fallbackKey];
      const filaIa = tablaIa.find((row) => normalizeString(row?.tiempo_sesion).toLowerCase() === label.toLowerCase());
      if (filaIa) {
        const actividadTexto = normalizeString(filaIa.actividades || '');
        if (actividadTexto) {
          return [{ momento_key: fallbackKey, momento_label: label, actividad_seleccionada: actividadTexto, actividad_texto: actividadTexto }];
        }
      }
    }
  }

  return [];
}

function buildListaCoTejoPrompt({ materia, nivel, tema, actividadesEvaluadas }) {
  const momentosTexto = actividadesEvaluadas
    .map((act) => `- ${act.momento_label} — ${act.actividad_seleccionada}:\n  ${act.actividad_texto}`)
    .join('\n\n');

  const instruccionMomentos = actividadesEvaluadas.length === 1
    ? 'Centra los 5 criterios en ese unico momento.'
    : 'Integra los 5 criterios en una sola tabla, cubriendo de forma equilibrada las evidencias principales de esos momentos.';

  return `Genera una lista de cotejo para evaluar la(s) siguiente(s) actividad(es) didactica(s).

Contexto:
Materia: ${materia || 'No especificada'}
Nivel: ${nivel || 'No especificado'}
Tema: ${tema || 'No especificado'}

Momentos y actividades que debe evaluar la lista de cotejo:
${momentosTexto}

Instrucciones:
- Genera exactamente 5 criterios.
- Cada criterio debe valer 2 puntos en "si".
- Cada criterio debe valer 0 puntos en "no".
- El total debe ser 10 puntos.
- ${instruccionMomentos}
- Los criterios deben ser claros, observables y evaluables.
- Los criterios deben estar directamente relacionados con las actividades evaluadas.
- Genera UNA sola lista de cotejo para la planeacion completa. No generes una lista por cada momento.
- No conviertas una actividad en otra. Evalua exactamente la actividad seleccionada.
- La lista debe servir como instrumento de evaluacion para el docente.
- No uses markdown.
- No agregues explicacion.
- Devuelve unicamente JSON valido.

Formato obligatorio:
{
  "titulo": "Lista de cotejo",
  "criterios": [
    { "criterio": "Criterio observable y evaluable", "si": 2, "no": 0 },
    { "criterio": "Criterio observable y evaluable", "si": 2, "no": 0 },
    { "criterio": "Criterio observable y evaluable", "si": 2, "no": 0 },
    { "criterio": "Criterio observable y evaluable", "si": 2, "no": 0 },
    { "criterio": "Criterio observable y evaluable", "si": 2, "no": 0 }
  ],
  "total_puntos": 10
}`;
}

function parseListaJson(rawText) {
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

function validateListaPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw buildHttpError(502, 'La IA no devolvio un JSON valido.');
  }
  if (!Array.isArray(payload.criterios) || payload.criterios.length !== 5) {
    throw buildHttpError(502, 'La lista debe tener exactamente 5 criterios.');
  }
  for (const criterio of payload.criterios) {
    if (criterio.si !== 2 || criterio.no !== 0) {
      throw buildHttpError(502, 'Cada criterio debe valer 2 en si y 0 en no.');
    }
    if (!normalizeString(criterio.criterio)) {
      throw buildHttpError(502, 'Cada criterio debe tener texto.');
    }
  }
  if (payload.total_puntos !== 10) {
    throw buildHttpError(502, 'El total debe ser exactamente 10 puntos.');
  }
  return payload;
}

async function generateListaWithIa({ materia, nivel, tema, actividadesEvaluadas, jobId = null, userId = null }) {
  const prompt = buildListaCoTejoPrompt({ materia, nivel, tema, actividadesEvaluadas });

  const callStart = Date.now();
  const completion = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: LISTA_COTEJO_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 800
    }),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(buildHttpError(504, 'Generacion tardo demasiado')),
        LISTA_COTEJO_ATTEMPT_TIMEOUT_MS
      );
    })
  ]);
  const callDurationMs = Date.now() - callStart;

  const rawText = completion.choices?.[0]?.message?.content || '';
  const parsed = parseListaJson(rawText);
  const validated = validateListaPayload(parsed);

  if (jobId && userId) {
    logAiCall({
      jobId,
      userId,
      artifactType:  'lista_cotejo',
      callPurpose:   'main_generation',
      model:         'gpt-4o-mini',
      promptVersion: LISTA_COTEJO_PROMPT_VERSION,
      usage:         completion.usage,
      status:        'success',
      jsonOk:        Boolean(parsed),
      durationMs:    callDurationMs,
      metadata:      {
        tema,
        momentos_evaluados: actividadesEvaluadas.map((a) => a.momento_key)
      }
    }).catch((err) => console.error('[aiMetrics] listas_cotejo logAiCall failed:', err?.message));
  }

  return validated;
}

async function fetchTemasConPlaneaciones(client, unidadId, userId) {
  const { data: temas, error: temasError } = await client
    .from('temas')
    .select('id, unidad_id, titulo, duracion, orden, created_at')
    .eq('unidad_id', unidadId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (temasError) throw temasError;
  if (!temas || temas.length === 0) {
    throw buildHttpError(400, 'No hay temas en esta unidad para generar listas de cotejo.');
  }

  const topicIds = temas.map((t) => t.id);
  const planeacionesQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tabla_ia, actividades_momentos, actividad_cierre, status, updated_at, is_archived')
    .in('tema_id', topicIds)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (userId) {
    planeacionesQuery.eq('user_id', userId);
  }

  const { data: planeaciones, error: planeacionesError } = await planeacionesQuery;
  if (planeacionesError) throw planeacionesError;

  const latestByTemaId = new Map();
  for (const p of planeaciones || []) {
    if (!latestByTemaId.has(p.tema_id)) {
      latestByTemaId.set(p.tema_id, p);
    }
  }

  return temas.map((tema) => ({
    ...tema,
    planeacion: latestByTemaId.get(tema.id) || null
  }));
}

export async function generarListasCotejoPorIds({ supabaseClient, userId, planeacionIds, unidadId }) {
  const startedAt = Date.now();
  const client = getClient(supabaseClient);

  if (!Array.isArray(planeacionIds) || planeacionIds.length === 0) {
    throw buildHttpError(400, 'planeacion_ids debe ser un arreglo con al menos un elemento.');
  }

  const normalizedIds = planeacionIds.map((id) => String(id).trim()).filter(Boolean);
  if (normalizedIds.length === 0) {
    throw buildHttpError(400, 'planeacion_ids no contiene IDs validos.');
  }

  console.info('[listas-cotejo] generate:start', { planeacionesCount: normalizedIds.length });

  // Fetch planeaciones validando pertenencia al usuario
  let planeacionesQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tabla_ia, actividades_momentos, actividad_cierre, status, updated_at, is_archived')
    .in('id', normalizedIds);

  if (userId) {
    planeacionesQuery = planeacionesQuery.eq('user_id', userId);
  }

  const { data: planeaciones, error: planeacionesError } = await planeacionesQuery;
  if (planeacionesError) throw planeacionesError;

  if (!planeaciones || planeaciones.length === 0) {
    throw buildHttpError(404, 'No se encontraron planeaciones validas.');
  }

  // Verificar cuales planeaciones ya tienen lista de cotejo
  const { data: existingListas } = await client
    .from('listas_cotejo')
    .select('planeacion_id')
    .in('planeacion_id', normalizedIds);

  const existingPlaneacionIds = new Set((existingListas || []).map((l) => String(l.planeacion_id)));

  // Obtener temas para titulo y unidad_id
  const temaIds = [...new Set(planeaciones.map((p) => p.tema_id).filter(Boolean))];
  const temasMap = new Map();
  let contexto = { materia: null, grado: null };

  if (temaIds.length > 0) {
    const { data: temas } = await client
      .from('temas')
      .select('id, unidad_id, titulo')
      .in('id', temaIds);

    if (temas && temas.length > 0) {
      temas.forEach((t) => temasMap.set(t.id, t));
      const resolvedUnidadId = normalizeString(unidadId) || temas[0].unidad_id;
      if (resolvedUnidadId) {
        try {
          contexto = await obtenerContextoUnidad(client, resolvedUnidadId);
        } catch {
          // contexto es opcional; continuar sin el
        }
      }
    }
  }

  const materia = normalizeString(contexto.materia?.nombre);
  const nivel = normalizeString(contexto.grado?.nombre);

  const listas = [];
  const skipped = [];

  // Create one AI metrics job for this batch call
  let aiJobId = null;
  if (userId) {
    try {
      aiJobId = await createAiJob({
        userId,
        artifactType: 'lista_cotejo',
        actionType:   'generate',
        nivel:        nivel || null,
        materia:      materia || null,
        inputSummary: {
          planeaciones_count: planeaciones.length
        }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (lista_cotejo por ids) error:', err?.message);
    }
  }

  for (const planeacion of planeaciones) {
    const planeacionIdStr = String(planeacion.id);

    if (existingPlaneacionIds.has(planeacionIdStr)) {
      skipped.push({ planeacion_id: planeacion.id, reason: 'already_exists' });
      continue;
    }

    const actividadesEvaluadas = getActividadesEvaluadas(planeacion);
    if (!actividadesEvaluadas.length) {
      skipped.push({ planeacion_id: planeacion.id, reason: 'missing_closing_activity' });
      continue;
    }

    const tema = temasMap.get(planeacion.tema_id);
    const temaTitulo = tema?.titulo || 'Tema sin titulo';
    const temaUnidadId = normalizeString(unidadId) || tema?.unidad_id || '';

    try {
      const listaIa = await generateListaWithIa({ materia, nivel, tema: temaTitulo, actividadesEvaluadas, jobId: aiJobId, userId });

      const actividadCierreLegacy = actividadesEvaluadas.find((a) => a.momento_key === 'cierre')?.actividad_texto || '';

      const insertPayload = {
        user_id: userId,
        planeacion_id: planeacion.id,
        tema_id: planeacion.tema_id || null,
        unidad_id: temaUnidadId || null,
        batch_id: planeacion.batch_id || null,
        titulo: normalizeString(listaIa.titulo) || 'Lista de cotejo',
        materia: materia || null,
        nivel: nivel || null,
        tema: temaTitulo,
        actividad_cierre: actividadCierreLegacy || '',
        actividades_evaluadas: actividadesEvaluadas,
        criterios: listaIa.criterios,
        total_puntos: 10,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from('listas_cotejo')
        .insert(insertPayload)
        .select('id, planeacion_id, tema_id, tema, titulo, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          skipped.push({ planeacion_id: planeacion.id, reason: 'already_exists' });
          continue;
        }
        throw error;
      }

      listas.push(data);

      console.info('[lista-cotejo] lista_generada_por_id', {
        listaId: data?.id,
        planeacionId: planeacion.id,
        tema: temaTitulo,
        promptVersion: LISTA_COTEJO_PROMPT_VERSION,
        actividadesEvaluadas
      });
    } catch (err) {
      console.error('[lista-cotejo] error generando lista para planeacion', {
        planeacionId: planeacion.id,
        motivo: err?.message || 'Error desconocido'
      });
      skipped.push({ planeacion_id: planeacion.id, reason: 'invalid_ai_response' });
    }
  }

  if (aiJobId) {
    const finishFn = listas.length === 0 && skipped.some((s) => s.reason === 'invalid_ai_response')
      ? failAiJob
      : finishAiJob;
    finishFn(aiJobId, {
      outputSummary: { listas_creadas: listas.length, skipped: skipped.length }
    }).catch(() => {});
  }

  console.info('[listas-cotejo] generate:success', {
    created: listas.length,
    skipped: skipped.length,
    durationMs: Date.now() - startedAt
  });

  return { created: listas.length, skipped, listas };
}

export async function generarListasCotejoUnidad({ supabaseClient, userId, unidadId }) {
  const startedAt = Date.now();
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  if (!normalizedUnidadId) {
    throw buildHttpError(400, 'unidad_id es requerido.');
  }

  console.info('[listas-cotejo] generate:start', { unidadId: normalizedUnidadId });

  const contexto = await obtenerContextoUnidad(client, normalizedUnidadId);
  const temas = await fetchTemasConPlaneaciones(client, normalizedUnidadId, userId);

  const materia = normalizeString(contexto.materia?.nombre);
  const nivel = normalizeString(contexto.grado?.nombre);

  const listas = [];
  const skipped = [];

  // Create one AI metrics job for this unit batch
  let aiJobId = null;
  if (userId) {
    try {
      aiJobId = await createAiJob({
        userId,
        artifactType: 'lista_cotejo',
        actionType:   'generate',
        nivel:        nivel || null,
        materia:      materia || null,
        inputSummary: {
          planeaciones_count: temas.filter((t) => t.planeacion?.id).length
        }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (lista_cotejo unidad) error:', err?.message);
    }
  }

  for (const tema of temas) {
    const planeacion = tema.planeacion;

    if (!planeacion?.id) {
      skipped.push({ tema_id: tema.id, tema: tema.titulo, razon: 'Sin planeacion generada' });
      continue;
    }

    const actividadesEvaluadas = getActividadesEvaluadas(planeacion);
    if (!actividadesEvaluadas.length) {
      skipped.push({ tema_id: tema.id, tema: tema.titulo, razon: 'Sin actividades evaluables en la planeacion' });
      continue;
    }

    try {
      const listaIa = await generateListaWithIa({
        materia,
        nivel,
        tema: tema.titulo,
        actividadesEvaluadas,
        jobId: aiJobId,
        userId
      });

      const actividadCierreLegacy = actividadesEvaluadas.find((a) => a.momento_key === 'cierre')?.actividad_texto || '';

      const upsertPayload = {
        user_id: userId,
        planeacion_id: planeacion.id,
        tema_id: tema.id,
        unidad_id: normalizedUnidadId,
        batch_id: planeacion.batch_id || null,
        titulo: normalizeString(listaIa.titulo) || 'Lista de cotejo',
        materia: materia || null,
        nivel: nivel || null,
        tema: tema.titulo,
        actividad_cierre: actividadCierreLegacy || '',
        actividades_evaluadas: actividadesEvaluadas,
        criterios: listaIa.criterios,
        total_puntos: 10,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from('listas_cotejo')
        .upsert(upsertPayload, { onConflict: 'planeacion_id' })
        .select('id, planeacion_id, tema_id, tema, titulo, created_at, updated_at')
        .single();

      if (error) throw error;

      listas.push(data);

      console.info('[lista-cotejo] lista_generada', {
        listaId: data?.id,
        planeacionId: planeacion.id,
        tema: tema.titulo,
        promptVersion: LISTA_COTEJO_PROMPT_VERSION,
        actividadesEvaluadas
      });
    } catch (err) {
      console.error('[lista-cotejo] error generando lista para tema', {
        temaId: tema.id,
        tema: tema.titulo,
        motivo: err?.message || 'Error desconocido'
      });
      skipped.push({ tema_id: tema.id, tema: tema.titulo, razon: err?.message || 'Error al generar' });
    }
  }

  if (aiJobId) {
    const finishFn = listas.length === 0 && skipped.some((s) => s.razon && !['Sin planeacion generada', 'Sin actividades evaluables en la planeacion'].includes(s.razon))
      ? failAiJob
      : finishAiJob;
    finishFn(aiJobId, {
      outputSummary: { listas_creadas: listas.length, skipped: skipped.length }
    }).catch(() => {});
  }

  console.info('[listas-cotejo] generate:success', {
    unidadId: normalizedUnidadId,
    createdOrUpdated: listas.length,
    skipped: skipped.length,
    durationMs: Date.now() - startedAt
  });

  return {
    created_or_updated: listas.length,
    skipped,
    listas
  };
}

export async function listarListasCotejoPorUnidad({ supabaseClient, userId, unidadId }) {
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  if (!normalizedUnidadId) {
    throw buildHttpError(400, 'unidad_id es requerido.');
  }

  const query = client
    .from('listas_cotejo')
    .select('id, planeacion_id, tema_id, unidad_id, titulo, materia, nivel, tema, actividad_cierre, actividades_evaluadas, criterios, total_puntos, created_at, updated_at')
    .eq('unidad_id', normalizedUnidadId)
    .order('created_at', { ascending: false });

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function obtenerListaCotejoPorId({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!normalizedId) {
    throw buildHttpError(400, 'id es requerido.');
  }

  const query = client
    .from('listas_cotejo')
    .select('*')
    .eq('id', normalizedId);

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Lista de cotejo no encontrada');
  return data;
}

export async function eliminarListaCotejo({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!userId) throw buildHttpError(401, 'Usuario requerido.');
  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  const { data: lista, error: fetchError } = await client
    .from('listas_cotejo')
    .select('id')
    .eq('id', normalizedId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!lista) throw buildHttpError(404, 'Lista de cotejo no encontrada.');

  const { error: deleteError } = await client
    .from('listas_cotejo')
    .delete()
    .eq('id', normalizedId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  console.info('[listas-cotejo] delete:success', { listaId: normalizedId });

  return { ok: true };
}

export async function obtenerListaCotejoPorPlaneacion({ supabaseClient, userId, planeacionId }) {
  const client = getClient(supabaseClient);
  const normalizedId = String(planeacionId || '').trim();

  if (!normalizedId) {
    throw buildHttpError(400, 'planeacion_id es requerido.');
  }

  const query = client
    .from('listas_cotejo')
    .select('*')
    .eq('planeacion_id', normalizedId);

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Lista de cotejo no encontrada para esta planeacion');
  return data;
}
