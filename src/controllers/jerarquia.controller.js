import { createUserClient } from '../../supabaseClient.js';
import {
  listarPlanteles,
  crearPlantel,
  eliminarPlantel,
  listarGradosPorPlantel,
  crearGrado,
  eliminarGrado,
  listarMateriasPorGrado,
  crearMateria,
  eliminarMateria,
  listarUnidadesPorMateria,
  crearUnidad,
  eliminarUnidad,
  listarTemasPorUnidad,
  crearTemas,
  eliminarTema,
  obtenerPlaneacionPorTema
} from '../services/jerarquia.service.js';
import { generarPlaneacionesIAPorUnidad } from '../services/planeaciones.service.js';

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

function sendDeleteSuccess(res, type, id) {
  return res.json({
    ok: true,
    deleted: {
      type,
      id
    }
  });
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

function parseTemasBody(body) {
  if (Array.isArray(body?.temas)) {
    return body.temas;
  }

  if (body?.titulo || body?.duracion || body?.orden) {
    return [
      {
        titulo: body.titulo,
        duracion: body.duracion,
        orden: body.orden
      }
    ];
  }

  return [];
}

export async function getPlanteles(req, res) {
  try {
    const data = await listarPlanteles(userClientFromReq(req));
    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener planteles');
  }
}

export async function postPlantel(req, res) {
  try {
    const data = await crearPlantel(userClientFromReq(req), {
      nombre: req.body?.nombre
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error, 'Error al crear plantel');
  }
}

export async function deletePlantel(req, res) {
  try {
    await eliminarPlantel(userClientFromReq(req), req.params.plantelId);
    sendDeleteSuccess(res, 'plantel', req.params.plantelId);
  } catch (error) {
    sendError(res, error, 'Error al eliminar plantel');
  }
}

export async function getGradosByPlantel(req, res) {
  try {
    const data = await listarGradosPorPlantel(
      userClientFromReq(req),
      req.params.plantelId
    );

    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener grados');
  }
}

export async function postGrado(req, res) {
  try {
    const data = await crearGrado(userClientFromReq(req), {
      plantelId: req.body?.plantel_id,
      nombre: req.body?.nombre,
      orden: Number.parseInt(req.body?.orden, 10),
      nivelBase: req.body?.nivel_base
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error, 'Error al crear grado');
  }
}

export async function deleteGrado(req, res) {
  try {
    await eliminarGrado(userClientFromReq(req), req.params.gradoId);
    sendDeleteSuccess(res, 'grado', req.params.gradoId);
  } catch (error) {
    sendError(res, error, 'Error al eliminar grado');
  }
}

export async function getMateriasByGrado(req, res) {
  try {
    const data = await listarMateriasPorGrado(
      userClientFromReq(req),
      req.params.gradoId
    );

    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener materias');
  }
}

export async function postMateria(req, res) {
  try {
    const data = await crearMateria(userClientFromReq(req), {
      gradoId: req.body?.grado_id,
      nombre: req.body?.nombre
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error, 'Error al crear materia');
  }
}

export async function deleteMateria(req, res) {
  try {
    await eliminarMateria(userClientFromReq(req), req.params.materiaId);
    sendDeleteSuccess(res, 'materia', req.params.materiaId);
  } catch (error) {
    sendError(res, error, 'Error al eliminar materia');
  }
}

export async function getUnidadesByMateria(req, res) {
  try {
    const data = await listarUnidadesPorMateria(
      userClientFromReq(req),
      req.params.materiaId
    );

    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener unidades');
  }
}

export async function postUnidad(req, res) {
  try {
    const data = await crearUnidad(userClientFromReq(req), {
      materiaId: req.body?.materia_id,
      nombre: req.body?.nombre,
      orden: Number.parseInt(req.body?.orden, 10)
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error, 'Error al crear unidad');
  }
}

export async function deleteUnidad(req, res) {
  try {
    await eliminarUnidad(userClientFromReq(req), req.params.unidadId);
    sendDeleteSuccess(res, 'unidad', req.params.unidadId);
  } catch (error) {
    sendError(res, error, 'Error al eliminar unidad');
  }
}

export async function getTemasByUnidad(req, res) {
  try {
    const data = await listarTemasPorUnidad(
      userClientFromReq(req),
      req.params.unidadId
    );

    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener temas');
  }
}

export async function postTemas(req, res) {
  const temas = parseTemasBody(req.body);

  if (!req.body?.unidad_id) {
    return res.status(400).json({ error: 'unidad_id es requerido' });
  }

  if (!Array.isArray(temas) || temas.length === 0) {
    return res.status(400).json({ error: 'Debes enviar al menos un tema' });
  }

  try {
    const data = await crearTemas(userClientFromReq(req), {
      unidadId: req.body.unidad_id,
      temas
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error, 'Error al crear temas');
  }
}

export async function deleteTema(req, res) {
  try {
    await eliminarTema(userClientFromReq(req), req.params.temaId);
    sendDeleteSuccess(res, 'tema', req.params.temaId);
  } catch (error) {
    sendError(res, error, 'Error al eliminar tema');
  }
}

export async function generarPlaneacionesPorUnidad(req, res) {
  const temas = Array.isArray(req.body?.temas) ? req.body.temas : [];

  if (temas.length === 0) {
    return res.status(400).json({ error: 'Debes enviar al menos un tema' });
  }

  const payload = {
    unidadId: req.params.unidadId,
    temas,
    materia: typeof req.body?.materia === 'string' ? req.body.materia : null,
    nivel: typeof req.body?.nivel === 'string' ? req.body.nivel : null
  };

  logPlaneacionDebug('backend request /api/unidades/:unidadId/generar', payload);

  if (!wantsStream(req)) {
    try {
      const result = await generarPlaneacionesIAPorUnidad({
        supabaseClient: userClientFromReq(req),
        ...payload
      });

      logPlaneacionDebug('backend response /api/unidades/:unidadId/generar', result);

      return res.json(result);
    } catch (error) {
      return sendError(res, error, 'Error al generar planeaciones por unidad');
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
    const result = await generarPlaneacionesIAPorUnidad(
      {
        supabaseClient: userClientFromReq(req),
        ...payload
      },
      (event) => {
        if (!closed) {
          writeSse(res, event);
        }
      }
    );

    if (!closed) {
      logPlaneacionDebug('backend response /api/unidades/:unidadId/generar?stream=1', result);
      writeSse(res, { type: 'done', data: result });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    console.error('Error generando planeaciones por unidad (stream):', error);

    if (!closed) {
      writeSse(res, {
        type: 'error',
        error: error?.message || 'Error al generar planeaciones por unidad'
      });
      res.end();
    }
  }
}

export async function getPlaneacionByTema(req, res) {
  try {
    const data = await obtenerPlaneacionPorTema(
      userClientFromReq(req),
      req.params.temaId
    );

    res.json(data);
  } catch (error) {
    sendError(res, error, 'Error al obtener planeacion por tema');
  }
}
