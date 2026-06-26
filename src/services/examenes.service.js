import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { buildExamPromptByUnit } from '../utils/buildExamPromptByUnit.js';
import { obtenerContextoUnidad } from './jerarquia.service.js';
import { createAiJob, finishAiJob, failAiJob, logAiCall } from './aiMetrics.service.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const OPENAI_EXAM_SYSTEM_PROMPT =
  'Actua como un docente experto en evaluacion por competencias. Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';
const EXAM_PROMPT_VERSION = 'v8_unit_exam_counts_by_type_completion';
const EXAM_MIN_OUTPUT_TOKENS = 3200;
const EXAM_MAX_OUTPUT_TOKENS = 6800;
const EXAM_SINGLE_QUESTION_MAX_TOKENS = 1200;
const EXAM_GENERATION_ATTEMPTS = 2;
const EXAM_RETRY_TOKEN_STEP = 800;
const EXAM_ATTEMPT_TIMEOUT_MS = 90000;
const EXAM_ITEM_MAX_RETRIES = 3;
// Enfoques cognitivos que se rotan en los intentos de fallback para forzar
// preguntas distintas cuando la IA insiste en repetir el mismo concepto.
const QUESTION_COGNITIVE_FOCUSES = [
  'aplicacion practica del concepto',
  'analisis critico de una situacion',
  'caso practico o escenario concreto',
  'comparacion o contraste entre dos elementos',
  'relacion causa-consecuencia',
  'interpretacion de informacion o datos',
  'resolucion de un problema concreto',
  'clasificacion o categorizacion'
];
// En los ultimos intentos de fallback se relaja la deteccion de "parecido"
// (warning) y solo se rechazan duplicados reales, para garantizar que el
// examen se complete en vez de fallar por una pregunta limitrofe.
const EXAM_FALLBACK_RELAX_TAIL = 3;
const VALID_TIPOS_PREGUNTA = new Set([
  'opcion_multiple',
  'verdadero_falso',
  'respuesta_corta',
  'emparejamiento',
  'pregunta_abierta',
  'calculo_numerico',
  'ordenacion_jerarquizacion'
]);
const QUESTION_TYPE_ALIASES = new Map([
  ['opcion_multiple', 'opcion_multiple'],
  ['opcion multiple', 'opcion_multiple'],
  ['opcion-multiple', 'opcion_multiple'],
  ['opciones multiples', 'opcion_multiple'],
  ['multiple', 'opcion_multiple'],
  ['multiple choice', 'opcion_multiple'],
  ['verdadero_falso', 'verdadero_falso'],
  ['verdadero falso', 'verdadero_falso'],
  ['verdadero/falso', 'verdadero_falso'],
  ['falso verdadero', 'verdadero_falso'],
  ['respuesta_corta', 'respuesta_corta'],
  ['respuesta corta', 'respuesta_corta'],
  ['respuesta corta completar', 'respuesta_corta'],
  ['respuesta corta / completar', 'respuesta_corta'],
  ['completar', 'respuesta_corta'],
  ['emparejamiento', 'emparejamiento'],
  ['emparejamiento relacion de columnas', 'emparejamiento'],
  ['relacion de columnas', 'emparejamiento'],
  ['relacion columnas', 'emparejamiento'],
  ['pregunta_abierta', 'pregunta_abierta'],
  ['pregunta abierta', 'pregunta_abierta'],
  ['ensayo', 'pregunta_abierta'],
  ['pregunta abierta ensayo', 'pregunta_abierta'],
  ['calculo_numerico', 'calculo_numerico'],
  ['calculo numerico', 'calculo_numerico'],
  ['calculo numerica', 'calculo_numerico'],
  ['calculo / numerica', 'calculo_numerico'],
  ['calculo', 'calculo_numerico'],
  ['numerica', 'calculo_numerico'],
  ['pregunta numerica', 'calculo_numerico'],
  ['ordenacion_jerarquizacion', 'ordenacion_jerarquizacion'],
  ['ordenacion jerarquizacion', 'ordenacion_jerarquizacion'],
  ['ordenacion', 'ordenacion_jerarquizacion'],
  ['jerarquizacion', 'ordenacion_jerarquizacion']
]);
const QUESTION_TYPE_PLAN = {
  opcion_multiple: {
    label: 'Opcion multiple',
    weight: 64
  },
  verdadero_falso: {
    label: 'Verdadero/Falso',
    weight: 24
  },
  respuesta_corta: {
    label: 'Respuesta corta / completar',
    weight: 16
  },
  emparejamiento: {
    label: 'Emparejamiento / relacion de columnas',
    weight: 8
  },
  pregunta_abierta: {
    label: 'Pregunta abierta / ensayo',
    weight: 12
  },
  calculo_numerico: {
    label: 'Calculo / numerica',
    weight: 16
  },
  ordenacion_jerarquizacion: {
    label: 'Ordenacion / jerarquizacion',
    weight: 8
  }
};
const QUESTION_TYPE_OUTPUT_WEIGHT = {
  opcion_multiple: 90,
  verdadero_falso: 42,
  respuesta_corta: 48,
  emparejamiento: 150,
  pregunta_abierta: 80,
  calculo_numerico: 65,
  ordenacion_jerarquizacion: 70
};
const QUESTION_SIMILARITY_WARNING_THRESHOLD = 0.82;
const QUESTION_SIMILARITY_DUPLICATE_THRESHOLD = 0.90;
const QUESTION_MIN_NORMALIZED_WORDS = 5;
const EXAM_GENERIC_FAILURE_MESSAGE = 'No se pudo completar la generacion del examen. Intenta nuevamente.';
const GENERIC_QUESTION_PATTERNS = [
  /^cual es la importancia de\b/,
  /^que importancia tiene\b/,
  /^por que es importante\b/,
  /^explica la importancia de\b/,
  /^describe la importancia de\b/,
  /^que es\b/,
  /^define\b/
];

function buildHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getClient(supabaseClient) {
  return supabaseClient || supabaseAdmin;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLooseKey(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuestionTypeValue(value) {
  const raw = normalizeString(value);
  if (!raw) return '';

  const normalizedKey = normalizeLooseKey(raw);
  return QUESTION_TYPE_ALIASES.get(normalizedKey) || raw;
}

function normalizeQuestionTypes(tiposPregunta) {
  if (!Array.isArray(tiposPregunta) || tiposPregunta.length === 0) {
    throw buildHttpError(400, 'Debes seleccionar al menos un tipo de pregunta.');
  }

  const normalized = [
    ...new Set(
      tiposPregunta
        .map((tipo) => normalizeQuestionTypeValue(tipo))
        .filter(Boolean)
    )
  ];

  if (normalized.length === 0) {
    throw buildHttpError(400, 'Debes seleccionar al menos un tipo de pregunta.');
  }

  const invalid = normalized.find((tipo) => !VALID_TIPOS_PREGUNTA.has(tipo));
  if (invalid) {
    throw buildHttpError(400, 'Se recibio un tipo de pregunta no valido.');
  }

  return normalized;
}

function normalizeQuestionCounts(rawCounts, selectedTypes) {
  if (rawCounts == null) {
    return null;
  }

  if (typeof rawCounts !== 'object' || Array.isArray(rawCounts)) {
    throw buildHttpError(400, 'cantidades_pregunta debe ser un objeto valido.');
  }

  const normalized = {};

  for (const tipo of selectedTypes || []) {
    const rawValue = rawCounts[tipo];
    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw buildHttpError(400, `Debes indicar una cantidad valida para el tipo ${tipo}.`);
    }

    normalized[tipo] = parsed;
  }

  return normalized;
}

async function fetchUnitTopics(client, unidadId, userId) {
  const temasQuery = client
    .from('temas')
    .select('id, unidad_id, titulo, duracion, orden, created_at')
    .eq('unidad_id', unidadId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  const { data: temas, error: temasError } = await temasQuery;

  if (temasError) throw temasError;
  if (!temas || temas.length === 0) {
    throw buildHttpError(400, 'No hay temas en esta unidad para generar un examen.');
  }

  const topicIds = temas.map((tema) => tema.id);
  const planeacionesQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tabla_ia, status, updated_at, is_archived')
    .in('tema_id', topicIds)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (userId) {
    planeacionesQuery.eq('user_id', userId);
  }

  const { data: planeaciones, error: planeacionesError } = await planeacionesQuery;

  if (planeacionesError) throw planeacionesError;

  const latestPlaneacionByTemaId = new Map();
  for (const planeacion of planeaciones || []) {
    if (!latestPlaneacionByTemaId.has(planeacion.tema_id)) {
      latestPlaneacionByTemaId.set(planeacion.tema_id, planeacion);
    }
  }

  return temas.map((tema) => ({
    ...tema,
    planeacion: latestPlaneacionByTemaId.get(tema.id) || null
  }));
}

function buildContextoTemasSnapshot(temas) {
  return (temas || []).map((tema) => ({
    tema_id: tema.id,
    tema: tema.titulo,
    duracion: tema.duracion,
    planeacion_id: tema.planeacion?.id || null
  }));
}

function buildPromptTopicsContext(temas) {
  return (temas || []).map((tema) => ({
    tema_id: tema.id,
    tema: tema.titulo,
    duracion: tema.duracion,
    planeacion_id: tema.planeacion?.id || null,
    tabla_ia: Array.isArray(tema.planeacion?.tabla_ia)
      ? tema.planeacion.tabla_ia.map((fila) => ({
          tiempo_sesion: fila?.tiempo_sesion || '',
          actividades: fila?.actividades || '',
          producto: fila?.producto || ''
        }))
      : []
  }));
}

function getRequestedQuestionCountTotal(requestedCounts) {
  if (!requestedCounts || typeof requestedCounts !== 'object') return 0;
  return Object.values(requestedCounts).reduce((sum, count) => sum + Number(count || 0), 0);
}

function buildQuestionTypeCountMap(preguntas) {
  return (Array.isArray(preguntas) ? preguntas : []).reduce((map, question) => {
    const tipo = normalizeQuestionTypeValue(question?.tipo) || 'sin_tipo';
    map.set(tipo, Number(map.get(tipo) || 0) + 1);
    return map;
  }, new Map());
}

function buildQuestionTypeCountObject(preguntas) {
  return Object.fromEntries(buildQuestionTypeCountMap(preguntas).entries());
}

function buildMissingQuestionCounts(questions, requestedCounts) {
  if (!requestedCounts || typeof requestedCounts !== 'object') return {};

  const actualCounts = buildQuestionTypeCountMap(questions);
  const missing = {};

  Object.entries(requestedCounts).forEach(([tipo, expected]) => {
    const diff = Number(expected || 0) - Number(actualCounts.get(tipo) || 0);
    if (diff > 0) {
      missing[tipo] = diff;
    }
  });

  return missing;
}

function hasRequestedQuestionCounts(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && Object.values(value).some((count) => Number(count || 0) > 0)
  );
}

function summarizeQuestionPrompt(question) {
  const tipo = normalizeQuestionTypeValue(question?.tipo) || 'sin_tipo';
  const tema = normalizeString(question?.tema) || 'Sin tema';
  const pregunta = normalizeString(question?.pregunta || question?.enunciado || '').slice(0, 140);
  return `- ${tipo} | ${tema} | ${pregunta}`;
}

function buildQuestionDebugList(preguntas) {
  return (Array.isArray(preguntas) ? preguntas : []).map((question, index) => ({
    index: index + 1,
    tipo: normalizeQuestionTypeValue(question?.tipo) || 'sin_tipo',
    tema: normalizeString(question?.tema) || 'Sin tema',
    pregunta: normalizeString(question?.pregunta || question?.enunciado || '').slice(0, 180)
  }));
}

function normalizeCompletionUsage(usage) {
  return {
    prompt_tokens: Number(usage?.prompt_tokens || 0),
    completion_tokens: Number(usage?.completion_tokens || 0),
    total_tokens: Number(usage?.total_tokens || 0)
  };
}

function createUsageAccumulator() {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };
}

function addUsage(accumulator, usage) {
  const base = accumulator || createUsageAccumulator();
  const next = normalizeCompletionUsage(usage);

  base.prompt_tokens += next.prompt_tokens;
  base.completion_tokens += next.completion_tokens;
  base.total_tokens += next.total_tokens;

  return base;
}

function buildQuestionPlan(tiposPregunta, questionCounts = null) {
  const selected = Array.isArray(tiposPregunta) ? tiposPregunta : [];
  const exactCounts = Boolean(questionCounts && typeof questionCounts === 'object');

  const items = selected.map((tipo) => {
    const config = QUESTION_TYPE_PLAN[tipo];
    return {
      tipo,
      label: config?.label || tipo,
      requestedCount: exactCounts ? Number(questionCounts?.[tipo] || 0) : null
    };
  });

  return {
    items,
    exactCounts,
    totalQuestions: exactCounts
      ? items.reduce((sum, item) => sum + Number(item?.requestedCount || 0), 0)
      : null
  };
}

function estimateExamOutputTokens(questionPlan) {
  const items = Array.isArray(questionPlan?.items) ? questionPlan.items : [];
  const estimate = items.reduce((sum, item) => {
    const weight = Number(QUESTION_TYPE_OUTPUT_WEIGHT[item?.tipo] || 60);
    const count = Math.max(Number(item?.requestedCount || 1), 1);
    return sum + (weight * count);
  }, 350);

  return Math.max(EXAM_MIN_OUTPUT_TOKENS, Math.min(Math.ceil(estimate), EXAM_MAX_OUTPUT_TOKENS));
}

function buildExamRetryPrompt(basePrompt, feedback) {
  const details = normalizeString(feedback) || 'El intento anterior devolvio JSON incompleto o invalido.';

  return `${basePrompt}

CORRECCION OBLIGATORIA DEL NUEVO INTENTO:
- El intento anterior fallo por: ${details}
- Regenera TODO el examen desde cero.
- Debes respetar exactamente las cantidades por tipo solicitadas cuando esten definidas en el prompt.
- Mantén el examen breve y equilibrado.
- No omitas campos requeridos.
- Manten cada reactivo breve para que el JSON no se corte.
- En opcion_multiple usa opciones cortas.
- En emparejamiento usa solo 4 o 5 pares por bloque.
- En explicacion usa una sola frase muy breve.
`;
}

function extractJsonCandidates(rawText) {
  const candidates = [];

  function pushCandidate(value) {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate || candidates.includes(candidate)) return;
    candidates.push(candidate);
  }

  pushCandidate(rawText);
  pushCandidate(rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || '');
  pushCandidate(rawText.match(/\{[\s\S]*\}/)?.[0] || '');
  pushCandidate(rawText.match(/\[[\s\S]*\]/)?.[0] || '');

  return candidates;
}

function normalizeExamPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  if (payload.examen_ia && typeof payload.examen_ia === 'object' && !Array.isArray(payload.examen_ia)) {
    return payload.examen_ia;
  }

  if (payload.examen && typeof payload.examen === 'object' && !Array.isArray(payload.examen)) {
    return payload.examen;
  }

  return payload;
}

function parseExamJson(rawText) {
  const candidates = extractJsonCandidates(rawText);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const examen = normalizeExamPayload(parsed);
      if (examen) return examen;
    } catch {
      // Continue trying alternative candidates.
    }
  }

  return null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function pickFirstString(...values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }

  return '';
}

function pickFirstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  return [];
}

function extractQuestionText(question) {
  return pickFirstString(
    question?.pregunta,
    question?.enunciado,
    question?.reactivo,
    question?.consigna,
    question?.instruccion,
    question?.instrucciones,
    question?.texto,
    question?.planteamiento,
    question?.item
  );
}

export function normalizeQuestionText(text) {
  return normalizeString(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQuestionWords(questionText) {
  return normalizeQuestionText(questionText)
    .split(' ')
    .map((word) => word.trim())
    .filter(Boolean);
}

export function calculateSimilarity(a, b) {
  const left = new Set(getQuestionWords(a));
  const right = new Set(getQuestionWords(b));

  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) intersection += 1;
  }

  const union = new Set([...left, ...right]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const overlap = intersection / Math.min(left.size, right.size);
  return Math.max(jaccard, overlap);
}

function isGenericQuestionText(questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return true;

  const words = normalized.split(' ').filter(Boolean);
  if (words.length < QUESTION_MIN_NORMALIZED_WORDS) return true;

  return GENERIC_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildQuestionValidationError({
  code,
  reason,
  preguntaNumero = null,
  duplicateOf = null,
  similarity = null,
  pregunta = '',
  comparedQuestion = ''
}) {
  return {
    code,
    reason,
    pregunta_numero: preguntaNumero,
    duplicate_of: duplicateOf,
    similarity,
    pregunta,
    compared_question: comparedQuestion
  };
}

function formatQuestionValidationFeedback(errors) {
  return (Array.isArray(errors) ? errors : [])
    .map((error) => {
      if (typeof error === 'string') return error;
      const reason = error?.reason || error?.code || 'La pregunta no paso validacion.';
      const similarity = error?.similarity != null ? ` (similarity ${error.similarity})` : '';
      return `${reason}${similarity}`;
    })
    .filter(Boolean)
    .join('; ');
}

function buildRetryFeedbackForPrompt(errors, attempt, maxRetries) {
  const list = Array.isArray(errors) ? errors : [];
  const hasDuplicate = list.some((error) => String(error?.code || '').includes('duplicado'));
  const hasGeneric = list.some((error) => error?.code === 'pregunta_generica_o_corta');
  const isFallback = attempt >= maxRetries;

  const parts = [];

  if (hasDuplicate) {
    parts.push('La pregunta anterior fue rechazada porque era demasiado parecida a una pregunta ya aceptada. Genera una pregunta completamente diferente. No evalues el mismo concepto ni uses una redaccion equivalente. Debe evaluar otro subtema, habilidad, aplicacion, caso o nivel cognitivo del tema seleccionado.');
  }

  if (hasGeneric) {
    parts.push('La pregunta anterior fue rechazada por ser demasiado corta o generica. Hazla mas especifica, verificable y ligada a una evidencia concreta del tema.');
  }

  if (isFallback) {
    parts.push('Este es un intento de fallback: cambia el enfoque cognitivo, usa un subconcepto distinto del mismo tema y evita cualquier redaccion generica.');
  }

  if (parts.length === 0) {
    parts.push(formatQuestionValidationFeedback(list) || 'La pregunta anterior no cumplio la validacion requerida.');
  }

  return parts.join(' ');
}

export function isDuplicateQuestion(newQuestion, existingQuestions) {
  const newText = extractQuestionText(newQuestion);
  const normalizedNewText = normalizeQuestionText(newText);

  if (!normalizedNewText) {
    return {
      duplicate: false,
      warning: false,
      reason: 'pregunta_vacia',
      similarity: 0,
      duplicateOf: null,
      comparedQuestion: null
    };
  }

  for (const existing of Array.isArray(existingQuestions) ? existingQuestions : []) {
    const existingQuestion = existing?.question || existing?.pregunta_ia || existing;
    const existingText = extractQuestionText(existingQuestion);
    const normalizedExistingText = normalizeQuestionText(existingText);
    if (!normalizedExistingText) continue;

    const similarity = normalizedNewText === normalizedExistingText
      ? 1
      : calculateSimilarity(normalizedNewText, normalizedExistingText);

    if (normalizedNewText === normalizedExistingText || similarity >= QUESTION_SIMILARITY_DUPLICATE_THRESHOLD) {
      return {
        duplicate: true,
        warning: false,
        reason: normalizedNewText === normalizedExistingText ? 'duplicado_exacto' : 'duplicado_semantico',
        similarity,
        duplicateOf: existing?.pregunta_numero ?? existing?.index ?? null,
        comparedQuestion: existingText
      };
    }

    if (similarity >= QUESTION_SIMILARITY_WARNING_THRESHOLD) {
      return {
        duplicate: false,
        warning: true,
        reason: 'posible_duplicado_semantico',
        similarity,
        duplicateOf: existing?.pregunta_numero ?? existing?.index ?? null,
        comparedQuestion: existingText
      };
    }
  }

  return {
    duplicate: false,
    warning: false,
    reason: '',
    similarity: 0,
    duplicateOf: null,
    comparedQuestion: null
  };
}

function validateSingleQuestionUniqueness(question, existingQuestions, preguntaNumero = null, options = {}) {
  // strict (por defecto) rechaza duplicados reales Y preguntas en rango de
  // advertencia (muy parecidas). Con strict=false solo se rechazan duplicados
  // reales, lo que se usa en los fallbacks finales para no quedarse atascado.
  const strict = options.strict !== false;
  const pregunta = extractQuestionText(question);
  const errors = [];

  if (isGenericQuestionText(pregunta)) {
    errors.push(buildQuestionValidationError({
      code: 'pregunta_generica_o_corta',
      reason: 'La pregunta es demasiado corta o generica.',
      preguntaNumero,
      pregunta
    }));
  }

  const duplicate = isDuplicateQuestion(question, existingQuestions);
  const rejectAsDuplicate = duplicate.duplicate || (strict && duplicate.warning);
  if (rejectAsDuplicate) {
    errors.push(buildQuestionValidationError({
      code: duplicate.reason,
      reason: duplicate.duplicate
        ? 'La pregunta duplica o evalua lo mismo que otra pregunta aceptada.'
        : 'La pregunta es muy parecida a otra pregunta aceptada.',
      preguntaNumero,
      duplicateOf: duplicate.duplicateOf,
      similarity: Number(duplicate.similarity.toFixed(4)),
      pregunta,
      comparedQuestion: duplicate.comparedQuestion || ''
    }));
  }

  return errors;
}

export function validateExamQuestionsUniqueness(examOrQuestions) {
  const questions = Array.isArray(examOrQuestions)
    ? examOrQuestions
    : (Array.isArray(examOrQuestions?.preguntas) ? examOrQuestions.preguntas : []);
  const accepted = [];
  const errors = [];

  questions.forEach((question, index) => {
    const preguntaNumero = index + 1;
    // La validacion final solo bloquea duplicados reales: las preguntas
    // limitrofes (warning) ya fueron filtradas durante la generacion estricta
    // por pregunta, y aceptarlas aqui evita ciclos de regeneracion infinitos.
    const questionErrors = validateSingleQuestionUniqueness(question, accepted, preguntaNumero, { strict: false });

    if (questionErrors.length > 0) {
      errors.push(...questionErrors);
    }

    accepted.push({
      index: preguntaNumero,
      pregunta_numero: preguntaNumero,
      question
    });
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

function normalizeEmparejamientoPair(pair) {
  if (Array.isArray(pair) && pair.length >= 2) {
    const lado_a = normalizeString(pair[0]);
    const lado_b = normalizeString(pair[1]);
    return lado_a && lado_b ? { lado_a, lado_b } : null;
  }

  if (typeof pair === 'string') {
    const text = normalizeString(pair);
    if (!text) return null;

    const separators = [' => ', ' -> ', ' : ', ' - ', ':', '=>', '->', '|'];
    for (const separator of separators) {
      if (!text.includes(separator)) continue;
      const parts = text.split(separator).map((item) => normalizeString(item)).filter(Boolean);
      if (parts.length >= 2) {
        return {
          lado_a: parts[0],
          lado_b: parts.slice(1).join(' - ')
        };
      }
    }

    return null;
  }

  if (!pair || typeof pair !== 'object' || Array.isArray(pair)) {
    return null;
  }

  const lado_a = pickFirstString(
    pair.lado_a,
    pair.columna_a,
    pair.izquierda,
    pair.item_a,
    pair.termino,
    pair.concepto,
    pair.pregunta,
    pair.a
  );
  const lado_b = pickFirstString(
    pair.lado_b,
    pair.columna_b,
    pair.derecha,
    pair.item_b,
    pair.definicion,
    pair.descripcion,
    pair.respuesta,
    pair.b
  );

  return lado_a && lado_b ? { lado_a, lado_b } : null;
}

function validateEmparejamientoPairs(question, index) {
  if (!Array.isArray(question.pares) || question.pares.length < 2) {
    throw buildHttpError(502, `La pregunta ${index + 1} de emparejamiento requiere al menos 2 pares.`);
  }

  const pairs = question.pares.map((pair, pairIndex) => {
    const normalizedPair = normalizeEmparejamientoPair(pair);
    if (!normalizedPair?.lado_a || !normalizedPair?.lado_b) {
      throw buildHttpError(502, `La pregunta ${index + 1} contiene un par incompleto en la posicion ${pairIndex + 1}.`);
    }

    return normalizedPair;
  });

  return pairs;
}

function trimQuestionsToRequestedCounts(questions, requestedCounts) {
  if (!requestedCounts || typeof requestedCounts !== 'object') {
    return Array.isArray(questions) ? questions : [];
  }

  const questionList = Array.isArray(questions) ? questions : [];
  const actualCounts = buildQuestionTypeCountMap(questionList);
  const requestedEntries = Object.entries(requestedCounts);

  const canTrim = requestedEntries.every(([tipo, expected]) => {
    return Number(actualCounts.get(tipo) || 0) >= Number(expected || 0);
  });

  if (!canTrim) {
    return null;
  }

  const consumed = {};
  const trimmed = [];

  for (const question of questionList) {
    const tipo = normalizeQuestionTypeValue(question?.tipo);
    if (!Object.prototype.hasOwnProperty.call(requestedCounts, tipo)) {
      continue;
    }

    const expected = Number(requestedCounts[tipo] || 0);
    const current = Number(consumed[tipo] || 0);

    if (current >= expected) {
      continue;
    }

    trimmed.push(question);
    consumed[tipo] = current + 1;
  }

  const hasExactCounts = requestedEntries.every(([tipo, expected]) => {
    return Number(consumed[tipo] || 0) === Number(expected || 0);
  });

  return hasExactCounts ? trimmed : null;
}

function validateQuestion(question, index, selectedTypesSet) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw buildHttpError(502, `La pregunta ${index + 1} no es valida.`);
  }

  const tipo = normalizeQuestionTypeValue(question.tipo);
  const tema = normalizeString(question.tema);
  const pregunta = extractQuestionText(question);
  const explicacion = pickFirstString(question.explicacion, question.retroalimentacion, question.justificacion);

  if (!tipo || !selectedTypesSet.has(tipo)) {
    throw buildHttpError(502, `La pregunta ${index + 1} tiene un tipo no permitido.`);
  }

  if (!pregunta) {
    throw buildHttpError(502, `La pregunta ${index + 1} requiere el campo pregunta.`);
  }

  const normalized = {
    ...question,
    tipo,
    tema,
    pregunta,
    explicacion
  };

  if (tipo === 'opcion_multiple') {
    const opciones = normalizeStringArray(question.opciones);
    const normalizedOptions = opciones.map((option) => normalizeQuestionText(option));
    const respuestaCorrecta = pickFirstString(
      question.respuesta_correcta,
      question.correcta,
      question.respuesta,
      question.opcion_correcta,
      question.answer
    );
    if (opciones.length !== 4 || !respuestaCorrecta) {
      throw buildHttpError(502, `La pregunta ${index + 1} de opcion multiple requiere exactamente 4 opciones y respuesta_correcta.`);
    }
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      throw buildHttpError(502, `La pregunta ${index + 1} de opcion multiple contiene opciones duplicadas.`);
    }
    if (!normalizedOptions.includes(normalizeQuestionText(respuestaCorrecta))) {
      throw buildHttpError(502, `La respuesta_correcta de la pregunta ${index + 1} no existe dentro de opciones.`);
    }
    normalized.opciones = opciones;
    normalized.respuesta_correcta = respuestaCorrecta;
    return normalized;
  }

  if (tipo === 'verdadero_falso') {
    const respuestaCorrectaRaw = normalizeLooseKey(
      pickFirstString(question.respuesta_correcta, question.correcta, question.respuesta, question.answer)
    );
    const respuestaCorrecta = respuestaCorrectaRaw === 'verdadero'
      ? 'Verdadero'
      : (respuestaCorrectaRaw === 'falso' ? 'Falso' : '');
    if (!respuestaCorrecta) {
      throw buildHttpError(502, `La pregunta ${index + 1} de verdadero_falso requiere respuesta_correcta valida.`);
    }
    normalized.opciones = ['Verdadero', 'Falso'];
    normalized.respuesta_correcta = respuestaCorrecta;
    return normalized;
  }

  if (tipo === 'respuesta_corta' || tipo === 'calculo_numerico') {
    const respuestaCorrecta = pickFirstString(
      question.respuesta_correcta,
      question.correcta,
      question.respuesta,
      question.solucion,
      question.answer,
      question.explicacion,
      tipo === 'calculo_numerico'
        ? 'Resultado esperado conforme al procedimiento indicado.'
        : 'Respuesta breve esperada conforme al contenido de la unidad.'
    );
    normalized.respuesta_correcta = respuestaCorrecta;
    return normalized;
  }

  if (tipo === 'pregunta_abierta') {
    const respuestaCorrecta = pickFirstString(
      question.respuesta_correcta,
      question.respuesta_modelo,
      question.correcta,
      question.respuesta,
      question.explicacion,
      'Respuesta modelo abierta con argumentos claros y dominio del tema.'
    );
    const criterios = pickFirstString(
      question.criterios_evaluacion,
      question.criterios,
      'Claridad, pertinencia, argumentacion y dominio del tema.'
    );
    normalized.respuesta_correcta = respuestaCorrecta;
    normalized.criterios_evaluacion = criterios;
    return normalized;
  }

  if (tipo === 'emparejamiento') {
    const pairs = validateEmparejamientoPairs(question, index);
    const respuestaCorrecta = pickFirstArray(
      question.respuesta_correcta,
      question.correcta,
      question.respuesta
    );
    normalized.pares = pairs;
    normalized.respuesta_correcta = respuestaCorrecta.length > 0 ? respuestaCorrecta : pairs.map((pair) => ({ ...pair }));
    return normalized;
  }

  if (tipo === 'ordenacion_jerarquizacion') {
    const elementos = normalizeStringArray(
      pickFirstArray(
        question.elementos,
        question.items,
        question.opciones,
        question.pasos,
        question.secuencia,
        question.opciones_desordenadas
      )
    );
    const respuestaCorrecta = pickFirstArray(
      question.respuesta_correcta,
      question.correcta,
      question.orden_correcto,
      question.secuencia_correcta,
      question.pasos_correctos
    ).map((item) => normalizeString(item)).filter(Boolean);

    const fallbackElementos = elementos.length >= 2
      ? elementos
      : (respuestaCorrecta.length >= 2 ? [...respuestaCorrecta] : []);
    const fallbackRespuesta = respuestaCorrecta.length >= 2
      ? respuestaCorrecta
      : (fallbackElementos.length >= 2 ? [...fallbackElementos] : []);

    if (fallbackElementos.length < 2 || fallbackRespuesta.length < 2) {
      throw buildHttpError(502, `La pregunta ${index + 1} de ordenacion requiere elementos y respuesta_correcta.`);
    }

    normalized.elementos = fallbackElementos;
    normalized.respuesta_correcta = fallbackRespuesta;
    return normalized;
  }

  throw buildHttpError(502, `La pregunta ${index + 1} contiene un tipo no soportado.`);
}

function normalizeExamStructure(examen, selectedTypes) {
  if (!examen || typeof examen !== 'object' || Array.isArray(examen)) {
    throw buildHttpError(502, 'La IA no devolvio un examen valido.');
  }

  const titulo = normalizeString(examen.titulo);
  const instrucciones = normalizeString(examen.instrucciones_generales);
  const preguntas = Array.isArray(examen.preguntas) ? examen.preguntas : [];

  if (!titulo) {
    throw buildHttpError(502, 'El examen generado requiere un titulo.');
  }

  if (!instrucciones) {
    throw buildHttpError(502, 'El examen generado requiere instrucciones_generales.');
  }

  if (preguntas.length === 0) {
    throw buildHttpError(502, 'El examen generado requiere preguntas.');
  }

  const selectedTypesSet = new Set(selectedTypes);
  const normalizedQuestions = preguntas.map((question, index) => validateQuestion(question, index, selectedTypesSet));

  return {
    titulo,
    instrucciones_generales: instrucciones,
    preguntas: normalizedQuestions
  };
}

function validateExamPayload(examen, selectedTypes, requestedCounts = null) {
  const normalizedExam = normalizeExamStructure(examen, selectedTypes);
  const normalizedQuestions = normalizedExam.preguntas;
  const adjustedQuestions = requestedCounts
    ? (trimQuestionsToRequestedCounts(normalizedQuestions, requestedCounts) || normalizedQuestions)
    : normalizedQuestions;
  const usedCounts = buildQuestionTypeCountMap(adjustedQuestions);
  const uniquenessValidation = validateExamQuestionsUniqueness(adjustedQuestions);

  if (!uniquenessValidation.valid) {
    const firstError = uniquenessValidation.errors[0];
    throw buildHttpError(
      502,
      `El examen generado contiene preguntas duplicadas o demasiado parecidas. Pregunta ${firstError?.pregunta_numero || 'sin numero'}: ${firstError?.reason || 'duplicado detectado'}.`
    );
  }

  if (requestedCounts && typeof requestedCounts === 'object') {
    selectedTypes.forEach((tipo) => {
      const expected = Number(requestedCounts?.[tipo] || 0);
      const actual = Number(usedCounts.get(tipo) || 0);

      if (actual !== expected) {
        throw buildHttpError(502, `El examen generado debe contener exactamente ${expected} pregunta(s) del tipo ${tipo}.`);
      }
    });

    const expectedTotal = Object.values(requestedCounts)
      .reduce((sum, count) => sum + Number(count || 0), 0);

    if (adjustedQuestions.length !== expectedTotal) {
      throw buildHttpError(502, `El examen generado debe contener exactamente ${expectedTotal} preguntas.`);
    }
  } else {
    selectedTypes.forEach((tipo) => {
      if (!usedCounts.has(tipo)) {
        throw buildHttpError(502, `El examen generado no incluyo una pregunta del tipo ${tipo}.`);
      }
    });
  }

  return {
    titulo: normalizedExam.titulo,
    instrucciones_generales: normalizedExam.instrucciones_generales,
    preguntas: adjustedQuestions
  };
}

function summarizeQuestionTypeCounts(preguntas) {
  const counts = new Map();

  (Array.isArray(preguntas) ? preguntas : []).forEach((question) => {
    const tipo = normalizeQuestionTypeValue(question?.tipo) || 'sin_tipo';
    counts.set(tipo, Number(counts.get(tipo) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([tipo, count]) => `${tipo}: ${count}`)
    .join(', ');
}

function buildExamValidationFeedback(examen, error, requestedCounts = null) {
  const baseMessage = normalizeString(error?.message) || 'El examen generado no cumplio la estructura requerida.';
  const actualQuestions = Array.isArray(examen?.preguntas) ? examen.preguntas : [];
  const actualDistribution = summarizeQuestionTypeCounts(actualQuestions);
  const expectedDistribution = requestedCounts && typeof requestedCounts === 'object'
    ? summarizeQuestionTypeCounts(
        Object.entries(requestedCounts).flatMap(([tipo, count]) => (
          Array.from({ length: Number(count || 0) }, () => ({ tipo }))
        ))
      )
    : '';

  return [
    baseMessage,
    expectedDistribution ? `Distribucion esperada: ${expectedDistribution}.` : '',
    actualDistribution ? `Distribucion actual: ${actualDistribution}.` : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function buildMissingQuestionsPrompt(basePrompt, partialExam, missingCounts) {
  const missingBlock = Object.entries(missingCounts)
    .map(([tipo, count]) => `- ${tipo}: ${count} pregunta(s) faltante(s)`)
    .join('\n');

  const existingQuestionsBlock = (Array.isArray(partialExam?.preguntas) ? partialExam.preguntas : [])
    .map((question) => summarizeQuestionPrompt(question))
    .join('\n');

  return `${basePrompt}

COMPLEMENTO OBLIGATORIO:
- Ya existe un examen parcial valido. No lo reescribas.
- Genera SOLO las preguntas faltantes para completar el examen.
- Devuelve EXCLUSIVAMENTE un objeto JSON valido con esta estructura:
{
  "preguntas": [
    {
      "tipo": "clave_interna",
      "tema": "texto",
      "pregunta": "texto",
      "opciones": ["texto"],
      "respuesta_correcta": "texto o arreglo",
      "explicacion": "texto",
      "pares": [
        {
          "lado_a": "texto",
          "lado_b": "texto"
        }
      ],
      "criterios_evaluacion": "texto",
      "elementos": ["texto"]
    }
  ]
}
- No incluyas titulo.
- No incluyas instrucciones_generales.
- No repitas preguntas ya existentes.
- Debes generar EXACTAMENTE estas faltantes:
${missingBlock}

PREGUNTAS YA GENERADAS:
${existingQuestionsBlock || '- Sin preguntas previas'}
`;
}

function validateQuestionListPayload(payload, selectedTypes) {
  const preguntas = Array.isArray(payload?.preguntas)
    ? payload.preguntas
    : (Array.isArray(payload) ? payload : []);

  if (preguntas.length === 0) {
    throw buildHttpError(502, 'La IA no devolvio preguntas de complemento validas.');
  }

  const selectedTypesSet = new Set(selectedTypes);
  return preguntas.map((question, index) => validateQuestion(question, index, selectedTypesSet));
}

function selectRelevantExistingQuestionsForPrompt(existingQuestions, item, limit = 12) {
  const list = Array.isArray(existingQuestions) ? existingQuestions : [];
  const normalizedTema = normalizeLooseKey(item?.tema || '');
  const sameTopic = [];
  const recent = [];

  for (const entry of list) {
    const question = entry?.question || entry?.pregunta_ia || entry;
    const entryTema = normalizeLooseKey(question?.tema || entry?.tema || '');
    if (normalizedTema && entryTema && entryTema === normalizedTema) {
      sameTopic.push(entry);
    }
  }

  for (let index = list.length - 1; index >= 0 && recent.length < limit; index -= 1) {
    recent.push(list[index]);
  }

  const selected = [];
  const seen = new Set();

  for (const entry of [...sameTopic, ...recent]) {
    const key = entry?.pregunta_numero || entry?.index || extractQuestionText(entry?.question || entry?.pregunta_ia || entry);
    if (!key || seen.has(String(key))) continue;
    seen.add(String(key));
    selected.push(entry);
    if (selected.length >= limit) break;
  }

  return selected.sort((a, b) => Number(a?.pregunta_numero || a?.index || 0) - Number(b?.pregunta_numero || b?.index || 0));
}

function buildExamQuestionItems({ temas, questionCounts }) {
  const counts = questionCounts && typeof questionCounts === 'object' ? questionCounts : {};
  const entries = Object.entries(counts).filter(([, count]) => Number(count || 0) > 0);
  const topicList = Array.isArray(temas) ? temas : [];
  const items = [];

  entries.forEach(([tipo, count]) => {
    for (let index = 0; index < Number(count || 0); index += 1) {
      const tema = topicList[items.length % Math.max(topicList.length, 1)] || null;
      items.push({
        pregunta_numero: items.length + 1,
        tema_id: tema?.id || null,
        tema: tema?.titulo || '',
        tipo_pregunta: tipo
      });
    }
  });

  return items;
}

function getQuestionJsonPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.pregunta_ia && typeof payload.pregunta_ia === 'object' && !Array.isArray(payload.pregunta_ia)) {
    return payload.pregunta_ia;
  }
  if (payload.pregunta && typeof payload.pregunta === 'object' && !Array.isArray(payload.pregunta)) {
    return payload.pregunta;
  }
  if (payload.question && typeof payload.question === 'object' && !Array.isArray(payload.question)) {
    return payload.question;
  }
  return payload;
}

function parseQuestionJson(rawText) {
  const candidates = extractJsonCandidates(rawText);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const question = getQuestionJsonPayload(parsed);
      if (question) return question;
    } catch {
      // Continue trying alternative candidates.
    }
  }

  return null;
}

function sameStringSet(left, right) {
  const leftValues = normalizeStringArray(left).map((item) => normalizeLooseKey(item)).sort();
  const rightValues = normalizeStringArray(right).map((item) => normalizeLooseKey(item)).sort();
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

function validateGeneratedQuestionStrict(question, expectedType) {
  const errors = [];
  const tipo = normalizeQuestionTypeValue(question?.tipo);
  const tema = normalizeString(question?.tema);
  const pregunta = extractQuestionText(question);
  const respuestaCorrectaRaw = question?.respuesta_correcta;
  const respuestaCorrectaText = Array.isArray(respuestaCorrectaRaw)
    ? ''
    : pickFirstString(respuestaCorrectaRaw, question?.correcta, question?.respuesta, question?.answer);
  const criterios = pickFirstString(question?.criterios_evaluacion, question?.criterios);
  const explicacion = pickFirstString(question?.explicacion, question?.retroalimentacion, question?.justificacion);
  const opciones = normalizeStringArray(question?.opciones);
  const normalizedOptions = opciones.map((option) => normalizeQuestionText(option));
  const elementos = normalizeStringArray(question?.elementos);

  if (!tema) errors.push('El campo tema esta vacio');
  if (!tipo) errors.push('El campo tipo esta vacio');
  if (tipo && tipo !== expectedType) errors.push('El campo tipo no coincide con el tipo solicitado');
  if (!pregunta) errors.push('El campo pregunta esta vacio');
  if (!criterios) errors.push('El campo criterios_evaluacion esta vacio');

  if (expectedType === 'opcion_multiple') {
    if (opciones.length !== 4) errors.push('La pregunta de opcion_multiple requiere exactamente 4 opciones (A, B, C, D)');
    if (opciones.length === 4 && new Set(normalizedOptions).size !== normalizedOptions.length) {
      errors.push('La pregunta de opcion_multiple contiene opciones duplicadas');
    }
    if (!respuestaCorrectaText) {
      errors.push('El campo respuesta_correcta esta vacio');
    } else if (!normalizedOptions.includes(normalizeQuestionText(respuestaCorrectaText))) {
      errors.push('La respuesta_correcta no existe dentro de opciones');
    }
  } else if (expectedType === 'verdadero_falso') {
    const normalizedAnswer = normalizeLooseKey(respuestaCorrectaText);
    if (normalizedAnswer !== 'verdadero' && normalizedAnswer !== 'falso') {
      errors.push('La pregunta de verdadero_falso requiere respuesta_correcta Verdadero o Falso');
    }
  } else if (expectedType === 'emparejamiento') {
    const pares = Array.isArray(question?.pares) ? question.pares : [];
    if (pares.length < 2) {
      errors.push('La pregunta de emparejamiento requiere al menos 2 pares');
    } else {
      try {
        validateEmparejamientoPairs(question, 0);
      } catch (error) {
        errors.push(error?.message || 'La pregunta de emparejamiento contiene pares incompletos');
      }
    }
  } else if (expectedType === 'ordenacion_jerarquizacion') {
    const respuestaOrden = Array.isArray(respuestaCorrectaRaw)
      ? respuestaCorrectaRaw.map((item) => normalizeString(item)).filter(Boolean)
      : [];
    if (elementos.length < 3) errors.push('La pregunta de ordenacion_jerarquizacion requiere al menos 3 elementos');
    if (respuestaOrden.length < 3) errors.push('La respuesta_correcta debe ser un array con al menos 3 elementos');
    if (elementos.length >= 3 && respuestaOrden.length >= 3 && !sameStringSet(elementos, respuestaOrden)) {
      errors.push('La respuesta_correcta debe contener los mismos elementos que elementos');
    }
  } else if (!respuestaCorrectaText) {
    errors.push('El campo respuesta_correcta esta vacio');
  }

  if (errors.length > 0) {
    return { valid: false, errors, question: null };
  }

  const normalized = {
    tema,
    tipo: expectedType,
    pregunta,
    opciones: expectedType === 'opcion_multiple'
      ? opciones
      : (expectedType === 'verdadero_falso' ? ['Verdadero', 'Falso'] : []),
    elementos: expectedType === 'ordenacion_jerarquizacion' ? elementos : [],
    explicacion,
    respuesta_correcta: expectedType === 'ordenacion_jerarquizacion'
      ? respuestaCorrectaRaw.map((item) => normalizeString(item)).filter(Boolean)
      : (expectedType === 'verdadero_falso'
        ? (normalizeLooseKey(respuestaCorrectaText) === 'verdadero' ? 'Verdadero' : 'Falso')
        : (expectedType === 'emparejamiento'
          ? validateEmparejamientoPairs(question, 0).map((pair) => ({ ...pair }))
          : respuestaCorrectaText)),
    criterios_evaluacion: criterios
  };

  if (expectedType === 'emparejamiento') {
    normalized.pares = validateEmparejamientoPairs(question, 0);
    normalized.respuesta_correcta = normalized.pares.map((pair) => ({ ...pair }));
  }

  return { valid: true, errors: [], question: normalized };
}

function buildSingleQuestionPrompt({
  contexto,
  item,
  temasContexto,
  totalPreguntas,
  existingQuestions,
  retryFeedback,
  cognitiveFocus = '',
  isFallback = false
}) {
  const type = item.tipo_pregunta;
  const topicContext = (Array.isArray(temasContexto) ? temasContexto : [])
    .filter((tema) => !item.tema_id || tema.tema_id === item.tema_id)
    .slice(0, 1);
  const contextForPrompt = topicContext.length > 0 ? topicContext : (Array.isArray(temasContexto) ? temasContexto.slice(0, 3) : []);
  const relevantExistingQuestions = selectRelevantExistingQuestionsForPrompt(existingQuestions, item);
  const existingQuestionsBlock = relevantExistingQuestions
    .map((entry) => summarizeQuestionPrompt(entry?.question || entry?.pregunta_ia || entry))
    .join('\n');

  return `Genera una sola pregunta para un examen de unidad.

CONTEXTO:
- Plantel: ${contexto.plantel?.nombre || ''}
- Grado: ${contexto.grado?.grado_nombre || contexto.grado?.nombre || contexto.grado?.nivel_base || ''}
- Materia: ${contexto.materia?.nombre || ''}
- Unidad: ${contexto.unidad?.nombre || ''}
- Pregunta numero: ${item.pregunta_numero} de ${totalPreguntas}
- Tema solicitado: ${item.tema || 'Tema de la unidad'}
- Tipo solicitado: ${type}

TEMAS Y PLANEACION DISPONIBLE:
${JSON.stringify(contextForPrompt)}

INSTRUCCIONES OBLIGATORIAS:
- Devuelve unicamente un objeto JSON valido.
- No incluyas markdown.
- No incluyas texto antes o despues del JSON.
- No incluyas explicacion fuera del JSON.
- El campo "pregunta" es obligatorio.
- El campo "pregunta" no puede estar vacio.
- El campo "respuesta_correcta" es obligatorio.
- El campo "criterios_evaluacion" es obligatorio.
- El campo "tipo" debe coincidir exactamente con "${type}".
- No repitas ni reformules una pregunta ya aceptada.
- La pregunta debe evaluar un aprendizaje, dato, habilidad o concepto distinto de las preguntas ya aceptadas.
- Evita preguntas genericas como "Cual es la importancia de...", "Que es..." o "Explica..." si no exigen una evidencia concreta.
- Si el tipo es "opcion_multiple", incluye "opciones" con EXACTAMENTE 4 opciones (A, B, C y D) y asegurate de que "respuesta_correcta" exista dentro de "opciones".
- Si el tipo es "opcion_multiple", las 4 opciones deben ser distintas entre si y solo una debe ser correcta.
- Si el tipo es "verdadero_falso", usa "respuesta_correcta": "Verdadero" o "Falso".
- Si el tipo es "emparejamiento", incluye "pares" como array de objetos con "lado_a" y "lado_b".
- Si el tipo es "ordenacion_jerarquizacion", incluye "elementos" y "respuesta_correcta" como arrays con los mismos elementos.
- Si no puedes generar una pregunta valida, genera otra pregunta diferente.
- Para tipos que no usan opciones, devuelve "opciones": [].
- Para tipos que no usan elementos, devuelve "elementos": [].
${cognitiveFocus ? `- Enfoca esta pregunta especificamente en: ${cognitiveFocus}. Usa un angulo distinto al de las preguntas ya aceptadas.` : ''}
${isFallback ? '- Las preguntas anteriores para este reactivo salieron repetidas. Cambia de subtema, de evidencia y de enfoque cognitivo. Crea una pregunta claramente diferente, mas especifica y ligada a un caso o aplicacion concreta.' : ''}
${retryFeedback ? `- Corrige el intento anterior: ${retryFeedback}` : ''}

PREGUNTAS YA ACEPTADAS QUE NO PUEDES REPETIR NI IMITAR:
${existingQuestionsBlock || '- Ninguna pregunta aceptada aun.'}

FORMATO ESPERADO:
{
  "tema": "${item.tema || 'Tema'}",
  "tipo": "${type}",
  "pregunta": "...",
  "opciones": [],
  "elementos": [],
  "explicacion": "...",
  "respuesta_correcta": "...",
  "criterios_evaluacion": "..."
}`;
}

async function updateGenerationJob(client, jobId, payload) {
  const { error } = await client
    .from('examen_generation_jobs')
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);

  if (error) throw error;
}

async function updateGenerationItem(client, itemId, payload) {
  const { error } = await client
    .from('examen_generation_items')
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId);

  if (error) throw error;
}

async function fetchGenerationJob(client, jobId, userId) {
  const query = client
    .from('examen_generation_jobs')
    .select('*')
    .eq('id', jobId);

  if (userId) query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Generacion de examen no encontrada');
  return data;
}

async function fetchGenerationItems(client, jobId) {
  const { data, error } = await client
    .from('examen_generation_items')
    .select('*')
    .eq('job_id', jobId)
    .order('pregunta_numero', { ascending: true });

  if (error) throw error;
  return data || [];
}

function countAcceptedQuestionsByTopic(existingQuestions) {
  const counts = new Map();
  for (const entry of Array.isArray(existingQuestions) ? existingQuestions : []) {
    const question = entry?.question || entry?.pregunta_ia || entry;
    const key = normalizeLooseKey(question?.tema || entry?.tema || '');
    if (!key) continue;
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  return counts;
}

// Construye el plan de intentos de fallback cuando los reintentos normales no
// lograron una pregunta valida/unica. Escala de menos a mas agresivo:
//   1) mismo tema y tipo, variando el enfoque cognitivo,
//   2) otros temas disponibles (priorizando los menos usados), mismo tipo,
//   3) otros tipos permitidos como ultimo recurso.
// Cada plan se sigue validando contra las preguntas ya aceptadas.
function buildExamFallbackPlans({ item, allowedTypes, availableTopics, existingQuestions }) {
  const focuses = QUESTION_COGNITIVE_FOCUSES;
  const usageByTopic = countAcceptedQuestionsByTopic(existingQuestions);
  const topics = (Array.isArray(availableTopics) ? availableTopics : [])
    .map((topic) => ({
      tema_id: topic?.tema_id ?? topic?.id ?? null,
      tema: normalizeString(topic?.tema || topic?.titulo || '')
    }))
    .filter((topic) => topic.tema);
  const otherTopics = topics
    .filter((topic) => String(topic.tema_id ?? '') !== String(item.tema_id ?? '') || topic.tema !== item.tema)
    .sort((a, b) => (
      Number(usageByTopic.get(normalizeLooseKey(a.tema)) || 0)
      - Number(usageByTopic.get(normalizeLooseKey(b.tema)) || 0)
    ));
  const otherTypes = (Array.isArray(allowedTypes) ? allowedTypes : [])
    .map((tipo) => normalizeQuestionTypeValue(tipo))
    .filter((tipo) => tipo && tipo !== item.tipo_pregunta);

  const plans = [];

  // Stage 1: mismo tema/tipo, distintos enfoques cognitivos.
  focuses.forEach((focus) => {
    plans.push({
      tema: item.tema,
      tema_id: item.tema_id,
      tipo_pregunta: item.tipo_pregunta,
      cognitiveFocus: focus
    });
  });

  // Stage 2: otros temas disponibles (menos usados primero), mismo tipo.
  otherTopics.forEach((topic, index) => {
    plans.push({
      tema: topic.tema,
      tema_id: topic.tema_id,
      tipo_pregunta: item.tipo_pregunta,
      cognitiveFocus: focuses[index % focuses.length]
    });
  });

  // Stage 3: otros tipos permitidos, tema original (ultimo recurso).
  otherTypes.forEach((tipo, index) => {
    plans.push({
      tema: item.tema,
      tema_id: item.tema_id,
      tipo_pregunta: tipo,
      cognitiveFocus: focuses[index % focuses.length]
    });
  });

  return plans;
}

// Genera UNA pregunta valida y unica para un reactivo del examen.
// Nunca hace throw por duplicados o validacion de contenido: esos casos son
// recuperables y se manejan con reintentos + fallbacks. Solo devuelve
// { ok: false } cuando se agotan TODAS las estrategias. Los errores reales de
// infraestructura (OpenAI/timeout) se reintentan y, si todas las llamadas
// fallan, tambien terminan como { ok: false } con su detalle en logs.
async function generateSingleQuestionWithIa({
  contexto,
  item,
  temasContexto,
  totalPreguntas,
  jobId,
  existingQuestions = [],
  allowedTypes = [],
  availableTopics = [],
  aiJobId = null,
  userId = null
}) {
  let retryFeedback = '';
  let lastValidationErrors = [];
  let attemptIndex = 0;
  const configuredMaxRetries = Number(item?.max_retries || EXAM_ITEM_MAX_RETRIES);
  const normalRetries = Math.max(configuredMaxRetries, EXAM_ITEM_MAX_RETRIES);
  const fallbackPlans = buildExamFallbackPlans({ item, allowedTypes, availableTopics, existingQuestions });

  const runAttempt = async ({ effectiveItem, cognitiveFocus, isFallback, strictUniqueness }) => {
    attemptIndex += 1;
    const attemptNumber = attemptIndex;
    const prompt = buildSingleQuestionPrompt({
      contexto,
      item: effectiveItem,
      temasContexto,
      totalPreguntas,
      existingQuestions,
      retryFeedback,
      cognitiveFocus,
      isFallback
    });

    let completion;
    const callStart = Date.now();
    try {
      completion = await requestExamCompletion({
        prompt,
        maxTokens: EXAM_SINGLE_QUESTION_MAX_TOKENS,
        temperature: attemptNumber === 1 ? 0.35 : (isFallback ? 0.6 : 0.25)
      });
    } catch (apiError) {
      // Error transitorio de OpenAI/timeout: lo tratamos como recuperable y
      // dejamos que el siguiente intento/fallback lo reintente.
      console.warn('[examenes] error al solicitar pregunta a la IA, reintentando', {
        jobId,
        preguntaNumero: item.pregunta_numero,
        attempt: attemptNumber,
        isFallback,
        motivo: apiError?.message || 'Error desconocido de OpenAI'
      });
      lastValidationErrors = [buildQuestionValidationError({
        code: 'error_api',
        reason: apiError?.message || 'Error al solicitar la pregunta a la IA.',
        preguntaNumero: item.pregunta_numero
      })];
      return { ok: false, apiError };
    }
    const callDurationMs = Date.now() - callStart;

    const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseQuestionJson(rawText);
    const validation = validateGeneratedQuestionStrict(parsed, effectiveItem.tipo_pregunta);
    const uniquenessErrors = validation.valid
      ? validateSingleQuestionUniqueness(validation.question, existingQuestions, item.pregunta_numero, { strict: strictUniqueness })
      : [];
    const validationOk = validation.valid && uniquenessErrors.length === 0;

    // Log each OpenAI call to metrics (fire-and-forget)
    if (aiJobId && userId) {
      logAiCall({
        jobId:         aiJobId,
        userId,
        artifactType:  'examen',
        callPurpose:   `question_${effectiveItem.tipo_pregunta}`,
        model:         'gpt-4o-mini',
        promptVersion: EXAM_PROMPT_VERSION,
        usage:         completion.usage,
        status:        validationOk ? 'success' : 'error',
        jsonOk:        Boolean(parsed),
        validationOk,
        retryNumber:   attemptNumber - 1,
        durationMs:    callDurationMs,
        metadata:      {
          pregunta_numero: item.pregunta_numero,
          tipo_pregunta:   effectiveItem.tipo_pregunta,
          is_fallback:     isFallback,
          finish_reason:   completion.choices?.[0]?.finish_reason || null
        }
      }).catch((err) => console.error('[aiMetrics] examenes logAiCall failed:', err?.message));
    }

    if (validationOk) {
      console.info('[examenes] pregunta aceptada', {
        jobId,
        preguntaNumero: item.pregunta_numero,
        tema: effectiveItem.tema,
        tipoPregunta: effectiveItem.tipo_pregunta,
        attempt: attemptNumber,
        usedFallback: isFallback
      });
      return { ok: true, question: validation.question };
    }

    const allErrors = validation.valid ? uniquenessErrors : validation.errors;
    lastValidationErrors = allErrors;
    const duplicateError = uniquenessErrors.find((error) => error?.code?.includes('duplicado'));
    if (duplicateError) {
      console.warn('[examenes] pregunta rechazada, reintentando', {
        jobId,
        preguntaNumero: item.pregunta_numero,
        tema: effectiveItem.tema,
        tipoPregunta: effectiveItem.tipo_pregunta,
        attempt: attemptNumber,
        isFallback,
        reason: duplicateError.reason,
        similarity: duplicateError.similarity,
        duplicateOf: duplicateError.duplicate_of
      });
    }

    retryFeedback = buildRetryFeedbackForPrompt(allErrors, attemptNumber, normalRetries);
    return { ok: false, errors: allErrors };
  };

  // Fase 1: reintentos normales con el tema/tipo solicitados.
  for (let i = 0; i <= normalRetries; i += 1) {
    const result = await runAttempt({
      effectiveItem: item,
      cognitiveFocus: '',
      isFallback: false,
      strictUniqueness: true
    });

    if (result.ok) {
      return { ok: true, question: result.question, retryCount: attemptIndex - 1, validationErrors: [], usedFallback: false };
    }

    await updateGenerationJob(supabaseAdmin, jobId, {
      current_step: `Reintentando pregunta ${item.pregunta_numero}...`
    }).catch(() => {});
    await updateGenerationItem(supabaseAdmin, item.id, {
      status: 'retrying',
      retry_count: attemptIndex,
      validation_errors: lastValidationErrors,
      error_message: null
    }).catch(() => {});
  }

  // Fase 2: fallbacks (enfoque cognitivo -> otro tema -> otro tipo).
  for (let p = 0; p < fallbackPlans.length; p += 1) {
    const plan = fallbackPlans[p];
    const effectiveItem = {
      ...item,
      tema: plan.tema || item.tema,
      tema_id: plan.tema_id ?? item.tema_id,
      tipo_pregunta: plan.tipo_pregunta || item.tipo_pregunta
    };
    // En los ultimos planes relajamos la unicidad (solo duplicados reales) para
    // garantizar que el examen se complete en vez de fallar por una pregunta
    // limitrofe.
    const strictUniqueness = p < (fallbackPlans.length - EXAM_FALLBACK_RELAX_TAIL);

    const result = await runAttempt({
      effectiveItem,
      cognitiveFocus: plan.cognitiveFocus,
      isFallback: true,
      strictUniqueness
    });

    if (result.ok) {
      return { ok: true, question: result.question, retryCount: attemptIndex - 1, validationErrors: [], usedFallback: true };
    }

    await updateGenerationJob(supabaseAdmin, jobId, {
      current_step: `Buscando otra pregunta para el reactivo ${item.pregunta_numero}...`
    }).catch(() => {});
    await updateGenerationItem(supabaseAdmin, item.id, {
      status: 'retrying',
      retry_count: attemptIndex,
      validation_errors: lastValidationErrors,
      error_message: null
    }).catch(() => {});
  }

  console.error('[examenes] no se pudo generar pregunta unica despues de reintentos y fallbacks', {
    jobId,
    preguntaNumero: item.pregunta_numero,
    tema: item.tema,
    tipoPregunta: item.tipo_pregunta,
    totalAttempts: attemptIndex,
    validationErrors: lastValidationErrors
  });

  return { ok: false, question: null, retryCount: attemptIndex, validationErrors: lastValidationErrors };
}

function buildFinalExamPayloadFromItems({ job, items }) {
  const questions = items.map((item) => item.pregunta_ia);
  return {
    titulo: job.titulo,
    preguntas: questions,
    configuracion: {
      tema_ids: (Array.isArray(job.contexto_temas) ? job.contexto_temas : [])
        .map((tema) => tema?.tema_id)
        .filter(Boolean),
      total_preguntas: questions.length,
      cantidades_pregunta: job.configuracion?.cantidades_pregunta || {}
    },
    instrucciones_generales: job.instrucciones || 'Lee cuidadosamente cada pregunta antes de responder.'
  };
}

function buildAcceptedQuestionsFromItems(items, excludePreguntaNumero = null) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => (
      item.status === 'completed'
      && item.pregunta_ia
      && Number(item.pregunta_numero) !== Number(excludePreguntaNumero)
    ))
    .map((item) => ({
      pregunta_numero: item.pregunta_numero,
      question: item.pregunta_ia
    }));
}

function getProblemQuestionNumbers(validationErrors) {
  return [...new Set(
    (Array.isArray(validationErrors) ? validationErrors : [])
      .map((error) => Number(error?.pregunta_numero || 0))
      .filter((value) => value > 0)
  )];
}

async function processExamGenerationJob(jobId) {
  const client = supabaseAdmin;
  const job = await fetchGenerationJob(client, jobId);
  const contexto = await obtenerContextoUnidad(client, job.unidad_id);
  const allUnitTemas = await fetchUnitTopics(client, job.unidad_id, job.user_id);
  // El contexto del prompt debe limitarse a los temas seleccionados al crear el
  // job, no a todos los temas de la unidad. Asi el examen nunca incluye temas
  // que el usuario no eligio (defensa contra contexto cruzado/viejo).
  const selectedTemaIds = Array.isArray(job.configuracion?.tema_ids)
    ? job.configuracion.tema_ids.map(String).filter(Boolean)
    : [];
  const scopedTemas = selectedTemaIds.length > 0
    ? allUnitTemas.filter((tema) => selectedTemaIds.includes(String(tema.id)))
    : allUnitTemas;
  const temas = scopedTemas.length > 0 ? scopedTemas : allUnitTemas;
  const temasContexto = buildPromptTopicsContext(temas);
  console.info('[examenes] contexto final para prompt', {
    unidadId: job.unidad_id,
    totalTemas: temasContexto.length,
    temas: temasContexto.map((tema) => tema.tema)
  });
  let items = await fetchGenerationItems(client, jobId);
  const total = Number(job.progress_total || items.length || 0);
  // Tipos permitidos y temas seleccionados, usados por los fallbacks por
  // pregunta (cambiar de tema o de tipo cuando una pregunta sale duplicada).
  const allowedTypes = Array.isArray(job.tipos_pregunta) ? job.tipos_pregunta : [];
  const availableTopics = [...new Map(
    items
      .map((it) => [String(it.tema_id ?? it.tema ?? ''), { tema_id: it.tema_id ?? null, tema: it.tema || '' }])
  ).values()].filter((topic) => topic.tema);

  // Create AI metrics job for this exam generation
  let aiJobId = null;
  if (job.user_id) {
    try {
      aiJobId = await createAiJob({
        userId:       job.user_id,
        artifactType: 'examen',
        actionType:   'generate',
        nivel:        contexto.grado?.nivel_base || null,
        materia:      contexto.materia?.nombre   || null,
        titulo:       job.titulo || null,
        inputSummary: {
          total_preguntas: total,
          tipos_pregunta:  job.tipos_pregunta || [],
          temas_count:     temas.length
        }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (examen) error:', err?.message);
    }
  }

  try {
    for (const item of items) {
      if (item.status === 'completed') continue;

      await updateGenerationItem(client, item.id, {
        status: 'processing',
        error_message: null
      });
      await updateGenerationJob(client, jobId, {
        status: 'processing',
        current_step: `Generando pregunta ${item.pregunta_numero} de ${total}...`
      });

      const acceptedQuestions = buildAcceptedQuestionsFromItems(await fetchGenerationItems(client, jobId));

      const result = await generateSingleQuestionWithIa({
        contexto,
        item,
        temasContexto,
        totalPreguntas: total,
        jobId,
        existingQuestions: acceptedQuestions,
        allowedTypes,
        availableTopics,
        aiJobId,
        userId: job.user_id
      });

      // Un duplicado/validacion recuperable NO cancela el examen: la pregunta
      // se marca como failed y se continua. El job solo fallara al final si
      // realmente quedaron reactivos sin completar.
      if (!result.ok) {
        await updateGenerationItem(client, item.id, {
          status: 'failed',
          validation_errors: Array.isArray(result.validationErrors) ? result.validationErrors : [],
          retry_count: result.retryCount,
          error_message: EXAM_GENERIC_FAILURE_MESSAGE
        });
        continue;
      }

      await updateGenerationItem(client, item.id, {
        status: 'completed',
        pregunta_ia: result.question,
        validation_errors: [],
        retry_count: result.retryCount,
        error_message: null
      });

      const completedCount = Number((await fetchGenerationItems(client, jobId))
        .filter((candidate) => candidate.status === 'completed').length);
      await updateGenerationJob(client, jobId, {
        progress_current: completedCount,
        current_step: `Validando pregunta ${item.pregunta_numero}...`
      });
    }

    items = await fetchGenerationItems(client, jobId);
    const failedItems = items.filter((item) => item.status !== 'completed');

    if (failedItems.length > 0) {
      const validationErrors = failedItems.flatMap((item) => (
        Array.isArray(item.validation_errors) ? item.validation_errors : []
      ));
      // Solo se llega aqui si, tras reintentos + fallbacks por pregunta, algun
      // reactivo quedo realmente sin completar (caso extremo / infra).
      console.error('[examenes] fallo al completar examen', {
        jobId,
        requestedTotal: total,
        generatedTotal: items.length - failedItems.length,
        failedQuestions: failedItems.map((item) => item.pregunta_numero),
        errors: validationErrors
      });
      await updateGenerationJob(client, jobId, {
        status: 'failed',
        error_message: EXAM_GENERIC_FAILURE_MESSAGE,
        current_step: 'No se pudo completar el examen.',
        failed_at: new Date().toISOString()
      });
      if (aiJobId) {
        failAiJob(aiJobId, {
          status:           'partial',
          errorType:        'validation_failed',
          errorMessageSafe: EXAM_GENERIC_FAILURE_MESSAGE,
          outputSummary:    {
            preguntas_generadas: items.length - failedItems.length,
            preguntas_fallidas:  failedItems.length
          }
        }).catch(() => {});
      }
      return { ok: false, validationErrors };
    }

    const freshJob = await fetchGenerationJob(client, jobId);
    let examenIa = buildFinalExamPayloadFromItems({ job: freshJob, items });
    let finalUniquenessValidation = validateExamQuestionsUniqueness(examenIa);

    if (!finalUniquenessValidation.valid) {
      const problemQuestionNumbers = getProblemQuestionNumbers(finalUniquenessValidation.errors);

      for (const error of finalUniquenessValidation.errors) {
        console.warn('[examenes] duplicado detectado en validacion final, regenerando pregunta', {
          jobId,
          preguntaNumero: error?.pregunta_numero,
          duplicateOf: error?.duplicate_of,
          similarity: error?.similarity,
          reason: error?.reason
        });
      }

      for (const preguntaNumero of problemQuestionNumbers) {
        const item = items.find((candidate) => Number(candidate.pregunta_numero) === Number(preguntaNumero));
        if (!item) continue;

        await updateGenerationItem(client, item.id, {
          status: 'processing',
          validation_errors: finalUniquenessValidation.errors.filter((error) => Number(error?.pregunta_numero) === Number(preguntaNumero)),
          error_message: null
        });
        await updateGenerationJob(client, jobId, {
          status: 'processing',
          current_step: `Ajustando pregunta ${preguntaNumero}...`
        });

        const latestItems = await fetchGenerationItems(client, jobId);
        const acceptedQuestions = buildAcceptedQuestionsFromItems(latestItems, preguntaNumero);
        const result = await generateSingleQuestionWithIa({
          contexto,
          item,
          temasContexto,
          totalPreguntas: total,
          jobId,
          existingQuestions: acceptedQuestions,
          allowedTypes,
          availableTopics,
          aiJobId,
          userId: job.user_id
        });

        if (!result.ok) {
          // No se pudo reemplazar la pregunta duplicada ni con fallbacks. Se
          // marca el reactivo como failed; el bloque de validacion final
          // posterior decidira si el examen completo falla.
          await updateGenerationItem(client, item.id, {
            status: 'failed',
            validation_errors: Array.isArray(result.validationErrors) ? result.validationErrors : [],
            retry_count: Number(item.retry_count || 0) + Number(result.retryCount || 0) + 1,
            error_message: EXAM_GENERIC_FAILURE_MESSAGE
          });
          continue;
        }

        await updateGenerationItem(client, item.id, {
          status: 'completed',
          pregunta_ia: result.question,
          validation_errors: [],
          retry_count: Number(item.retry_count || 0) + Number(result.retryCount || 0) + 1,
          error_message: null
        });
      }

      items = await fetchGenerationItems(client, jobId);
      examenIa = buildFinalExamPayloadFromItems({ job: freshJob, items });
      finalUniquenessValidation = validateExamQuestionsUniqueness(examenIa);
    }

    if (!finalUniquenessValidation.valid) {
      const errorsByQuestion = new Map();
      for (const error of finalUniquenessValidation.errors) {
        const preguntaNumero = Number(error?.pregunta_numero || 0);
        if (!preguntaNumero) continue;
        errorsByQuestion.set(preguntaNumero, [
          ...(errorsByQuestion.get(preguntaNumero) || []),
          error
        ]);
      }

      await Promise.all(items.map((item) => {
        const itemErrors = errorsByQuestion.get(Number(item.pregunta_numero));
        if (!itemErrors) return Promise.resolve();

        return updateGenerationItem(client, item.id, {
          status: 'failed',
          validation_errors: itemErrors,
          error_message: EXAM_GENERIC_FAILURE_MESSAGE
        });
      }));

      await updateGenerationJob(client, jobId, {
        status: 'failed',
        error_message: EXAM_GENERIC_FAILURE_MESSAGE,
        current_step: 'No se pudo completar el examen.',
        failed_at: new Date().toISOString()
      });

      if (aiJobId) {
        failAiJob(aiJobId, {
          status:           'failed',
          errorType:        'duplicate_questions',
          errorMessageSafe: EXAM_GENERIC_FAILURE_MESSAGE,
          outputSummary:    {
            preguntas_generadas: examenIa.preguntas.length,
            preguntas_fallidas:  finalUniquenessValidation.errors.length
          }
        }).catch(() => {});
      }

      return { ok: false, validationErrors: finalUniquenessValidation.errors };
    }

    const jobBatchId = freshJob.configuracion?.batch_id || null;
    const insertPayload = {
      user_id: freshJob.user_id,
      plantel_id: freshJob.plantel_id,
      grado_id: freshJob.grado_id,
      materia_id: freshJob.materia_id,
      unidad_id: freshJob.unidad_id,
      batch_id: jobBatchId,
      titulo: examenIa.titulo,
      instrucciones: examenIa.instrucciones_generales,
      tipos_pregunta: freshJob.tipos_pregunta,
      total_preguntas: examenIa.preguntas.length,
      contexto_temas: freshJob.contexto_temas,
      examen_ia: examenIa,
      prompt_version: EXAM_PROMPT_VERSION,
      status: 'generado',
      generation_job_id: jobId,
      generation_error: null,
      validation_errors: []
    };

    const { data: examen, error: examenError } = await client
      .from('examenes')
      .insert([insertPayload])
      .select('*')
      .single();

    if (examenError) throw examenError;

    await updateGenerationJob(client, jobId, {
      status: 'completed',
      progress_current: total,
      progress_total: total,
      current_step: 'Examen generado correctamente',
      completed_at: new Date().toISOString(),
      examen_id: examen.id,
      error_message: null
    });

    if (aiJobId) {
      finishAiJob(aiJobId, {
        examenId:     examen.id,
        outputSummary: {
          preguntas_generadas: examenIa.preguntas.length,
          preguntas_fallidas:  0,
          retries:             items.reduce((sum, it) => sum + Number(it.retry_count || 0), 0)
        }
      }).catch(() => {});
    }

    return { ok: true, examenId: examen.id };
  } catch (error) {
    const latestItems = await fetchGenerationItems(client, jobId).catch(() => []);
    const validationErrors = latestItems.flatMap((item) => (
      Array.isArray(item.validation_errors) ? item.validation_errors : []
    ));

    await updateGenerationJob(client, jobId, {
      status: 'failed',
      error_message: EXAM_GENERIC_FAILURE_MESSAGE,
      current_step: 'No se pudo completar el examen.',
      failed_at: new Date().toISOString()
    }).catch(() => {});

    if (aiJobId) {
      failAiJob(aiJobId, {
        errorType:        error?.status ? `http_${error.status}` : 'generation_error',
        errorMessageSafe: EXAM_GENERIC_FAILURE_MESSAGE
      }).catch(() => {});
    }

    console.error('[exam-debug] processExamGenerationJob.fallo', {
      jobId,
      motivo: error?.message || 'Error desconocido',
      validationErrors
    });
    return { ok: false, error };
  }
}

function scheduleExamGenerationJob(jobId) {
  setTimeout(() => {
    processExamGenerationJob(jobId).catch((error) => {
      console.error('[exam-debug] scheduleExamGenerationJob.fallo', {
        jobId,
        motivo: error?.message || 'Error desconocido'
      });
    });
  }, 0);
}

async function generateMissingQuestionsWithIa({
  basePrompt,
  partialExam,
  missingCounts
}) {
  const missingTypes = Object.keys(missingCounts);
  const prompt = buildMissingQuestionsPrompt(basePrompt, partialExam, missingCounts);
  const missingPlan = buildQuestionPlan(missingTypes, missingCounts);
  const maxTokens = Math.min(
    Math.max(1200, estimateExamOutputTokens(missingPlan)),
    EXAM_MAX_OUTPUT_TOKENS
  );

  console.info('[exam-debug] generateMissingQuestionsWithIa.request', {
    missingCounts,
    maxTokens,
    partialTotal: Array.isArray(partialExam?.preguntas) ? partialExam.preguntas.length : 0
  });

  const completion = await requestExamCompletion({
    prompt,
    maxTokens,
    temperature: 0.4
  });
  const completionUsage = normalizeCompletionUsage(completion?.usage);

  const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
  const parsed = parseExamJson(rawText);

  console.info('[exam-debug] generateMissingQuestionsWithIa.response', {
    finishReason: completion.choices?.[0]?.finish_reason || '',
    usage: completionUsage,
    rawLength: rawText.length,
    parsed: Boolean(parsed),
    parsedTotal: Array.isArray(parsed?.preguntas) ? parsed.preguntas.length : 0,
    parsedDistribution: buildQuestionTypeCountObject(parsed?.preguntas || [])
  });

  if (!parsed) {
    console.warn('[exam-debug] generateMissingQuestionsWithIa.fallo', {
      motivo: 'La IA no devolvio preguntas de complemento en JSON valido.',
      missingCounts,
      rawResponse: rawText
    });
    throw buildHttpError(502, 'La IA no devolvio preguntas de complemento en JSON valido.');
  }

  const validatedQuestions = validateQuestionListPayload(parsed, missingTypes);
  console.info('[exam-debug] generateMissingQuestionsWithIa.preguntas_creadas', {
    total: validatedQuestions.length,
    distribution: buildQuestionTypeCountObject(validatedQuestions),
    preguntas: buildQuestionDebugList(validatedQuestions),
    usage: completionUsage
  });
  return {
    questions: validatedQuestions,
    usage: completionUsage
  };
}

async function requestExamCompletion({ prompt, maxTokens, temperature }) {
  return Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: OPENAI_EXAM_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature,
      max_tokens: maxTokens
    }),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(buildHttpError(504, 'La generacion del examen tardo demasiado. Intenta con menos preguntas o menos tipos.'));
      }, EXAM_ATTEMPT_TIMEOUT_MS);
    })
  ]);
}

async function generateExamWithIa({
  contexto,
  tiposPregunta,
  temasContexto,
  questionPlan,
  questionCounts
}) {
  const prompt = buildExamPromptByUnit({
    plantel: contexto.plantel?.nombre || '',
    grado: contexto.grado?.grado_nombre || contexto.grado?.nombre || contexto.grado?.nivel_base || '',
    materia: contexto.materia?.nombre || '',
    unidad: contexto.unidad?.nombre || '',
    tiposPregunta,
    temasContexto,
    questionPlan
  });
  const estimatedTokens = estimateExamOutputTokens(questionPlan);
  const attempts = Array.from({ length: EXAM_GENERATION_ATTEMPTS }, (_, index) => ({
    maxTokens: Math.min(estimatedTokens + (index * EXAM_RETRY_TOKEN_STEP), EXAM_MAX_OUTPUT_TOKENS),
    temperature: index === 0 ? 0.4 : 0.2
  }));

  console.info('[exam-debug] generateExamWithIa.request', {
    unidad: contexto.unidad?.nombre || '',
    tiposPregunta,
    questionCounts: questionCounts || null,
    totalRequested: getRequestedQuestionCountTotal(questionCounts),
    topicsCount: Array.isArray(temasContexto) ? temasContexto.length : 0,
    estimatedTokens,
    attempts: attempts.map((attempt, index) => ({
      attempt: index + 1,
      maxTokens: attempt.maxTokens,
      temperature: attempt.temperature
    })),
    questionPlan: Array.isArray(questionPlan?.items)
      ? questionPlan.items.map((item) => ({
          tipo: item.tipo,
          requestedCount: item.requestedCount ?? null
        }))
      : []
  });

  let lastMessage = '';
  let lastValidationMessage = '';
  const totalUsage = createUsageAccumulator();

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const promptForAttempt = index === 0
      ? prompt
      : buildExamRetryPrompt(prompt, lastValidationMessage);
    let completion;

    try {
      completion = await requestExamCompletion({
        prompt: promptForAttempt,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature
      });
    } catch (error) {
      console.error('[exam-debug] generateExamWithIa.fallo', {
        etapa: 'requestExamCompletion',
        attempt: index + 1,
        motivo: error?.message || 'Error desconocido al solicitar generacion a OpenAI.',
        requestedCounts: questionCounts || null,
        requestedTotal: getRequestedQuestionCountTotal(questionCounts)
      });
      throw error;
    }

    const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
    const finishReason = completion.choices?.[0]?.finish_reason || '';
    const completionUsage = normalizeCompletionUsage(completion?.usage);
    addUsage(totalUsage, completionUsage);
    lastMessage = rawText;
    const parsed = parseExamJson(rawText);

    console.info('[exam-debug] generateExamWithIa.attempt', {
      attempt: index + 1,
      finishReason,
      usage: completionUsage,
      rawLength: rawText.length,
      parsed: Boolean(parsed),
      parsedTotal: Array.isArray(parsed?.preguntas) ? parsed.preguntas.length : 0,
      parsedDistribution: buildQuestionTypeCountObject(parsed?.preguntas || [])
    });

    if (!parsed) {
      lastValidationMessage = finishReason === 'length'
        ? 'La respuesta se corto por limite de salida.'
        : 'La respuesta no se pudo interpretar como JSON valido.';
      console.warn('[exam-debug] generateExamWithIa.fallo', {
        etapa: 'parseExamJson',
        attempt: index + 1,
        motivo: lastValidationMessage,
        finishReason,
        usage: completionUsage,
        rawLength: rawText.length,
        rawResponse: rawText
      });
      continue;
    }

    try {
      const normalizedExam = normalizeExamStructure(parsed, tiposPregunta);
      let candidateExam = normalizedExam;

      if (hasRequestedQuestionCounts(questionCounts)) {
        const trimmedQuestions = trimQuestionsToRequestedCounts(normalizedExam.preguntas, questionCounts)
          || normalizedExam.preguntas;
        const missingCounts = buildMissingQuestionCounts(trimmedQuestions, questionCounts);

        if (hasRequestedQuestionCounts(missingCounts)) {
          console.info('[exam-debug] generateExamWithIa.missing_counts', {
            attempt: index + 1,
            missingCounts,
            currentTotal: trimmedQuestions.length,
            currentDistribution: buildQuestionTypeCountObject(trimmedQuestions)
          });

          try {
            const supplementResult = await generateMissingQuestionsWithIa({
              basePrompt: prompt,
              partialExam: {
                ...normalizedExam,
                preguntas: trimmedQuestions
              },
              missingCounts
            });
            addUsage(totalUsage, supplementResult?.usage);
            const supplementalQuestions = supplementResult?.questions || [];

            candidateExam = {
              ...normalizedExam,
              preguntas: [...trimmedQuestions, ...supplementalQuestions]
            };

            console.info('[exam-debug] generateExamWithIa.supplemented', {
              attempt: index + 1,
              supplementalTotal: supplementalQuestions.length,
              mergedTotal: candidateExam.preguntas.length,
              mergedDistribution: buildQuestionTypeCountObject(candidateExam.preguntas),
              usageComplemento: supplementResult?.usage || createUsageAccumulator()
            });
          } catch (supplementError) {
            console.warn('[exam-debug] generateExamWithIa.supplement_failed', {
              attempt: index + 1,
              message: supplementError?.message || 'No se pudieron generar las preguntas faltantes.',
              missingCounts
            });
          }
        }
      }

      const validated = validateExamPayload(candidateExam, tiposPregunta, questionCounts);
      console.info('[exam-debug] generateExamWithIa.validated', {
        attempt: index + 1,
        mensaje: 'Examen validado con exito.',
        requestedCounts: questionCounts || null,
        requestedTotal: getRequestedQuestionCountTotal(questionCounts),
        returnedTotal: Array.isArray(validated?.preguntas) ? validated.preguntas.length : 0,
        returnedDistribution: buildQuestionTypeCountObject(validated?.preguntas || []),
        preguntasCreadas: buildQuestionDebugList(validated?.preguntas || []),
        totalDeTokensUsadosEnEsteExamen: totalUsage.total_tokens,
        usageAcumulada: totalUsage
      });
      return {
        examen: validated,
        usage: totalUsage
      };
    } catch (error) {
      lastValidationMessage = buildExamValidationFeedback(parsed, error, questionCounts);
      console.warn('[exam-debug] generateExamWithIa.validation_failed', {
        attempt: index + 1,
        mensaje: 'Fallo por validacion del examen generado.',
        message: error?.message || 'Error de validacion',
        requestedCounts: questionCounts || null,
        requestedTotal: getRequestedQuestionCountTotal(questionCounts),
        returnedTotal: Array.isArray(parsed?.preguntas) ? parsed.preguntas.length : 0,
        returnedDistribution: buildQuestionTypeCountObject(parsed?.preguntas || []),
        usage: completionUsage,
        rawResponse: rawText
      });
      if (index === attempts.length - 1) {
        throw error;
      }
    }
  }

  console.error('[exam-debug] respuesta IA invalida', lastMessage);
  console.error('[exam-debug] generateExamWithIa.fallo', {
    etapa: 'final',
    motivo: 'La IA no devolvio un examen valido.',
    requestedCounts: questionCounts || null,
    requestedTotal: getRequestedQuestionCountTotal(questionCounts),
    totalDeTokensUsadosEnEsteExamen: totalUsage.total_tokens,
    usageAcumulada: totalUsage
  });
  throw buildHttpError(502, 'La IA no devolvio un examen valido.');
}

function detectBatchIdFromTemas(temas) {
  const batchIds = [...new Set(
    (temas || [])
      .map((t) => t.planeacion?.batch_id)
      .filter(Boolean)
  )];
  if (batchIds.length === 1) return batchIds[0];
  if (batchIds.length > 1) {
    throw buildHttpError(
      400,
      'No se puede generar un examen mezclando planeaciones de diferentes conjuntos.'
    );
  }
  return null;
}

// Resuelve una lista de IDs de planeacion a los IDs de tema asociados.
// Se usa porque la biblioteca selecciona por planeacion, no por tema.
async function resolveTemaIdsFromPlaneaciones(client, planeacionIds, userId) {
  const ids = Array.isArray(planeacionIds)
    ? [...new Set(planeacionIds.map(String).filter(Boolean))]
    : [];
  if (ids.length === 0) return [];

  const query = client
    .from('planeaciones')
    .select('id, tema_id')
    .in('id', ids);
  if (userId) query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) throw error;

  return [...new Set((data || []).map((p) => p.tema_id).filter(Boolean).map(String))];
}

// Resuelve, desde la tabla temas, a que unidad(es) pertenecen los IDs de tema
// recibidos. Es la defensa principal contra contexto cruzado entre unidades.
async function resolveUnidadIdsForTemas(client, temaIds) {
  const ids = Array.isArray(temaIds)
    ? [...new Set(temaIds.map(String).filter(Boolean))]
    : [];
  if (ids.length === 0) return { unidadIds: [], foundTemaIds: [] };

  const { data, error } = await client
    .from('temas')
    .select('id, unidad_id')
    .in('id', ids);
  if (error) throw error;

  const unidadIds = [...new Set((data || []).map((t) => t.unidad_id).filter(Boolean).map(String))];
  const foundTemaIds = (data || []).map((t) => String(t.id));
  return { unidadIds, foundTemaIds };
}

export async function generarExamenUnidad({
  supabaseClient,
  userId,
  unidadId,
  tiposPregunta,
  cantidadesPregunta,
  temaIds,
  planeacionIds,
  batchId
}) {
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  try {
    if (!normalizedUnidadId) {
      throw buildHttpError(400, 'unidad_id es requerido.');
    }

    const normalizedTypes = normalizeQuestionTypes(tiposPregunta);
    const normalizedQuestionCounts = normalizeQuestionCounts(cantidadesPregunta, normalizedTypes);
    if (!hasRequestedQuestionCounts(normalizedQuestionCounts)) {
      throw buildHttpError(400, 'Debes indicar una cantidad mayor a 0 para cada tipo de pregunta.');
    }

    // 1) Reunir los IDs de tema seleccionados: directos (dashboard) y/o
    //    derivados de las planeaciones seleccionadas (biblioteca).
    const directTemaIds = Array.isArray(temaIds) && temaIds.length > 0 ? temaIds.map(String) : [];
    const temaIdsFromPlaneaciones = await resolveTemaIdsFromPlaneaciones(client, planeacionIds, userId);
    const candidateTemaIds = [...new Set([...directTemaIds, ...temaIdsFromPlaneaciones])];

    // 2) Determinar la unidad real de la seleccion. El backend NO confia en el
    //    unidad_id del payload: si la seleccion pertenece a otra unidad (p. ej.
    //    el unidad_id viejo del batch), se autocorrige hacia la unidad real.
    let effectiveUnidadId = normalizedUnidadId;
    if (candidateTemaIds.length > 0) {
      const { unidadIds } = await resolveUnidadIdsForTemas(client, candidateTemaIds);

      if (unidadIds.length > 1) {
        throw buildHttpError(400, 'No se puede generar un examen mezclando temas de diferentes unidades.');
      }

      if (unidadIds.length === 1 && unidadIds[0] !== normalizedUnidadId) {
        console.warn('[examenes] unidad_id corregido: la seleccion pertenece a otra unidad', {
          expectedUnidadId: normalizedUnidadId,
          realUnidadId: unidadIds[0],
          candidateTemaIds
        });
        effectiveUnidadId = unidadIds[0];
      }
    }

    const contexto = await obtenerContextoUnidad(client, effectiveUnidadId);
    const allTemas = await fetchUnitTopics(client, effectiveUnidadId, userId);
    const temas = candidateTemaIds.length > 0
      ? allTemas.filter((tema) => candidateTemaIds.includes(String(tema.id)))
      : allTemas;

    // 3) Si hubo seleccion pero ningun tema pertenece a esta unidad, abortar en
    //    vez de caer silenciosamente a "todos los temas" (origen del bug).
    if (candidateTemaIds.length > 0 && temas.length === 0) {
      throw buildHttpError(400, 'Los temas seleccionados no pertenecen a esta unidad. Vuelve a seleccionarlos.');
    }

    console.info('[exam-debug] generarExamenUnidad.input', {
      unidadId: effectiveUnidadId,
      tiposPregunta: normalizedTypes,
      cantidadesPregunta: normalizedQuestionCounts,
      totalRequested: getRequestedQuestionCountTotal(normalizedQuestionCounts),
      temasContexto: Array.isArray(temas) ? temas.map((tema) => ({
        id: tema.id,
        titulo: tema.titulo,
        planeacionId: tema.planeacion?.id || null
      })) : []
    });

    const contextoTemas = buildContextoTemasSnapshot(temas);
    const totalPreguntas = getRequestedQuestionCountTotal(normalizedQuestionCounts);

    const resolvedBatchId = normalizeString(batchId) || detectBatchIdFromTemas(temas);
    if (resolvedBatchId) {
      console.info('[exam-debug] batch_id_detectado', { batchId: resolvedBatchId });
    } else {
      console.warn('[exam-debug] batch_id_no_detectado: examen se guardara sin batch_id');
    }

    const jobPayload = {
      user_id: userId,
      plantel_id: contexto.plantel?.id || null,
      grado_id: contexto.grado?.id || null,
      materia_id: contexto.materia?.id || null,
      unidad_id: effectiveUnidadId,
      titulo: `Examen de ${contexto.unidad?.nombre || 'unidad'}`,
      instrucciones: 'Lee cuidadosamente cada pregunta antes de responder.',
      tipos_pregunta: normalizedTypes,
      total_preguntas: totalPreguntas,
      contexto_temas: contextoTemas,
      configuracion: {
        tema_ids: temas.map((tema) => tema.id),
        total_preguntas: totalPreguntas,
        cantidades_pregunta: normalizedQuestionCounts,
        batch_id: resolvedBatchId || null
      },
      prompt_version: EXAM_PROMPT_VERSION,
      status: 'processing',
      progress_current: 0,
      progress_total: totalPreguntas,
      current_step: 'Preparando generacion del examen...',
      started_at: new Date().toISOString()
    };

    const { data: job, error: jobError } = await client
      .from('examen_generation_jobs')
      .insert([jobPayload])
      .select('*')
      .single();

    if (jobError) throw jobError;

    const generationItems = buildExamQuestionItems({
      temas,
      questionCounts: normalizedQuestionCounts
    }).map((item) => ({
      ...item,
      job_id: job.id,
      user_id: userId,
      status: 'pending',
      retry_count: 0,
      max_retries: EXAM_ITEM_MAX_RETRIES
    }));

    const { error: itemsError } = await client
      .from('examen_generation_items')
      .insert(generationItems);

    if (itemsError) throw itemsError;

    console.info('[exam-debug] examen_generation_job_creado', {
      jobId: job.id,
      unidadId: normalizedUnidadId,
      totalPreguntas,
      tiposPregunta: normalizedTypes
    });

    scheduleExamGenerationJob(job.id);

    return job;
  } catch (error) {
    console.error('[exam-debug] generarExamenUnidad.fallo', {
      unidadId: normalizedUnidadId || null,
      motivo: error?.message || 'Error desconocido al generar examen.',
      status: error?.status || 500
    });
    throw error;
  }
}

export async function obtenerEstadoGeneracionExamen({
  supabaseClient,
  userId,
  jobId
}) {
  const client = getClient(supabaseClient);
  const normalizedJobId = normalizeString(jobId);

  if (!normalizedJobId) {
    throw buildHttpError(400, 'jobId es requerido.');
  }

  const job = await fetchGenerationJob(client, normalizedJobId, userId);

  return {
    ok: true,
    job_id: job.id,
    status: job.status,
    progress_current: Number(job.progress_current || 0),
    progress_total: Number(job.progress_total || 0),
    current_step: job.current_step || '',
    examen_id: job.examen_id || null,
    error_message: job.status === 'failed'
      ? EXAM_GENERIC_FAILURE_MESSAGE
      : (job.error_message || null)
  };
}

export async function listarExamenesPorUnidad({
  supabaseClient,
  userId,
  unidadId
}) {
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  if (!normalizedUnidadId) {
    throw buildHttpError(400, 'unidad_id es requerido.');
  }

  const query = client
    .from('examenes')
    .select('id, unidad_id, titulo, tipos_pregunta, total_preguntas, status, created_at, updated_at, prompt_version')
    .eq('unidad_id', normalizedUnidadId)
    .order('created_at', { ascending: false });

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function eliminarExamen({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!userId) throw buildHttpError(401, 'Usuario requerido.');
  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  const { data: examen, error: fetchError } = await client
    .from('examenes')
    .select('id')
    .eq('id', normalizedId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!examen) throw buildHttpError(404, 'Examen no encontrado.');

  const { error: deleteError } = await client
    .from('examenes')
    .delete()
    .eq('id', normalizedId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  return { ok: true };
}

export async function obtenerExamenPorId({
  supabaseClient,
  userId,
  id
}) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!normalizedId) {
    throw buildHttpError(400, 'id es requerido.');
  }

  const query = client
    .from('examenes')
    .select('*')
    .eq('id', normalizedId);

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) {
    throw buildHttpError(404, 'Examen no encontrado');
  }

  return data;
}
