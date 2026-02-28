function buildHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function ensureRecordExists(client, table, id, notFoundMessage) {
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw buildHttpError(404, notFoundMessage);
}

async function nextOrderFor(client, table, parentColumn, parentId) {
  const { data, error } = await client
    .from(table)
    .select('orden')
    .eq(parentColumn, parentId)
    .order('orden', { ascending: false })
    .limit(1);

  if (error) throw error;

  const maxOrder = Number.isInteger(data?.[0]?.orden) ? data[0].orden : 0;
  return maxOrder + 1;
}

export async function listarPlanteles(client) {
  const { data, error } = await client
    .from('planteles')
    .select('id, nombre, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function crearPlantel(client, { nombre }) {
  const safeNombre = normalizeText(nombre);
  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de plantel invalido');
  }

  const { data, error } = await client
    .from('planteles')
    .insert([{ nombre: safeNombre }])
    .select('id, nombre, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function listarGradosPorPlantel(client, plantelId) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');

  const { data, error } = await client
    .from('grados')
    .select('id, plantel_id, nombre, orden, created_at, updated_at')
    .eq('plantel_id', plantelId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function crearGrado(client, { plantelId, nombre, orden }) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');

  const safeNombre = normalizeText(nombre);
  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de grado invalido');
  }

  const providedOrder = asPositiveInteger(orden);
  const resolvedOrder = providedOrder || (await nextOrderFor(client, 'grados', 'plantel_id', plantelId));

  const { data, error } = await client
    .from('grados')
    .insert([
      {
        plantel_id: plantelId,
        nombre: safeNombre,
        orden: resolvedOrder
      }
    ])
    .select('id, plantel_id, nombre, orden, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function listarMateriasPorGrado(client, gradoId) {
  await ensureRecordExists(client, 'grados', gradoId, 'Grado no encontrado');

  const { data, error } = await client
    .from('materias')
    .select('id, grado_id, nombre, created_at, updated_at')
    .eq('grado_id', gradoId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function crearMateria(client, { gradoId, nombre }) {
  await ensureRecordExists(client, 'grados', gradoId, 'Grado no encontrado');

  const safeNombre = normalizeText(nombre);
  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de materia invalido');
  }

  const { data, error } = await client
    .from('materias')
    .insert([
      {
        grado_id: gradoId,
        nombre: safeNombre
      }
    ])
    .select('id, grado_id, nombre, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function listarUnidadesPorMateria(client, materiaId) {
  await ensureRecordExists(client, 'materias', materiaId, 'Materia no encontrada');

  const { data, error } = await client
    .from('unidades')
    .select('id, materia_id, nombre, orden, created_at, updated_at')
    .eq('materia_id', materiaId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function crearUnidad(client, { materiaId, nombre, orden }) {
  await ensureRecordExists(client, 'materias', materiaId, 'Materia no encontrada');

  const safeNombre = normalizeText(nombre);
  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de unidad invalido');
  }

  const providedOrder = asPositiveInteger(orden);
  const resolvedOrder = providedOrder || (await nextOrderFor(client, 'unidades', 'materia_id', materiaId));

  const { data, error } = await client
    .from('unidades')
    .insert([
      {
        materia_id: materiaId,
        nombre: safeNombre,
        orden: resolvedOrder
      }
    ])
    .select('id, materia_id, nombre, orden, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

function normalizeTemaInput(item) {
  const titulo = normalizeText(item?.titulo);
  const duracion = Number.parseInt(item?.duracion, 10);
  const orden = asPositiveInteger(item?.orden);

  if (!titulo) {
    throw buildHttpError(400, 'Titulo de tema invalido');
  }

  if (!Number.isInteger(duracion) || duracion < 10) {
    throw buildHttpError(400, 'Duracion de tema invalida');
  }

  return {
    titulo,
    duracion,
    orden
  };
}

export async function crearTemas(client, { unidadId, temas }) {
  await ensureRecordExists(client, 'unidades', unidadId, 'Unidad no encontrada');

  if (!Array.isArray(temas) || temas.length === 0) {
    throw buildHttpError(400, 'Debes enviar al menos un tema');
  }

  const normalized = temas.map(normalizeTemaInput);

  let nextAutoOrder = await nextOrderFor(client, 'temas', 'unidad_id', unidadId);

  const rows = normalized.map((tema) => {
    const resolvedOrder = Number.isInteger(tema.orden) ? tema.orden : nextAutoOrder++;

    return {
      unidad_id: unidadId,
      titulo: tema.titulo,
      duracion: tema.duracion,
      orden: resolvedOrder
    };
  });

  const { data, error } = await client
    .from('temas')
    .insert(rows)
    .select('id, unidad_id, titulo, duracion, orden, created_at, updated_at');

  if (error) throw error;

  return {
    total: data.length,
    temas: data
  };
}

export async function listarTemasPorUnidad(client, unidadId) {
  await ensureRecordExists(client, 'unidades', unidadId, 'Unidad no encontrada');

  const { data: temas, error: temasError } = await client
    .from('temas')
    .select('id, unidad_id, titulo, duracion, orden, created_at, updated_at')
    .eq('unidad_id', unidadId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (temasError) throw temasError;
  if (!temas || temas.length === 0) return [];

  const temaIds = temas.map((tema) => tema.id);

  const { data: planeaciones, error: planeacionesError } = await client
    .from('planeaciones')
    .select('id, tema_id, status, updated_at')
    .in('tema_id', temaIds)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (planeacionesError) throw planeacionesError;

  const planeacionByTemaId = new Map();
  for (const planeacion of planeaciones || []) {
    if (!planeacionByTemaId.has(planeacion.tema_id)) {
      planeacionByTemaId.set(planeacion.tema_id, {
        id: planeacion.id,
        status: planeacion.status,
        updated_at: planeacion.updated_at
      });
    }
  }

  return temas.map((tema) => ({
    ...tema,
    planeacion: planeacionByTemaId.get(tema.id) || null
  }));
}

export async function obtenerContextoUnidad(client, unidadId) {
  const { data: unidad, error: unidadError } = await client
    .from('unidades')
    .select('id, materia_id, nombre, orden')
    .eq('id', unidadId)
    .maybeSingle();

  if (unidadError) throw unidadError;
  if (!unidad) throw buildHttpError(404, 'Unidad no encontrada');

  const { data: materia, error: materiaError } = await client
    .from('materias')
    .select('id, grado_id, nombre')
    .eq('id', unidad.materia_id)
    .maybeSingle();

  if (materiaError) throw materiaError;
  if (!materia) throw buildHttpError(404, 'Materia no encontrada');

  const { data: grado, error: gradoError } = await client
    .from('grados')
    .select('id, nombre')
    .eq('id', materia.grado_id)
    .maybeSingle();

  if (gradoError) throw gradoError;
  if (!grado) throw buildHttpError(404, 'Grado no encontrado');

  return {
    unidad,
    materia,
    grado
  };
}

export async function obtenerPlaneacionPorTema(client, temaId) {
  const { data: tema, error: temaError } = await client
    .from('temas')
    .select('id')
    .eq('id', temaId)
    .maybeSingle();

  if (temaError) throw temaError;
  if (!tema) throw buildHttpError(404, 'Tema no encontrado');

  const { data, error } = await client
    .from('planeaciones')
    .select('*')
    .eq('tema_id', temaId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    throw buildHttpError(404, 'Planeacion no encontrada para el tema');
  }

  return data[0];
}
