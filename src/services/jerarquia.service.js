function buildHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUniqueViolation(error) {
  return String(error?.code || '').trim() === '23505';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

const GRADO_NIVEL_LABELS = {
  primaria: 'Primaria',
  secundaria: 'Secundaria',
  preparatoria: 'Preparatoria',
  universidad: 'Universidad'
};

const GRADO_NIVEL_ALIASES = {
  primaria: ['primaria'],
  secundaria: ['secundaria'],
  preparatoria: ['preparatoria', 'prepa', 'bachillerato', 'bachiller'],
  universidad: ['universidad', 'universitario', 'licenciatura', 'ingenieria', 'ingeniería', 'posgrado']
};

function normalizeNivelBase(value) {
  const safeValue = normalizeText(value).toLowerCase();
  if (!safeValue) return '';

  for (const [nivelBase, aliases] of Object.entries(GRADO_NIVEL_ALIASES)) {
    if (aliases.some((alias) => safeValue === alias || safeValue.startsWith(`${alias} `))) {
      return nivelBase;
    }
  }

  return '';
}

function formatNivelBaseLabel(nivelBase) {
  return GRADO_NIVEL_LABELS[nivelBase] || '';
}

function stripNivelBaseFromNombre(nombre, nivelBase) {
  const safeNombre = normalizeText(nombre);
  const nivelLabel = formatNivelBaseLabel(nivelBase);

  if (!safeNombre || !nivelLabel) {
    return safeNombre;
  }

  const normalizedName = safeNombre.toLowerCase();
  const normalizedLabel = nivelLabel.toLowerCase();

  if (normalizedName === normalizedLabel) {
    return '';
  }

  if (normalizedName.startsWith(`${normalizedLabel} `)) {
    return safeNombre.slice(nivelLabel.length).trim();
  }

  return safeNombre;
}

function buildStoredGradoNombre({ nivelBase, nombre }) {
  const safeNivelBase = normalizeNivelBase(nivelBase || nombre);
  const safeNombre = normalizeText(nombre);

  if (!safeNivelBase) {
    throw buildHttpError(400, 'Nivel base de grado invalido');
  }

  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de grado invalido');
  }

  const nivelLabel = formatNivelBaseLabel(safeNivelBase);
  const gradoNombre = stripNivelBaseFromNombre(safeNombre, safeNivelBase);

  return {
    nivelBase: safeNivelBase,
    nivelBaseDb: nivelLabel,
    nombreCompleto: gradoNombre ? `${nivelLabel} ${gradoNombre}` : nivelLabel
  };
}

function enrichGradoRecord(grado) {
  if (!grado || typeof grado !== 'object') {
    return grado;
  }

  const nivelBase = normalizeNivelBase(grado.nivel_base || grado.nombre);
  const safeNombre = normalizeText(grado.nombre);

  return {
    ...grado,
    nivel_base: nivelBase || null,
    grado_nombre: stripNivelBaseFromNombre(safeNombre, nivelBase) || safeNombre
  };
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

async function findExistingSingle(client, table, selectFields, filters = []) {
  let query = client.from(table).select(selectFields);

  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
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

async function listIdsByRelation(client, table, relationColumn, relationValue) {
  if (!relationValue || (Array.isArray(relationValue) && relationValue.length === 0)) {
    return [];
  }

  let query = client.from(table).select('id');

  if (Array.isArray(relationValue)) {
    query = query.in(relationColumn, relationValue);
  } else {
    query = query.eq(relationColumn, relationValue);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .map((item) => item?.id)
    .filter(Boolean);
}

async function deleteRowsByIds(client, table, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;

  const { error } = await client
    .from(table)
    .delete()
    .in('id', ids);

  if (error) throw error;
}

async function deletePlaneacionesByTemaIds(client, temaIds) {
  if (!Array.isArray(temaIds) || temaIds.length === 0) return;

  const { error } = await client
    .from('planeaciones')
    .delete()
    .in('tema_id', temaIds);

  if (error) throw error;
}

async function listActivePlaneacionesByTemaIds(client, temaIds, userId) {
  if (!Array.isArray(temaIds) || temaIds.length === 0) {
    return [];
  }

  const query = client
    .from('planeaciones')
    .select('id, batch_id, tema_id')
    .in('tema_id', temaIds)
    .or('is_archived.is.null,is_archived.eq.false');

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}

async function archivePlaneacionesByTemaIds(client, temaIds, { userId, scopeType, scopeId }) {
  const activePlaneaciones = await listActivePlaneacionesByTemaIds(
    client,
    temaIds,
    userId
  );

  if (activePlaneaciones.length === 0) {
    return {
      ok: true,
      archived: {
        type: scopeType,
        id: scopeId,
        total_planeaciones: 0,
        planeacion_ids: [],
        batch_ids: []
      }
    };
  }

  const planeacionIds = activePlaneaciones.map((item) => item.id);
  const query = client
    .from('planeaciones')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString()
    })
    .in('id', planeacionIds);

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.select('id, batch_id, tema_id');
  if (error) throw error;

  const archivedRows = data || [];

  return {
    ok: true,
    archived: {
      type: scopeType,
      id: scopeId,
      total_planeaciones: archivedRows.length,
      planeacion_ids: archivedRows.map((item) => item.id),
      batch_ids: [...new Set(archivedRows.map((item) => item.batch_id).filter(Boolean))]
    }
  };
}

async function collectTemaIdsForPlantel(client, plantelId) {
  const gradoIds = await listIdsByRelation(client, 'grados', 'plantel_id', plantelId);
  const materiaIds = await listIdsByRelation(client, 'materias', 'grado_id', gradoIds);
  const unidadIds = await listIdsByRelation(client, 'unidades', 'materia_id', materiaIds);
  return listIdsByRelation(client, 'temas', 'unidad_id', unidadIds);
}

async function collectTemaIdsForGrado(client, gradoId) {
  const materiaIds = await listIdsByRelation(client, 'materias', 'grado_id', gradoId);
  const unidadIds = await listIdsByRelation(client, 'unidades', 'materia_id', materiaIds);
  return listIdsByRelation(client, 'temas', 'unidad_id', unidadIds);
}

async function collectTemaIdsForMateria(client, materiaId) {
  const unidadIds = await listIdsByRelation(client, 'unidades', 'materia_id', materiaId);
  return listIdsByRelation(client, 'temas', 'unidad_id', unidadIds);
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

  const selectFields = 'id, nombre, created_at, updated_at';
  const existing = await findExistingSingle(client, 'planteles', selectFields, [
    ['nombre', safeNombre]
  ]);

  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from('planteles')
    .insert([{ nombre: safeNombre }])
    .select(selectFields)
    .single();

  if (error && isUniqueViolation(error)) {
    const duplicate = await findExistingSingle(client, 'planteles', selectFields, [
      ['nombre', safeNombre]
    ]);

    if (duplicate) {
      return duplicate;
    }
  }

  if (error) throw error;
  return data;
}

export async function actualizarPlantel(client, plantelId, { nombre }) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');

  const safeNombre = normalizeText(nombre);
  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de plantel invalido');
  }

  const { data, error } = await client
    .from('planteles')
    .update({ nombre: safeNombre })
    .eq('id', plantelId)
    .select('id, nombre, created_at, updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Plantel no encontrado');
  return data;
}

export async function eliminarPlantel(client, plantelId) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');

  const gradoIds = await listIdsByRelation(client, 'grados', 'plantel_id', plantelId);
  const materiaIds = await listIdsByRelation(client, 'materias', 'grado_id', gradoIds);
  const unidadIds = await listIdsByRelation(client, 'unidades', 'materia_id', materiaIds);
  const temaIds = await listIdsByRelation(client, 'temas', 'unidad_id', unidadIds);

  await deletePlaneacionesByTemaIds(client, temaIds);
  await deleteRowsByIds(client, 'temas', temaIds);
  await deleteRowsByIds(client, 'unidades', unidadIds);
  await deleteRowsByIds(client, 'materias', materiaIds);
  await deleteRowsByIds(client, 'grados', gradoIds);

  const { error } = await client
    .from('planteles')
    .delete()
    .eq('id', plantelId);

  if (error) throw error;
}

export async function archivarPlaneacionesDePlantel(client, plantelId, userId) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');
  const temaIds = await collectTemaIdsForPlantel(client, plantelId);
  return archivePlaneacionesByTemaIds(client, temaIds, {
    userId,
    scopeType: 'plantel',
    scopeId: plantelId
  });
}

export async function listarGradosPorPlantel(client, plantelId) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');

  const { data, error } = await client
    .from('grados')
    .select('id, plantel_id, nombre, nivel_base, orden, created_at, updated_at')
    .eq('plantel_id', plantelId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(enrichGradoRecord);
}

export async function crearGrado(client, { plantelId, nombre, orden, nivelBase }) {
  await ensureRecordExists(client, 'planteles', plantelId, 'Plantel no encontrado');

  const gradoData = buildStoredGradoNombre({ nivelBase, nombre });
  const providedOrder = asPositiveInteger(orden);
  const resolvedOrder = providedOrder || (await nextOrderFor(client, 'grados', 'plantel_id', plantelId));
  const selectFields = 'id, plantel_id, nombre, nivel_base, orden, created_at, updated_at';
  const existing = await findExistingSingle(client, 'grados', selectFields, [
    ['plantel_id', plantelId],
    ['nombre', gradoData.nombreCompleto]
  ]);

  if (existing) {
    return enrichGradoRecord(existing);
  }

  const { data, error } = await client
    .from('grados')
    .insert([
      {
        plantel_id: plantelId,
        nombre: gradoData.nombreCompleto,
        nivel_base: gradoData.nivelBaseDb,
        orden: resolvedOrder
      }
    ])
    .select(selectFields)
    .single();

  if (error && isUniqueViolation(error)) {
    const duplicate = await findExistingSingle(client, 'grados', selectFields, [
      ['plantel_id', plantelId],
      ['nombre', gradoData.nombreCompleto]
    ]);

    if (duplicate) {
      return enrichGradoRecord(duplicate);
    }
  }

  if (error) throw error;
  return enrichGradoRecord(data);
}

export async function actualizarGrado(client, gradoId, { nombre }) {
  const { data: existing, error: existingError } = await client
    .from('grados')
    .select('id, plantel_id, nombre, nivel_base, orden, created_at, updated_at')
    .eq('id', gradoId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) throw buildHttpError(404, 'Grado no encontrado');

  const gradoData = buildStoredGradoNombre({
    nivelBase: existing.nivel_base || existing.nombre,
    nombre
  });

  const { data, error } = await client
    .from('grados')
    .update({ nombre: gradoData.nombreCompleto })
    .eq('id', gradoId)
    .select('id, plantel_id, nombre, nivel_base, orden, created_at, updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Grado no encontrado');
  return enrichGradoRecord(data);
}

export async function eliminarGrado(client, gradoId) {
  await ensureRecordExists(client, 'grados', gradoId, 'Grado no encontrado');

  const materiaIds = await listIdsByRelation(client, 'materias', 'grado_id', gradoId);
  const unidadIds = await listIdsByRelation(client, 'unidades', 'materia_id', materiaIds);
  const temaIds = await listIdsByRelation(client, 'temas', 'unidad_id', unidadIds);

  await deletePlaneacionesByTemaIds(client, temaIds);
  await deleteRowsByIds(client, 'temas', temaIds);
  await deleteRowsByIds(client, 'unidades', unidadIds);
  await deleteRowsByIds(client, 'materias', materiaIds);

  const { error } = await client
    .from('grados')
    .delete()
    .eq('id', gradoId);

  if (error) throw error;
}

export async function archivarPlaneacionesDeGrado(client, gradoId, userId) {
  await ensureRecordExists(client, 'grados', gradoId, 'Grado no encontrado');
  const temaIds = await collectTemaIdsForGrado(client, gradoId);
  return archivePlaneacionesByTemaIds(client, temaIds, {
    userId,
    scopeType: 'grado',
    scopeId: gradoId
  });
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

  const selectFields = 'id, grado_id, nombre, created_at, updated_at';
  const existing = await findExistingSingle(client, 'materias', selectFields, [
    ['grado_id', gradoId],
    ['nombre', safeNombre]
  ]);

  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from('materias')
    .insert([
      {
        grado_id: gradoId,
        nombre: safeNombre
      }
    ])
    .select(selectFields)
    .single();

  if (error && isUniqueViolation(error)) {
    const duplicate = await findExistingSingle(client, 'materias', selectFields, [
      ['grado_id', gradoId],
      ['nombre', safeNombre]
    ]);

    if (duplicate) {
      return duplicate;
    }
  }

  if (error) throw error;
  return data;
}

export async function eliminarMateria(client, materiaId) {
  await ensureRecordExists(client, 'materias', materiaId, 'Materia no encontrada');

  const unidadIds = await listIdsByRelation(client, 'unidades', 'materia_id', materiaId);
  const temaIds = await listIdsByRelation(client, 'temas', 'unidad_id', unidadIds);

  await deletePlaneacionesByTemaIds(client, temaIds);
  await deleteRowsByIds(client, 'temas', temaIds);
  await deleteRowsByIds(client, 'unidades', unidadIds);

  const { error } = await client
    .from('materias')
    .delete()
    .eq('id', materiaId);

  if (error) throw error;
}

export async function archivarPlaneacionesDeMateria(client, materiaId, userId) {
  await ensureRecordExists(client, 'materias', materiaId, 'Materia no encontrada');
  const temaIds = await collectTemaIdsForMateria(client, materiaId);
  return archivePlaneacionesByTemaIds(client, temaIds, {
    userId,
    scopeType: 'materia',
    scopeId: materiaId
  });
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
  const selectFields = 'id, materia_id, nombre, orden, created_at, updated_at';
  const existing = await findExistingSingle(client, 'unidades', selectFields, [
    ['materia_id', materiaId],
    ['nombre', safeNombre]
  ]);

  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from('unidades')
    .insert([
      {
        materia_id: materiaId,
        nombre: safeNombre,
        orden: resolvedOrder
      }
    ])
    .select(selectFields)
    .single();

  if (error && isUniqueViolation(error)) {
    const duplicate = await findExistingSingle(client, 'unidades', selectFields, [
      ['materia_id', materiaId],
      ['nombre', safeNombre]
    ]);

    if (duplicate) {
      return duplicate;
    }
  }

  if (error) throw error;
  return data;
}

export async function actualizarUnidad(client, unidadId, { nombre }) {
  await ensureRecordExists(client, 'unidades', unidadId, 'Unidad no encontrada');

  const safeNombre = normalizeText(nombre);
  if (!safeNombre) {
    throw buildHttpError(400, 'Nombre de unidad invalido');
  }

  const { data, error } = await client
    .from('unidades')
    .update({ nombre: safeNombre })
    .eq('id', unidadId)
    .select('id, materia_id, nombre, orden, created_at, updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Unidad no encontrada');
  return data;
}

export async function eliminarUnidad(client, unidadId) {
  await ensureRecordExists(client, 'unidades', unidadId, 'Unidad no encontrada');

  const temaIds = await listIdsByRelation(client, 'temas', 'unidad_id', unidadId);

  await deletePlaneacionesByTemaIds(client, temaIds);
  await deleteRowsByIds(client, 'temas', temaIds);

  const { error } = await client
    .from('unidades')
    .delete()
    .eq('id', unidadId);

  if (error) throw error;
}

export async function archivarPlaneacionesDeUnidad(client, unidadId, userId) {
  await ensureRecordExists(client, 'unidades', unidadId, 'Unidad no encontrada');
  const temaIds = await listIdsByRelation(client, 'temas', 'unidad_id', unidadId);
  return archivePlaneacionesByTemaIds(client, temaIds, {
    userId,
    scopeType: 'unidad',
    scopeId: unidadId
  });
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

export async function eliminarTema(client, temaId) {
  await ensureRecordExists(client, 'temas', temaId, 'Tema no encontrado');

  await deletePlaneacionesByTemaIds(client, [temaId]);

  const { error } = await client
    .from('temas')
    .delete()
    .eq('id', temaId);

  if (error) throw error;
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
    .select('id, tema_id, status, updated_at, is_archived')
    .in('tema_id', temaIds)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (planeacionesError) throw planeacionesError;

  const planeacionesByTemaId = new Map();
  const planeacionByTemaId = new Map();
  for (const planeacion of planeaciones || []) {
    if (!planeacionesByTemaId.has(planeacion.tema_id)) {
      planeacionesByTemaId.set(planeacion.tema_id, []);
    }

    planeacionesByTemaId.get(planeacion.tema_id).push(planeacion);

    if (planeacion.is_archived !== true && !planeacionByTemaId.has(planeacion.tema_id)) {
      planeacionByTemaId.set(planeacion.tema_id, {
        id: planeacion.id,
        status: planeacion.status,
        updated_at: planeacion.updated_at
      });
    }
  }

  return temas
    .filter((tema) => {
      const planeacionesTema = planeacionesByTemaId.get(tema.id) || [];
      return planeacionesTema.some((planeacion) => planeacion.is_archived !== true);
    })
    .map((tema) => ({
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
    .select('id, plantel_id, nombre, nivel_base')
    .eq('id', materia.grado_id)
    .maybeSingle();

  if (gradoError) throw gradoError;
  if (!grado) throw buildHttpError(404, 'Grado no encontrado');

  const { data: plantel, error: plantelError } = await client
    .from('planteles')
    .select('id, nombre')
    .eq('id', grado.plantel_id)
    .maybeSingle();

  if (plantelError) throw plantelError;
  if (!plantel) throw buildHttpError(404, 'Plantel no encontrado');

  return {
    plantel,
    unidad,
    materia,
    grado: enrichGradoRecord(grado)
  };
}

export async function obtenerContextoTema(client, temaId) {
  const { data: tema, error: temaError } = await client
    .from('temas')
    .select('id, unidad_id, titulo, duracion, orden')
    .eq('id', temaId)
    .maybeSingle();

  if (temaError) throw temaError;
  if (!tema) throw buildHttpError(404, 'Tema no encontrado');

  const contextoUnidad = await obtenerContextoUnidad(client, tema.unidad_id);

  return {
    ...contextoUnidad,
    tema
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
    .or('is_archived.is.null,is_archived.eq.false')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    throw buildHttpError(404, 'Planeacion no encontrada para el tema');
  }

  return data[0];
}
