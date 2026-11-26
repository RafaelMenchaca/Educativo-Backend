import { supabaseAdmin } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { createAiJob, finishAiJob, failAiJob, logAiCall } from './aiMetrics.service.js';
import { esTipoCuadernillo } from '../domain/cuadernillos.js';
import {
  CuadernilloV2GenerationError,
  generarCuadernilloV2
} from './cuadernilloV2.engine.js';
import {
  CuadernilloV3GenerationError,
  generarCuadernilloV3
} from './cuadernilloV3.engine.js';
import {
  buildCuadernilloV3RequestMetadata,
  classifyOpenAIProviderError,
  CuadernilloV3ProviderError,
  validateOpenAiStructuredOutputSchema
} from './cuadernilloV3.provider.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ANEXOS_SYSTEM_PROMPT =
  'Eres un asistente experto en diseño de materiales educativos para estudiantes. ' +
  'Tu tarea es generar anexos de trabajo para alumnos a partir de una planeacion docente ya existente. ' +
  'No debes crear una nueva planeacion. No debes cambiar el tema. No debes inventar actividades desconectadas. ' +
  'Debes convertir las actividades de la planeacion en materiales concretos para que los estudiantes puedan trabajar. ' +
  'Los anexos deben ser solo texto. No incluyas imagenes. No incluyas glosario. ' +
  'No incluyas informacion tecnica, JSON visible, tokens, prompt, ni notas para desarrolladores. ' +
  'El resultado debe ser claro, util, conciso y listo para entregar a estudiantes. ' +
  'Responde solo con JSON valido, sin markdown, sin backticks y sin texto adicional.';

const ANEXOS_PROMPT_VERSION = 'v1_anexos_desde_planeacion';
const ANEXOS_TIMEOUT_MS = 90000;
const CUADERNILLO_V2_PROMPT_VERSION = 'v2_cuadernillo_segmentado';
const CUADERNILLO_V3_PROMPT_VERSION = 'v3_cuadernillo_academico_tipado';
const CUADERNILLO_V2_MODEL = 'gpt-4o-mini';
const CUADERNILLO_V2_TEMPERATURE = 0.3;
const CUADERNILLO_V2_MAX_TOKENS = 3000;
const CUADERNILLO_V2_TIMEOUT_MS = 90000;
export const CUADERNILLO_V3_DEFAULT_MODEL = 'gpt-6-luna';
export const CUADERNILLO_V3_ALLOWED_MODELS = Object.freeze(['gpt-6-luna']);
const CUADERNILLO_V3_REASONING_EFFORT = 'low';
const CUADERNILLO_V3_MAX_COMPLETION_TOKENS = 5000;
const CUADERNILLO_V3_TIMEOUT_MS = 120000;

export function resolveCuadernilloV3Model(env = process.env) {
  const configured = Object.hasOwn(env, 'OPENAI_CUADERNILLO_V3_MODEL')
    ? normalizeString(env.OPENAI_CUADERNILLO_V3_MODEL)
    : CUADERNILLO_V3_DEFAULT_MODEL;
  if (!configured || !CUADERNILLO_V3_ALLOWED_MODELS.includes(configured)) {
    throw buildHttpError(500, 'Configuracion de modelo v3 invalida.', 'cuadernillo_v3_modelo_invalido');
  }
  return configured;
}

function buildHttpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function getClient(supabaseClient) {
  return supabaseClient || supabaseAdmin;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeParseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getSchemaVersion(anexo) {
  if (!anexo?.tipo_cuadernillo) return null;
  const declared = Number(anexo?.contenido?.schema_version ?? anexo?.schema_version);
  if ([2, 3].includes(declared)) return declared;
  return anexo?.prompt_version === CUADERNILLO_V3_PROMPT_VERSION ? 3 : 2;
}

function withVersionSummary(anexo) {
  if (!anexo) return anexo;
  return {
    ...anexo,
    tipo_cuadernillo: anexo.tipo_cuadernillo ?? null,
    schema_version: getSchemaVersion(anexo)
  };
}

function formatTablaIa(tablaIa) {
  if (!Array.isArray(tablaIa) || tablaIa.length === 0) return 'Sin tabla disponible.';
  return tablaIa
    .map((row) => {
      const momento = normalizeString(row?.tiempo_sesion || row?.momento || '');
      const actividad = normalizeString(row?.actividades || row?.actividad || '');
      const estrategia = normalizeString(row?.estrategia || '');
      const recursos = normalizeString(row?.recursos || '');
      const parts = [
        momento ? `Momento: ${momento}` : '',
        actividad ? `Actividad: ${actividad}` : '',
        estrategia ? `Estrategia: ${estrategia}` : '',
        recursos ? `Recursos: ${recursos}` : ''
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .filter(Boolean)
    .join('\n');
}

function formatActividadesMomentos(actividadesMomentos) {
  if (!actividadesMomentos || typeof actividadesMomentos !== 'object') return 'Sin actividades disponibles.';
  const LABELS = {
    conocimientos_previos: 'Conocimientos previos',
    desarrollo: 'Desarrollo',
    cierre: 'Cierre'
  };
  return Object.entries(actividadesMomentos)
    .filter(([key, val]) => LABELS[key] && normalizeString(val))
    .map(([key, val]) => `- ${LABELS[key]}: ${normalizeString(val)}`)
    .join('\n') || 'Sin actividades disponibles.';
}

function buildAnexosUserPrompt({ nivel, materia, tema, duracion, tablaIa, actividadesMomentos }) {
  const tablaTexto = formatTablaIa(tablaIa);
  const actividadesTexto = formatActividadesMomentos(actividadesMomentos);

  return `Genera anexos para estudiantes tomando como base la siguiente planeacion.

Datos de la planeacion:
Nivel: ${nivel || 'No especificado'}
Materia: ${materia || 'No especificada'}
Tema: ${tema || 'No especificado'}
Duracion: ${duracion ? `${duracion} minutos` : 'No especificada'}

Tabla de planeacion:
${tablaTexto}

Actividades por momentos:
${actividadesTexto}

Instrucciones:
- Genera entre 3 y 5 anexos.
- Cada anexo debe tener titulo, instrucciones y contenido.
- Los anexos deben servir directamente para realizar las actividades de la planeacion.
- Si la planeacion incluye reflexion inicial, crea preguntas o situaciones de analisis.
- Si la planeacion incluye lectura, caso o explicacion, crea una lectura breve de apoyo.
- Si la planeacion incluye analisis, crea preguntas, tabla o ejercicios.
- Si la planeacion incluye trabajo colaborativo, crea preguntas para equipo.
- Si la planeacion incluye producto final, crea una guia breve y concisa para elaborarlo.
- No incluyas glosario.
- No incluyas imagenes.
- No repitas informacion innecesaria.
- Usa lenguaje adecuado para el nivel educativo.
- Devuelve unicamente JSON valido con el formato obligatorio.

Formato obligatorio:
{
  "titulo_general": "string",
  "descripcion": "string",
  "anexos": [
    {
      "numero": 1,
      "titulo": "string",
      "tipo": "reflexion | lectura | analisis | tabla | colaborativo | producto_final | ejercicio",
      "instrucciones": "string",
      "contenido": [
        {
          "subtitulo": "string",
          "texto": "string",
          "preguntas": ["string"]
        }
      ],
      "tabla": {
        "columnas": ["string"],
        "filas": [["string"]]
      }
    }
  ]
}`;
}

function parseAnexosJson(rawText) {
  const candidates = [
    rawText.trim(),
    rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || '',
    rawText.match(/\{[\s\S]*\}/)?.[0] || ''
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function validateAnexosPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw buildHttpError(502, 'La IA no devolvio un JSON valido.');
  }
  if (!normalizeString(payload.titulo_general)) {
    throw buildHttpError(502, 'El JSON no contiene titulo_general.');
  }
  if (!Array.isArray(payload.anexos)) {
    throw buildHttpError(502, 'El campo anexos debe ser un arreglo.');
  }
  if (payload.anexos.length < 3 || payload.anexos.length > 5) {
    throw buildHttpError(502, `Se esperaban entre 3 y 5 anexos, se recibieron ${payload.anexos.length}.`);
  }
  for (const anexo of payload.anexos) {
    if (typeof anexo.numero !== 'number') {
      throw buildHttpError(502, 'Cada anexo debe tener un campo numero numerico.');
    }
    if (!normalizeString(anexo.titulo)) {
      throw buildHttpError(502, 'Cada anexo debe tener titulo.');
    }
    if (!normalizeString(anexo.tipo)) {
      throw buildHttpError(502, 'Cada anexo debe tener tipo.');
    }
    if (!normalizeString(anexo.instrucciones)) {
      throw buildHttpError(502, 'Cada anexo debe tener instrucciones.');
    }
    if (anexo.tabla) {
      if (!Array.isArray(anexo.tabla.columnas) || !Array.isArray(anexo.tabla.filas)) {
        throw buildHttpError(502, 'El campo tabla debe tener columnas y filas.');
      }
    }
  }
  return payload;
}

async function generateAnexosWithIa({ nivel, materia, tema, duracion, tablaIa, actividadesMomentos, jobId = null, userId = null }) {
  const userPrompt = buildAnexosUserPrompt({ nivel, materia, tema, duracion, tablaIa, actividadesMomentos });

  const callStart = Date.now();
  const completion = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ANEXOS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 3000
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(buildHttpError(504, 'La generacion de IA tardo demasiado.')), ANEXOS_TIMEOUT_MS)
    )
  ]);
  const callDurationMs = Date.now() - callStart;

  const rawText = completion.choices?.[0]?.message?.content || '';
  const tokensPrompt = completion.usage?.prompt_tokens ?? null;
  const tokensCompletion = completion.usage?.completion_tokens ?? null;
  const tokensTotal = completion.usage?.total_tokens ?? null;

  const parsed = parseAnexosJson(rawText);
  const validated = validateAnexosPayload(parsed);

  if (jobId && userId) {
    logAiCall({
      jobId,
      userId,
      artifactType:  'anexo',
      callPurpose:   'main_generation',
      model:         'gpt-4o-mini',
      promptVersion: ANEXOS_PROMPT_VERSION,
      usage:         completion.usage,
      status:        'success',
      jsonOk:        Boolean(parsed),
      durationMs:    callDurationMs,
      metadata:      {
        tema,
        anexos_count: Array.isArray(validated?.anexos) ? validated.anexos.length : 0
      }
    }).catch((err) => console.error('[aiMetrics] anexos logAiCall failed:', err?.message));
  }

  return { contenido: validated, tokensPrompt, tokensCompletion, tokensTotal };
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(buildHttpError(504, 'La generacion de IA tardo demasiado.')),
          timeoutMs
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createCuadernilloV2Completer({
  jobId,
  userId,
  tipoCuadernillo,
  openaiClient = openai,
  logCall = logAiCall
}) {
  return async ({ systemPrompt, userPrompt, segmento, intento, schemaVersion = 2 }) => {
    const callStart = Date.now();
    const completion = await withTimeout(
      openaiClient.chat.completions.create({
        model: CUADERNILLO_V2_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: CUADERNILLO_V2_TEMPERATURE,
        max_tokens: CUADERNILLO_V2_MAX_TOKENS
      }),
      CUADERNILLO_V2_TIMEOUT_MS
    );
    const durationMs = Date.now() - callStart;
    const content = completion.choices?.[0]?.message?.content || '';
    const finishReason = completion.choices?.[0]?.finish_reason || null;

    if (jobId && userId) {
      logCall({
        jobId,
        userId,
        artifactType: 'anexo',
        callPurpose: 'workbook_segment',
        model: CUADERNILLO_V2_MODEL,
        promptVersion: schemaVersion === 3 ? CUADERNILLO_V3_PROMPT_VERSION : CUADERNILLO_V2_PROMPT_VERSION,
        usage: completion.usage,
        status: 'success',
        jsonOk: Boolean(content),
        retryNumber: Math.max(0, Number(intento || 1) - 1),
        durationMs,
        metadata: {
          tipo_cuadernillo: tipoCuadernillo,
          segmento: segmento?.id || null,
          finish_reason: finishReason
        }
      }).catch((err) => console.error('[aiMetrics] cuadernillo logAiCall failed:', err?.message));
    }

    return { content, usage: completion.usage || {}, durationMs, finishReason };
  };
}

export function createCuadernilloV3Completer({
  jobId,
  userId,
  tipoCuadernillo,
  openaiClient = openai,
  logCall = logAiCall,
  env = process.env,
  diagnosticar = null
}) {
  const model = resolveCuadernilloV3Model(env);
  return async ({ systemPrompt, userPrompt, jsonSchema, segmento, segmentoIndice, slots, intento }) => {
    const schemaName = 'cuadernillo_v3_slots';
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema: jsonSchema }
      },
      reasoning_effort: CUADERNILLO_V3_REASONING_EFFORT,
      max_completion_tokens: CUADERNILLO_V3_MAX_COMPLETION_TOKENS
    };
    const requestMetadata = buildCuadernilloV3RequestMetadata({
      model, reasoningEffort: CUADERNILLO_V3_REASONING_EFFORT, body,
      timeoutMs: CUADERNILLO_V3_TIMEOUT_MS, schemaName, slots, segmento
    });
    const eventBase = {
      tipoCuadernillo,
      segmentoId: requestMetadata.segmentId,
      segmentoIndice: segmentoIndice ?? null,
      intento,
      model: requestMetadata.model,
      reasoningEffort: requestMetadata.reasoningEffort,
      hasTemperature: requestMetadata.hasTemperature,
      maxCompletionTokens: requestMetadata.maxCompletionTokens,
      responseFormatType: requestMetadata.responseFormatType,
      schemaName: requestMetadata.schemaName,
      slotsSolicitados: requestMetadata.slotCount,
      timeoutMs: requestMetadata.timeoutMs
    };
    const emit = (payload) => {
      try { diagnosticar?.(Object.freeze(payload)); } catch { /* non-blocking observability */ }
    };
    const callStart = Date.now();
    let completion;
    try {
      validateOpenAiStructuredOutputSchema(jsonSchema);
      emit({ eventType: 'completion_request', ...eventBase });
      completion = await openaiClient.chat.completions.create(body, { timeout: CUADERNILLO_V3_TIMEOUT_MS });
    } catch (error) {
      const safe = classifyOpenAIProviderError(error, error?.stage || 'provider_request');
      emit({ eventType: 'completion_error', ...eventBase, ...safe, durationMs: Date.now() - callStart });
      if (error instanceof CuadernilloV3ProviderError) throw error;
      throw new CuadernilloV3ProviderError(safe.stage, safe, error);
    }
    const durationMs = Date.now() - callStart;
    const message = completion.choices?.[0]?.message || {};
    const content = message.content || '';
    const refusal = normalizeString(message.refusal) || null;
    const finishReason = completion.choices?.[0]?.finish_reason || null;
    if (jobId && userId) {
      logCall({
        jobId, userId, artifactType: 'anexo', callPurpose: 'workbook_segment', model,
        promptVersion: CUADERNILLO_V3_PROMPT_VERSION, usage: completion.usage,
        status: refusal || !content ? 'error' : 'success', jsonOk: Boolean(content),
        retryNumber: Math.max(0, Number(intento || 1) - 1), durationMs,
        metadata: {
          tipo_cuadernillo: tipoCuadernillo,
          segmento: segmento?.id || null,
          finish_reason: finishReason,
          reasoning_effort: CUADERNILLO_V3_REASONING_EFFORT,
          tokens_reasoning: Number(completion.usage?.completion_tokens_details?.reasoning_tokens || 0) || 0
        }
      }).catch((err) => console.error('[aiMetrics] cuadernillo v3 logAiCall failed:', err?.message));
    }
    return { content, usage: completion.usage || {}, durationMs, finishReason, refusal };
  };
}

function logCuadernilloV2Diagnostic(diagnostic) {
  const event = diagnostic?.eventType || 'structural_failure';
  const method = event === 'segment_slots_validated' ? 'info' : 'warn';
  console[method](`[anexos] cuadernillo_v2:${event}`, diagnostic);
}

function logCuadernilloV3Diagnostic(diagnostic) {
  const event = diagnostic?.eventType || 'structural_failure';
  const method = ['segment_slots_validated', 'completion_request'].includes(event) ? 'info' : 'warn';
  console[method](`[anexos] cuadernillo_v3:${event}`, diagnostic);
}

function buildTrustedV2Context(planeacion, tablaIa, actividadesMomentos) {
  return {
    materia: normalizeString(planeacion.materia),
    nivel: normalizeString(planeacion.nivel),
    tema: normalizeString(planeacion.tema),
    duracion: planeacion.duracion,
    tabla_ia: tablaIa,
    actividades_momentos: actividadesMomentos,
    datos_generales: {}
  };
}

function buildTrustedV3Context(planeacion, tablaIa, actividadesMomentos) {
  return {
    ...buildTrustedV2Context(planeacion, tablaIa, actividadesMomentos),
    unidad: planeacion.unidad == null ? '' : String(planeacion.unidad).trim(),
    subtema: normalizeString(planeacion.subtema),
    titulo: normalizeString(planeacion.custom_title),
    actividad_cierre: normalizeString(planeacion.actividad_cierre)
  };
}

async function generateV2Content({
  planeacion,
  tablaIa,
  actividadesMomentos,
  tipoCuadernillo,
  completar,
  jobId,
  userId,
  logCall
}) {
  try {
    const result = await generarCuadernilloV2({
      tipoCuadernillo,
      contextoPlaneacion: buildTrustedV2Context(planeacion, tablaIa, actividadesMomentos),
      diagnosticar: logCuadernilloV2Diagnostic,
      completar: completar || createCuadernilloV2Completer({
        jobId,
        userId,
        tipoCuadernillo,
        logCall
      })
    });
    return {
      contenido: result.contenido,
      tokensPrompt: result.metricas.tokensPrompt,
      tokensCompletion: result.metricas.tokensCompletion,
      tokensTotal: result.metricas.tokensTotal,
      metricasV2: result.metricas
    };
  } catch (error) {
    if (error instanceof CuadernilloV2GenerationError) {
      const safeError = buildHttpError(502, 'No se pudo generar un cuadernillo valido.', 'cuadernillo_v2_invalido');
      safeError.structuralCause = {
        code: error.code,
        segmentId: error.segmentId,
        path: error.path,
        diagnostics: error.diagnostics
      };
      throw safeError;
    }
    throw error;
  }
}

async function generateV3Content({
  planeacion,
  tablaIa,
  actividadesMomentos,
  tipoCuadernillo,
  completar,
  jobId,
  userId,
  logCall
}) {
  try {
    const model = resolveCuadernilloV3Model();
    const result = await generarCuadernilloV3({
      tipoCuadernillo,
      contextoPlaneacion: buildTrustedV3Context(planeacion, tablaIa, actividadesMomentos),
      diagnosticar: logCuadernilloV3Diagnostic,
      modelo: model,
      completar: completar || createCuadernilloV3Completer({
        jobId, userId, tipoCuadernillo, logCall, diagnosticar: logCuadernilloV3Diagnostic
      })
    });
    return {
      contenido: result.contenido,
      tokensPrompt: result.metricas.tokensPrompt,
      tokensCompletion: result.metricas.tokensCompletion,
      tokensTotal: result.metricas.tokensTotal,
      metricasV2: result.metricas
    };
  } catch (error) {
    if (error instanceof CuadernilloV3GenerationError) {
      const safeError = buildHttpError(502, 'No se pudo generar un cuadernillo valido.', 'cuadernillo_v3_invalido');
      safeError.structuralCause = {
        code: error.code,
        segmentId: error.segmentId,
        path: error.path,
        diagnostics: error.diagnostics
      };
      throw safeError;
    }
    throw error;
  }
}

async function generateContentByVersion({
  planeacion,
  tablaIa,
  actividadesMomentos,
  tipoCuadernillo,
  schemaVersion = tipoCuadernillo ? 3 : 1,
  completarV2,
  generarV1,
  jobId,
  userId,
  logCall
}) {
  if (tipoCuadernillo) {
    const generateTyped = schemaVersion === 2 ? generateV2Content : schemaVersion === 3 ? generateV3Content : null;
    if (!generateTyped) throw buildHttpError(500, 'El anexo tiene una version no valida.', 'schema_version_persistida_invalida');
    return generateTyped({
      planeacion,
      tablaIa,
      actividadesMomentos,
      tipoCuadernillo,
      completar: completarV2,
      jobId,
      userId,
      logCall
    });
  }
  return generarV1({
    nivel: normalizeString(planeacion.nivel),
    materia: normalizeString(planeacion.materia),
    tema: normalizeString(planeacion.tema),
    duracion: planeacion.duracion || null,
    tablaIa,
    actividadesMomentos,
    jobId,
    userId
  });
}

export async function generarAnexo({
  supabaseClient,
  userId,
  planeacionId,
  tipoCuadernillo = null,
  completarV2 = null,
  generarV1 = generateAnexosWithIa,
  metricas = { createAiJob, finishAiJob, failAiJob, logAiCall }
}) {
  const startedAt = Date.now();
  const client = getClient(supabaseClient);
  const normalizedPlaneacionId = String(planeacionId || '').trim();

  if (!normalizedPlaneacionId) {
    throw buildHttpError(400, 'planeacion_id es requerido.');
  }
  if (tipoCuadernillo !== null && !esTipoCuadernillo(tipoCuadernillo)) {
    throw buildHttpError(400, 'tipo_cuadernillo no es valido.', 'tipo_cuadernillo_invalido');
  }

  console.info('[anexos] generate:start', { planeacionId: normalizedPlaneacionId });

  // Fetch planeacion validando que pertenezca al usuario
  const planeacionQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tema, subtema, materia, nivel, unidad, custom_title, duracion, actividad_cierre, tabla_ia, actividades_momentos')
    .eq('id', normalizedPlaneacionId);

  if (userId) {
    planeacionQuery.eq('user_id', userId);
  }

  const { data: planeacion, error: planeacionError } = await planeacionQuery.maybeSingle();
  if (planeacionError) throw planeacionError;
  if (!planeacion) throw buildHttpError(404, 'Planeacion no encontrada.');

  // Verificar si ya existe un anexo para esta planeacion
  const existingQuery = client
    .from('anexos')
    .select('*')
    .eq('planeacion_id', normalizedPlaneacionId);

  if (userId) {
    existingQuery.eq('user_id', userId);
  }

  const { data: existingAnexo, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;

  if (existingAnexo) {
    const summarized = withVersionSummary(existingAnexo);
    return {
      ok: true,
      anexo_id: existingAnexo.id,
      status: 'already_exists',
      tipo_cuadernillo: summarized.tipo_cuadernillo,
      schema_version: summarized.schema_version,
      anexo: summarized
    };
  }

  // Obtener contexto adicional del tema si existe
  let unidadId = null;
  if (planeacion.tema_id) {
    const { data: tema } = await client
      .from('temas')
      .select('unidad_id')
      .eq('id', planeacion.tema_id)
      .maybeSingle();
    unidadId = tema?.unidad_id || null;
  }

  const tablaIa = safeParseJson(planeacion.tabla_ia, []);
  const actividadesMomentos = safeParseJson(planeacion.actividades_momentos, {});

  // Create AI metrics job
  let aiJobId = null;
  if (userId) {
    try {
      aiJobId = await metricas.createAiJob({
        userId,
        artifactType: 'anexo',
        actionType:   'generate',
        nivel:        normalizeString(planeacion.nivel) || null,
        materia:      normalizeString(planeacion.materia) || null,
        tema:         normalizeString(planeacion.tema) || null,
        inputSummary: {
          planeacion_id: planeacion.id,
          planeaciones_count: 1,
          tipo_cuadernillo: tipoCuadernillo,
          schema_version: tipoCuadernillo ? 3 : 1
        }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (anexo) error:', err?.message);
    }
  }

  let contenido, tokensPrompt, tokensCompletion, tokensTotal, metricasV2 = null;
  try {
    ({ contenido, tokensPrompt, tokensCompletion, tokensTotal, metricasV2 = null } = await generateContentByVersion({
      planeacion,
      tablaIa,
      actividadesMomentos,
      tipoCuadernillo,
      completarV2,
      generarV1,
      jobId: aiJobId,
      userId,
      logCall: metricas.logAiCall
    }));
  } catch (err) {
    if (aiJobId) {
        metricas.failAiJob(aiJobId, {
        errorType:        err?.status ? `http_${err.status}` : 'generation_error',
        errorMessageSafe: err?.message || 'Error generando anexo'
      }).catch(() => {});
    }
    console.error('[anexos] generate:error', {
      planeacionId: planeacion.id,
      errorType: err?.status ? `http_${err.status}` : 'generation_error',
      message: err?.message || 'Error generando anexo',
      durationMs: Date.now() - startedAt
    });
    throw err;
  }

  const titulo = tipoCuadernillo
    ? normalizeString(contenido.titulo)
    : normalizeString(contenido.titulo_general) || `Anexos: ${normalizeString(planeacion.tema) || 'Sin titulo'}`;
  const promptVersion = tipoCuadernillo ? CUADERNILLO_V3_PROMPT_VERSION : ANEXOS_PROMPT_VERSION;

  const insertPayload = {
    user_id: userId,
    planeacion_id: planeacion.id,
    tema_id: planeacion.tema_id || null,
    unidad_id: unidadId,
    batch_id: planeacion.batch_id || null,
    titulo,
    materia: normalizeString(planeacion.materia) || null,
    nivel: normalizeString(planeacion.nivel) || null,
    tema: normalizeString(planeacion.tema) || null,
    tipo_cuadernillo: tipoCuadernillo,
    contenido,
    prompt_version: promptVersion,
    status: 'generated',
    tokens_prompt: tokensPrompt,
    tokens_completion: tokensCompletion,
    tokens_total: tokensTotal,
    updated_at: new Date().toISOString()
  };

  const { data: nuevoAnexo, error: insertError } = await client
    .from('anexos')
    .insert(insertPayload)
    .select('id, planeacion_id, titulo, materia, nivel, tema, tipo_cuadernillo, prompt_version, status, created_at')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      // Race condition — alguien ya lo genero; devolver el existente
      const raceQuery = client
        .from('anexos')
        .select('id, planeacion_id, titulo, tipo_cuadernillo, prompt_version, status')
        .eq('planeacion_id', normalizedPlaneacionId);
      if (userId) raceQuery.eq('user_id', userId);
      const { data: raceAnexo } = await raceQuery.maybeSingle();
      if (aiJobId) {
        metricas.finishAiJob(aiJobId, {
          outputSummary: { anexos_creados: 0, status: 'already_exists' }
        }).catch(() => {});
      }
      const summarized = withVersionSummary(raceAnexo);
      return {
        ok: true,
        anexo_id: raceAnexo?.id,
        status: 'already_exists',
        tipo_cuadernillo: summarized?.tipo_cuadernillo ?? null,
        schema_version: summarized?.schema_version ?? null,
        anexo: summarized || null
      };
    }
    if (aiJobId) {
      metricas.failAiJob(aiJobId, {
        errorType: 'db_insert_error',
        errorMessageSafe: insertError.message
      }).catch(() => {});
    }
    throw insertError;
  }

  if (aiJobId) {
    metricas.finishAiJob(aiJobId, {
      anexoId:      nuevoAnexo.id,
      outputSummary: {
        anexos_creados: tipoCuadernillo ? 1 : (Array.isArray(contenido?.anexos) ? contenido.anexos.length : 0),
        tipo_cuadernillo: tipoCuadernillo,
        schema_version: tipoCuadernillo ? 3 : 1,
        segmentos: metricasV2?.segmentos ?? null,
        llamadas: metricasV2?.llamadas ?? 1,
        retries: metricasV2?.reintentos ?? 0,
        tokens_reasoning: metricasV2?.tokensReasoning ?? 0,
        familias_cuantitativas: metricasV2?.familiasCuantitativas ?? [],
        verificaciones_exitosas: metricasV2?.verificacionesExitosas ?? 0
      }
    }).catch(() => {});
  }

  console.info('[anexos] generate:success', {
    anexoId: nuevoAnexo?.id,
    planeacionId: planeacion.id,
    promptVersion,
    tokensTotal,
    durationMs: Date.now() - startedAt
  });

  return {
    ok: true,
    anexo_id: nuevoAnexo.id,
    status: 'generated',
    tipo_cuadernillo: tipoCuadernillo,
    schema_version: tipoCuadernillo ? 3 : null,
    anexo: withVersionSummary(nuevoAnexo)
  };
}

export async function regenerarAnexo({
  supabaseClient,
  userId,
  id,
  completarV2 = null,
  generarV1 = generateAnexosWithIa,
  metricas = { createAiJob, finishAiJob, failAiJob, logAiCall }
}) {
  const startedAt = Date.now();
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  console.info('[anexos] regenerate:start', { anexoId: normalizedId });

  // Obtener el anexo existente para saber su planeacion_id
  const anexoQuery = client.from('anexos').select('*').eq('id', normalizedId);
  if (userId) anexoQuery.eq('user_id', userId);
  const { data: anexo, error: anexoError } = await anexoQuery.maybeSingle();
  if (anexoError) throw anexoError;
  if (!anexo) throw buildHttpError(404, 'Anexo no encontrado.');
  const tipoCuadernillo = anexo.tipo_cuadernillo ?? null;
  if (tipoCuadernillo !== null && !esTipoCuadernillo(tipoCuadernillo)) {
    throw buildHttpError(500, 'El anexo tiene un tipo no valido.', 'tipo_cuadernillo_persistido_invalido');
  }
  const storedSchemaVersion = tipoCuadernillo ? Number(anexo.contenido?.schema_version) : 1;
  if (tipoCuadernillo && ![2, 3].includes(storedSchemaVersion)) {
    throw buildHttpError(500, 'El anexo tiene una version no valida.', 'schema_version_persistida_invalida');
  }

  // Re-obtener la planeacion original
  const planeacionQuery = client
    .from('planeaciones')
    .select('id, tema_id, batch_id, tema, subtema, materia, nivel, unidad, custom_title, duracion, actividad_cierre, tabla_ia, actividades_momentos')
    .eq('id', anexo.planeacion_id);

  if (userId) planeacionQuery.eq('user_id', userId);
  const { data: planeacion, error: planeacionError } = await planeacionQuery.maybeSingle();
  if (planeacionError) throw planeacionError;
  if (!planeacion) throw buildHttpError(404, 'Planeacion original no encontrada.');

  const tablaIa = safeParseJson(planeacion.tabla_ia, []);
  const actividadesMomentos = safeParseJson(planeacion.actividades_momentos, {});

  // Create AI metrics job for regeneration
  let aiJobId = null;
  if (userId) {
    try {
      aiJobId = await metricas.createAiJob({
        userId,
        artifactType: 'anexo',
        actionType:   'regenerate',
        nivel:        normalizeString(planeacion.nivel) || null,
        materia:      normalizeString(planeacion.materia) || null,
        tema:         normalizeString(planeacion.tema) || null,
        inputSummary: {
          planeacion_id: planeacion.id,
          planeaciones_count: 1,
          tipo_cuadernillo: tipoCuadernillo,
          schema_version: storedSchemaVersion
        }
      });
    } catch (err) {
      console.error('[aiMetrics] createAiJob (anexo regenerar) error:', err?.message);
    }
  }

  let contenido, tokensPrompt, tokensCompletion, tokensTotal, metricasV2 = null;
  try {
    ({ contenido, tokensPrompt, tokensCompletion, tokensTotal, metricasV2 = null } = await generateContentByVersion({
      planeacion,
      tablaIa,
      actividadesMomentos,
      tipoCuadernillo,
      schemaVersion: storedSchemaVersion,
      completarV2,
      generarV1,
      jobId: aiJobId,
      userId,
      logCall: metricas.logAiCall
    }));
  } catch (err) {
    if (aiJobId) {
        metricas.failAiJob(aiJobId, {
        errorType:        err?.status ? `http_${err.status}` : 'generation_error',
        errorMessageSafe: err?.message || 'Error regenerando anexo'
      }).catch(() => {});
    }
    console.error('[anexos] regenerate:error', {
      anexoId: normalizedId,
      errorType: err?.status ? `http_${err.status}` : 'generation_error',
      message: err?.message || 'Error regenerando anexo',
      durationMs: Date.now() - startedAt
    });
    throw err;
  }

  const titulo = tipoCuadernillo
    ? normalizeString(contenido.titulo)
    : normalizeString(contenido.titulo_general) || `Anexos: ${normalizeString(planeacion.tema) || 'Sin titulo'}`;
  const promptVersion = tipoCuadernillo
    ? (storedSchemaVersion === 3 ? CUADERNILLO_V3_PROMPT_VERSION : CUADERNILLO_V2_PROMPT_VERSION)
    : ANEXOS_PROMPT_VERSION;

  const { data: updated, error: updateError } = await client
    .from('anexos')
    .update({
      titulo,
      contenido,
      prompt_version: promptVersion,
      status: 'generated',
      tokens_prompt: tokensPrompt,
      tokens_completion: tokensCompletion,
      tokens_total: tokensTotal,
      updated_at: new Date().toISOString()
    })
    .eq('id', normalizedId)
    .select('id, planeacion_id, titulo, tipo_cuadernillo, prompt_version, status, updated_at')
    .single();

  if (updateError) {
    if (aiJobId) {
      metricas.failAiJob(aiJobId, {
        errorType: 'db_update_error',
        errorMessageSafe: updateError.message
      }).catch(() => {});
    }
    throw updateError;
  }

  if (aiJobId) {
    metricas.finishAiJob(aiJobId, {
      anexoId:      updated.id,
      outputSummary: {
        anexos_creados: tipoCuadernillo ? 1 : (Array.isArray(contenido?.anexos) ? contenido.anexos.length : 0),
        tipo_cuadernillo: tipoCuadernillo,
        schema_version: storedSchemaVersion,
        segmentos: metricasV2?.segmentos ?? null,
        llamadas: metricasV2?.llamadas ?? 1,
        retries: metricasV2?.reintentos ?? 0,
        tokens_reasoning: metricasV2?.tokensReasoning ?? 0,
        familias_cuantitativas: metricasV2?.familiasCuantitativas ?? [],
        verificaciones_exitosas: metricasV2?.verificacionesExitosas ?? 0
      }
    }).catch(() => {});
  }

  console.info('[anexos] regenerate:success', {
    anexoId: updated?.id,
    planeacionId: planeacion.id,
    promptVersion,
    tokensTotal,
    durationMs: Date.now() - startedAt
  });

  return {
    ok: true,
    tipo_cuadernillo: tipoCuadernillo,
    schema_version: tipoCuadernillo ? storedSchemaVersion : null,
    anexo: withVersionSummary(updated)
  };
}

export async function obtenerAnexosPorBatch({ supabaseClient, userId, batchId }) {
  const client = getClient(supabaseClient);
  const normalizedBatchId = normalizeString(batchId);

  if (!normalizedBatchId) throw buildHttpError(400, 'batchId es requerido.');

  const query = client
    .from('anexos')
    .select('id, planeacion_id, titulo, materia, nivel, tema, tipo_cuadernillo, prompt_version, status, created_at, updated_at')
    .eq('batch_id', normalizedBatchId)
    .order('created_at', { ascending: true });

  if (userId) query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(withVersionSummary);
}

export async function obtenerAnexoPorPlaneacion({ supabaseClient, userId, planeacionId }) {
  const client = getClient(supabaseClient);
  const normalizedId = String(planeacionId || '').trim();

  if (!normalizedId) throw buildHttpError(400, 'planeacion_id es requerido.');

  const query = client.from('anexos').select('*').eq('planeacion_id', normalizedId);
  if (userId) query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Anexo no encontrado para esta planeacion.');
  return withVersionSummary(data);
}

export async function eliminarAnexo({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!userId) throw buildHttpError(401, 'Usuario requerido.');
  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  const { data: anexo, error: fetchError } = await client
    .from('anexos')
    .select('id')
    .eq('id', normalizedId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!anexo) throw buildHttpError(404, 'Anexo no encontrado.');

  const { error: deleteError } = await client
    .from('anexos')
    .delete()
    .eq('id', normalizedId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  console.info('[anexos] delete:success', { anexoId: normalizedId });

  return { ok: true };
}

export async function obtenerAnexoPorId({ supabaseClient, userId, id }) {
  const client = getClient(supabaseClient);
  const normalizedId = normalizeString(id);

  if (!normalizedId) throw buildHttpError(400, 'id es requerido.');

  const query = client.from('anexos').select('*').eq('id', normalizedId);
  if (userId) query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw buildHttpError(404, 'Anexo no encontrado.');
  return withVersionSummary(data);
}
