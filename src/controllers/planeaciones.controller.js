import { createUserClient } from '../../supabaseClient.js';
import {
  listarPlaneaciones,
  obtenerPlaneacionPorId,
  actualizarPlaneacion,
  eliminarPlaneacion,
  archivarPlaneacion,
  restaurarPlaneacion,
  archivarBatchPlaneaciones,
  restaurarBatchPlaneaciones,
  listarPlaneacionesArchivadas,
  eliminarPlaneacionPermanentemente,
  eliminarBatchPermanentemente,
  generarPlaneacionesIA,
  generarPlaneacionesIAConProgreso,
  listarBatches,
  listarPlaneacionesPorBatch
} from '../services/planeaciones.service.js';

function userClientFromReq(req) {
  return createUserClient(req.accessToken);
}

function validarPayloadGeneracion(body) {
  const { materia, nivel, unidad, temas } = body || {};

  if (
    !materia ||
    !nivel ||
    !Number.isInteger(unidad) ||
    !Array.isArray(temas) ||
    temas.length === 0
  ) {
    return null;
  }

  return { materia, nivel, unidad, temas };
}

function wantsStream(req) {
  if (req.query?.stream === '1') return true;

  const accept = req.get('accept') || '';
  return accept.includes('text/event-stream');
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function logPlaneacionDebug(label, payload) {
  console.log(`[planeacion-debug] ${label}`, JSON.stringify(payload, null, 2));
}

function sendPlaneacionesError(res, error, fallbackMessage) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

export async function getPlaneaciones(req, res) {
  try {
    const data = await listarPlaneaciones({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
}

export async function getPlaneacionesArchivadas(req, res) {
  try {
    const data = await listarPlaneacionesArchivadas({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(res, error, 'Error al obtener planeaciones archivadas');
  }
}

export async function getPlaneacionById(req, res) {
  const id = Number(req.params.id);

  try {
    const data = await obtenerPlaneacionPorId({
      supabaseClient: userClientFromReq(req),
      id,
      userId: req.user.id
    });

    if (!data) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener planeacion' });
  }
}

export async function updatePlaneacion(req, res) {
  const id = Number(req.params.id);

  try {
    const data = await actualizarPlaneacion({
      supabaseClient: userClientFromReq(req),
      id,
      update: req.body || {},
      userId: req.user.id
    });

    if (!data) return res.status(404).json({ error: 'No encontrado' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al actualizar planeacion' });
  }
}

export async function deletePlaneacion(req, res) {
  try {
    await eliminarPlaneacion({
      supabaseClient: userClientFromReq(req),
      id: Number(req.params.id),
      userId: req.user.id
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
}

export async function archivePlaneacion(req, res) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  try {
    const data = await archivarPlaneacion({
      supabaseClient: userClientFromReq(req),
      id,
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(res, error, 'Error al archivar planeacion');
  }
}

export async function restorePlaneacion(req, res) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  try {
    const data = await restaurarPlaneacion({
      supabaseClient: userClientFromReq(req),
      id,
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(res, error, 'Error al restaurar planeacion');
  }
}

export async function archiveBatch(req, res) {
  try {
    const data = await archivarBatchPlaneaciones({
      supabaseClient: userClientFromReq(req),
      batchId: req.params.batchId,
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(res, error, 'Error al archivar batch');
  }
}

export async function restoreBatch(req, res) {
  try {
    const data = await restaurarBatchPlaneaciones({
      supabaseClient: userClientFromReq(req),
      batchId: req.params.batchId,
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(res, error, 'Error al restaurar batch');
  }
}

export async function deletePlaneacionPermanent(req, res) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  try {
    const data = await eliminarPlaneacionPermanentemente({
      supabaseClient: userClientFromReq(req),
      id,
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(
      res,
      error,
      'Error al eliminar permanentemente la planeacion'
    );
  }
}

export async function deleteBatchPermanent(req, res) {
  try {
    const data = await eliminarBatchPermanentemente({
      supabaseClient: userClientFromReq(req),
      batchId: req.params.batchId,
      userId: req.user.id
    });

    res.json(data);
  } catch (error) {
    sendPlaneacionesError(
      res,
      error,
      'Error al eliminar permanentemente el batch'
    );
  }
}

export async function generarPlaneaciones(req, res) {
  const payload = validarPayloadGeneracion(req.body);
  if (!payload) {
    return res.status(400).json({ error: 'Datos invalidos' });
  }

  logPlaneacionDebug('backend request /api/planeaciones/generate', payload);

  if (!wantsStream(req)) {
    try {
      const result = await generarPlaneacionesIA({
        ...payload,
        userId: req.user.id,
        supabaseClient: userClientFromReq(req)
      });

      logPlaneacionDebug('backend response /api/planeaciones/generate', result);

      return res.json(result);
    } catch (err) {
      console.error('Error generando planeacion:', err);
      return res.status(500).json({ error: err.message || 'Error interno' });
    }
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  try {
    const result = await generarPlaneacionesIAConProgreso(
      {
        ...payload,
        userId: req.user.id,
        supabaseClient: userClientFromReq(req)
      },
      (event) => {
        if (!closed) {
          writeSse(res, event);
        }
      }
    );

    if (!closed) {
      logPlaneacionDebug('backend response /api/planeaciones/generate?stream=1', result);
      writeSse(res, { type: 'done', data: result });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    console.error('Error generando planeacion (stream):', err);

    if (!closed) {
      writeSse(res, {
        type: 'error',
        error: err?.message || 'Error generando planeaciones'
      });
      res.end();
    }
  }
}

export async function getBatches(req, res) {
  try {
    const data = await listarBatches({
      supabaseClient: userClientFromReq(req),
      userId: req.user.id
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener batches' });
  }
}

export async function getPlaneacionesByBatch(req, res) {
  try {
    const data = await listarPlaneacionesPorBatch({
      supabaseClient: userClientFromReq(req),
      batchId: req.params.batch_id,
      userId: req.user.id
    });

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Batch no encontrado' });
    }

    res.json({
      batch_id: req.params.batch_id,
      total: data.length,
      planeaciones: data
    });
  } catch {
    res.status(500).json({ error: 'Error al obtener planeaciones del batch' });
  }
}
