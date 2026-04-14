import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { buildExamPromptByUnit } from '../utils/buildExamPromptByUnit.js';
import { obtenerContextoUnidad } from './jerarquia.service.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const OPENAI_EXAM_SYSTEM_PROMPT =
  'Actua como un docente experto en evaluacion por competencias. Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';
const EXAM_PROMPT_VERSION = 'v6_unit_exam_no_total_rules';
const EXAM_MIN_OUTPUT_TOKENS = 2600;
const EXAM_MAX_OUTPUT_TOKENS = 5200;
const EXAM_GENERATION_ATTEMPTS = 2;
const EXAM_RETRY_TOKEN_STEP = 600;
const EXAM_ATTEMPT_TIMEOUT_MS = 60000;
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
    countRange: '10 a 15 preguntas',
    timeGuide: '1 minuto por item',
    weight: 64
  },
  verdadero_falso: {
    label: 'Verdadero/Falso',
    countRange: '5 a 8 preguntas',
    timeGuide: '1 minuto por item',
    weight: 24
  },
  respuesta_corta: {
    label: 'Respuesta corta / completar',
    countRange: '3 a 5 preguntas',
    timeGuide: '2 a 3 minutos por item',
    weight: 16
  },
  emparejamiento: {
    label: 'Emparejamiento / relacion de columnas',
    countRange: '1 a 2 bloques',
    timeGuide: '5 minutos por bloque',
    weight: 8
  },
  pregunta_abierta: {
    label: 'Pregunta abierta / ensayo',
    countRange: '1 a 2 preguntas',
    timeGuide: '10 a 15 minutos por item',
    weight: 12
  },
  calculo_numerico: {
    label: 'Calculo / numerica',
    countRange: '2 a 4 problemas',
    timeGuide: '5 a 10 minutos por item',
    weight: 16
  },
  ordenacion_jerarquizacion: {
    label: 'Ordenacion / jerarquizacion',
    countRange: '1 a 2 ejercicios',
    timeGuide: '2 a 3 minutos por item',
    weight: 8
  }
};
const DEFAULT_EXAM_TIEMPO_MIN = 50;
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

function validateTiempoMin(tiempoMin) {
  const parsed = Number.parseInt(tiempoMin, 10);
  if (!Number.isInteger(parsed) || parsed < 10) {
    return DEFAULT_EXAM_TIEMPO_MIN;
  }

  return parsed;
}

function buildQuestionPlan(tiposPregunta) {
  const selected = Array.isArray(tiposPregunta) ? tiposPregunta : [];

  const items = selected.map((tipo) => {
    const config = QUESTION_TYPE_PLAN[tipo];
    return {
      tipo,
      label: config?.label || tipo,
      countRange: config?.countRange || 'Cantidad variable',
      timeGuide: config?.timeGuide || 'Tiempo variable'
    };
  });

  return {
    items
  };
}

function estimateExamOutputTokens(questionPlan) {
  const items = Array.isArray(questionPlan?.items) ? questionPlan.items : [];
  const estimate = items.reduce((sum, item) => {
    const weight = Number(QUESTION_TYPE_OUTPUT_WEIGHT[item?.tipo] || 60);
    return sum + weight;
  }, 450);

  return Math.max(EXAM_MIN_OUTPUT_TOKENS, Math.min(Math.ceil(estimate), EXAM_MAX_OUTPUT_TOKENS));
}

function buildExamRetryPrompt(basePrompt, feedback) {
  const details = normalizeString(feedback) || 'El intento anterior devolvio JSON incompleto o invalido.';

  return `${basePrompt}

CORRECCION OBLIGATORIA DEL NUEVO INTENTO:
- El intento anterior fallo por: ${details}
- Regenera TODO el examen desde cero.
- Debes incluir al menos una pregunta por cada tipo seleccionado.
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

function validateEmparejamientoPairs(question, index) {
  if (!Array.isArray(question.pares) || question.pares.length < 2) {
    throw buildHttpError(502, `La pregunta ${index + 1} de emparejamiento requiere al menos 2 pares.`);
  }

  const pairs = question.pares.map((pair, pairIndex) => {
    if (!pair || typeof pair !== 'object' || Array.isArray(pair)) {
      throw buildHttpError(502, `La pregunta ${index + 1} contiene un par invalido en la posicion ${pairIndex + 1}.`);
    }

    const lado_a = normalizeString(pair.lado_a);
    const lado_b = normalizeString(pair.lado_b);

    if (!lado_a || !lado_b) {
      throw buildHttpError(502, `La pregunta ${index + 1} contiene un par incompleto en la posicion ${pairIndex + 1}.`);
    }

    return { lado_a, lado_b };
  });

  return pairs;
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

function validateExamPayload(examen, selectedTypes) {
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
  const usedTypes = new Set(normalizedQuestions.map((question) => question.tipo));

  selectedTypes.forEach((tipo) => {
    if (!usedTypes.has(tipo)) {
      throw buildHttpError(502, `El examen generado no incluyo una pregunta del tipo ${tipo}.`);
    }
  });

  return {
    titulo,
    instrucciones_generales: instrucciones,
    preguntas: normalizedQuestions
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

function buildExamValidationFeedback(examen, error) {
  const baseMessage = normalizeString(error?.message) || 'El examen generado no cumplio la estructura requerida.';
  const actualQuestions = Array.isArray(examen?.preguntas) ? examen.preguntas : [];
  const actualDistribution = summarizeQuestionTypeCounts(actualQuestions);

  return [baseMessage, actualDistribution ? `Distribucion actual: ${actualDistribution}.` : '']
    .filter(Boolean)
    .join(' ');
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
  tiempoMin,
  questionPlan
}) {
  const prompt = buildExamPromptByUnit({
    plantel: contexto.plantel?.nombre || '',
    grado: contexto.grado?.grado_nombre || contexto.grado?.nombre || contexto.grado?.nivel_base || '',
    materia: contexto.materia?.nombre || '',
    unidad: contexto.unidad?.nombre || '',
    tiposPregunta,
    temasContexto,
    questionPlan,
    tiempoMin
  });
  const estimatedTokens = estimateExamOutputTokens(questionPlan);
  const attempts = Array.from({ length: EXAM_GENERATION_ATTEMPTS }, (_, index) => ({
    maxTokens: Math.min(estimatedTokens + (index * EXAM_RETRY_TOKEN_STEP), EXAM_MAX_OUTPUT_TOKENS),
    temperature: index === 0 ? 0.2 : 0.1
  }));

  let lastMessage = '';
  let lastValidationMessage = '';

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const promptForAttempt = index === 0
      ? prompt
      : buildExamRetryPrompt(prompt, lastValidationMessage);
    const completion = await requestExamCompletion({
      prompt: promptForAttempt,
      maxTokens: attempt.maxTokens,
      temperature: attempt.temperature
    });

    const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
    const finishReason = completion.choices?.[0]?.finish_reason || '';
    lastMessage = rawText;
    const parsed = parseExamJson(rawText);

    if (!parsed) {
      lastValidationMessage = finishReason === 'length'
        ? 'La respuesta se corto por limite de salida.'
        : 'La respuesta no se pudo interpretar como JSON valido.';
      continue;
    }

    try {
      return validateExamPayload(parsed, tiposPregunta);
    } catch (error) {
      lastValidationMessage = buildExamValidationFeedback(parsed, error);
      if (index === attempts.length - 1) {
        throw error;
      }
    }
  }

  console.error('[exam-debug] respuesta IA invalida', lastMessage);
  throw buildHttpError(502, 'La IA no devolvio un examen valido.');
}

export async function generarExamenUnidad({
  supabaseClient,
  userId,
  unidadId,
  tiposPregunta,
  tiempoMin
}) {
  const client = getClient(supabaseClient);
  const normalizedUnidadId = normalizeString(unidadId);

  if (!normalizedUnidadId) {
    throw buildHttpError(400, 'unidad_id es requerido.');
  }

  const normalizedTypes = normalizeQuestionTypes(tiposPregunta);
  const normalizedTiempoMin = validateTiempoMin(tiempoMin);
  const contexto = await obtenerContextoUnidad(client, normalizedUnidadId);
  const temas = await fetchUnitTopics(client, normalizedUnidadId, userId);
  const contextoTemas = buildContextoTemasSnapshot(temas);
  const promptTemasContext = buildPromptTopicsContext(temas);
  const questionPlan = buildQuestionPlan(normalizedTypes);
  const examenIa = await generateExamWithIa({
    contexto,
    tiposPregunta: normalizedTypes,
    temasContexto: promptTemasContext,
    tiempoMin: normalizedTiempoMin,
    questionPlan
  });
  const actualQuestionCount = Array.isArray(examenIa?.preguntas) ? examenIa.preguntas.length : 0;
  const examenIaPersisted = {
    ...examenIa,
    configuracion: {
      tiempo_min: normalizedTiempoMin,
      total_preguntas: actualQuestionCount,
      tema_ids: temas.map((tema) => tema.id)
    }
  };

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
  return data;
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
