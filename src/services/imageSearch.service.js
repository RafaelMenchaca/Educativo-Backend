import { stemSpanish } from '../utils/buildImageSearchQuery.js';

const PIXABAY_ENDPOINT = 'https://pixabay.com/api/';
const PIXABAY_TIMEOUT_MS = 8000;
const DOWNLOAD_TIMEOUT_MS = 12000;

const VALID_CATEGORIES = new Set([
  'backgrounds','fashion','nature','science','education','feelings','health',
  'people','religion','places','animals','industry','computer','food','sports',
  'transportation','travel','buildings','business','music'
]);

// Palabras genéricas de "dominio" o modifier — matchear SOLO estas en los tags
// no constituye relevancia real (cualquier cosa tiene tag "biology" o "science").
// Una imagen relevante debe tener al menos una palabra NO-genérica del tema.
const DOMAIN_GENERIC_TOKENS = new Set([
  'biology','mathematics','physics','chemistry','history','geography',
  'science','education','art','music','literature','philosophy','economics',
  'technology','computing','english','spanish','civics','ethics','anatomy',
  'astronomy','algebra','geometry','calculus','statistics','trigonometry',
  'arithmetic','educational','illustration','diagram','infographic','vector'
]);

function buildPixabayUrl(query, apiKey, category) {
  const url = new URL(PIXABAY_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'es');
  url.searchParams.set('image_type', 'illustration');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', '20');
  if (category && VALID_CATEGORIES.has(category)) {
    url.searchParams.set('category', category);
  }
  return url.toString();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function tokenizeTags(tagsString) {
  if (!tagsString || typeof tagsString !== 'string') return [];
  return tagsString
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(stemSpanish);
}

function countUniqueTagOverlap(tagsString, queryTokens) {
  const tokens = tokenizeTags(tagsString);
  const matched = new Set();
  for (const tok of tokens) {
    if (queryTokens.has(tok)) matched.add(tok);
  }
  return matched.size;
}

function countNonDomainOverlap(tagsString, queryTokens) {
  const tokens = tokenizeTags(tagsString);
  const matched = new Set();
  for (const tok of tokens) {
    if (DOMAIN_GENERIC_TOKENS.has(tok)) continue;
    if (queryTokens.has(tok)) matched.add(tok);
  }
  return matched.size;
}

function countNonDomainTokens(queryTokens) {
  let count = 0;
  for (const tok of queryTokens) {
    if (!DOMAIN_GENERIC_TOKENS.has(tok)) count += 1;
  }
  return count;
}

function pickBestHit(hits, query) {
  if (!Array.isArray(hits) || hits.length === 0) return null;

  const queryTokens = new Set(
    (query || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .map(stemSpanish)
  );

  // Umbral dinámico: si la query tiene 2+ palabras no-genéricas (tema compuesto),
  // exigir que 2 de ellas matcheen en tags. Así bloqueamos "revolución digital"
  // cuando buscas "Revolución Mexicana" (solo matchea "revolucion", no "mexicana").
  // Para temas de 1 palabra, umbral = 1.
  const nonDomainInQuery = countNonDomainTokens(queryTokens);
  const minOverlap = Math.max(1, Math.min(2, nonDomainInQuery));

  const scored = hits.map((hit) => {
    const overlap = countUniqueTagOverlap(hit?.tags, queryTokens);
    const nonDomainOverlap = countNonDomainOverlap(hit?.tags, queryTokens);
    const isEducationalType = hit?.type === 'illustration' || hit?.type === 'vector';
    const popularity = (hit?.likes || 0) + (hit?.views || 0) / 1000;
    return { hit, overlap, nonDomainOverlap, isEducationalType, popularity };
  });

  scored.sort((a, b) => {
    if (b.nonDomainOverlap !== a.nonDomainOverlap) return b.nonDomainOverlap - a.nonDomainOverlap;
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (a.isEducationalType !== b.isEducationalType) {
      return b.isEducationalType ? 1 : -1;
    }
    return b.popularity - a.popularity;
  });

  const best = scored[0];
  if (!best || best.nonDomainOverlap < minOverlap) return null;
  return best.hit;
}

function inferExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{3,4})(?:$|\?)/);
    if (match) return match[1].toLowerCase();
  } catch (_) {
    // ignore
  }
  return 'jpg';
}

function mimeFromExtension(ext) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml'
  };
  return map[ext] || 'image/jpeg';
}

export async function searchEducationalImage(query, options = {}) {
  const apiKey = options.apiKey || process.env.PIXABAY_API_KEY;

  if (!apiKey) {
    throw new Error('PIXABAY_API_KEY no configurada');
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Query de imagen requerida');
  }

  const trimmedQuery = query.trim();
  const url = buildPixabayUrl(trimmedQuery, apiKey, options.category);
  const response = await fetchWithTimeout(url, undefined, PIXABAY_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Pixabay respondio ${response.status}`);
  }

  const data = await response.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  if (hits.length === 0) return null;

  const best = pickBestHit(hits, trimmedQuery);
  if (!best) return null;

  const downloadUrl = best.largeImageURL || best.webformatURL;
  if (!downloadUrl) return null;

  return {
    url: downloadUrl,
    previewUrl: best.previewURL || null,
    pageUrl: best.pageURL || null,
    tags: best.tags || '',
    width: best.imageWidth || null,
    height: best.imageHeight || null
  };
}

export async function downloadImageBytes(url) {
  if (!url) throw new Error('URL de imagen requerida');

  const response = await fetchWithTimeout(url, undefined, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen (${response.status})`);
  }

  const rawContentType = response.headers.get('content-type') || '';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = inferExtension(url);
  const mime = rawContentType.startsWith('image/')
    ? rawContentType.split(';')[0].trim()
    : mimeFromExtension(ext);

  return { buffer, mime, ext, size: buffer.length };
}
