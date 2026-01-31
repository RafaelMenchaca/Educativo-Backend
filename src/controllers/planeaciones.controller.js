import {
  listarPlaneaciones,
  obtenerPlaneacionPorId,
  actualizarPlaneacion,
  eliminarPlaneacion
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
