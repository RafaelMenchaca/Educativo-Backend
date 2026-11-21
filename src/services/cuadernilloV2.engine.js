import {
  ANEXO_SCHEMA_VERSION_V2,
  obtenerBlueprintCuadernillo,
  obtenerMetadataTipoCuadernillo,
  obtenerSlotsSegmentoCuadernillo,
  esTipoCuadernillo
} from '../domain/cuadernillos.js';
import {
  CUADERNILLO_V2_ACTIVITY_MODALITIES,
  CUADERNILLO_V2_EVALUATION_MODALITIES,
  CUADERNILLO_V2_SLOT_BLOCK_CONTRACTS,
  CuadernilloV2ValidationError,
  construirBloqueV2DesdeSlot,
  construirSeccionDatosGeneralesV2,
  validateCuadernilloV2,
  validateCuadernilloV2Segment
} from '../validators/cuadernilloV2.validator.js';

const CONTEXT_KEYS = new Set(['materia', 'nivel', 'tema', 'duracion', 'tabla_ia', 'actividades_momentos', 'datos_generales']);
const TRUSTED_GENERAL_KEYS = new Set(['institucion', 'unidad']);
const RESPONSE_ROOT_KEYS = new Set(['respuestas']);
const RESPONSE_KEYS = new Set(['slot_id', 'bloque']);
const MAX_SAFE_DIAGNOSTICS = 8;
const MAX_SAFE_SLOT_IDS = 45;

export class CuadernilloV2GenerationError extends Error {
  constructor(code, { segmentId = null, path = null, details = null, diagnostics = [] } = {}) {
    super(`No se pudo generar el cuadernillo v2: ${code}`);
    this.name = 'CuadernilloV2GenerationError';
    this.code = code;
    this.segmentId = segmentId;
    this.path = path;
    this.details = details;
    this.diagnostics = diagnostics.slice(0, MAX_SAFE_DIAGNOSTICS);
  }
}

function fail(code, segmentId = null, safe = {}) {
  throw new CuadernilloV2GenerationError(code, { segmentId, ...safe });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertExactKeys(value, allowed, code, segmentId = null, path = null) {
  if (!isObject(value)) fail(code, segmentId, { path });
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code, segmentId, { path: path ? `${path}.${key}` : key });
  }
}

function normalizeContext(contextoPlaneacion) {
  assertExactKeys(contextoPlaneacion, CONTEXT_KEYS, 'contexto_invalido');
  const materia = cleanText(contextoPlaneacion.materia);
  const nivel = cleanText(contextoPlaneacion.nivel);
  const tema = cleanText(contextoPlaneacion.tema);
  const duracion = Number(contextoPlaneacion.duracion);
  if (!materia || !nivel || !tema || !Number.isFinite(duracion) || duracion <= 0) fail('contexto_incompleto');
  if (!Array.isArray(contextoPlaneacion.tabla_ia)) fail('tabla_ia_invalida');
  if (!isObject(contextoPlaneacion.actividades_momentos)) fail('actividades_momentos_invalidas');
  const trusted = contextoPlaneacion.datos_generales ?? {};
  assertExactKeys(trusted, TRUSTED_GENERAL_KEYS, 'datos_generales_contexto_invalidos');
  return Object.freeze({
    materia, nivel, tema, duracion,
    tabla_ia: structuredClone(contextoPlaneacion.tabla_ia),
    actividades_momentos: structuredClone(contextoPlaneacion.actividades_momentos),
    datos_generales: Object.freeze({
      institucion: cleanText(trusted.institucion),
      unidad: cleanText(trusted.unidad)
    })
  });
}

function buildGeneralData(context) {
  const trustedField = (value) => value ? { valor: value, modo: 'backend' } : { valor: '', modo: 'completar' };
  return {
    institucion: trustedField(context.datos_generales.institucion),
    asignatura: { valor: context.materia, modo: 'backend' },
    unidad: trustedField(context.datos_generales.unidad),
    tema: { valor: context.tema, modo: 'backend' },
    estudiante: { valor: '', modo: 'completar', lineas: 1 },
    grupo: { valor: '', modo: 'completar', lineas: 1 },
    fecha: { valor: '', modo: 'completar', lineas: 1 }
  };
}

export function crearPlanSegmentosCuadernilloV2(tipoCuadernillo) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido');
  const blueprint = obtenerBlueprintCuadernillo(tipoCuadernillo);
  const middle = blueprint.slice(2, -2);
  const split = Math.ceil(middle.length / 2);
  const groups = [blueprint.slice(1, 2), middle.slice(0, split), middle.slice(split), blueprint.slice(-2)];
  if (groups.some((group) => group.length === 0)) fail('plan_segmentos_invalido');
  return Object.freeze(groups.map((secciones, index) => Object.freeze({
    id: `segmento_${index + 1}`,
    orden: index + 1,
    secciones: Object.freeze(secciones),
    slots: obtenerSlotsSegmentoCuadernillo(tipoCuadernillo, secciones.map(({ id }) => id))
  })));
}

function promptContext(context) {
  return {
    materia: context.materia, nivel: context.nivel, tema: context.tema,
    duracion_minutos: context.duracion, tabla_ia: context.tabla_ia,
    actividades_momentos: context.actividades_momentos
  };
}

function promptSlot(slot) {
  return {
    slot_id: slot.slotId,
    nombre: slot.nombre,
    clasificacion: slot.clasificacion,
    ...(slot.alternativa ? { alternativa: slot.alternativa } : {})
  };
}

export function construirPromptSegmentoCuadernilloV2({
  tipoCuadernillo, contextoPlaneacion, segmento, slots = segmento?.slots, errores = []
}) {
  const metadata = obtenerMetadataTipoCuadernillo(tipoCuadernillo);
  if (!metadata || !segmento?.secciones?.length || !Array.isArray(slots) || slots.length === 0) {
    fail('prompt_segmento_invalido', segmento?.id || null);
  }
  const retry = errores.length
    ? `SEGUNDO Y ULTIMO INTENTO. Corrige unicamente los slots solicitados. Errores estructurales seguros: ${JSON.stringify(errores.slice(0, 8))}\n\n`
    : '';
  const systemPrompt = [
    'Genera contenido pedagogico textual para slots canonicos como JSON valido.',
    'No produzcas cobertura, IDs tecnicos, secciones, orden, datos generales ni metadata documental.',
    'Usa la planeacion como contexto sin copiarla literalmente.',
    'Devuelve solo el objeto solicitado, sin Markdown ni texto adicional.'
  ].join(' ');
  const contract = {
    respuestas: [{ slot_id: slots[0].slotId, bloque: { tipo: 'texto', contenido: 'Contenido pedagogico util para este slot' } }]
  };
  const userPrompt = `${retry}Slots solicitados:
${JSON.stringify(slots.map(promptSlot))}

Tipo canonico:
${JSON.stringify(metadata)}

Contexto academico:
${JSON.stringify(promptContext(contextoPlaneacion))}

Contrato exacto de salida:
${JSON.stringify(contract)}
La raiz permite UNICAMENTE respuestas. Cada respuesta permite UNICAMENTE slot_id y bloque.
El bloque permite UNICAMENTE uno de estos schemas pedagogicos de entrada:
${JSON.stringify(CUADERNILLO_V2_SLOT_BLOCK_CONTRACTS)}
Modalidades de actividad: ${JSON.stringify(CUADERNILLO_V2_ACTIVITY_MODALITIES)}.
Modalidades de evaluacion: ${JSON.stringify(CUADERNILLO_V2_EVALUATION_MODALITIES)}.

Reglas:
- Devuelve exactamente una respuesta pedagogica util por cada slot solicitado.
- Copia cada slot_id exactamente; el orden del arreglo respuestas es libre.
- No devuelvas slots desconocidos ni duplicados.
- No incluyas cobertura, IDs de items o criterios, seccion, titulo de seccion, orden, schema_version, datos_generales ni tipo_cuadernillo.
- El backend asigna toda la metadata tecnica solo despues de validar el contenido.
- Los items de actividad contienen enunciado y opcionalmente opciones o espacio_respuesta, nunca id.
- Los criterios de evaluacion contienen texto, nunca id.
- Para componentes condicionales no aplicables literalmente, desarrolla la alternativa canonica indicada.
- Adapta cada respuesta a materia, nivel, tema, duracion y actividades de la planeacion.
- No uses placeholders ni contenido vacio.
- Devuelve JSON directo, sin fences ni texto externo.`;
  return Object.freeze({ systemPrompt, userPrompt });
}

function parseJson(raw) {
  if (isObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || '',
    trimmed.match(/\{[\s\S]*\}/)?.[0] || ''
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isObject(parsed)) return parsed;
    } catch {
      // Try the next safe candidate.
    }
  }
  return null;
}

function completionData(result) {
  if (typeof result === 'string' || isObject(result) && Object.hasOwn(result, 'respuestas')) {
    return { content: result, usage: {}, durationMs: 0, finishReason: 'stop' };
  }
  if (!isObject(result)) fail('completion_invalida');
  const content = result.content ?? result.choices?.[0]?.message?.content;
  const usage = isObject(result.usage) ? result.usage : {};
  const durationMs = Number.isFinite(Number(result.durationMs)) && Number(result.durationMs) >= 0 ? Number(result.durationMs) : 0;
  const finishReason = cleanText(result.finishReason ?? result.finish_reason) || null;
  return { content, usage, durationMs, finishReason };
}

function addMetrics(metrics, usage, durationMs, retry) {
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const total = Number(usage.total_tokens ?? prompt + completion);
  metrics.llamadas += 1;
  if (retry) metrics.reintentos += 1;
  metrics.tokensPrompt += Number.isFinite(prompt) ? prompt : 0;
  metrics.tokensCompletion += Number.isFinite(completion) ? completion : 0;
  metrics.tokensTotal += Number.isFinite(total) ? total : 0;
  metrics.duracionMs += durationMs;
}

function usageNumbers(usage) {
  return {
    tokensPrompt: Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0,
    tokensCompletion: Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0
  };
}

function emitDiagnostic(diagnosticar, diagnostics, payload) {
  const safe = Object.freeze({ ...payload });
  diagnostics.push(safe);
  if (diagnostics.length > MAX_SAFE_DIAGNOSTICS) diagnostics.shift();
  try { diagnosticar?.(safe); } catch { /* Observability is non-blocking. */ }
}

function safeValidation(error, slotId = null) {
  return {
    code: cleanText(error?.code) || 'contenido_slot_invalido',
    ...(cleanText(error?.path) ? { path: cleanText(error.path).slice(0, 180) } : {}),
    ...(slotId ? { slotId } : {})
  };
}

export function validarRespuestasSlotsCuadernilloV2({ segmento, slotsSolicitados, payload }) {
  if (!isObject(payload)) fail('raiz_slots_invalida', segmento.id, { path: 'slots' });
  assertExactKeys(payload, RESPONSE_ROOT_KEYS, 'raiz_slots_invalida', segmento.id, 'slots');
  if (!Array.isArray(payload.respuestas)) fail('respuestas_slots_invalidas', segmento.id, { path: 'slots.respuestas' });
  const requested = new Map(slotsSolicitados.map((slot) => [slot.slotId, slot]));
  const seen = new Set();
  const validas = new Map();
  const invalidas = new Map();
  payload.respuestas.forEach((response, index) => {
    const path = `slots.respuestas[${index}]`;
    if (!isObject(response)) fail('respuesta_slot_invalida', segmento.id, { path });
    assertExactKeys(response, RESPONSE_KEYS, 'respuesta_slot_invalida', segmento.id, path);
    const slotId = cleanText(response.slot_id);
    if (!requested.has(slotId)) fail('slot_desconocido', segmento.id, { path: `${path}.slot_id`, details: { slotId } });
    if (seen.has(slotId)) fail('slot_duplicado', segmento.id, { path: `${path}.slot_id`, details: { slotId } });
    seen.add(slotId);
    try {
      validas.set(slotId, construirBloqueV2DesdeSlot(requested.get(slotId), response.bloque));
    } catch (error) {
      if (!(error instanceof CuadernilloV2ValidationError)) throw error;
      invalidas.set(slotId, safeValidation(error, slotId));
    }
  });
  const pendientes = slotsSolicitados.filter(({ slotId }) => !validas.has(slotId));
  return Object.freeze({ validas, invalidas, pendientes: Object.freeze(pendientes) });
}

function assembleSegment(segment, validBlocks) {
  const payload = {
    secciones: segment.secciones.map((section) => ({
      id: section.id,
      titulo: section.titulo,
      orden: section.orden,
      bloques: segment.slots
        .filter(({ seccionId }) => seccionId === section.id)
        .map(({ slotId }) => structuredClone(validBlocks.get(slotId)))
    }))
  };
  validateCuadernilloV2Segment(segment.slots[0].tipoCuadernillo, segment.secciones.map(({ id }) => id), payload);
  return payload.secciones;
}

async function generateSegment({ tipoCuadernillo, context, segment, segmentIndex, completar, metrics, diagnosticar, diagnostics }) {
  const validBlocks = new Map();
  let pending = [...segment.slots];
  let safeErrors = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = construirPromptSegmentoCuadernilloV2({
      tipoCuadernillo, contextoPlaneacion: context, segmento: segment, slots: pending, errores: safeErrors
    });
    let completion;
    try {
      completion = completionData(await completar({
        ...prompt, tipoCuadernillo, segmento: segment, slots: pending, intento: attempt
      }));
    } catch (error) {
      if (error instanceof CuadernilloV2GenerationError) throw error;
      fail('completion_fallida', segment.id);
    }
    addMetrics(metrics, completion.usage, completion.durationMs, attempt === 2);
    const tokenData = usageNumbers(completion.usage);
    try {
      if (completion.finishReason === 'length') fail('truncamiento', segment.id, { path: 'completion.finish_reason' });
      const parsed = parseJson(completion.content);
      if (!parsed) fail('json_segmento_invalido', segment.id, { path: 'slots' });
      const analysis = validarRespuestasSlotsCuadernilloV2({ segmento: segment, slotsSolicitados: pending, payload: parsed });
      for (const [slotId, block] of analysis.validas) validBlocks.set(slotId, block);
      if (analysis.pendientes.length === 0) {
        emitDiagnostic(diagnosticar, diagnostics, {
          eventType: 'segment_slots_validated', tipoCuadernillo, segmentoId: segment.id,
          segmentoIndice: segmentIndex, intento: attempt, slotsTotal: segment.slots.length,
          slotsPendientes: [], finishReason: completion.finishReason, ...tokenData, durationMs: completion.durationMs
        });
        return assembleSegment(segment, validBlocks);
      }
      pending = [...analysis.pendientes];
      safeErrors = [...analysis.invalidas.values()].slice(0, MAX_SAFE_DIAGNOSTICS);
      if (safeErrors.length === 0) safeErrors = [{ code: 'slots_ausentes', path: 'slots.respuestas' }];
    } catch (error) {
      const fatal = error instanceof CuadernilloV2GenerationError && ['slot_desconocido', 'slot_duplicado'].includes(error.code);
      if (fatal) throw error;
      safeErrors = [safeValidation(error)];
      if (attempt === 1) pending = segment.slots.filter(({ slotId }) => !validBlocks.has(slotId));
    }
    emitDiagnostic(diagnosticar, diagnostics, {
      eventType: attempt === 1 ? 'segment_slot_retry' : 'segment_slot_retry_failed',
      tipoCuadernillo, segmentoId: segment.id, segmentoIndice: segmentIndex, intento: attempt,
      slotsTotal: segment.slots.length,
      slotsPendientes: pending.map(({ slotId }) => slotId).slice(0, MAX_SAFE_SLOT_IDS),
      errorCode: safeErrors[0]?.code || 'slots_incompletos', errorPath: safeErrors[0]?.path || null,
      finishReason: completion.finishReason, ...tokenData, durationMs: completion.durationMs
    });
    if (attempt === 2) {
      fail('segmento_invalido_tras_retry', segment.id, {
        path: safeErrors[0]?.path || null,
        details: { slotsPendientes: pending.map(({ slotId }) => slotId).slice(0, MAX_SAFE_SLOT_IDS) },
        diagnostics
      });
    }
  }
  fail('segmento_invalido_tras_retry', segment.id, { diagnostics });
}

export async function generarCuadernilloV2({ tipoCuadernillo, contextoPlaneacion, completar, diagnosticar = null }) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido');
  if (typeof completar !== 'function') fail('completar_requerido');
  const context = normalizeContext(contextoPlaneacion);
  const metadata = obtenerMetadataTipoCuadernillo(tipoCuadernillo);
  const blueprint = obtenerBlueprintCuadernillo(tipoCuadernillo);
  const plan = crearPlanSegmentosCuadernilloV2(tipoCuadernillo);
  const metrics = { segmentos: 4, llamadas: 0, reintentos: 0, tokensPrompt: 0, tokensCompletion: 0, tokensTotal: 0, duracionMs: 0 };
  const datosGenerales = buildGeneralData(context);
  const sections = [construirSeccionDatosGeneralesV2({ blueprint, datosGenerales })];
  const diagnostics = [];
  for (let index = 0; index < plan.length; index += 1) {
    sections.push(...await generateSegment({
      tipoCuadernillo, context, segment: plan[index], segmentIndex: index + 1,
      completar, metrics, diagnosticar, diagnostics
    }));
  }
  const contenido = {
    schema_version: ANEXO_SCHEMA_VERSION_V2,
    titulo: `${metadata.label}: ${context.tema}`,
    descripcion: metadata.objetivo,
    datos_generales: datosGenerales,
    secciones: sections
  };
  try {
    validateCuadernilloV2(tipoCuadernillo, contenido);
  } catch (error) {
    const safe = safeValidation(error);
    emitDiagnostic(diagnosticar, diagnostics, {
      eventType: 'segment_slot_retry_failed', tipoCuadernillo, segmentoId: 'validacion_final',
      segmentoIndice: 0, intento: 1, slotsTotal: plan.flatMap(({ slots }) => slots).length,
      slotsPendientes: [], errorCode: safe.code, errorPath: safe.path || null,
      finishReason: null, tokensPrompt: metrics.tokensPrompt,
      tokensCompletion: metrics.tokensCompletion, durationMs: metrics.duracionMs
    });
    fail('validacion_final_invalida', 'validacion_final', { path: safe.path || null, diagnostics });
  }
  return Object.freeze({ contenido, metricas: Object.freeze({ ...metrics }) });
}
