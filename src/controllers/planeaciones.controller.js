import {
  listarPlaneaciones,
  obtenerPlaneacionPorId,
  actualizarPlaneacion,
  eliminarPlaneacion,
  generarPlaneacionesIA,
  generarPlaneacionesIAConProgreso,
  listarBatches,
  listarPlaneacionesPorBatch
} from '../services/planeaciones.service.js';

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

export async function getPlaneaciones(req, res) {
  try {
    const data = await listarPlaneaciones(req.user.id);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
}

export async function getPlaneacionById(req, res) {
  const id = Number(req.params.id);

  const data = await obtenerPlaneacionPorId(id, req.user.id);
  if (!data) {
    return res.status(404).json({ error: 'No encontrado' });
  }

  res.json(data);
}

export async function updatePlaneacion(req, res) {
  const id = Number(req.params.id);

  try {
    const data = await actualizarPlaneacion(id, req.body || {}, req.user.id);
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al actualizar planeacion' });
  }
}

export async function deletePlaneacion(req, res) {
  try {
    await eliminarPlaneacion(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
}

export async function generarPlaneaciones(req, res) {
  const payload = validarPayloadGeneracion(req.body);
  if (!payload) {
    return res.status(400).json({ error: 'Datos invalidos' });
  }

  if (!wantsStream(req)) {
    try {
      const result = await generarPlaneacionesIA({
        ...payload,
        userId: req.user.id
      });

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
        userId: req.user.id
      },
      (event) => {
        if (!closed) {
          writeSse(res, event);
        }
      }
    );

    if (!closed) {
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
    const data = await listarBatches(req.user.id);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener batches' });
  }
}

export async function getPlaneacionesByBatch(req, res) {
  try {
    const data = await listarPlaneacionesPorBatch(
      req.params.batch_id,
      req.user.id
    );

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
