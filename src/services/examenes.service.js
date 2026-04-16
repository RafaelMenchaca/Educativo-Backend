import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { buildExamPromptByUnit } from '../utils/buildExamPromptByUnit.js';
import { obtenerContextoUnidad } from './jerarquia.service.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const OPENAI_EXAM_SYSTEM_PROMPT =
  'Actua como un docente experto en evaluacion por competencias. Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';
const EXAM_PROMPT_VERSION = 'v8_unit_exam_counts_by_type_completion';
const EXAM_MIN_OUTPUT_TOKENS = 3200;
const EXAM_MAX_OUTPUT_TOKENS = 6800;
const EXAM_GENERATION_ATTEMPTS = 2;
const EXAM_RETRY_TOKEN_STEP = 800;
const EXAM_ATTEMPT_TIMEOUT_MS = 90000;
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
    .select('id, tema_id, tabla_ia, status, updated_at, is_archived')
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
    const respuestaCorrecta = pickFirstString(
      question.respuesta_correcta,
      question.correcta,
      question.respuesta,
      question.opcion_correcta,
      question.answer
    );
    if (opciones.length < 2 || !respuestaCorrecta) {
      throw buildHttpError(502, `La pregunta ${index + 1} de opcion multiple requiere opciones y respuesta_correcta.`);
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
    temperature: 0.1
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
    temperature: index === 0 ? 0.2 : 0.1
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

export async function generarExamenUnidad({
  supabaseClient,
  userId,
  unidadId,
  tiposPregunta,
  cantidadesPregunta
}) {
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  try {
    if (!normalizedUnidadId) {
      throw buildHttpError(400, 'unidad_id es requerido.');
    }

    const normalizedTypes = normalizeQuestionTypes(tiposPregunta);
    const normalizedQuestionCounts = normalizeQuestionCounts(cantidadesPregunta, normalizedTypes);
    const contexto = await obtenerContextoUnidad(client, normalizedUnidadId);
    const temas = await fetchUnitTopics(client, normalizedUnidadId, userId);
    console.info('[exam-debug] generarExamenUnidad.input', {
      unidadId: normalizedUnidadId,
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
    const promptTemasContext = buildPromptTopicsContext(temas);
    const questionPlan = buildQuestionPlan(normalizedTypes, normalizedQuestionCounts);
    const generationResult = await generateExamWithIa({
      contexto,
      tiposPregunta: normalizedTypes,
      temasContexto: promptTemasContext,
      questionPlan,
      questionCounts: normalizedQuestionCounts
    });
    const examenIa = generationResult?.examen || generationResult;
    const generationUsage = generationResult?.usage || createUsageAccumulator();
    const actualQuestionCount = Array.isArray(examenIa?.preguntas) ? examenIa.preguntas.length : 0;
    const examenIaPersisted = {
      ...examenIa,
      configuracion: {
        total_preguntas: actualQuestionCount,
        cantidades_pregunta: normalizedQuestionCounts,
        tema_ids: temas.map((tema) => tema.id)
      }
    };

    console.info('[exam-debug] examen_generado_con_exito', {
      mensaje: 'Examen generado con exito antes de guardar en base de datos.',
      titulo: examenIa.titulo,
      totalPreguntas: actualQuestionCount,
      distribucion: buildQuestionTypeCountObject(examenIa?.preguntas || []),
      preguntasCreadas: buildQuestionDebugList(examenIa?.preguntas || []),
      totalDeTokensUsadosEnEsteExamen: generationUsage.total_tokens,
      usageAcumulada: generationUsage
    });

    const insertPayload = {
      user_id: userId,
      plantel_id: contexto.plantel?.id || null,
      grado_id: contexto.grado?.id || null,
      materia_id: contexto.materia?.id || null,
      unidad_id: normalizedUnidadId,
      titulo: examenIa.titulo,
      instrucciones: examenIa.instrucciones_generales,
      tipos_pregunta: normalizedTypes,
      total_preguntas: actualQuestionCount,
      contexto_temas: contextoTemas,
      examen_ia: examenIaPersisted,
      prompt_version: EXAM_PROMPT_VERSION,
      status: 'generado'
    };

    const { data, error } = await client
      .from('examenes')
      .insert([insertPayload])
      .select('*')
      .single();

    if (error) throw error;

    console.info('[exam-debug] examen_creado_con_exito', {
      mensaje: 'Examen creado con exito en base de datos.',
      examenId: data?.id || null,
      unidadId: normalizedUnidadId,
      titulo: data?.titulo || examenIa.titulo,
      totalPreguntas: data?.total_preguntas || actualQuestionCount,
      distribucion: buildQuestionTypeCountObject(examenIa?.preguntas || []),
      totalDeTokensUsadosEnEsteExamen: generationUsage.total_tokens,
      usageAcumulada: generationUsage
    });

    return data;
  } catch (error) {
    console.error('[exam-debug] generarExamenUnidad.fallo', {
      unidadId: normalizedUnidadId || null,
      motivo: error?.message || 'Error desconocido al generar examen.',
      status: error?.status || 500
    });
    throw error;
  }
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
