import { createUserClient } from '../../supabaseClient.js';
import {
  generarListasCotejoUnidad,
  generarListasCotejoPorIds,
  listarListasCotejoPorUnidad,
  obtenerListaCotejoPorId,
  obtenerListaCotejoPorPlaneacion
} from '../services/listas_cotejo.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function sendError(res, error, fallbackMessage) {
  console.error('[lista-cotejo] controller.fallo', {
    motivo: error?.message || fallbackMessage || 'Error no controlado',
    status: error?.status || 500
  });

  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

export async function postGenerateListasCotejo(req, res) {
  const body = req.body || {};
  const planeacionIds = body.planeacion_ids;
  const unidadId = typeof body.unidad_id === 'string' ? body.unidad_id.trim() : '';

  // Flujo nuevo: IDs explícitos de planeaciones seleccionadas
  if (Array.isArray(planeacionIds)) {
    if (planeacionIds.length === 0) {
      return res.status(400).json({ error: 'planeacion_ids debe contener al menos un elemento.' });
    }
    try {
      const result = await generarListasCotejoPorIds({
        supabaseClient: userClientFromReq(req),
        userId: req.user.id,
        planeacionIds,
        unidadId
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error, 'Error al generar las listas de cotejo');
    }
  }

  // Flujo legado: por unidad completa
  if (!unidadId) {
    return res.status(400).json({ error: 'Se requiere planeacion_ids o unidad_id.' });
  }

  try {
    const result = await generarListasCotejoUnidad({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      unidadId
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error, 'Error al generar las listas de cotejo');
  }
}

export async function getListasCotejoPorUnidad(req, res) {
  try {
    const listas = await listarListasCotejoPorUnidad({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      unidadId: req.params.unidadId
    });

    res.json({ listas });
  } catch (error) {
    sendError(res, error, 'Error al obtener las listas de cotejo');
  }
}

export async function getListaCotejoById(req, res) {
  try {
    const lista = await obtenerListaCotejoPorId({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      id: req.params.id
    });

    res.json({ lista });
  } catch (error) {
    sendError(res, error, 'Error al obtener la lista de cotejo');
  }
}

export async function getListaCotejoPorPlaneacion(req, res) {
  try {
    const lista = await obtenerListaCotejoPorPlaneacion({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      planeacionId: req.params.planeacionId
    });

    res.json({ lista });
  } catch (error) {
    sendError(res, error, 'Error al obtener la lista de cotejo de la planeacion');
  }
}
