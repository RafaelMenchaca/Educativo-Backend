export const CUADERNILLO_V3_QUANTITATIVE_FAMILIES = Object.freeze([
  'aritmetica_racional',
  'determinante_2x2',
  'sistema_lineal_2x2'
]);

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

export function construirSchemaBloqueV3(tipo, modalidad = null, familiaCuantitativa = null) {
  const common = { tipo: { type: 'string', enum: [tipo] } };
  switch (tipo) {
    case 'texto': return noExtras({ ...common, contenido: string });
    case 'lista': return noExtras({ ...common, items: stringArray });
    case 'conceptos': return noExtras({ ...common, items: { type: 'array', items: noExtras({ termino: string, explicacion: string }) } });
    case 'tabla': return noExtras({ ...common, columnas: stringArray, filas: { type: 'array', items: stringArray } });
    case 'actividad': return noExtras({ ...common, modalidad: { type: 'string', enum: [modalidad || 'preguntas'] }, instrucciones: string, items: { type: 'array', items: noExtras({ enunciado: string }) }, contrato_tarea: CUADERNILLO_V3_TASK_CONTRACT_SCHEMA });
    case 'procedimiento': return noExtras({ ...common, pasos: stringArray });
    case 'ejemplo_resuelto': return familiaCuantitativa ? noExtras({
      ...common,
      contrato_cuantitativo: QUANTITATIVE_SCHEMAS_BY_FAMILY[familiaCuantitativa]
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
    const definitionId = `bloque_${tipo}${modalidad ? `_${modalidad}` : ''}${familiaCuantitativa ? `_${familiaCuantitativa}` : ''}`;
    definitions[definitionId] ||= construirSchemaBloqueV3(tipo, modalidad, familiaCuantitativa);
    return noExtras({
      slot_id: { type: 'string', enum: [slot.slotId] },
      bloque: { $ref: `#/$defs/${definitionId}` }
    });
  });
  return { ...noExtras({
    respuestas: { type: 'array', items: { anyOf: variants } }
  }), $defs: definitions };
}
