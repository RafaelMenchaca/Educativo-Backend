const STOPWORDS = new Set([
  'de','la','el','los','las','en','y','a','o','u','con','sin','por','para','que','del','al','se','su','sus','lo','es','son','ser','como','un','una','unos','unas','mas','este','esta','estos','estas','ese','esa','esos','esas','le','les','pero','si','no','ya','muy','tambien','entre','sobre','hasta','desde','cuando','donde','hacer','haga','hagan','durante','mediante','cada','todo','toda','todos','todas','otro','otra','otros','otras','vez','veces','alumno','alumnos','alumna','alumnas','estudiante','estudiantes','maestro','maestra','maestros','profesor','profesora','profesores','docente','docentes','grupo','equipo','equipos','clase','sesion','sesiones','tema','actividad','actividades','trabajo','trabajos','material','materiales','pagina','paginas','libro','libros','cuaderno','cuadernos','leer','lean','escribir','escriban','responder','respondan','analizar','analicen','comentar','comenten','explicar','expliquen','discutir','discutan','compartir','compartan','presentar','presenten','revisar','revisen','aplicar','apliquen','utilizar','utilicen','usar','usen','forma','formas','parte','partes','punto','puntos','caso','casos','tipo','tipos','tiempo','minutos','hora','horas'
]);

const MOMENT_MODIFIERS = {
  'conocimientos-previos': ['diagrama', 'educativo', 'ilustracion'],
  'desarrollo': ['diagrama', 'esquema', 'educativo'],
  'cierre': ['infografia', 'resumen', 'educativo']
};

const DIACRITICS_REGEX = /[̀-ͯ]/g;

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text, max) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const words = cleaned.split(' ');
  const seen = new Set();
  const keywords = [];

  for (const word of words) {
    if (word.length < 4) continue;
    if (STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
    if (keywords.length >= max) break;
  }

  return keywords;
}

function normalizeMomento(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function buildImageSearchQuery({
  materia,
  tema,
  tiempoSesion,
  actividades
} = {}) {
  const parts = [];

  if (typeof tema === 'string' && tema.trim()) {
    parts.push(...extractKeywords(tema, 4));
  }

  if (typeof materia === 'string' && materia.trim()) {
    parts.push(...extractKeywords(materia, 2));
  }

  if (typeof actividades === 'string' && actividades.trim()) {
    parts.push(...extractKeywords(actividades, 4));
  }

  const momentoKey = normalizeMomento(tiempoSesion);
  const modifiers = MOMENT_MODIFIERS[momentoKey] || ['educativo'];
  parts.push(...modifiers);

  const seen = new Set();
  const final = [];
  for (const word of parts) {
    if (!word) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    final.push(word);
    if (final.length >= 10) break;
  }

  return final.join(' ');
}
