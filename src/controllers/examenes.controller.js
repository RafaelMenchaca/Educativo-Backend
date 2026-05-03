import { createUserClient } from '../../supabaseClient.js';
import {
  generarExamenUnidad,
  obtenerEstadoGeneracionExamen,
  listarExamenesPorUnidad,
  obtenerExamenPorId
} from '../services/examenes.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function sendError(res, error, fallbackMessage) {
  console.error('[exam-debug] controller.fallo', {
    motivo: error?.message || fallbackMessage || 'Error no controlado',
    status: error?.status || 500
  });

  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

function parseGeneratePayload(body) {
  const unidadId = typeof body?.unidad_id === 'string' ? body.unidad_id.trim() : '';
  const tiposPregunta = Array.isArray(body?.tipos_pregunta) ? body.tipos_pregunta : [];
  const cantidadesPregunta = body?.cantidades_pregunta && typeof body.cantidades_pregunta === 'object' && !Array.isArray(body.cantidades_pregunta)
    ? body.cantidades_pregunta
    : null;

  if (!unidadId || tiposPregunta.length === 0) {
    return null;
  }

  return {
    unidadId,
    tiposPregunta,
    cantidadesPregunta
  };
}

export async function postGenerateExamen(req, res) {
  const payload = parseGeneratePayload(req.body);

  if (!payload) {
    return res.status(400).json({
      error: 'Debes enviar unidad_id y al menos un tipo de pregunta.'
    });
  }

  try {
    const job = await generarExamenUnidad({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      unidadId: payload.unidadId,
      tiposPregunta: payload.tiposPregunta,
      cantidadesPregunta: payload.cantidadesPregunta
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
