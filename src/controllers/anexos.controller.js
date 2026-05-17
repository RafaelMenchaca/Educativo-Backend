import { createUserClient } from '../../supabaseClient.js';
import {
  generarAnexo,
  regenerarAnexo,
  obtenerAnexosPorBatch,
  obtenerAnexoPorPlaneacion,
  obtenerAnexoPorId
} from '../services/anexos.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function sendError(res, error, fallbackMessage) {
  console.error('[anexos] controller.fallo', {
    motivo: error?.message || fallbackMessage || 'Error no controlado',
    status: error?.status || 500
  });

  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: fallbackMessage || 'Error interno del servidor.' });
}

export async function postGenerarAnexo(req, res) {
  const planeacionId = req.body?.planeacion_id;

  if (!planeacionId) {
    return res.status(400).json({ error: 'planeacion_id es requerido.' });
  }

  try {
    const result = await generarAnexo({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      planeacionId
    });
    return res.status(result.status === 'already_exists' ? 200 : 201).json(result);
  } catch (error) {
    return sendError(res, error, 'Error al generar el anexo.');
  }
}

export async function postRegenerarAnexo(req, res) {
  try {
    const result = await regenerarAnexo({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      id: req.params.id
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Error al regenerar el anexo.');
  }
}

export async function getAnexosPorBatch(req, res) {
  try {
    const anexos = await obtenerAnexosPorBatch({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      batchId: req.params.batchId
    });
    return res.json({ anexos });
  } catch (error) {
    return sendError(res, error, 'Error al obtener los anexos del bloque.');
  }
}

export async function getAnexoPorPlaneacion(req, res) {
  try {
    const anexo = await obtenerAnexoPorPlaneacion({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      planeacionId: req.params.planeacionId
    });
    return res.json({ anexo });
  } catch (error) {
    return sendError(res, error, 'Error al obtener el anexo de la planeacion.');
  }
}

export async function getAnexoById(req, res) {
  try {
    const anexo = await obtenerAnexoPorId({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      id: req.params.id
    });
    return res.json({ anexo });
  } catch (error) {
    return sendError(res, error, 'Error al obtener el anexo.');
  }
}
