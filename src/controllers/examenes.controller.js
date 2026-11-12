import { createUserClient } from '../../supabaseClient.js';
import {
  generarExamenUnidad,
  obtenerEstadoGeneracionExamen,
  listarExamenesPorUnidad,
  obtenerExamenPorId,
  eliminarExamen
} from '../services/examenes.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function sendError(res, error, fallbackMessage) {
  console.error('[exam-debug] controller.fallo', {
    motivo: error?.status ? 'controlled_error' : 'internal_error',
    status: error?.status || 500
  });

  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  return res.status(500).json({ error: fallbackMessage });
}

const GENERATE_FIELDS = new Set([
  'unidad_id',
  'tipos_pregunta',
  'cantidades_pregunta',
  'tema_ids',
  'planeacion_ids',
  'batch_id'
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseGeneratePayload(body) {
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(body))
  ) {
    return { error: 'Body invalido.' };
  }
  if (Reflect.ownKeys(body).some((key) => (
    typeof key !== 'string'
    || !GENERATE_FIELDS.has(key)
    || !Object.prototype.propertyIsEnumerable.call(body, key)
  ))) {
    return { error: 'La solicitud contiene campos no permitidos.' };
  }

  const unidadId = typeof body?.unidad_id === 'string' ? body.unidad_id.trim() : '';
  const tiposPregunta = Array.isArray(body?.tipos_pregunta) ? body.tipos_pregunta : [];
  const cantidadesPregunta = body?.cantidades_pregunta && typeof body.cantidades_pregunta === 'object' && !Array.isArray(body.cantidades_pregunta)
    ? body.cantidades_pregunta
    : null;
  const temaIds = Array.isArray(body?.tema_ids) && body.tema_ids.length > 0 ? body.tema_ids : null;
  const planeacionIds = Array.isArray(body?.planeacion_ids) && body.planeacion_ids.length > 0 ? body.planeacion_ids : null;
  const hasBatchId = Object.hasOwn(body, 'batch_id');
  const batchId = typeof body?.batch_id === 'string' && body.batch_id.trim() ? body.batch_id.trim() : null;

  if (!unidadId || tiposPregunta.length === 0) {
    return { error: 'Debes enviar unidad_id y al menos un tipo de pregunta.' };
  }
  if (hasBatchId && (!batchId || !UUID_PATTERN.test(batchId))) {
    return { error: 'batch_id invalido.' };
  }

  return { value: {
    unidadId,
    tiposPregunta,
    cantidadesPregunta,
    temaIds,
    planeacionIds,
    batchId
  } };
}

export async function postGenerateExamen(req, res) {
  const parsed = parseGeneratePayload(req.body);

  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const payload = parsed.value;

  console.info('[examenes] generar examen recibido', {
    evento: 'request_validated',
    totalTemas: Array.isArray(payload.temaIds) ? payload.temaIds.length : 0,
    totalPlaneaciones: Array.isArray(payload.planeacionIds) ? payload.planeacionIds.length : 0,
    tieneBatch: Boolean(payload.batchId)
  });

  try {
    const job = await generarExamenUnidad({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      unidadId: payload.unidadId,
      tiposPregunta: payload.tiposPregunta,
      cantidadesPregunta: payload.cantidadesPregunta,
      temaIds: payload.temaIds,
      planeacionIds: payload.planeacionIds,
      batchId: payload.batchId
    });

    res.status(202).json({
      ok: true,
      job_id: job.id,
      status: job.status || 'processing'
    });
  } catch (error) {
    sendError(res, error, 'Error al generar el examen');
  }
}

export async function getExamenGenerationJob(req, res) {
  try {
    const job = await obtenerEstadoGeneracionExamen({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      jobId: req.params.jobId
    });

    res.json(job);
  } catch (error) {
    sendError(res, error, 'Error al obtener el progreso del examen');
  }
}

export async function getExamenesByUnidad(req, res) {
  try {
    const examenes = await listarExamenesPorUnidad({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      unidadId: req.params.unidadId
    });

    res.json({ examenes });
  } catch (error) {
    sendError(res, error, 'Error al obtener los examenes de la unidad');
  }
}

export async function getExamenById(req, res) {
  try {
    const examen = await obtenerExamenPorId({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      id: req.params.id
    });

    res.json({ examen });
  } catch (error) {
    sendError(res, error, 'Error al obtener el examen');
  }
}

export async function deleteExamen(req, res) {
  try {
    const result = await eliminarExamen({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      id: req.params.id
    });
    res.json(result);
  } catch (error) {
    sendError(res, error, 'Error al eliminar el examen');
  }
}
