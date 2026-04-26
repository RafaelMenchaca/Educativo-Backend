const STOPWORDS = new Set([
  // Artículos, preposiciones, conjunciones, pronombres
  'de','la','el','los','las','en','y','a','o','u','con','sin','por','para','que','del','al','se','su','sus','lo','es','son','ser','como','un','una','unos','unas','mas','este','esta','estos','estas','ese','esa','esos','esas','le','les','pero','si','no','ya','muy','tambien','entre','sobre','hasta','desde','cuando','donde','durante','mediante','cada','todo','toda','todos','todas','otro','otra','otros','otras','vez','veces','cual','cuales','quien','quienes','nos','nuestro','nuestra','nuestros','nuestras','mi','mis','tu','tus','yo','el','ella','ellos','ellas','usted','ustedes',

  // Contexto escolar (no aportan a búsqueda visual)
  'alumno','alumnos','alumna','alumnas','estudiante','estudiantes','maestro','maestra','maestros','profesor','profesora','profesores','docente','docentes','grupo','equipo','equipos','clase','sesion','sesiones','tema','actividad','actividades','trabajo','trabajos','material','materiales','pagina','paginas','libro','libros','cuaderno','cuadernos','tarea','tareas','ejercicio','ejercicios','lista','listas','ejemplo','ejemplos','pregunta','preguntas','respuesta','respuestas','plenaria','debate','dialogo','reflexion','reflexiones','comentario','comentarios',

  // Palabras vacías / ruido
  'forma','formas','parte','partes','punto','puntos','caso','casos','tipo','tipos','tiempo','minutos','minuto','hora','horas','manera','maneras','cosa','cosas','algo','nada','siempre','nunca','ademas','tras','mientras','luego','despues','antes','primero','segundo','tercero','ultimo','finalmente','total','idea','ideas','concepto','conceptos','informacion','datos','dato','grupo','grupos',

  // Verbos comunes (infinitivo + conjugaciones)
  'hacer','hacen','hagan','hace','haga','haciendo','hecho','hecha','hechas','hechos',
  'leer','lee','lean','leen','leyendo','leido','leida','leyeron',
  'escribir','escribe','escriben','escriban','escribiendo','escrito','escrita','escribieron',
  'responder','responde','responden','respondan','respondiendo','respondido','respondieron',
  'analizar','analiza','analizan','analicen','analizando','analizado','analizaron',
  'comentar','comenta','comentan','comenten','comentando','comentado','comentaron',
  'explicar','explica','explican','expliquen','explicando','explicado','explicaron',
  'discutir','discute','discuten','discutan','discutiendo','discutido','discutieron',
  'compartir','comparte','comparten','compartan','compartiendo','compartido','compartieron',
  'presentar','presenta','presentan','presenten','presentando','presentado','presentaron',
  'revisar','revisa','revisan','revisen','revisando','revisado','revisaron',
  'aplicar','aplica','aplican','apliquen','aplicando','aplicado','aplicaron',
  'utilizar','utiliza','utilizan','utilicen','utilizando','utilizado','utilizaron',
  'usar','usa','usan','usen','usando','usado','usaron',
  'resolver','resuelve','resuelven','resuelvan','resolviendo','resuelto','resuelta','resolvieron',
  'calcular','calcula','calculan','calculen','calculando','calculado','calcularon',
  'investigar','investiga','investigan','investiguen','investigando','investigado','investigaron',
  'observar','observa','observan','observen','observando','observado','observaron',
  'identificar','identifica','identifican','identifiquen','identificando','identificado','identificaron',
  'comparar','compara','comparan','comparen','comparando','comparado','compararon',
  'elaborar','elabora','elaboran','elaboren','elaborando','elaborado','elaboraron',
  'crear','crea','crean','creen','creando','creado','creada','crearon',
  'trabajar','trabaja','trabajan','trabajen','trabajando','trabajado','trabajaron',
  'reflexionar','reflexiona','reflexionan','reflexionen','reflexionando','reflexionado','reflexionaron',
  'exponer','expone','exponen','expongan','exponiendo','expuesto','expuesta','expusieron',
  'describir','describe','describen','describan','describiendo','descrito','describieron',
  'definir','define','definen','definan','definiendo','definido','definieron',
  'mostrar','muestra','muestran','muestren','mostrando','mostrado','mostraron',
  'relacionar','relaciona','relacionan','relacionen','relacionando','relacionado','relacionaron',
  'organizar','organiza','organizan','organicen','organizando','organizado','organizaron',
  'construir','construye','construyen','construyan','construyendo','construido','construyeron',
  'dibujar','dibuja','dibujan','dibujen','dibujando','dibujado','dibujaron',
  'recordar','recuerda','recuerdan','recuerden','recordando','recordado','recordaron',
  'pensar','piensa','piensan','piensen','pensando','pensado','pensaron',
  'hablar','habla','hablan','hablen','hablando','hablado','hablaron',
  'mencionar','menciona','mencionan','mencionen','mencionando','mencionado','mencionaron',
  'participar','participa','participan','participen','participando','participado','participaron',
  'formar','forma','forman','formen','formando','formado','formaron',
  'poder','puede','pueden','podria','podrian','podran','podemos',
  'tener','tiene','tienen','tengan','tenido','tenida','tuvo','tuvieron',
  'dar','da','dan','den','dando','dado','daran','dieron',
  'ver','ve','ven','vea','vean','viendo','visto','vista','vieron',
  'saber','sabe','saben','sepa','sepan','sabiendo','sabido','supieron',
  'encontrar','encuentra','encuentran','encuentren','encontrando','encontrado','encontraron',
  'considerar','considera','consideran','consideren','considerando','considerado','consideraron',
  'ayudar','ayuda','ayudan','ayuden','ayudando','ayudado','ayudaron',
  'estudiar','estudia','estudian','estudien','estudiando','estudiado','estudiaron',
  'preguntar','pregunta','preguntan','pregunten','preguntando','preguntado','preguntaron',
  'contar','cuenta','cuentan','cuenten','contando','contado','contaron',
  'empezar','empieza','empiezan','empezando','empezado','empezaron',
  'terminar','termina','terminan','terminen','terminando','terminado','terminaron',
  'continuar','continua','continuan','continuen','continuando','continuado',
  'seguir','sigue','siguen','sigan','siguiendo','seguido',
  'llegar','llega','llegan','lleguen','llegando','llegado'
]);

const VERB_SUFFIX_REGEX = /(ando|iendo|yendo)$/;

// Sin modifiers genéricos en query — usamos category de Pixabay + image_type
// para filtrar el tipo de contenido. Los modifiers como "illustration" o
// "infographic" hacen más daño que bien (matches tangenciales).

const ES_EN_DICT = new Map([
  // Materias
  ['matematicas', 'mathematics'], ['matematica', 'mathematics'],
  ['fisica', 'physics'], ['quimica', 'chemistry'], ['biologia', 'biology'],
  ['historia', 'history'], ['geografia', 'geography'],
  ['espanol', 'spanish'], ['ingles', 'english'],
  ['literatura', 'literature'], ['arte', 'art'], ['musica', 'music'],
  ['filosofia', 'philosophy'], ['economia', 'economics'],
  ['informatica', 'computing'], ['computacion', 'computing'],
  ['tecnologia', 'technology'], ['civica', 'civics'], ['etica', 'ethics'],
  ['ciencias', 'science'], ['ciencia', 'science'],
  ['anatomia', 'anatomy'], ['astronomia', 'astronomy'],
  ['algebra', 'algebra'], ['geometria', 'geometry'],
  ['calculo', 'calculus'], ['estadistica', 'statistics'],
  ['trigonometria', 'trigonometry'], ['aritmetica', 'arithmetic'],

  // Términos visuales / educativos
  ['diagrama', 'diagram'], ['esquema', 'diagram'],
  ['ilustracion', 'illustration'], ['ilustraciones', 'illustration'],
  ['mapa', 'map'], ['mapas', 'map'],
  ['grafico', 'chart'], ['graficos', 'chart'], ['grafica', 'graph'],
  ['infografia', 'infographic'], ['tabla', 'table'],
  ['dibujo', 'drawing'], ['modelo', 'model'], ['maqueta', 'model'],
  ['experimento', 'experiment'], ['experimentos', 'experiment'],
  ['laboratorio', 'laboratory'],

  // Física
  ['circuito', 'circuit'], ['circuitos', 'circuit'],
  ['electricidad', 'electricity'],
  ['electrico', 'electric'], ['electricos', 'electric'],
  ['electrica', 'electric'], ['electricas', 'electric'],
  ['voltaje', 'voltage'], ['corriente', 'current'],
  ['resistencia', 'resistance'], ['energia', 'energy'],
  ['fuerza', 'force'], ['movimiento', 'motion'],
  ['velocidad', 'velocity'], ['aceleracion', 'acceleration'],
  ['gravedad', 'gravity'], ['presion', 'pressure'],
  ['temperatura', 'temperature'],
  ['onda', 'wave'], ['ondas', 'wave'],
  ['luz', 'light'], ['sonido', 'sound'],
  ['magnetismo', 'magnetism'], ['iman', 'magnet'], ['imanes', 'magnet'],
  ['mecanica', 'mechanics'], ['termodinamica', 'thermodynamics'],
  ['optica', 'optics'], ['nuclear', 'nuclear'],
  ['atomo', 'atom'], ['atomos', 'atom'],
  ['proton', 'proton'], ['electron', 'electron'], ['electrones', 'electron'],
  ['neutron', 'neutron'], ['newton', 'newton'],
  ['ohm', 'ohm'], ['ohmio', 'ohm'],

  // Química
  ['elemento', 'element'], ['elementos', 'element'],
  ['compuesto', 'compound'], ['compuestos', 'compound'],
  ['molecula', 'molecule'], ['moleculas', 'molecule'],
  ['reaccion', 'reaction'], ['reacciones', 'reaction'],
  ['acido', 'acid'], ['acidos', 'acid'],
  ['solucion', 'solution'], ['mezcla', 'mixture'],
  ['enlace', 'bond'], ['enlaces', 'bond'],
  ['periodica', 'periodic'], ['periodico', 'periodic'],

  // Biología
  ['celula', 'cell'], ['celulas', 'cell'],
  ['tejido', 'tissue'], ['tejidos', 'tissue'],
  ['organo', 'organ'], ['organos', 'organ'],
  ['sistema', 'system'], ['sistemas', 'system'],
  ['organismo', 'organism'], ['organismos', 'organism'],
  ['planta', 'plant'], ['plantas', 'plant'],
  ['animal', 'animal'], ['animales', 'animal'],
  ['adn', 'dna'], ['arn', 'rna'],
  ['gen', 'gene'], ['genes', 'gene'], ['genetica', 'genetics'],
  ['evolucion', 'evolution'], ['ecosistema', 'ecosystem'], ['ecosistemas', 'ecosystem'],
  ['fotosintesis', 'photosynthesis'], ['respiracion', 'respiration'],
  ['digestion', 'digestion'], ['circulacion', 'circulation'],
  ['reproduccion', 'reproduction'],
  ['esqueleto', 'skeleton'], ['musculo', 'muscle'], ['musculos', 'muscle'],
  ['corazon', 'heart'], ['cerebro', 'brain'],
  ['pulmon', 'lung'], ['pulmones', 'lung'],
  ['rinon', 'kidney'], ['estomago', 'stomach'],
  ['sangre', 'blood'], ['hueso', 'bone'], ['huesos', 'bone'],
  ['piel', 'skin'], ['ojo', 'eye'], ['ojos', 'eye'],

  // Matemáticas
  ['numero', 'number'], ['numeros', 'number'],
  ['suma', 'addition'], ['resta', 'subtraction'],
  ['multiplicacion', 'multiplication'], ['division', 'division'],
  ['fraccion', 'fraction'], ['fracciones', 'fraction'],
  ['equivalente', 'equivalent'], ['equivalentes', 'equivalent'],
  ['decimal', 'decimal'], ['decimales', 'decimal'],
  ['porcentaje', 'percentage'],
  ['ecuacion', 'equation'], ['ecuaciones', 'equation'],
  ['variable', 'variable'], ['variables', 'variable'],
  ['funcion', 'function'], ['funciones', 'function'],
  ['triangulo', 'triangle'], ['cuadrado', 'square'],
  ['circulo', 'circle'], ['rectangulo', 'rectangle'],
  ['poligono', 'polygon'], ['angulo', 'angle'], ['angulos', 'angle'],
  ['area', 'area'], ['perimetro', 'perimeter'],
  ['volumen', 'volume'], ['probabilidad', 'probability'],
  ['potencia', 'power'], ['raiz', 'root'],
  ['compas', 'compass'], ['regla', 'ruler'],
  ['conjunto', 'set'], ['conjuntos', 'set'],
  ['recta', 'line'], ['plano', 'plane'],

  // Geografía
  ['continente', 'continent'], ['continentes', 'continent'],
  ['pais', 'country'], ['paises', 'country'],
  ['ciudad', 'city'], ['ciudades', 'city'],
  ['montana', 'mountain'], ['montanas', 'mountain'],
  ['rio', 'river'], ['rios', 'river'],
  ['oceano', 'ocean'], ['mar', 'sea'], ['lago', 'lake'],
  ['clima', 'climate'], ['relieve', 'relief'],
  ['poblacion', 'population'],
  ['planeta', 'planet'], ['tierra', 'earth'],
  ['globo', 'globe'], ['mundo', 'world'],
  ['desierto', 'desert'], ['bosque', 'forest'], ['selva', 'jungle'],

  // Historia
  ['revolucion', 'revolution'], ['guerra', 'war'], ['guerras', 'war'],
  ['batalla', 'battle'], ['batallas', 'battle'],
  ['ejercito', 'army'], ['soldado', 'soldier'], ['soldados', 'soldier'],
  ['conquista', 'conquest'], ['conquistador', 'conquistador'],
  ['independencia', 'independence'],
  ['imperio', 'empire'], ['imperios', 'empire'],
  ['civilizacion', 'civilization'], ['civilizaciones', 'civilization'],
  ['cultura', 'culture'], ['culturas', 'culture'],
  ['prehistoria', 'prehistory'], ['renacimiento', 'renaissance'],
  ['colonia', 'colony'], ['colonial', 'colonial'],
  ['politica', 'politics'], ['sociedad', 'society'],
  ['mexicana', 'mexican'], ['mexicano', 'mexican'], ['mexico', 'mexico'],
  ['piramide', 'pyramid'], ['piramides', 'pyramid'],
  ['azteca', 'aztec'], ['maya', 'maya'], ['inca', 'inca'],

  // Lenguaje
  ['lectura', 'reading'], ['escritura', 'writing'],
  ['texto', 'text'], ['textos', 'text'],
  ['oracion', 'sentence'], ['parrafo', 'paragraph'],
  ['verbo', 'verb'], ['verbos', 'verb'],
  ['sustantivo', 'noun'], ['sustantivos', 'noun'],
  ['adjetivo', 'adjective'], ['adjetivos', 'adjective'],
  ['poesia', 'poetry'], ['poema', 'poem'],
  ['cuento', 'story'], ['novela', 'novel'],
  ['narrativa', 'narrative'], ['gramatica', 'grammar'],
  ['ortografia', 'spelling'],

  // Tecnología
  ['computadora', 'computer'], ['internet', 'internet'],
  ['red', 'network'], ['software', 'software'], ['hardware', 'hardware'],
  ['programacion', 'programming'], ['robot', 'robot'],
  ['codigo', 'code'], ['algoritmo', 'algorithm'],

  // Astronomía / espacio
  ['solar', 'solar system'],
  ['sol', 'sun'], ['luna', 'moon'],
  ['planeta', 'planet'], ['planetas', 'planet'],
  ['estrella', 'star'], ['estrellas', 'star'],
  ['galaxia', 'galaxy'], ['galaxias', 'galaxy'],
  ['universo', 'universe'], ['cosmos', 'cosmos'],
  ['espacio', 'space'], ['satelite', 'satellite'],
  ['cometa', 'comet'], ['meteorito', 'meteorite'],
  ['orbita', 'orbit'], ['eclipse', 'eclipse'],

  // Cuerpo humano / sistemas biológicos
  ['cuerpo', 'body'], ['humano', 'human'], ['humana', 'human'],
  ['digestivo', 'digestive'], ['nervioso', 'nervous'],
  ['respiratorio', 'respiratory'], ['circulatorio', 'circulatory'],
  ['oseo', 'skeletal'], ['muscular', 'muscular'],
  ['excretor', 'excretory'], ['endocrino', 'endocrine'],
  ['reproductor', 'reproductive'], ['inmunologico', 'immune'],

  // Fenómenos naturales / ciclos
  ['agua', 'water'], ['aire', 'air'], ['fuego', 'fire'],
  ['ciclo', 'cycle'], ['ciclos', 'cycle'],
  ['lluvia', 'rain'], ['nube', 'cloud'], ['nubes', 'cloud'],
  ['evaporacion', 'evaporation'], ['condensacion', 'condensation'],
  ['precipitacion', 'precipitation'],
  ['volcan', 'volcano'], ['volcanes', 'volcano'],
  ['terremoto', 'earthquake'], ['tsunami', 'tsunami'],
  ['huracan', 'hurricane'], ['tornado', 'tornado']
]);

const SCIENCE_MATERIA_KEYWORDS = new Set([
  'fisica','quimica','biologia','ciencias','ciencia',
  'matematicas','matematica','anatomia','astronomia',
  'algebra','geometria','calculo','estadistica',
  'trigonometria','aritmetica','tecnologia','informatica','computacion'
]);

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

export function stemSpanish(word) {
  if (!word || word.length <= 4) return word;
  // Nunca stem -sis (analisis, tesis, sintesis, fotosintesis, crisis)
  if (word.endsWith('sis')) return word;
  // -ones → -on (electrones → electron, fracciones → fraccion, revoluciones → revolucion)
  if (word.endsWith('ones')) return word.slice(0, -2);
  // -s tras vocal → -"" (triangulos → triangulo, planetas → planeta, celulas → celula)
  const lastChar = word[word.length - 1];
  const secondLast = word[word.length - 2];
  if (lastChar === 's' && 'aeiou'.includes(secondLast)) {
    return word.slice(0, -1);
  }
  return word;
}

function isLikelyVerb(word) {
  return VERB_SUFFIX_REGEX.test(word);
}

function extractKeywords(text, max, { minLength = 4 } = {}) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const words = cleaned.split(' ');
  const seen = new Set();
  const keywords = [];

  for (const rawWord of words) {
    if (rawWord.length < minLength) continue;
    if (STOPWORDS.has(rawWord)) continue;
    if (isLikelyVerb(rawWord)) continue;
    const word = stemSpanish(rawWord);
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
    if (keywords.length >= max) break;
  }

  return keywords;
}

function translateBatch(words) {
  const out = [];
  const seen = new Set();
  for (const word of words) {
    const en = ES_EN_DICT.get(word);
    if (!en) continue;
    for (const token of en.split(' ')) {
      if (!token) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
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

function dedupCap(words, max) {
  const seen = new Set();
  const out = [];
  for (const word of words) {
    if (!word) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= max) break;
  }
  return out.join(' ');
}

// STRATEGY: all queries are Spanish → Pixabay lang=es returns Spanish tags → overlap scoring works.
//
// actividades keywords are filtered through ES_EN_DICT: only domain-specific academic terms
// (volcán, célula, voltaje, batalla, fracción…) pass — pedagogical noise words
// (lluvia, proceso, linea, conocen, elaboran) are not in the dict and are excluded.
// This produces moment-specific queries when the AI wrote rich activity descriptions.
export function buildImageSearchQuery({ materia, tema, actividades } = {}) {
  const temaKws = extractKeywords(tema, 3, { minLength: 3 });
  const materiaKws = extractKeywords(materia, 1, { minLength: 3 });
  const actKws = actividades ? extractKeywords(actividades, 8, { minLength: 4 }) : [];

  // Keep only actividades words that are academic domain terms (in ES_EN_DICT).
  // Filters: "lluvia" (brainstorm), "proceso" (process), "conocen" (verb), "etapa" (stage).
  // Keeps: "voltaje", "planeta", "batalla", "celula", "fraccion", "fotosintesis", etc.
  const actDomain = actKws.filter((w) => ES_EN_DICT.has(w));

  // Among domain terms, prefer those not already in the tema (adds new info about the moment).
  const temaSet = new Set([...temaKws, ...materiaKws]);
  const actNew = actDomain.filter((w) => !temaSet.has(w));

  // Primary: moment-specific domain terms + tema for context (all Spanish)
  if (actNew.length >= 1) {
    return dedupCap([...actNew.slice(0, 2), ...temaKws], 3);
  }
  // No new domain terms: tema + materia (all moments get same query, which is fine)
  return dedupCap([...temaKws, ...materiaKws], 3);
}

export function pickPixabayCategory({ materia } = {}) {
  const materiaKw = extractKeywords(materia, 1, { minLength: 3 })[0];
  if (materiaKw && SCIENCE_MATERIA_KEYWORDS.has(materiaKw)) return 'science';
  return 'education';
}

// Fallbacks en inglés para cuando el query de GPT no devuelve resultados en Wikimedia Commons.
// Wikimedia tiene mejor cobertura de contenido educativo con términos en inglés.
export function buildFallbackQueries({ materia, tema, actividades } = {}) {
  const temaKws = extractKeywords(tema, 3, { minLength: 3 });
  const materiaKws = extractKeywords(materia, 1, { minLength: 3 });
  const actKws = actividades ? extractKeywords(actividades, 8, { minLength: 4 }) : [];

  const actDomain = actKws.filter((w) => ES_EN_DICT.has(w));

  // Traducir al inglés para coincidir con los tags en inglés que devuelve Pixabay (lang=en)
  const temaEn = translateBatch(temaKws);
  const materiaEn = translateBatch(materiaKws);
  const actDomainEn = translateBatch(actDomain);

  const fallbacks = [];
  const seen = new Set();
  const pushUnique = (query) => {
    if (!query || seen.has(query)) return;
    seen.add(query);
    fallbacks.push(query);
  };

  // F1: tema EN (el más específico al tema)
  pushUnique(dedupCap(temaEn, 2));

  // F2: tema EN + materia EN
  pushUnique(dedupCap([...temaEn, ...materiaEn], 3));

  // F3: domain terms del actividades EN (si hay)
  if (actDomainEn.length > 0) {
    pushUnique(dedupCap([...actDomainEn, ...temaEn], 3));
  }

  // F4: materia EN sola (último recurso con algo de contexto)
  pushUnique(dedupCap(materiaEn, 1));

  return fallbacks;
}
