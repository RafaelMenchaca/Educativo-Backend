import {
  ANEXO_SCHEMA_VERSION_V3,
  CUADERNILLO_V3_COMMON_EDITORIAL_POLICY,
  CUADERNILLO_V3_SEGMENT_SECTION_IDS,
  CUADERNILLO_V3_TYPE_POLICIES,
  obtenerBlueprintCuadernilloV3,
  obtenerContratoPedagogicoSlotV3,
  obtenerFuncionEditorialSeccionV3,
  obtenerFuncionEditorialSlotV3,
  obtenerGruposCoherenciaCuadernilloV3,
  obtenerMetadataTipoCuadernilloV3,
  obtenerSlotsSegmentoCuadernilloV3
} from '../domain/cuadernillosV3.js';
import { esTipoCuadernillo } from '../domain/cuadernillos.js';
import { resolverRepresentacionSlotCuadernilloV3 } from '../domain/cuadernilloV3Representations.js';
import {
  CUADERNILLO_V3_QUANTITATIVE_FAMILIES,
  construirJsonSchemaCompletionV3,
  obtenerContratoAcademicoSlotV3,
  obtenerFamiliasCuantitativasContextoV3,
  obtenerPoliticaCuantitativaContextoV3
} from '../domain/cuadernilloV3Contracts.js';
import {
  CUADERNILLO_V2_SLOT_BLOCK_CONTRACTS,
  CuadernilloV2ValidationError,
  construirBloqueV3DesdeSlot,
  validateCuadernilloV3,
  validateCuadernilloV3Segment
} from '../validators/cuadernilloV2.validator.js';

const CONTEXT_KEYS = new Set([
  'materia', 'nivel', 'unidad', 'tema', 'subtema', 'titulo', 'duracion',
  'actividad_cierre', 'tabla_ia', 'actividades_momentos', 'datos_generales'
]);
const RESPONSE_ROOT_KEYS = new Set(['respuestas']);
const RESPONSE_KEYS = new Set(['slot_id', 'bloque']);
const MAX_SAFE_DIAGNOSTICS = 8;
const MAX_SAFE_SLOT_IDS = 45;
const MAX_SAFE_CORRECTIONS = 45;

export class CuadernilloV3GenerationError extends Error {
  constructor(code, { segmentId = null, path = null, details = null, diagnostics = [] } = {}) {
    super(`No se pudo generar el cuadernillo v3: ${code}`);
    this.name = 'CuadernilloV3GenerationError';
    this.code = code;
    this.segmentId = segmentId;
    this.path = path;
    this.details = details;
    this.diagnostics = diagnostics.slice(0, MAX_SAFE_DIAGNOSTICS);
  }
}

function fail(code, segmentId = null, safe = {}) {
  throw new CuadernilloV3GenerationError(code, { segmentId, ...safe });
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
  if (contextoPlaneacion.datos_generales !== undefined && !isObject(contextoPlaneacion.datos_generales)) {
    fail('datos_generales_contexto_invalidos');
  }
  return Object.freeze({
    materia,
    nivel,
    unidad: cleanText(contextoPlaneacion.unidad),
    tema,
    subtema: cleanText(contextoPlaneacion.subtema),
    titulo: cleanText(contextoPlaneacion.titulo),
    duracion,
    actividad_cierre: cleanText(contextoPlaneacion.actividad_cierre),
    tabla_ia: structuredClone(contextoPlaneacion.tabla_ia),
    actividades_momentos: structuredClone(contextoPlaneacion.actividades_momentos)
  });
}

export function crearPlanSegmentosCuadernilloV3(tipoCuadernillo) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido');
  const blueprint = obtenerBlueprintCuadernilloV3(tipoCuadernillo);
  const byId = new Map(blueprint.map((section) => [section.id, section]));
  const groups = CUADERNILLO_V3_SEGMENT_SECTION_IDS[tipoCuadernillo]
    .map((sectionIds) => sectionIds.map((id) => byId.get(id)).filter(Boolean));
  if (groups.some((group) => group.length === 0)) fail('plan_segmentos_invalido');
  if (groups.flat().length !== blueprint.length || new Set(groups.flat().map(({ id }) => id)).size !== blueprint.length) fail('plan_segmentos_invalido');
  return Object.freeze(groups.map((secciones, index) => Object.freeze({
    id: `segmento_${index + 1}`,
    orden: index + 1,
    secciones: Object.freeze(secciones),
    slots: obtenerSlotsSegmentoCuadernilloV3(tipoCuadernillo, secciones.map(({ id }) => id))
  })));
}

function promptContext(context) {
  return {
    materia: context.materia,
    nivel: context.nivel,
    ...(context.unidad ? { unidad: context.unidad } : {}),
    tema: context.tema,
    ...(context.subtema ? { subtema: context.subtema } : {}),
    ...(context.titulo ? { titulo: context.titulo } : {}),
    duracion_minutos: context.duracion,
    ...(context.actividad_cierre ? { proposito_cierre: context.actividad_cierre } : {}),
    tabla_ia: context.tabla_ia,
    actividades_momentos: context.actividades_momentos
  };
}

function promptSlot(slot, familiasEsperadas = new Map(), contextoPlaneacion = null) {
  const representation = resolverRepresentacionSlotCuadernilloV3(slot, contextoPlaneacion);
  const { tipo, modalidad } = representation.recomendacionPrincipal;
  const baseContract = obtenerContratoAcademicoSlotV3(slot, tipo);
  const expectedFamilies = familiasEsperadas.get(slot.slotId);
  const academicContract = Array.isArray(expectedFamilies) ? {
    ...baseContract,
    familiasCuantitativas: expectedFamilies,
    fallbackCuantitativo: 'Selecciona una familia soportada del schema; no uses no_cuantitativo.'
  } : expectedFamilies === 'no_cuantitativo' ? {
    ...baseContract,
    permiteCuantitativo: false,
    familiasCuantitativas: [],
    fallbackCuantitativo: 'Desarrolla un ejemplo conceptual del tema; no declares familias matematicas ni resultados numericos como verificados.'
  } : baseContract;
  return {
    slot_id: slot.slotId,
    nombre: slot.nombre,
    seccion: slot.seccionId,
    clasificacion: slot.clasificacion,
    funcion_editorial: obtenerFuncionEditorialSlotV3(slot),
    ...(slot.alternativa ? { alternativa: slot.alternativa } : {}),
    representacion: { tipo, ...(modalidad ? { modalidad } : {}) },
    ...(representation.nivelProcedimental ? { nivel_procedimental: representation.nivelProcedimental } : {}),
    contrato_academico: academicContract,
    reglas: representation.reglas,
    instruccion: `Devuelve una entrada para ${slot.slotId}; la forma exacta esta en JSON Schema.`
  };
}

function promptContinuity(tipoCuadernillo, segmento) {
  const blueprint = obtenerBlueprintCuadernilloV3(tipoCuadernillo);
  const firstOrder = Math.min(...segmento.secciones.map(({ orden }) => orden));
  return {
    secciones_actuales: segmento.secciones.map(({ id }) => ({
      seccion_id: id,
      funcion_editorial: obtenerFuncionEditorialSeccionV3(tipoCuadernillo, id)
    })),
    antecedentes_canonicos: blueprint
      .filter(({ orden }) => orden < firstOrder)
      .map(({ id, cobertura_requerida }) => ({
        seccion_id: id,
        funcion_editorial: obtenerFuncionEditorialSeccionV3(tipoCuadernillo, id),
        componentes_ya_solicitados: cobertura_requerida.map(({ nombre }) => nombre)
      }))
  };
}

function promptCoherenceGroups(tipoCuadernillo, segmento, slots) {
  const requested = new Set(slots.map(({ slotId }) => slotId));
  return obtenerGruposCoherenciaCuadernilloV3(tipoCuadernillo)
    .filter((group) => group.miembros.some(({ slotId }) => requested.has(slotId))
      && group.miembros.every(({ slotId }) => segmento.slots.some((slot) => slot.slotId === slotId)))
    .map((group) => ({
      group_id: group.id,
      proposito: group.proposito,
      slot_principal: group.slotPrincipalId,
      slots_miembros: group.miembros.map(({ slotId }) => slotId),
      regla_coherencia: group.regla,
      instrucciones_comunes: group.instrucciones,
      ...(group.ownerMatematico ? {
        owner_matematico: {
          slot_principal: group.ownerMatematico.slotPrincipalId,
          regla: group.ownerMatematico.regla
        }
      } : {})
    }));
}

function correctionForSlot(slot, error, inputBlock = null, familiaEsperada = null, contextoPlaneacion = null) {
  const representation = resolverRepresentacionSlotCuadernilloV3(slot, contextoPlaneacion);
  const tipo = cleanText(inputBlock?.tipo) || representation.recomendacionPrincipal.tipo;
  const threeLearningsSlot = slot.slotId === 'aprendizaje_guiado:presentacion_tema:8';
  const threeProjectLearningsSlot = slot.slotId === 'actividades_integradoras:presentacion_proyecto:8';
  const twoCompactActionsSlot = slot.slotId === 'actividades_integradoras:presentacion_proyecto:11';
  const threeCaseQuestionsSlot = slot.slotId === 'actividades_integradoras:contextualizacion:20';
  const centralMatrixDataSlot = representation.familia === 'datos_matriz_vector_actividad_central';
  const classificationSlot = slot.slotId === 'aprendizaje_guiado:actividades_comprension:26';
  const contract = CUADERNILLO_V2_SLOT_BLOCK_CONTRACTS[tipo];
  const v3Internal = tipo === 'ejemplo_resuelto'
    ? ['contrato_cuantitativo', 'verificacion']
    : ['actividad', 'proyecto'].includes(tipo) ? ['contrato_tarea'] : [];
  const allowed = threeLearningsSlot
    ? ['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']
    : threeProjectLearningsSlot
      ? ['tipo', 'aprendizaje_1', 'aprendizaje_2', 'aprendizaje_3']
      : twoCompactActionsSlot
        ? ['tipo', 'accion_1', 'accion_2']
        : centralMatrixDataSlot
          ? ['tipo', 'variables', 'etiquetas_filas', 'matriz', 'vector_b']
        : threeCaseQuestionsSlot
          ? ['tipo', 'modalidad', 'instrucciones', 'pregunta_1', 'pregunta_2', 'pregunta_3', 'contrato_tarea']
    : classificationSlot
      ? ['tipo', 'categorias', 'elementos']
    : contract ? [...contract.requeridas, ...contract.opcionales, ...v3Internal] : [];
  const detected = isObject(inputBlock)
    ? Object.keys(inputBlock).filter((key) => !allowed.includes(key))
    : [];
  const correctionRules = [
    `Devuelve una respuesta independiente para ${slot.slotId}.`,
    'Conserva una respuesta por cada slot solicitado y no combines slots.'
  ];
  if (detected.includes('contenido') && tipo !== 'texto') {
    correctionRules.push(`contenido no esta permitido para ${tipo}; usa las propiedades requeridas del schema.`);
  }
  if (tipo === 'conceptos') {
    correctionRules.push('Usa items; cada item requiere termino y explicacion, y ejemplo es opcional.');
  }
  if (threeLearningsSlot) {
    correctionRules.push('Devuelve exactamente aprendizaje_1, aprendizaje_2 y aprendizaje_3 como strings no vacios y diferentes.');
    correctionRules.push('Cada valor comienza con una capacidad observable dirigida al estudiante y relacionada con el tema; no redactes actividades ni evaluaciones.');
  }
  if (threeProjectLearningsSlot) {
    correctionRules.push('Devuelve exactamente aprendizaje_1, aprendizaje_2 y aprendizaje_3 como capacidades observables, no vacias y diferentes.');
  }
  if (twoCompactActionsSlot) {
    correctionRules.push('Devuelve exactamente accion_1 y accion_2 como acciones no vacias y diferentes de una ruta compacta; no anuncies fases.');
  }
  if (threeCaseQuestionsSlot) {
    correctionRules.push('Devuelve exactamente pregunta_1, pregunta_2 y pregunta_3 como preguntas completas, no vacias y diferentes sobre el mismo caso.');
  }
  if (representation.familia === 'datos_matriz_vector_actividad_central') {
    correctionRules.push('Incluye una matriz A numerica 3x3 rectangular, un vector b de tres componentes, tres variables ordenadas con significado y tres etiquetas de fila.');
    correctionRules.push('No remitas a datos externos y no calcules determinante, rango, solucion ni conclusion.');
  }
  if (error?.code === 'editorial_placeholder_lineas') {
    correctionRules.push('Elimina guiones bajos, lineas y caracteres repetidos; reformula cada enunciado como una oracion completa.');
    correctionRules.push('Conserva la actividad y su banco de palabras, columnas o categorias; no muestres soluciones.');
    correctionRules.push('No dibujes el espacio de respuesta: el backend lo agrega automaticamente.');
  }
  if (error?.code === 'respuesta_revelada') {
    correctionRules.push('Conserva el banco de palabras y reformula la descripcion sin mencionar el termino correcto.');
    correctionRules.push('Conserva respuesta_correcta unicamente como metadata interna, no agregues guiones bajos y no muestres la solucion.');
  }
  if (error?.code === 'actividad_en_desarrollo_teorico') {
    correctionRules.push('Reformula el contenido como exposicion pedagogica: explica, define, compara o muestra relaciones sin pedir respuestas, tareas o ejercicios.');
    correctionRules.push('Los ejemplos de Desarrollo teorico deben estar resueltos o ser puramente ilustrativos; reserva las consignas para Actividades de comprension.');
  }
  if (error?.code === 'producto_inconsistente') {
    correctionRules.push('Conserva exactamente el unico producto final definido en la Presentacion del proyecto; no lo sustituyas ni agregues otro entregable.');
  }
  const quantitativeFamily = familiaEsperada || cleanText(inputBlock?.contrato_cuantitativo?.familia_problema);
  const quantitativeInputFields = quantitativeFamily === 'sistema_lineal_2x2'
    ? ['familia_problema', 'datos.ecuaciones[2].coeficiente_x', 'datos.ecuaciones[2].coeficiente_y', 'datos.ecuaciones[2].termino_independiente', 'metodo']
    : quantitativeFamily === 'determinante_2x2'
      ? ['familia_problema', 'datos.matriz[2][2]']
      : quantitativeFamily === 'aritmetica_racional'
        ? ['familia_problema', 'datos.valor_inicial', 'operaciones[].operacion', 'operaciones[].operando']
        : [];
  if (quantitativeFamily && quantitativeFamily !== 'no_cuantitativo') {
    correctionRules.push(`Conserva obligatoriamente la familia ${quantitativeFamily}; no uses no_cuantitativo ni otra familia.`);
    correctionRules.push('Devuelve solo datos matematicos de entrada como racionales literales; no uses expresiones, igualdades ni unidades dentro de un numero.');
    correctionRules.push('No devuelvas soluciones, resultados, determinantes, lados de comprobacion ni operaciones ya calculadas; el backend los deriva.');
    correctionRules.push('No devuelvas contexto_pedagogico, interpretacion, pasos ni otro texto libre dentro del contrato cuantitativo.');
    correctionRules.push('Usa valores pedagogicamente manejables y evita denominadores cero o sistemas singulares.');
  } else if (quantitativeFamily === 'no_cuantitativo') {
    correctionRules.push('Conserva la familia no_cuantitativo y desarrolla el caso concreto de la materia y tema actuales.');
    correctionRules.push('Incluye al menos tres pasos especificos con evidencia, observacion o comparacion, decision y conclusion; no introduzcas metodos matematicos ajenos.');
  }
  return Object.freeze({
    code: cleanText(error?.code) || 'contenido_slot_invalido',
    path: cleanText(error?.path) || `slots[${slot.slotId}].bloque`,
    slotId: slot.slotId,
    slotCausal: slot.slotId,
    tipoRecomendado: representation.recomendacionPrincipal,
    bloquesPermitidos: representation.bloquesPermitidos,
    propiedadesRequeridas: threeLearningsSlot || threeProjectLearningsSlot || twoCompactActionsSlot || centralMatrixDataSlot || threeCaseQuestionsSlot || classificationSlot ? allowed : contract?.requeridas || [],
    propiedadesOpcionales: threeLearningsSlot || threeProjectLearningsSlot || twoCompactActionsSlot || centralMatrixDataSlot || threeCaseQuestionsSlot || classificationSlot ? [] : contract?.opcionales || [],
    ...(detected.length ? { propiedadesProhibidasDetectadas: detected } : {}),
    schemaMinimoValido: quantitativeFamily
      ? { tipo: 'ejemplo_resuelto', contrato_cuantitativo: { familia_problema: quantitativeFamily, datos: 'entradas segun JSON Schema' } }
      : representation.esquemaMinimo,
    ...(Number.isInteger(error?.details?.cantidadEsperada) ? { cantidadEsperada: error.details.cantidadEsperada } : {}),
    ...(Number.isInteger(error?.details?.cantidadEsperadaMin) ? { cantidadEsperadaMin: error.details.cantidadEsperadaMin } : {}),
    ...(Number.isInteger(error?.details?.cantidadEsperadaMax) ? { cantidadEsperadaMax: error.details.cantidadEsperadaMax } : {}),
    ...(Number.isInteger(error?.details?.cantidadRecibida) ? { cantidadRecibida: error.details.cantidadRecibida } : {}),
    ...(quantitativeFamily
      ? { familiaCuantitativa: quantitativeFamily, camposEntradaRequeridos: quantitativeInputFields }
      : {}),
    ...(cleanText(error?.details?.solverStage) ? { solverStage: cleanText(error.details.solverStage) } : {}),
    ...(cleanText(error?.details?.seccionPrevia) ? { seccionPrevia: cleanText(error.details.seccionPrevia) } : {}),
    ...(cleanText(error?.details?.tipoCoincidencia) ? { tipoCoincidencia: cleanText(error.details.tipoCoincidencia) } : {}),
    reglasCorrectivas: correctionRules
  });
}

export function construirPromptSegmentoCuadernilloV3({
  tipoCuadernillo, contextoPlaneacion, segmento, slots = segmento?.slots, errores = [], familiasEsperadas = new Map(), actividadesPrevias = []
}) {
  const metadata = obtenerMetadataTipoCuadernilloV3(tipoCuadernillo);
  if (!metadata || !segmento?.secciones?.length || !Array.isArray(slots) || slots.length === 0) {
    fail('prompt_segmento_invalido', segmento?.id || null);
  }
  const retry = errores.length
    ? `SEGUNDO Y ULTIMO INTENTO. Devuelve nuevamente una entrada independiente por cada slot solicitado. Corrige unicamente esos slots; no incluyas respuestas anteriores. Contratos correctivos seguros: ${JSON.stringify(errores.slice(0, MAX_SAFE_CORRECTIONS))}\n\n`
    : '';
  const systemPrompt = [
    'Genera contenido pedagogico para estudiantes mediante slots canonicos y devuelve JSON valido.',
    'El campo tipo solo acepta discriminadores de bloque; una modalidad nunca se coloca en tipo.',
    'No produzcas cobertura, IDs tecnicos, secciones, orden, datos generales ni metadata documental.',
    'Sigue la politica editorial comun y la politica especifica del tipo.',
    'Devuelve solo el objeto solicitado por JSON Schema, sin Markdown ni texto adicional.'
  ].join(' ');
  const resolveRepresentation = (slot) => resolverRepresentacionSlotCuadernilloV3(slot, contextoPlaneacion);
  const jsonSchema = construirJsonSchemaCompletionV3(slots, resolveRepresentation, familiasEsperadas);
  const contextualPolicy = obtenerPoliticaCuantitativaContextoV3(contextoPlaneacion);
  const userPrompt = `${retry}POLITICA EDITORIAL COMUN OBLIGATORIA:\n- ${CUADERNILLO_V3_COMMON_EDITORIAL_POLICY.join('\n- ')}

POLITICA ESPECIFICA DE ${tipoCuadernillo}:\n- ${CUADERNILLO_V3_TYPE_POLICIES[tipoCuadernillo].join('\n- ')}

${contextualPolicy.length ? `POLITICA DISCIPLINAR CONDICIONAL:\n- ${contextualPolicy.join('\n- ')}\n` : ''}

Slots solicitados:\n${JSON.stringify(slots.map((slot) => promptSlot(slot, familiasEsperadas, contextoPlaneacion)))}

Continuidad editorial segura (solo metadata canonica; no contiene completions previas):\n${JSON.stringify(promptContinuity(tipoCuadernillo, segmento))}

Actividades, problemas y producto ya utilizados (resumen estructural acotado):\n${JSON.stringify(actividadesPrevias.map(({ seccion, modalidad, escenario, variables, relaciones, objetivo, producto }) => ({ seccion, modalidad, escenario, variables, relaciones, objetivo, producto })))}

Grupos de coherencia solicitados:\n${JSON.stringify(promptCoherenceGroups(tipoCuadernillo, segmento, slots))}

Tipo canonico:\n${JSON.stringify(metadata)}

Contexto academico:\n${JSON.stringify(promptContext(contextoPlaneacion))}

Reglas contractuales:
- Devuelve exactamente una respuesta util por cada slot solicitado y copia su slot_id exactamente.
- No resumas, agrupes ni combines slots: la agrupacion editorial ocurre despues en backend.
- Cuando varios slots pertenezcan a un grupo de coherencia, devuelve una entrada por slot pero conserva exactamente el mismo enunciado, contexto, datos, variables y resultado indicado por el grupo.
- El orden de respuestas es libre; no devuelvas slots desconocidos ni duplicados.
- Para componentes condicionales no aplicables literalmente, desarrolla la alternativa canonica.
- Para componentes para completar, solicita una accion concreta y deja espacio; no inventes la respuesta.
- En toda consigna usa una oracion completa: no escribas guiones bajos, lineas, puntos repetidos, recuadros textuales ni frases como "escribe en la linea" o "responde en el recuadro de abajo"; el backend agrega los espacios visuales.
- Entrega parrafos como texto normal; no escribas secuencias visibles \\n, \\r\\n ni caracteres de escape para separarlos.
- En completar con banco de palabras, cada item describe de forma completa el concepto que debe identificarse, conserva el banco en opciones y no muestra la solucion.
- En completar, incluye respuesta_correcta como metadata interna que coincide exactamente con una opcion; no menciones ese termino en el enunciado. El backend valida y elimina esta metadata antes de persistir.
- En Desarrollo teorico explica, define, compara y muestra relaciones: no pidas responder, completar, clasificar, calcular ni comprobar la comprension. Los ejemplos alli deben estar resueltos o ser ilustrativos; las consignas pertenecen exclusivamente a Actividades de comprension.
- En relacionar usa elementos y opciones completos con identificadores neutrales; en clasificar entrega categorias y elementos completos, nunca celdas dibujadas con caracteres.
- Adapta el contenido a materia, nivel, tema, duracion y planeacion sin copiarla literalmente.
- Para actividades y proyectos declara conceptos, datos suficientes, objetivo y aplicacion real del tema; no introduzcas herramientas, metodos ni ejemplos de otra asignatura.
- No reutilices ningun escenario, conjunto de variables, datos, ecuaciones u objetivo de la lista de actividades ya utilizadas; no reformules el mismo problema. La Actividad integradora debe usar un escenario nuevo y combinar los conceptos principales sin duplicar ejemplos o ejercicios basicos.
- En cada ejemplo resuelto desarrolla un caso concreto del tema con al menos tres acciones distinguibles, evidencia del caso, resultado o conclusion e interpretacion; no basta con "analiza", "aplica" o "revisa" sin mostrar como se ejecuta.
- Cuando el schema exija no_cuantitativo, desarrolla un analisis disciplinar concreto y no presentes una solucion numerica libre como verificada.
- No uses LaTeX (\\(...\\), $, $$, \\begin, \\end, \\frac). Usa texto plano y Unicode basico.
- Devuelve JSON directo, sin fences ni texto externo.`;
  return Object.freeze({ systemPrompt, userPrompt, jsonSchema });
}

function parseJson(raw) {
  if (isObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const candidates = [trimmed, trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || '', trimmed.match(/\{[\s\S]*\}/)?.[0] || ''].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isObject(parsed)) return parsed;
    } catch { /* Try the next safe candidate. */ }
  }
  return null;
}

function completionData(result) {
  if (typeof result === 'string' || isObject(result) && Object.hasOwn(result, 'respuestas')) {
    return { content: result, usage: {}, durationMs: 0, finishReason: 'stop' };
  }
  if (!isObject(result)) fail('completion_invalida');
  const usage = isObject(result.usage) ? result.usage : {};
  return {
    content: result.content ?? result.choices?.[0]?.message?.content,
    usage,
    durationMs: Number.isFinite(Number(result.durationMs)) && Number(result.durationMs) >= 0 ? Number(result.durationMs) : 0,
    finishReason: cleanText(result.finishReason ?? result.finish_reason) || null,
    refusal: cleanText(result.refusal) || null
  };
}

function addMetrics(metrics, usage, durationMs, retry) {
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const total = Number(usage.total_tokens ?? prompt + completion);
  const reasoning = Number(usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0);
  metrics.llamadas += 1;
  if (retry) metrics.reintentos += 1;
  metrics.tokensPrompt += Number.isFinite(prompt) ? prompt : 0;
  metrics.tokensCompletion += Number.isFinite(completion) ? completion : 0;
  metrics.tokensTotal += Number.isFinite(total) ? total : 0;
  metrics.tokensReasoning += Number.isFinite(reasoning) ? reasoning : 0;
  metrics.duracionMs += durationMs;
}

export function construirFamiliasEsperadasSegmentoV3(tipoCuadernillo, context, segment) {
  const familiasContexto = obtenerFamiliasCuantitativasContextoV3(context);
  return new Map(segment.slots
    .filter((slot) => resolverRepresentacionSlotCuadernilloV3(slot, context)?.recomendacionPrincipal?.tipo === 'ejemplo_resuelto')
    .map(({ slotId }) => [slotId, familiasContexto.length
      ? (tipoCuadernillo === 'ejercicios_aplicacion' ? [...familiasContexto] : null)
      : 'no_cuantitativo'])
    .filter(([, family]) => family !== null));
}

function safeValidation(error, slotId = null) {
  return {
    code: cleanText(error?.code) || 'contenido_slot_invalido',
    ...(cleanText(error?.path) ? { path: cleanText(error.path).slice(0, 180) } : {}),
    ...(slotId ? { slotId } : {})
  };
}

function emitDiagnostic(diagnosticar, diagnostics, payload) {
  const safe = Object.freeze({ ...payload });
  diagnostics.push(safe);
  if (diagnostics.length > MAX_SAFE_DIAGNOSTICS) diagnostics.shift();
  try { diagnosticar?.(safe); } catch { /* Observability is non-blocking. */ }
}

export function validarRespuestasSlotsCuadernilloV3({ segmento, slotsSolicitados, payload, bloquesExistentes = [], familiasEsperadas = new Map(), resumenesPrevios = [], contextoPlaneacion = null }) {
  if (!isObject(payload)) fail('raiz_slots_invalida', segmento.id, { path: 'slots' });
  assertExactKeys(payload, RESPONSE_ROOT_KEYS, 'raiz_slots_invalida', segmento.id, 'slots');
  if (!Array.isArray(payload.respuestas)) fail('respuestas_slots_invalidas', segmento.id, { path: 'slots.respuestas' });
  const requested = new Map(slotsSolicitados.map((slot) => [slot.slotId, slot]));
  const seen = new Set();
  const seenStatements = new Set();
  bloquesExistentes.flatMap(blockStatements).forEach((statement) => seenStatements.add(statement));
  const validas = new Map();
  const invalidas = new Map();
  const resumenes = new Map();
  const bloquesEntrada = new Map();
  const familiasCuantitativas = new Set();
  let verificacionesExitosas = 0;
  payload.respuestas.forEach((response, index) => {
    const path = `slots.respuestas[${index}]`;
    if (!isObject(response)) fail('respuesta_slot_invalida', segmento.id, { path });
    const slotId = cleanText(response.slot_id);
    if (!requested.has(slotId)) fail('slot_desconocido', segmento.id, { path: `${path}.slot_id`, details: { slotId } });
    if (seen.has(slotId)) fail('slot_duplicado', segmento.id, { path: `${path}.slot_id`, details: { slotId } });
    seen.add(slotId);
    try {
      const slot = requested.get(slotId);
      assertExactKeys(response, RESPONSE_KEYS, 'respuesta_slot_invalida', segmento.id, path);
      const familiaEsperada = familiasEsperadas.get(slotId);
      const familiaRecibida = cleanText(response.bloque?.contrato_cuantitativo?.familia_problema);
      if (familiaEsperada && !(Array.isArray(familiaEsperada)
        ? familiaEsperada.includes(familiaRecibida)
        : familiaRecibida === familiaEsperada)) {
        throw new CuadernilloV2ValidationError(
          'familia_cuantitativa_inconsistente',
          `${path}.bloque.contrato_cuantitativo.familia_problema`,
          { familia: Array.isArray(familiaEsperada) ? null : familiaEsperada, solverStage: 'input_validation' }
        );
      }
      const representation = resolverRepresentacionSlotCuadernilloV3(slot, contextoPlaneacion);
      if (!representation?.bloquesPermitidos.includes(response.bloque?.tipo)) {
        const centralDataRequired = representation?.familia === 'datos_matriz_vector_actividad_central';
        throw new CuadernilloV2ValidationError(
          centralDataRequired ? 'datos_actividad_incompletos' : 'tipo_bloque_no_recomendado',
          centralDataRequired ? `${path}.bloque` : `${path}.bloque.tipo`
        );
      }
      const finalBlock = construirBloqueV3DesdeSlot(slot, response.bloque, { contextoPlaneacion });
      const summary = buildActivitySummary(slot, response.bloque, finalBlock);
      if (summary?.productoReference) {
        const owner = resumenesPrevios.find(({ productoOwner }) => productoOwner);
        if (!owner?.producto || summary.producto !== owner.producto) {
          throw new CuadernilloV2ValidationError('producto_inconsistente', `${path}.bloque.producto`, {
            seccionPrevia: owner?.seccion || 'presentacion_proyecto',
            tipoCoincidencia: 'producto_distinto'
          });
        }
      }
      const statements = blockStatements(finalBlock);
      const duplicateIndex = statements.findIndex((statement) => seenStatements.has(statement));
      if (duplicateIndex >= 0) {
        throw new CuadernilloV2ValidationError('enunciado_duplicado', `${path}.bloque`);
      }
      statements.forEach((statement) => seenStatements.add(statement));
      validas.set(slotId, finalBlock);
      bloquesEntrada.set(slotId, response.bloque);
      if (summary) resumenes.set(slotId, summary);
      const family = response.bloque?.contrato_cuantitativo?.familia_problema;
      if (family && family !== 'no_cuantitativo') {
        familiasCuantitativas.add(family);
        verificacionesExitosas += 1;
      }
    } catch (error) {
      if (!(error instanceof CuadernilloV2ValidationError) && !(error instanceof CuadernilloV3GenerationError)) throw error;
      invalidas.set(slotId, correctionForSlot(requested.get(slotId), error, response.bloque, familiasEsperadas.get(slotId), contextoPlaneacion));
    }
  });
  const acceptedSummaries = [...resumenes.entries()]
    .sort(([left], [right]) => requested.get(left).numero - requested.get(right).numero);
  const history = [...resumenesPrevios];
  for (const [slotId, summary] of acceptedSummaries) {
    const conflict = findActivityConflict(summary, history);
    if (!conflict) {
      history.push(summary);
      continue;
    }
    const error = new CuadernilloV2ValidationError('actividad_repetida', `slots[${slotId}].bloque`, {
      seccionPrevia: conflict.previous.seccion,
      tipoCoincidencia: conflict.type
    });
    invalidas.set(slotId, correctionForSlot(requested.get(slotId), error, bloquesEntrada.get(slotId), familiasEsperadas.get(slotId), contextoPlaneacion));
    validas.delete(slotId);
    resumenes.delete(slotId);
  }
  const pendientes = slotsSolicitados.filter(({ slotId }) => !validas.has(slotId));
  return Object.freeze({ validas, invalidas, resumenes, pendientes: Object.freeze(pendientes), familiasCuantitativas, verificacionesExitosas });
}

function normalizeStatement(value) {
  return cleanText(value).toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:¡!¿?"'()\[\]{}-]+|[\s.,;:¡!¿?"'()\[\]{}-]+$/g, '');
}

function normalizeStructuralText(value) {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/[−–—]/g, '-').replace(/\s+/g, ' ')
    .replace(/^[\s.,;:¡!¿?"'()\[\]{}-]+|[\s.,;:¡!¿?"'()\[\]{}-]+$/g, '').trim();
}

function collectTextValues(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectTextValues(item, output));
  else if (isObject(value)) Object.values(value).forEach((item) => collectTextValues(item, output));
  return output;
}

function normalizeLinearEquation(value) {
  const [left = '', right = ''] = value.replace(/\s+/g, '').split('=');
  const terms = [];
  for (const match of left.matchAll(/([+-]?)(\d+(?:\/\d+)?)?([a-z])/g)) {
    const sign = match[1] === '-' ? '-' : '';
    terms.push(`${match[3]}:${sign}${match[2] || '1'}`);
  }
  return `${terms.sort().join('|')}=${right}`;
}

function extractEquationSet(inputBlock) {
  const contract = inputBlock?.contrato_cuantitativo;
  if (contract?.familia_problema === 'sistema_lineal_2x2') {
    return contract.datos.ecuaciones.map(({ coeficiente_x, coeficiente_y, termino_independiente }) =>
      normalizeLinearEquation(`${coeficiente_x}x+${coeficiente_y}y=${termino_independiente}`)).sort();
  }
  const compact = collectTextValues(inputBlock).join(';').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/[−–—]/g, '-').replace(/\s+/g, '');
  return [...new Set((compact.match(/[+-]?(?:\d+(?:\/\d+)?)?[a-z](?:[+-](?:\d+(?:\/\d+)?)?[a-z])+=-?\d+(?:\/\d+)?/g) || [])
    .map(normalizeLinearEquation))].sort();
}

function buildActivitySummary(slot, inputBlock, finalBlock) {
  if (!['actividad', 'proyecto', 'ejemplo_resuelto'].includes(finalBlock?.tipo)) return null;
  const task = inputBlock?.contrato_tarea;
  const relations = extractEquationSet(inputBlock);
  const variables = [...new Set(relations.join('').match(/[a-z]/g) || [])].sort();
  const scenarioSource = inputBlock?.instrucciones || inputBlock?.enunciado || inputBlock?.items?.[0]?.enunciado || '';
  const escenario = normalizeStructuralText(scenarioSource).slice(0, 180);
  const objetivo = normalizeStructuralText(task?.objetivo || '').slice(0, 140);
  const product = normalizeStructuralText(inputBlock?.producto || '').slice(0, 140);
  const pedagogical = obtenerContratoPedagogicoSlotV3(slot);
  const taskSignature = task ? JSON.stringify({
    familia: normalizeStructuralText(task.familia_tarea),
    objetivo,
    datos: [...task.datos_necesarios].map(normalizeStructuralText).sort()
  }) : '';
  if (!relations.length && !taskSignature && !escenario) return null;
  return Object.freeze({
    slotId: slot.slotId, seccion: slot.seccionId, modalidad: finalBlock.modalidad || finalBlock.tipo,
    escenario, variables: Object.freeze(variables), relaciones: Object.freeze(relations), objetivo, taskSignature,
    producto: product,
    productoOwner: Boolean(pedagogical?.productoOwner),
    productoReference: Boolean(pedagogical?.productoReference)
  });
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findActivityConflict(summary, previousSummaries) {
  for (const previous of previousSummaries) {
    if (summary.relaciones.length >= 2 && sameArray(summary.relaciones, previous.relaciones)) {
      return { previous, type: 'mismas_relaciones' };
    }
    if (!summary.productoReference && summary.taskSignature && summary.taskSignature === previous.taskSignature) {
      return { previous, type: 'mismo_contrato_tarea' };
    }
    if (summary.escenario && summary.escenario === previous.escenario
      && sameArray(summary.variables, previous.variables)) {
      return { previous, type: 'mismo_escenario_variables' };
    }
  }
  return null;
}

function blockStatements(block) {
  const values = block?.tipo === 'actividad'
    ? block.items?.map(({ enunciado }) => enunciado) || []
    : block?.tipo === 'evaluacion'
      ? block.criterios?.map(({ texto }) => texto) || []
      : [];
  return values.map(normalizeStatement).filter(Boolean);
}

function mergeCompatibleBlocks(blocks) {
  const merged = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    const sameOptionalTitle = (previous?.titulo ?? null) === (block.titulo ?? null);
    if (previous && sameOptionalTitle && previous.tipo === block.tipo && ['texto', 'lista', 'conceptos'].includes(block.tipo)) {
      if (block.tipo === 'texto') previous.contenido = `${previous.contenido}\n\n${block.contenido}`;
      else previous.items.push(...structuredClone(block.items));
      previous.cobertura.push(...block.cobertura);
    } else {
      merged.push(structuredClone(block));
    }
  }
  return merged;
}

function expandPendingCoherenceGroups(tipoCuadernillo, segment, pending, validBlocks) {
  const pendingIds = new Set(pending.map(({ slotId }) => slotId));
  const segmentIds = new Set(segment.slots.map(({ slotId }) => slotId));
  const groups = obtenerGruposCoherenciaCuadernilloV3(tipoCuadernillo)
    .filter((group) => group.miembros.every(({ slotId }) => segmentIds.has(slotId))
      && group.miembros.some(({ slotId }) => pendingIds.has(slotId)));
  const expandedIds = new Set(pendingIds);
  for (const group of groups) {
    for (const member of group.miembros) {
      expandedIds.add(member.slotId);
      validBlocks.delete(member.slotId);
    }
  }
  return {
    pending: segment.slots.filter(({ slotId }) => expandedIds.has(slotId)),
    groups
  };
}

const CAUSAL_METADATA_KEYS = Object.freeze([
  'cantidadEsperada', 'cantidadEsperadaMin', 'cantidadEsperadaMax', 'cantidadRecibida',
  'familiaCuantitativa', 'solverStage', 'seccionPrevia', 'tipoCoincidencia'
]);

function copyCausalMetadata(target, cause) {
  const result = { ...target, code: cause.code, path: cause.path, slotCausal: cause.slotCausal || cause.slotId };
  for (const key of CAUSAL_METADATA_KEYS) {
    if (cause[key] !== undefined) result[key] = cause[key];
  }
  return result;
}

function causalErrorsForPending(analysis, contextoPlaneacion = null) {
  return analysis.pendientes.map((slot) => analysis.invalidas.get(slot.slotId)
    || correctionForSlot(slot, { code: 'slot_ausente', path: `slots[${slot.slotId}]` }, null, null, contextoPlaneacion));
}

function causeForExpandedSlot(slot, causalErrors, groups) {
  const own = causalErrors.find(({ slotCausal, slotId }) => (slotCausal || slotId) === slot.slotId);
  if (own) return own;
  const group = groups.find(({ miembros }) => miembros.some(({ slotId }) => slotId === slot.slotId));
  if (!group) return causalErrors[0] || null;
  const memberIds = new Set(group.miembros.map(({ slotId }) => slotId));
  return causalErrors.find(({ slotCausal, slotId }) => memberIds.has(slotCausal || slotId)) || causalErrors[0] || null;
}

function safeCausalDiagnostic(error) {
  return Object.fromEntries(Object.entries({
    code: error?.code || 'contenido_slot_invalido',
    path: error?.path || null,
    slotCausal: error?.slotCausal || error?.slotId || null,
    cantidadEsperada: error?.cantidadEsperada,
    cantidadEsperadaMin: error?.cantidadEsperadaMin,
    cantidadEsperadaMax: error?.cantidadEsperadaMax,
    cantidadRecibida: error?.cantidadRecibida,
    familiaCuantitativa: error?.familiaCuantitativa,
    solverStage: error?.solverStage,
    seccionPrevia: error?.seccionPrevia,
    tipoCoincidencia: error?.tipoCoincidencia
  }).filter(([, value]) => value !== undefined && value !== null));
}

function consolidateQuantitativeCoherenceGroups(tipoCuadernillo, segment, validBlocks) {
  for (const group of obtenerGruposCoherenciaCuadernilloV3(tipoCuadernillo)) {
    if (!group.ownerMatematico) continue;
    if (!group.miembros.every(({ slotId }) => segment.slots.some((slot) => slot.slotId === slotId))) continue;
    const principal = validBlocks.get(group.ownerMatematico.slotPrincipalId);
    if (principal?.tipo !== 'ejemplo_resuelto' || !Array.isArray(principal.matrices)) continue;
    principal.cobertura = [...group.ownerMatematico.coberturaConsolidada];
    for (const member of group.miembros) {
      if (member.slotId !== group.ownerMatematico.slotPrincipalId) validBlocks.delete(member.slotId);
    }
  }
}

function assembleSegment(tipoCuadernillo, segment, validBlocks) {
  consolidateQuantitativeCoherenceGroups(tipoCuadernillo, segment, validBlocks);
  const payload = {
    secciones: segment.secciones.map((section) => ({
      id: section.id,
      titulo: section.titulo,
      orden: section.orden,
      bloques: mergeCompatibleBlocks(segment.slots
        .filter(({ seccionId }) => seccionId === section.id)
        .map(({ slotId }) => validBlocks.get(slotId))
        .filter(Boolean))
    }))
  };
  validateCuadernilloV3Segment(segment.slots[0].tipoCuadernillo, segment.secciones.map(({ id }) => id), payload);
  return payload.secciones;
}

async function generateSegment({ tipoCuadernillo, context, segment, segmentIndex, completar, metrics, diagnosticar, diagnostics, resumenesPrevios, modelo }) {
  const validBlocks = new Map();
  const validSummaries = new Map();
  const familiasEsperadas = construirFamiliasEsperadasSegmentoV3(tipoCuadernillo, context, segment);
  let pending = [...segment.slots];
  let safeErrors = [];
  let causalErrors = [];
  let coherenceGroups = [];
  let responseCounts = { recibidas: 0, validas: 0, invalidas: 0, ausentes: 0 };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    responseCounts = { recibidas: 0, validas: 0, invalidas: 0, ausentes: pending.length };
    const prompt = construirPromptSegmentoCuadernilloV3({
      tipoCuadernillo, contextoPlaneacion: context, segmento: segment, slots: pending,
      errores: safeErrors, familiasEsperadas, actividadesPrevias: resumenesPrevios
    });
    let completion;
    try {
      completion = completionData(await completar({ ...prompt, tipoCuadernillo, segmento: segment, segmentoIndice: segmentIndex, slots: pending, intento: attempt, schemaVersion: 3 }));
    } catch (error) {
      if (error instanceof CuadernilloV3GenerationError) throw error;
      if (error?.isCuadernilloV3ProviderError) {
        fail('completion_provider_fallida', segment.id, { details: error.safeDetails });
      }
      fail('completion_fallida', segment.id);
    }
    addMetrics(metrics, completion.usage, completion.durationMs, attempt === 2);
    const tokenData = {
      tokensPrompt: Number(completion.usage?.prompt_tokens ?? completion.usage?.input_tokens ?? 0) || 0,
      tokensCompletion: Number(completion.usage?.completion_tokens ?? completion.usage?.output_tokens ?? 0) || 0
    };
    try {
      if (completion.refusal) fail('refusal_modelo', segment.id, { path: 'completion.refusal' });
      if (completion.finishReason === 'length') fail('truncamiento', segment.id, { path: 'completion.finish_reason' });
      if (completion.finishReason && completion.finishReason !== 'stop') fail('completion_incompleta', segment.id, { path: 'completion.finish_reason' });
      const parsed = parseJson(completion.content);
      if (!parsed) fail('json_segmento_invalido', segment.id, { path: 'slots' });
      for (const response of parsed.respuestas || []) {
        const family = cleanText(response?.bloque?.contrato_cuantitativo?.familia_problema);
        const expected = familiasEsperadas.get(response?.slot_id);
        if (response?.slot_id && CUADERNILLO_V3_QUANTITATIVE_FAMILIES.includes(family)
          && (!expected || Array.isArray(expected) && expected.includes(family))) {
          familiasEsperadas.set(response.slot_id, family);
        }
      }
      const analysis = validarRespuestasSlotsCuadernilloV3({
        segmento: segment,
        slotsSolicitados: pending,
        payload: parsed,
        bloquesExistentes: [...validBlocks.values()],
        familiasEsperadas,
        resumenesPrevios: [...resumenesPrevios, ...validSummaries.values()],
        contextoPlaneacion: context
      });
      analysis.familiasCuantitativas.forEach((family) => metrics.familiasCuantitativas.add(family));
      metrics.verificacionesExitosas += analysis.verificacionesExitosas;
      for (const [slotId, block] of analysis.validas) validBlocks.set(slotId, block);
      for (const [slotId, summary] of analysis.resumenes) validSummaries.set(slotId, summary);
      responseCounts = {
        recibidas: parsed.respuestas.length,
        validas: analysis.validas.size,
        invalidas: analysis.invalidas.size,
        ausentes: analysis.pendientes.length - analysis.invalidas.size
      };
      const coherence = expandPendingCoherenceGroups(tipoCuadernillo, segment, analysis.pendientes, validBlocks);
      coherenceGroups = coherence.groups;
      for (const slot of coherence.pending) validSummaries.delete(slot.slotId);
      if (coherence.pending.length === 0) {
        emitDiagnostic(diagnosticar, diagnostics, {
          eventType: 'segment_slots_validated', schemaVersion: 3, tipoCuadernillo, segmentoId: segment.id,
          segmentoIndice: segmentIndex, intento: attempt, slotsTotal: segment.slots.length,
          slotsPendientes: [], respuestasRecibidas: responseCounts.recibidas,
          respuestasValidas: responseCounts.validas, respuestasInvalidas: 0, respuestasAusentes: 0,
          finishReason: completion.finishReason, ...tokenData, durationMs: completion.durationMs
        });
        resumenesPrevios.push(...validSummaries.values());
        return assembleSegment(tipoCuadernillo, segment, validBlocks);
      }
      const initiallyPending = new Set(analysis.pendientes.map(({ slotId }) => slotId));
      causalErrors = causalErrorsForPending(analysis, context);
      pending = [...coherence.pending];
      safeErrors = pending.map((slot) => {
        const cause = causeForExpandedSlot(slot, causalErrors, coherence.groups);
        const correction = analysis.invalidas.get(slot.slotId)
          || correctionForSlot(slot, cause || (initiallyPending.has(slot.slotId)
            ? { code: 'slot_ausente', path: `slots[${slot.slotId}]` }
            : { code: 'contenido_grupo_invalido', path: `slots[${slot.slotId}]` }), null,
          typeof familiasEsperadas.get(slot.slotId) === 'string' ? familiasEsperadas.get(slot.slotId) : null, context);
        return cause ? copyCausalMetadata(correction, cause) : correction;
      })
        .slice(0, MAX_SAFE_CORRECTIONS);
      if (coherence.groups.length) {
        safeErrors = safeErrors.map((error) => ({
          ...error,
          gruposCoherencia: coherence.groups
            .filter((group) => group.miembros.some(({ slotId }) => slotId === error.slotId))
            .map(({ id }) => id)
        }));
      }
    } catch (error) {
      const fatal = error instanceof CuadernilloV3GenerationError && ['slot_desconocido', 'slot_duplicado'].includes(error.code);
      if (fatal) throw error;
      safeErrors = [safeValidation(error)];
      causalErrors = safeErrors.map((item) => ({ ...item, slotCausal: item.slotId || null }));
      coherenceGroups = [];
      if (attempt === 1) pending = segment.slots.filter(({ slotId }) => !validBlocks.has(slotId));
    }
    const causalSlotId = causalErrors[0]?.slotCausal || causalErrors[0]?.slotId || null;
    const causalSlot = segment.slots.find(({ slotId }) => slotId === causalSlotId) || pending[0] || null;
    const causalRepresentation = causalSlot ? resolverRepresentacionSlotCuadernilloV3(causalSlot, context)?.recomendacionPrincipal : null;
    emitDiagnostic(diagnosticar, diagnostics, {
      eventType: attempt === 1 ? 'segment_slot_retry' : 'segment_slot_retry_failed', schemaVersion: 3,
      tipoCuadernillo, segmentoId: segment.id, segmentoIndice: segmentIndex, intento: attempt,
      slotsTotal: segment.slots.length, slotsPendientes: pending.map(({ slotId }) => slotId).slice(0, MAX_SAFE_SLOT_IDS),
      respuestasRecibidas: responseCounts.recibidas,
      respuestasValidas: responseCounts.validas,
      respuestasInvalidas: responseCounts.invalidas,
      respuestasAusentes: responseCounts.ausentes,
      retryScope: coherenceGroups.length ? 'group' : 'slot',
      groupExpanded: coherenceGroups.length > 0,
      groupIds: promptCoherenceGroups(tipoCuadernillo, segment, pending).map(({ group_id }) => group_id),
      slotsGrupo: promptCoherenceGroups(tipoCuadernillo, segment, pending).flatMap(({ slots_miembros }) => slots_miembros).slice(0, MAX_SAFE_SLOT_IDS),
      slotsConservadosFueraGrupo: validBlocks.size,
      errorCode: causalErrors[0]?.code || 'slots_incompletos', errorPath: causalErrors[0]?.path || null,
      slotCausal: causalErrors[0]?.slotCausal || causalErrors[0]?.slotId || null,
      representacion: causalRepresentation?.tipo || null,
      modalidad: causalRepresentation?.modalidad || null,
      modelo: modelo || null,
      erroresCausales: causalErrors.slice(0, MAX_SAFE_CORRECTIONS).map(safeCausalDiagnostic),
      cantidadEsperada: causalErrors[0]?.cantidadEsperada ?? null,
      cantidadEsperadaMin: causalErrors[0]?.cantidadEsperadaMin ?? null,
      cantidadEsperadaMax: causalErrors[0]?.cantidadEsperadaMax ?? null,
      cantidadRecibida: causalErrors[0]?.cantidadRecibida ?? null,
      familiaCuantitativa: causalErrors[0]?.familiaCuantitativa || null,
      solverStage: causalErrors[0]?.solverStage || null,
      seccionPreviaConflicto: causalErrors[0]?.seccionPrevia || null,
      tipoCoincidencia: causalErrors[0]?.tipoCoincidencia || null,
      finishReason: completion.finishReason, ...tokenData, durationMs: completion.durationMs
    });
    if (attempt === 2) fail('segmento_invalido_tras_retry', segment.id, {
      path: safeErrors[0]?.path || null,
      details: { slotsPendientes: pending.map(({ slotId }) => slotId).slice(0, MAX_SAFE_SLOT_IDS) },
      diagnostics
    });
  }
  fail('segmento_invalido_tras_retry', segment.id, { diagnostics });
}

export async function generarCuadernilloV3({ tipoCuadernillo, contextoPlaneacion, completar, diagnosticar = null, modelo = null }) {
  if (!esTipoCuadernillo(tipoCuadernillo)) fail('tipo_cuadernillo_invalido');
  if (typeof completar !== 'function') fail('completar_requerido');
  const context = normalizeContext(contextoPlaneacion);
  const metadata = obtenerMetadataTipoCuadernilloV3(tipoCuadernillo);
  const plan = crearPlanSegmentosCuadernilloV3(tipoCuadernillo);
  const metrics = { segmentos: 4, llamadas: 0, reintentos: 0, tokensPrompt: 0, tokensCompletion: 0, tokensReasoning: 0, tokensTotal: 0, duracionMs: 0, familiasCuantitativas: new Set(), verificacionesExitosas: 0 };
  const sections = [];
  const diagnostics = [];
  const resumenesActividades = [];
  for (let index = 0; index < plan.length; index += 1) {
    sections.push(...await generateSegment({
      tipoCuadernillo, context, segment: plan[index], segmentIndex: index + 1,
      completar, metrics, diagnosticar, diagnostics, resumenesPrevios: resumenesActividades, modelo
    }));
  }
  const contenido = {
    schema_version: ANEXO_SCHEMA_VERSION_V3,
    titulo: `${metadata.label}: ${context.tema}`,
    descripcion: metadata.descripcion,
    secciones: sections
  };
  try {
    validateCuadernilloV3(tipoCuadernillo, contenido);
  } catch (error) {
    const safe = safeValidation(error);
    emitDiagnostic(diagnosticar, diagnostics, {
      eventType: 'segment_slot_retry_failed', schemaVersion: 3, tipoCuadernillo, segmentoId: 'validacion_final',
      segmentoIndice: 0, intento: 1, slotsTotal: plan.flatMap(({ slots }) => slots).length,
      slotsPendientes: [], errorCode: safe.code, errorPath: safe.path || null,
      finishReason: null, tokensPrompt: metrics.tokensPrompt,
      tokensCompletion: metrics.tokensCompletion, durationMs: metrics.duracionMs
    });
    fail('validacion_final_invalida', 'validacion_final', { path: safe.path || null, diagnostics });
  }
  return Object.freeze({ contenido, metricas: Object.freeze({ ...metrics, familiasCuantitativas: Object.freeze([...metrics.familiasCuantitativas]) }) });
}
