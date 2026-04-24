import {
  buildImageSearchQuery,
  buildFallbackQueries,
  pickPixabayCategory
} from '../utils/buildImageSearchQuery.js';
import { searchEducationalImage, downloadImageBytes } from './imageSearch.service.js';

const STORAGE_BUCKET = 'planeacion-actividades';
const DIACRITICS_REGEX = /[̀-ͯ]/g;

const MOMENT_ALIASES = new Map([
  ['conocimientos-previos', 'conocimientos-previos'],
  ['conocimientos previos', 'conocimientos-previos'],
  ['desarrollo', 'desarrollo'],
  ['cierre', 'cierre']
]);

function normalizeMomentKey(value) {
  if (typeof value !== 'string') return null;
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .trim();
  return MOMENT_ALIASES.get(base) || null;
}

export function normalizeGenerarImagenesEn(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const key = normalizeMomentKey(item);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function sanitizeFileNameBase(name) {
  if (!name || typeof name !== 'string') return 'imagen';
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'imagen';
}

function buildImageId(timestamp) {
  const rand = Math.random().toString(36).slice(2, 12);
  return `img_${timestamp}_${rand}`;
}

async function searchWithFallback(queries, category) {
  for (const query of queries) {
    if (!query) continue;
    try {
      const result = await searchEducationalImage(query, { category });
      if (result) return { result, usedQuery: query };
    } catch (err) {
      console.warn('[image-enrichment] query fallback error:', err?.message || err);
    }
  }
  return null;
}

async function enrichMoment({
  queries,
  category,
  client,
  userId,
  planeacionId,
  momentKey
}) {
  const outcome = await searchWithFallback(queries, category);
  if (!outcome) return null;

  const { result: searchResult, usedQuery } = outcome;
  const downloaded = await downloadImageBytes(searchResult.url);
  const timestamp = Date.now();
  const fileName = `${sanitizeFileNameBase(usedQuery)}.${downloaded.ext}`;
  const path = `${userId}/${planeacionId}/${momentKey}/${timestamp}-${fileName}`;

  const { data: uploaded, error: uploadError } = await client
    .storage
    .from(STORAGE_BUCKET)
    .upload(path, downloaded.buffer, {
      contentType: downloaded.mime,
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Storage upload: ${uploadError.message || uploadError}`);
  }

  return {
    id: buildImageId(timestamp),
    name: fileName,
    path: uploaded?.path || path,
    size: downloaded.size,
    mime_type: downloaded.mime,
    uploaded_at: new Date(timestamp).toISOString(),
    source: 'ai_suggested',
    query: usedQuery
  };
}

export async function enrichPlaneacionWithImages({
  client,
  userId,
  planeacionId,
  tablaIa,
  generarImagenesEn,
  contexto
}) {
  const momentos = normalizeGenerarImagenesEn(generarImagenesEn);

  if (!Array.isArray(tablaIa) || tablaIa.length === 0 || momentos.length === 0) {
    return { tablaIa, enriched: 0, errors: [] };
  }

  if (!client || !userId || !planeacionId) {
    return {
      tablaIa,
      enriched: 0,
      errors: ['client/userId/planeacionId faltante en enrichPlaneacionWithImages']
    };
  }

  const nextTabla = tablaIa.map((row) => ({
    ...row,
    actividades_imagenes: Array.isArray(row?.actividades_imagenes)
      ? [...row.actividades_imagenes]
      : []
  }));

  const errors = [];
  let enriched = 0;

  const fallbacks = buildFallbackQueries({
    materia: contexto?.materia,
    tema: contexto?.tema
  });
  const category = pickPixabayCategory({ materia: contexto?.materia });

  for (const row of nextTabla) {
    const momentKey = normalizeMomentKey(row?.tiempo_sesion);
    if (!momentKey || !momentos.includes(momentKey)) continue;

    const primary = buildImageSearchQuery({
      materia: contexto?.materia,
      tema: contexto?.tema
    });

    const queries = [primary, ...fallbacks].filter(Boolean);

    try {
      const imagen = await enrichMoment({
        queries,
        category,
        client,
        userId,
        planeacionId,
        momentKey
      });

      if (imagen) {
        row.actividades_imagenes.push(imagen);
        enriched += 1;
      } else {
        console.warn(`[image-enrichment] [${momentKey}] 0 hits en ${queries.length} intentos (queries: ${queries.join(' | ')})`);
      }
    } catch (error) {
      const message = `[${momentKey}] ${error?.message || 'error desconocido'}`;
      errors.push(message);
      console.error('[image-enrichment]', message);
    }
  }

  return { tablaIa: nextTabla, enriched, errors };
}
