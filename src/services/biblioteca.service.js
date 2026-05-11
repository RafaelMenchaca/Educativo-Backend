import { supabaseAdmin } from '../../supabaseClient.js';

function getClient(supabaseClient) {
  return supabaseClient || supabaseAdmin;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildConjuntoPayload(batch, planeaciones, examenes, listas) {
  return {
    id: batch.id,
    titulo: batch.titulo,
    descripcion: batch.descripcion || null,
    nivel: batch.nivel,
    materia: batch.materia,
    unidad: batch.unidad,
    unidad_id: batch.unidad_id || null,
    materia_id: batch.materia_id || null,
    grado_id: batch.grado_id || null,
    plantel_id: batch.plantel_id || null,
    status: batch.status,
    is_archived: batch.is_archived || false,
    created_at: batch.created_at,
    updated_at: batch.updated_at,

    total_planeaciones: planeaciones.length,
    total_examenes: examenes.length,
    total_listas_cotejo: listas.length,

    planeaciones: planeaciones.map((p) => ({
      id: p.id,
      tema: p.tema,
      materia: p.materia,
      nivel: p.nivel,
      unidad: p.unidad,
      duracion: p.duracion,
      fecha_creacion: p.fecha_creacion,
      status: p.status,
      custom_title: p.custom_title || null
    })),

    examenes: examenes.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      tipos_pregunta: Array.isArray(e.tipos_pregunta) ? e.tipos_pregunta : [],
      contexto_temas: Array.isArray(e.contexto_temas) ? e.contexto_temas : [],
      total_preguntas: e.total_preguntas,
      status: e.status,
      created_at: e.created_at
    })),

    listas_cotejo: listas.map((l) => ({
      id: l.id,
      planeacion_id: l.planeacion_id || null,
      titulo: l.titulo,
      tema: l.tema,
      total_puntos: l.total_puntos,
      created_at: l.created_at
    }))
  };
}

export async function listConjuntosByUser({ supabaseClient, userId }) {
  const client = getClient(supabaseClient);

  if (!userId) throw buildHttpError(401, 'Usuario requerido.');

  const { data: batches, error: batchError } = await client
    .from('planeacion_batches')
    .select('id, titulo, descripcion, nivel, materia, unidad, unidad_id, materia_id, grado_id, plantel_id, status, is_archived, created_at, updated_at')
    .eq('user_id', userId)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('created_at', { ascending: false });

  if (batchError) throw batchError;
  if (!batches || batches.length === 0) return [];

  const batchIds = batches.map((b) => b.id);

  const [planeacionesRes, examenesRes, listasRes] = await Promise.all([
    client
      .from('planeaciones')
      .select('id, batch_id, tema, materia, nivel, unidad, duracion, fecha_creacion, status, custom_title')
      .in('batch_id', batchIds)
      .eq('user_id', userId)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('fecha_creacion', { ascending: true }),

    client
      .from('examenes')
      .select('id, batch_id, titulo, tipos_pregunta, contexto_temas, total_preguntas, status, created_at')
      .in('batch_id', batchIds)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    client
      .from('listas_cotejo')
      .select('id, batch_id, planeacion_id, titulo, tema, total_puntos, created_at')
      .in('batch_id', batchIds)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  ]);

  if (planeacionesRes.error) throw planeacionesRes.error;
  if (examenesRes.error) throw examenesRes.error;
  if (listasRes.error) throw listasRes.error;

  const planeacionesByBatch = groupById(planeacionesRes.data || [], 'batch_id');
  const examenessByBatch = groupById(examenesRes.data || [], 'batch_id');
  const listasByBatch = groupById(listasRes.data || [], 'batch_id');

  return batches.map((batch) =>
    buildConjuntoPayload(
      batch,
      planeacionesByBatch[batch.id] || [],
      examenessByBatch[batch.id] || [],
      listasByBatch[batch.id] || []
    )
  );
}

export async function getConjuntoById({ supabaseClient, userId, batchId }) {
  const client = getClient(supabaseClient);
  const normalizedBatchId = normalizeString(batchId);

  if (!userId) throw buildHttpError(401, 'Usuario requerido.');
  if (!normalizedBatchId) throw buildHttpError(400, 'batchId es requerido.');

  const { data: batch, error: batchError } = await client
    .from('planeacion_batches')
    .select('id, titulo, descripcion, nivel, materia, unidad, unidad_id, materia_id, grado_id, plantel_id, status, is_archived, created_at, updated_at')
    .eq('id', normalizedBatchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (batchError) throw batchError;
  if (!batch) throw buildHttpError(404, 'Conjunto no encontrado.');

  const [planeacionesRes, examenesRes, listasRes] = await Promise.all([
    client
      .from('planeaciones')
      .select('id, batch_id, tema, materia, nivel, unidad, duracion, fecha_creacion, status, custom_title, tabla_ia, actividades_momentos, actividad_cierre, tema_id, updated_at')
      .eq('batch_id', normalizedBatchId)
      .eq('user_id', userId)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('fecha_creacion', { ascending: true }),

    client
      .from('examenes')
      .select('id, batch_id, titulo, instrucciones, tipos_pregunta, contexto_temas, total_preguntas, status, created_at, updated_at')
      .eq('batch_id', normalizedBatchId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    client
      .from('listas_cotejo')
      .select('id, batch_id, planeacion_id, titulo, tema, materia, nivel, total_puntos, criterios, created_at, updated_at')
      .eq('batch_id', normalizedBatchId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  ]);

  if (planeacionesRes.error) throw planeacionesRes.error;
  if (examenesRes.error) throw examenesRes.error;
  if (listasRes.error) throw listasRes.error;

  return buildConjuntoPayload(
    batch,
    planeacionesRes.data || [],
    examenesRes.data || [],
    listasRes.data || []
  );
}

function groupById(items, key) {
  const map = {};
  for (const item of items) {
    const id = item[key];
    if (!id) continue;
    if (!map[id]) map[id] = [];
    map[id].push(item);
  }
  return map;
}
