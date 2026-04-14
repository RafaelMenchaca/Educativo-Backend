import { createUserClient } from '../../supabaseClient.js';
import {
  generarExamenUnidad,
  listarExamenesPorUnidad,
  obtenerExamenPorId
} from '../services/examenes.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function sendError(res, error, fallbackMessage) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

function parseGeneratePayload(body) {
  const unidadId = typeof body?.unidad_id === 'string' ? body.unidad_id.trim() : '';
  const tiposPregunta = Array.isArray(body?.tipos_pregunta) ? body.tipos_pregunta : [];
  const tiempoMin = Number.parseInt(body?.tiempo_min, 10);

  if (!unidadId || tiposPregunta.length === 0) {
    return null;
  }

  return {
    unidadId,
    tiposPregunta,
    tiempoMin
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
    const examen = await generarExamenUnidad({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      unidadId: payload.unidadId,
      tiposPregunta: payload.tiposPregunta,
      tiempoMin: payload.tiempoMin
    });

    res.status(201).json({ examen });
  } catch (error) {
    sendError(res, error, 'Error al generar el examen');
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
