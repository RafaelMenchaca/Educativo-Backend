import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { obtenerContextoUnidad } from './jerarquia.service.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LISTA_COTEJO_SYSTEM_PROMPT =
  'Actua como un docente experto en evaluacion por competencias. Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';
const LISTA_COTEJO_PROMPT_VERSION = 'v1_lista_cotejo_actividad_cierre';
const LISTA_COTEJO_ATTEMPT_TIMEOUT_MS = 60000;

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

function extractActividadCierre(tablaIa) {
  if (!Array.isArray(tablaIa)) return null;

  const fila = tablaIa.find((row) => {
    const ts = normalizeString(row?.tiempo_sesion).toLowerCase();
    return ts === 'cierre';
  });

  if (!fila) return null;
  return normalizeString(fila?.actividades || fila?.actividad || '') || null;
}

function buildListaCoTejoPrompt({ materia, nivel, tema, actividadCierre }) {
  return `Genera una lista de cotejo para evaluar la siguiente actividad de cierre.

Contexto:
Materia: ${materia || 'No especificada'}
Nivel: ${nivel || 'No especificado'}
Tema: ${tema || 'No especificado'}
Actividad de cierre: ${actividadCierre}

Instrucciones:
- Genera exactamente 5 criterios.
- Cada criterio debe valer 2 puntos en "si".
- Cada criterio debe valer 0 puntos en "no".
- El total debe ser 10 puntos.
- Los criterios deben ser claros, observables y evaluables.
- Los criterios deben estar directamente relacionados con la actividad de cierre.
- La lista debe servir como instrumento de evaluacion para el docente.
- No uses markdown.
- No agregues explicacion.
- Devuelve unicamente JSON valido.

Formato obligatorio:
{
  "titulo": "Lista de cotejo",
  "actividad_cierre": "${actividadCierre.replace(/"/g, '\\"')}",
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

async function generateListaWithIa({ materia, nivel, tema, actividadCierre }) {
  const prompt = buildListaCoTejoPrompt({ materia, nivel, tema, actividadCierre });

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

  const rawText = completion.choices?.[0]?.message?.content || '';
  const parsed = parseListaJson(rawText);
  return validateListaPayload(parsed);
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
    .select('id, tema_id, batch_id, tabla_ia, status, updated_at, is_archived')
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

export async function generarListasCotejoUnidad({ supabaseClient, userId, unidadId }) {
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  if (!normalizedUnidadId) {
    throw buildHttpError(400, 'unidad_id es requerido.');
  }

  const contexto = await obtenerContextoUnidad(client, normalizedUnidadId);
  const temas = await fetchTemasConPlaneaciones(client, normalizedUnidadId, userId);

  const materia = normalizeString(contexto.materia?.nombre);
  const nivel = normalizeString(contexto.grado?.nombre);

  const listas = [];
  const skipped = [];

  for (const tema of temas) {
    const planeacion = tema.planeacion;

    if (!planeacion?.id) {
      skipped.push({ tema_id: tema.id, tema: tema.titulo, razon: 'Sin planeacion generada' });
      continue;
    }

    const actividadCierre = extractActividadCierre(planeacion.tabla_ia);
    if (!actividadCierre) {
      skipped.push({ tema_id: tema.id, tema: tema.titulo, razon: 'Sin actividad de cierre en la planeacion' });
      continue;
    }

    try {
      const listaIa = await generateListaWithIa({
        materia,
        nivel,
        tema: tema.titulo,
        actividadCierre
      });

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
        actividad_cierre: actividadCierre,
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
        promptVersion: LISTA_COTEJO_PROMPT_VERSION
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
    .select('id, planeacion_id, tema_id, unidad_id, titulo, materia, nivel, tema, actividad_cierre, criterios, total_puntos, created_at, updated_at')
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
