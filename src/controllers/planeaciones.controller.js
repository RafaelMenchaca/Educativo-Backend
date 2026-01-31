import {
  listarPlaneaciones,
  obtenerPlaneacionPorId,
  actualizarPlaneacion,
  eliminarPlaneacion,
  generarPlaneacionesIA,
  listarBatches,
  listarPlaneacionesPorBatch
} from '../services/planeaciones.service.js';

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
    res.status(500).json({ error: 'Error al actualizar planeación' });
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
  try {
    const { materia, nivel, unidad, temas } = req.body;

    if (
      !materia ||
      !nivel ||
      !Number.isInteger(unidad) ||
      !Array.isArray(temas) ||
      temas.length === 0
    ) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const result = await generarPlaneacionesIA({
      materia,
      nivel,
      unidad,
      temas,
      userId: req.user.id
    });

    res.json(result);
  } catch (err) {
    console.error('❌ Error generando planeación:', err);
    res.status(500).json({ error: err.message });
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
