export const CUADERNILLO_V3_QUANTITATIVE_FAMILIES = Object.freeze([
  'aritmetica_racional',
  'determinante_2x2',
  'sistema_lineal_2x2'
]);

function normalizeAcademicId(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const QUANTITATIVE_CONTEXT_FAMILIES = Object.freeze({
  'matematicas|algebra lineal': Object.freeze(['determinante_2x2', 'sistema_lineal_2x2']),
  'matematica|algebra lineal': Object.freeze(['determinante_2x2', 'sistema_lineal_2x2']),
  'matematicas|ecuaciones lineales': Object.freeze(['sistema_lineal_2x2']),
  'matematica|ecuaciones lineales': Object.freeze(['sistema_lineal_2x2'])
});

export function obtenerFamiliasCuantitativasContextoV3(contexto) {
  const key = `${normalizeAcademicId(contexto?.materia)}|${normalizeAcademicId(contexto?.tema)}`;
  return QUANTITATIVE_CONTEXT_FAMILIES[key] || Object.freeze([]);
}

export function obtenerPoliticaCuantitativaContextoV3(contexto) {
  const familias = obtenerFamiliasCuantitativasContextoV3(contexto);
  if (!familias.length) return Object.freeze([]);
  return Object.freeze([
    'Este contexto admite exclusivamente las familias cuantitativas indicadas por el owner; devuelve solo sus datos matematicos de entrada.',
    'El backend construye operaciones, resultado, comprobacion e interpretacion y no puede ser sobrescrito por texto generado.',
    'Usa texto plano y Unicode; representa estructuras tabulares mediante el bloque tabla y no uses LaTeX.'
  ]);
}

// Keep the provider schema inside the Structured Outputs supported subset.
// Length, shape and non-empty constraints remain enforced by the backend validator.
const string = Object.freeze({ type: 'string' });
const stringArray = Object.freeze({ type: 'array', items: string });
const noExtras = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const rational = string;

export const CUADERNILLO_V3_TASK_CONTRACT_SCHEMA = Object.freeze(noExtras({
  conceptos_requeridos: stringArray,
  familia_tarea: string,
  datos_necesarios: stringArray,
  objetivo: string,
  condicion_suficiencia: string,
  aplicacion_tema: string
}));

const arithmetic = noExtras({
  familia_problema: { type: 'string', enum: ['aritmetica_racional'] },
  datos: noExtras({ valor_inicial: rational }),
  operaciones: { type: 'array', items: noExtras({ operacion: { type: 'string', enum: ['suma', 'resta', 'multiplicacion', 'division'] }, operando: rational }) }
});
const determinant = noExtras({
  familia_problema: { type: 'string', enum: ['determinante_2x2'] },
  datos: noExtras({ matriz: { type: 'array', items: { type: 'array', items: rational } } })
});
const equation = noExtras({ coeficiente_x: rational, coeficiente_y: rational, termino_independiente: rational });
const system = noExtras({
  familia_problema: { type: 'string', enum: ['sistema_lineal_2x2'] },
  datos: noExtras({ ecuaciones: { type: 'array', items: equation } }),
  metodo: { type: 'string', enum: ['cramer'] }
});

const QUANTITATIVE_SCHEMAS_BY_FAMILY = Object.freeze({
  aritmetica_racional: arithmetic,
  determinante_2x2: determinant,
  sistema_lineal_2x2: system
});

export const CUADERNILLO_V3_QUANTITATIVE_SCHEMA = Object.freeze({
  anyOf: [arithmetic, determinant, system]
});
const noQuantitative = Object.freeze(noExtras({ familia_problema: { type: 'string', enum: ['no_cuantitativo'] } }));

export function obtenerContratoAcademicoSlotV3(slot, blockType) {
  const quantitative = blockType === 'ejemplo_resuelto';
  return Object.freeze({
    requiereContratoTarea: ['actividad', 'proyecto'].includes(blockType),
    permiteCuantitativo: quantitative,
    familiasCuantitativas: Object.freeze(quantitative ? [...CUADERNILLO_V3_QUANTITATIVE_FAMILIES] : []),
    fallbackCuantitativo: quantitative ? 'Usa no_cuantitativo cuando el ejemplo no sea numerico; no inventes una familia.' : 'No presentes una solucion numerica libre.'
  });
}

const responseSpace = noExtras({ lineas: { type: 'integer' } });
const threeLearnings = noExtras({
  tipo: { type: 'string', enum: ['lista'] },
  aprendizaje_1: string,
  aprendizaje_2: string,
  aprendizaje_3: string
});
const threeProjectLearnings = noExtras({
  tipo: { type: 'string', enum: ['lista'] },
  aprendizaje_1: string,
  aprendizaje_2: string,
  aprendizaje_3: string
});
const twoCompactActions = noExtras({
  tipo: { type: 'string', enum: ['lista'] },
  accion_1: string,
  accion_2: string
});
const threeCaseQuestions = noExtras({
  tipo: { type: 'string', enum: ['actividad'] },
  modalidad: { type: 'string', enum: ['preguntas'] },
  instrucciones: string,
  pregunta_1: string,
  pregunta_2: string,
  pregunta_3: string,
  contrato_tarea: CUADERNILLO_V3_TASK_CONTRACT_SCHEMA
});
const matrixVariable = noExtras({ simbolo: string, significado: string });
const centralMatrixVectorData = noExtras({
  tipo: { type: 'string', enum: ['tabla'] },
  variables: { type: 'array', items: matrixVariable },
  etiquetas_filas: stringArray,
  matriz: { type: 'array', items: stringArray },
  vector_b: stringArray
});

export function construirSchemaBloqueV3(tipo, modalidad = null, familiaCuantitativa = null, espacioRespuestaBackend = false) {
  const common = { tipo: { type: 'string', enum: [tipo] } };
  switch (tipo) {
    case 'texto': return noExtras({ ...common, contenido: string });
    case 'lista': return noExtras({ ...common, items: stringArray });
    case 'conceptos': return noExtras({ ...common, items: { type: 'array', items: noExtras({ termino: string, explicacion: string }) } });
    case 'tabla': return noExtras({ ...common, columnas: stringArray, filas: { type: 'array', items: stringArray } });
    case 'actividad': {
      const itemProperties = { enunciado: string };
      if (!espacioRespuestaBackend) itemProperties.espacio_respuesta = responseSpace;
      if (['completar', 'relacionar'].includes(modalidad)) itemProperties.opciones = stringArray;
      if (modalidad === 'completar') itemProperties.respuesta_correcta = string;
      return noExtras({ ...common, modalidad: { type: 'string', enum: [modalidad || 'preguntas'] }, instrucciones: string, items: { type: 'array', items: noExtras(itemProperties) }, contrato_tarea: CUADERNILLO_V3_TASK_CONTRACT_SCHEMA });
    }
    case 'procedimiento': return noExtras({ ...common, pasos: stringArray });
    case 'ejemplo_resuelto': return familiaCuantitativa ? noExtras({
      ...common,
      ...(familiaCuantitativa === 'no_cuantitativo'
        ? { enunciado: string, pasos: stringArray, resultado: string, verificacion: stringArray, interpretacion: string }
        : {}),
      contrato_cuantitativo: familiaCuantitativa === 'no_cuantitativo'
        ? noQuantitative
        : Array.isArray(familiaCuantitativa)
        ? { anyOf: familiaCuantitativa.map((family) => QUANTITATIVE_SCHEMAS_BY_FAMILY[family]) }
        : QUANTITATIVE_SCHEMAS_BY_FAMILY[familiaCuantitativa]
    }) : {
      anyOf: [
        noExtras({ ...common, enunciado: string, pasos: stringArray, resultado: string, verificacion: stringArray, interpretacion: string, contrato_cuantitativo: noQuantitative }),
        noExtras({ ...common, contrato_cuantitativo: CUADERNILLO_V3_QUANTITATIVE_SCHEMA })
      ]
    };
    case 'proyecto': return noExtras({ ...common, producto: string, instrucciones: string, etapas: stringArray, espacio_respuesta: responseSpace, contrato_tarea: CUADERNILLO_V3_TASK_CONTRACT_SCHEMA });
    case 'registro': return noExtras({ ...common, campos: stringArray, espacio_respuesta: responseSpace });
    case 'evaluacion': return noExtras({ ...common, modalidad: { type: 'string', enum: [modalidad || 'lista_cotejo'] }, criterios: { type: 'array', items: noExtras({ texto: string }) } });
    case 'espacio_respuesta': return noExtras({ ...common, etiqueta: string, lineas: { type: 'integer' } });
    default: throw new Error(`tipo_bloque_no_soportado:${tipo}`);
  }
}

export function construirJsonSchemaCompletionV3(slots, resolveRepresentation, familiasEsperadas = new Map()) {
  const definitions = {};
  const variants = slots.map((slot) => {
    const representation = resolveRepresentation(slot);
    const { tipo, modalidad } = representation.recomendacionPrincipal;
    const familiaCuantitativa = familiasEsperadas.get(slot.slotId) || null;
    const familyKey = Array.isArray(familiaCuantitativa) ? familiaCuantitativa.join('_') : familiaCuantitativa;
    const threeLearningsSlot = slot.slotId === 'aprendizaje_guiado:presentacion_tema:8';
    const threeProjectLearningsSlot = slot.slotId === 'actividades_integradoras:presentacion_proyecto:8';
    const twoCompactActionsSlot = slot.slotId === 'actividades_integradoras:presentacion_proyecto:11';
    const threeCaseQuestionsSlot = slot.slotId === 'actividades_integradoras:contextualizacion:20';
    const centralMatrixDataSlot = slot.slotId === 'actividades_integradoras:contextualizacion:18'
      && representation.familia === 'datos_matriz_vector_actividad_central';
    const classificationSlot = slot.slotId === 'aprendizaje_guiado:actividades_comprension:26';
    const definitionId = threeLearningsSlot
      ? 'bloque_lista_tres_aprendizajes'
      : threeProjectLearningsSlot
        ? 'bloque_lista_tres_aprendizajes_proyecto'
        : twoCompactActionsSlot
          ? 'bloque_lista_dos_acciones_compactas'
          : centralMatrixDataSlot
            ? 'bloque_datos_matriz_vector_actividad_central'
          : threeCaseQuestionsSlot
            ? 'bloque_actividad_tres_preguntas_caso'
      : classificationSlot
        ? 'bloque_tabla_clasificacion'
      : `bloque_${tipo}${modalidad ? `_${modalidad}` : ''}${familyKey ? `_${familyKey}` : ''}`;
    definitions[definitionId] ||= threeLearningsSlot
      ? threeLearnings
      : threeProjectLearningsSlot
        ? threeProjectLearnings
        : twoCompactActionsSlot
          ? twoCompactActions
          : centralMatrixDataSlot
            ? centralMatrixVectorData
          : threeCaseQuestionsSlot
            ? threeCaseQuestions
      : classificationSlot
        ? noExtras({ tipo: { type: 'string', enum: ['tabla'] }, categorias: stringArray, elementos: stringArray })
        : construirSchemaBloqueV3(tipo, modalidad, familiaCuantitativa, representation.espacioRespuestaBackend === true);
    return noExtras({
      slot_id: { type: 'string', enum: [slot.slotId] },
      bloque: { $ref: `#/$defs/${definitionId}` }
    });
  });
  return { ...noExtras({
    respuestas: { type: 'array', items: { anyOf: variants } }
  }), $defs: definitions };
}
