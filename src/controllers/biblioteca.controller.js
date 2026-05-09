import { createUserClient } from '../../supabaseClient.js';
import { listConjuntosByUser, getConjuntoById } from '../services/biblioteca.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function sendError(res, error, fallbackMessage) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error('[biblioteca] error', error);
  return res.status(500).json({ error: fallbackMessage });
}

export async function getConjuntos(req, res) {
  try {
    const data = await listConjuntosByUser({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id
    });
    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener los conjuntos de la biblioteca');
  }
}

export async function getConjunto(req, res) {
  try {
    const data = await getConjuntoById({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id,
      batchId: req.params.batchId
    });
    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener el conjunto');
  }
}
