// Wikimedia Commons — no requiere API key, contenido educativo genuino y gratuito.
// API docs: https://www.mediawiki.org/wiki/API:Search

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const SEARCH_TIMEOUT_MS = 10000;
const DOWNLOAD_TIMEOUT_MS = 15000;

// Tipos de imagen aceptados para ilustraciones educativas
const VALID_MIMES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchUrl(query) {
  const url = new URL(WIKIMEDIA_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');       // namespace 6 = File (imágenes)
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrlimit', '12');           // primeros 12 resultados
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime|size|dimensions');
  url.searchParams.set('iiurlwidth', '800');        // thumbnail a 800px (PNG para SVGs)
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  return url.toString();
}

function pickBestImage(pages) {
  const candidates = Object.values(pages)
    .map((page) => {
      const info = page?.imageinfo?.[0];
      if (!info) return null;
      if (!VALID_MIMES.has(info.mime)) return null;
      // Descartar imágenes muy pequeñas (íconos, logos chicos)
      const w = info.thumbwidth || info.width || 0;
      const h = info.thumbheight || info.height || 0;
      if (w > 0 && w < 150) return null;
      if (h > 0 && h < 150) return null;
      return {
        downloadUrl: info.thumburl || info.url,   // thumbnail PNG o URL original
        originalUrl: info.url,
        mime: info.mime,
        width: info.thumbwidth || info.width || null,
        height: info.thumbheight || info.height || null,
        title: (page.title || '').replace('File:', '').replace(/_/g, ' ')
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;

  // Preferir PNG/JPEG sobre SVG directo (el thumbnail ya es PNG si viene de SVG)
  // Los resultados ya vienen ordenados por relevancia de búsqueda — tomamos el primero válido
  return candidates[0];
}

/**
 * Busca una imagen educativa en Wikimedia Commons.
 * query: string de keywords en inglés (generado por GPT-4o-mini)
 * Devuelve { url, previewUrl, pageUrl, tags, width, height } o null.
 */
export async function searchEducationalImage(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Query de imagen requerida');
  }

  const url = buildSearchUrl(query.trim());
  const response = await fetchWithTimeout(url, undefined, SEARCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Wikimedia API respondio ${response.status}`);
  }

  const data = await response.json();
  const pages = data?.query?.pages;
  if (!pages || Object.keys(pages).length === 0) return null;

  const best = pickBestImage(pages);
  if (!best) return null;

  return {
    url: best.downloadUrl,
    previewUrl: best.downloadUrl,
    pageUrl: null,
    tags: best.title,
    width: best.width,
    height: best.height
  };
}

function inferExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    // Wikimedia thumbnails de SVG terminan en ".svg.png" → tomar "png"
    const match = pathname.match(/\.([a-zA-Z0-9]{2,4})(?:$|\?)/);
    if (match) return match[1].toLowerCase();
  } catch (_) {
    // ignorar
  }
  return 'jpg';
}

function mimeFromExtension(ext) {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml'
  };
  return map[ext] || 'image/jpeg';
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
