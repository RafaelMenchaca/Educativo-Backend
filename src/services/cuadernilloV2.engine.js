import {
  ANEXO_SCHEMA_VERSION_V2,
  obtenerBlueprintCuadernillo,
  obtenerMetadataTipoCuadernillo,
  esTipoCuadernillo
} from '../domain/cuadernillos.js';
import {
  CUADERNILLO_V2_BLOCK_TYPES,
  CUADERNILLO_V2_ACTIVITY_MODALITIES,
  CUADERNILLO_V2_EVALUATION_MODALITIES,
  CuadernilloV2ValidationError,
  validateCuadernilloV2,
  validateCuadernilloV2Segment
} from '../validators/cuadernilloV2.validator.js';

const CONTEXT_KEYS = new Set([
  'materia',
  'nivel',
  'tema',
  'duracion',
  'tabla_ia',
  'actividades_momentos',
  'datos_generales'
]);
const TRUSTED_GENERAL_KEYS = new Set(['institucion', 'unidad']);
const SEGMENT_KEYS = new Set(['secciones']);

export class CuadernilloV2GenerationError extends Error {
  constructor(code, segmentId = null) {
    super(`No se pudo generar el cuadernillo v2: ${code}`);
    this.name = 'CuadernilloV2GenerationError';
    this.code = code;
    this.segmentId = segmentId;
  }
}

function fail(code, segmentId = null) {
  throw new CuadernilloV2GenerationError(code, segmentId);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertExactKeys(value, allowed, code) {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code);
  }
}

function normalizeContext(contextoPlaneacion) {
  assertExactKeys(contextoPlaneacion, CONTEXT_KEYS, 'contexto_invalido');
  const materia = cleanText(contextoPlaneacion.materia);
  const nivel = cleanText(contextoPlaneacion.nivel);
  const tema = cleanText(contextoPlaneacion.tema);
  const duracion = Number(contextoPlaneacion.duracion);
  if (!materia || !nivel || !tema || !Number.isFinite(duracion) || duracion <= 0) {
    fail('contexto_incompleto');
  }
  if (!Array.isArray(contextoPlaneacion.tabla_ia)) fail('tabla_ia_invalida');
  if (!isObject(contextoPlaneacion.actividades_momentos)) fail('actividades_momentos_invalidas');

  const trusted = contextoPlaneacion.datos_generales ?? {};
  assertExactKeys(trusted, TRUSTED_GENERAL_KEYS, 'datos_generales_contexto_invalidos');
  const institucion = cleanText(trusted.institucion);
  const unidad = cleanText(trusted.unidad);

  return Object.freeze({
    materia,
    nivel,
    tema,
    duracion,
    tabla_ia: structuredClone(contextoPlaneacion.tabla_ia),
    actividades_momentos: structuredClone(contextoPlaneacion.actividades_momentos),
    datos_generales: Object.freeze({ institucion, unidad })
  });
}

function buildGeneralData(context) {
  const trustedField = (value) => value
    ? { valor: value, modo: 'backend' }
    : { valor: '', modo: 'completar' };
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
  const groups = [
    blueprint.slice(0, 2),
    middle.slice(0, split),
    middle.slice(split),
    blueprint.slice(-2)
  ];
  if (groups.some((group) => group.length === 0)) fail('plan_segmentos_invalido');

  return Object.freeze(groups.map((sections, index) => Object.freeze({
    id: `segmento_${index + 1}`,
    orden: index + 1,
    secciones: Object.freeze(sections)
  })));
}

function promptContext(context) {
  return {
    materia: context.materia,
    nivel: context.nivel,
    tema: context.tema,
    duracion_minutos: context.duracion,
    tabla_ia: context.tabla_ia,
    actividades_momentos: context.actividades_momentos
  };
}

export function construirPromptSegmentoCuadernilloV2({ tipoCuadernillo, contextoPlaneacion, segmento, errores = [] }) {
  const metadata = obtenerMetadataTipoCuadernillo(tipoCuadernillo);
  if (!metadata || !segmento?.secciones?.length) fail('prompt_segmento_invalido', segmento?.id || null);
  const correction = errores.length > 0
    ? `\nCorreccion estructural requerida: ${errores.join(', ')}. No repitas la respuesta anterior.`
    : '';
  const systemPrompt = [
    'Genera material educativo textual como JSON valido.',
    'Usa la planeacion solo como contexto; no la copies literalmente.',
    'No inventes institucion, estudiante, grupo, fecha ni unidad.',
    'No incluyas datos_generales, schema_version, titulo, descripcion ni tipo_cuadernillo.',
    'Devuelve solo el objeto de segmento solicitado, sin markdown ni texto adicional.'
  ].join(' ');
  const userPrompt = `Tipo canonico:\n${JSON.stringify(metadata)}\n\nContexto academico:\n${JSON.stringify(promptContext(contextoPlaneacion))}\n\nBlueprint solicitado:\n${JSON.stringify(segmento.secciones)}\n\nContrato de salida:\n{"secciones":[{"id":"string","titulo":"string","orden":1,"bloques":[]}]}\n\nAllowlist de bloques:\n${JSON.stringify(CUADERNILLO_V2_BLOCK_TYPES)}\nModalidades de actividad:\n${JSON.stringify(CUADERNILLO_V2_ACTIVITY_MODALITIES)}\nModalidades de evaluacion:\n${JSON.stringify(CUADERNILLO_V2_EVALUATION_MODALITIES)}\n\nReglas:\n- Produce exactamente las secciones solicitadas, en su orden y sin secciones adicionales.\n- Conserva los IDs, ordenes y cobertura exacta indicados por el blueprint.\n- Cada seccion debe contener bloques pedagogicos utiles, no placeholders.\n- Adapta contenido y actividades a materia, nivel, tema y duracion.\n- Usa las actividades y tabla de la planeacion como contexto legitimo.\n- Para componentes condicionales no aplicables, usa la alternativa declarada.\n- Los espacios destinados al estudiante deben permanecer vacios o representarse mediante espacios de respuesta del contrato.${correction}`;
  return Object.freeze({ systemPrompt, userPrompt });
}

function parseSegmentJson(raw) {
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
  if (typeof result === 'string' || isObject(result) && Object.hasOwn(result, 'secciones')) {
    return { content: result, usage: {}, durationMs: 0 };
  }
  if (!isObject(result)) fail('completion_invalida');
  const content = result.content ?? result.choices?.[0]?.message?.content;
  const usage = isObject(result.usage) ? result.usage : {};
  const durationMs = Number.isFinite(Number(result.durationMs)) && Number(result.durationMs) >= 0
    ? Number(result.durationMs)
    : 0;
  return { content, usage, durationMs };
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

function safeStructuralErrors(error) {
  if (error instanceof CuadernilloV2ValidationError) return [error.code, error.path].filter(Boolean);
  if (error instanceof CuadernilloV2GenerationError) return [error.code];
  return ['segmento_invalido'];
}

async function generateSegment({ tipoCuadernillo, context, segment, completar, metrics }) {
  let safeErrors = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = construirPromptSegmentoCuadernilloV2({
      tipoCuadernillo,
      contextoPlaneacion: context,
      segmento: segment,
      errores: safeErrors
    });
    let completion;
    try {
      completion = completionData(await completar({
        ...prompt,
        tipoCuadernillo,
        segmento: segment,
        intento: attempt
      }));
    } catch (error) {
      if (error instanceof CuadernilloV2GenerationError) throw error;
      fail('completion_fallida', segment.id);
    }
    addMetrics(metrics, completion.usage, completion.durationMs, attempt === 2);
    const parsed = parseSegmentJson(completion.content);
    try {
      if (!parsed) fail('json_segmento_invalido', segment.id);
      for (const key of Object.keys(parsed)) {
        if (!SEGMENT_KEYS.has(key)) fail('raiz_segmento_invalida', segment.id);
      }
      validateCuadernilloV2Segment(
        tipoCuadernillo,
        segment.secciones.map(({ id }) => id),
        parsed
      );
      return parsed.secciones;
    } catch (error) {
      safeErrors = safeStructuralErrors(error);
      if (attempt === 2) fail('segmento_invalido_tras_retry', segment.id);
    }
  }
  fail('segmento_invalido_tras_retry', segment.id);
}

export async function generarCuadernilloV2({ tipoCuadernillo, contextoPlaneacion, completar }) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido');
  if (typeof completar !== 'function') fail('completar_requerido');
  const context = normalizeContext(contextoPlaneacion);
  const metadata = obtenerMetadataTipoCuadernillo(tipoCuadernillo);
  const plan = crearPlanSegmentosCuadernilloV2(tipoCuadernillo);
  const metrics = {
    segmentos: plan.length,
    llamadas: 0,
    reintentos: 0,
    tokensPrompt: 0,
    tokensCompletion: 0,
    tokensTotal: 0,
    duracionMs: 0
  };
  const sections = [];

  for (const segment of plan) {
    sections.push(...await generateSegment({
      tipoCuadernillo,
      context,
      segment,
      completar,
      metrics
    }));
  }

  const contenido = {
    schema_version: ANEXO_SCHEMA_VERSION_V2,
    titulo: `${metadata.label}: ${context.tema}`,
    descripcion: metadata.objetivo,
    datos_generales: buildGeneralData(context),
    secciones: sections
  };
  validateCuadernilloV2(tipoCuadernillo, contenido);
  return { contenido, metricas: Object.freeze({ ...metrics }) };
}
