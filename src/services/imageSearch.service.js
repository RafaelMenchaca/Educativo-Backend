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
// EN and ES equivalents — matching either in Pixabay tags doesn't count as relevant
const DOMAIN_GENERIC_TOKENS = new Set([
  // English
  'biology','mathematics','physics','chemistry','history','geography',
  'science','education','art','music','literature','philosophy','economics',
  'technology','computing','english','spanish','civics','ethics','anatomy',
  'astronomy','algebra','geometry','calculus','statistics','trigonometry',
  'arithmetic','educational','illustration','diagram','infographic','vector',
  // Spanish — Pixabay lang=es returns Spanish tags, so we need both
  'biologia','matematicas','matematica','fisica','quimica','historia','geografia',
  'ciencias','ciencia','educacion','arte','musica','literatura','filosofia','economia',
  'tecnologia','informatica','computacion','civica','etica','anatomia','astronomia',
  'geometria','calculo','estadistica','trigonometria','aritmetica',
  'ilustracion','diagrama','infografia','educativo','educativa'
]);

function buildPixabayUrl(query, apiKey) {
  const url = new URL(PIXABAY_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'es');
  url.searchParams.set('image_type', 'illustration');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', '20');
  // No category filter — combining category + image_type=illustration is too restrictive
  // and results in 0 hits for many valid educational queries.
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

  // Pixabay's own search already filters for relevance. The overlap scoring here
  // ranks results (prefer images whose tags explicitly match the query) but does NOT
  // reject them — rejecting based on overlap caused zero images when Pixabay returned
  // relevant images whose tags didn't repeat the search term word-for-word.
  //
  // Exception: when the query has 2+ non-generic terms, require at least 1 tag match
  // to avoid unrelated popular images (e.g., CEO/SEO teacher appearing for physics queries).
  const nonDomainInQuery = countNonDomainTokens(queryTokens);
  const minOverlap = nonDomainInQuery >= 2 ? 1 : 0;

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
  const url = buildPixabayUrl(trimmedQuery, apiKey);
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
