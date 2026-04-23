const PIXABAY_ENDPOINT = 'https://pixabay.com/api/';
const PIXABAY_TIMEOUT_MS = 8000;
const DOWNLOAD_TIMEOUT_MS = 12000;

function buildPixabayUrl(query, apiKey) {
  const url = new URL(PIXABAY_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'es');
  url.searchParams.set('image_type', 'photo,illustration,vector');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', '5');
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

function pickBestHit(hits) {
  const educational = hits.filter((hit) => hit?.type === 'illustration' || hit?.type === 'vector');
  const pool = educational.length > 0 ? educational : hits;

  return pool.slice().sort((a, b) => {
    const scoreA = (a?.likes || 0) + (a?.views || 0) / 1000;
    const scoreB = (b?.likes || 0) + (b?.views || 0) / 1000;
    return scoreB - scoreA;
  })[0];
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

  const url = buildPixabayUrl(query.trim(), apiKey);
  const response = await fetchWithTimeout(url, undefined, PIXABAY_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Pixabay respondio ${response.status}`);
  }

  const data = await response.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  if (hits.length === 0) return null;

  const best = pickBestHit(hits);
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
