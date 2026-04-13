const QUESTION_TYPE_LABELS = {
  opcion_multiple: 'Opcion multiple',
  verdadero_falso: 'Verdadero/Falso',
  respuesta_corta: 'Respuesta corta / completar',
  emparejamiento: 'Emparejamiento / relacion de columnas',
  pregunta_abierta: 'Pregunta abierta / ensayo',
  calculo_numerico: 'Calculo / numerica',
  ordenacion_jerarquizacion: 'Ordenacion / jerarquizacion'
};

function truncateText(value, maxLength = 180) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function summarizeTablaIa(tablaIa) {
  if (!Array.isArray(tablaIa) || tablaIa.length === 0) {
    return 'Sin planeacion guardada.';
  }

  return tablaIa
    .map((fila) => {
      const tiempo = typeof fila?.tiempo_sesion === 'string' ? fila.tiempo_sesion.trim() : 'Momento';
      const actividades = truncateText(typeof fila?.actividades === 'string' ? fila.actividades : '', 160);
      return `- ${tiempo}: ${actividades || 'Sin detalle.'}`;
    })
    .join('\n');
}

function buildQuestionTypesBlock(tiposPregunta) {
  return (tiposPregunta || [])
    .map((tipo) => `- ${tipo}: ${QUESTION_TYPE_LABELS[tipo] || tipo}`)
    .join('\n');
}

function buildQuestionPlanBlock(questionPlan) {
  return (questionPlan?.items || [])
    .map((item) => `- ${item.tipo}: ${item.count} reactivo(s). Referencia: ${item.countRange}. Tiempo estimado: ${item.timeGuide}.`)
    .join('\n');
}

function buildTopicsBlock(temasContexto) {
  return (temasContexto || [])
    .map((tema, index) => {
      const parts = [
        `${index + 1}. Tema: ${tema.tema}`,
        `Duracion aproximada: ${tema.duracion} minutos`
      ];

      if (tema.planeacion_id) {
        parts.push(`Planeacion asociada: ${tema.planeacion_id}`);
      } else {
        parts.push('Planeacion asociada: no disponible');
      }

      parts.push('Resumen de planeacion:');
      parts.push(summarizeTablaIa(tema.tabla_ia));
      return parts.join('\n');
    })
    .join('\n\n');
}

export function buildExamPromptByUnit({
  plantel,
  grado,
  materia,
  unidad,
  tiposPregunta,
  temasContexto,
  totalPreguntasSugerido,
  questionPlan,
  tiempoMin,
  enforceExactPlan = false,
  enforceExactDistribution = false
}) {
  const tiposBlock = buildQuestionTypesBlock(tiposPregunta);
  const planBlock = buildQuestionPlanBlock(questionPlan);
  const topicsBlock = buildTopicsBlock(temasContexto);
  const perTopicTarget = temasContexto?.length
    ? (Number(questionPlan?.totalReactivos || 0) / Number(temasContexto.length)).toFixed(1)
    : '0';
  const coverageInstruction = Number(questionPlan?.totalReactivos || 0) >= Number(temasContexto?.length || 0)
    ? 'Procura cubrir todos los temas al menos una vez y reparte el resto de reactivos de forma equilibrada.'
    : 'Cubre la mayor cantidad posible de temas sin exceder el total de reactivos; prioriza una distribucion equilibrada.';

  return `
Actua como un DOCENTE EXPERTO en evaluacion academica y diseno de examenes por unidad.
Genera un examen coherente con la unidad completa usando SOLO el contexto disponible.

Devuelve EXCLUSIVAMENTE un objeto JSON valido con esta estructura base:
{
  "titulo": "texto",
  "instrucciones_generales": "texto",
  "preguntas": [
    {
      "tipo": "opcion_multiple | verdadero_falso | respuesta_corta | emparejamiento | pregunta_abierta | calculo_numerico | ordenacion_jerarquizacion",
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

REGLAS ESTRICTAS:
- No escribas texto fuera del JSON.
- Usa SOLO los temas de esta unidad. No inventes temas externos.
- ${enforceExactPlan
    ? `Genera EXACTAMENTE ${totalPreguntasSugerido} reactivos en total.`
    : `Genera aproximadamente ${totalPreguntasSugerido} reactivos, ajustando solo lo necesario para cubrir todos los tipos seleccionados con coherencia.`}
- Debe aparecer al menos UNA pregunta de cada tipo seleccionado por el usuario.
- Distribuye las preguntas entre los temas disponibles de la unidad.
- Si existe planeacion, usala como apoyo para el contenido y nivel de profundidad.
- En el campo "tipo" usa EXACTAMENTE una de estas claves internas, no uses labels amigables: opcion_multiple, verdadero_falso, respuesta_corta, emparejamiento, pregunta_abierta, calculo_numerico, ordenacion_jerarquizacion.
- ${enforceExactDistribution
    ? 'Respeta EXACTAMENTE el plan de reactivos por tipo indicado abajo. No agregues ni elimines preguntas por tipo.'
    : 'Usa el plan de reactivos por tipo como guia principal de distribucion, pero prioriza cumplir el total solicitado.'}
- Cada item debe incluir obligatoriamente el campo "pregunta" como string breve y claro.
- Manten consistencia entre el tipo de pregunta y sus campos.
- La redaccion de cada reactivo debe ser breve y directa para no extender innecesariamente el examen.
- La explicacion debe ser corta, maximo una frase.
- ${coverageInstruction}

PLAN DE REACTIVOS:
${planBlock}
Objetivo de cobertura: ${questionPlan?.totalReactivos || 0} reactivos totales para ${temasContexto?.length || 0} tema(s), aproximadamente ${perTopicTarget} reactivos por tema.

CAMPOS POR TIPO:
- opcion_multiple: incluye "opciones" con 4 opciones y "respuesta_correcta" como texto.
- verdadero_falso: incluye "opciones" con ["Verdadero", "Falso"] y "respuesta_correcta".
- respuesta_corta: incluye "respuesta_correcta" breve y precisa.
- emparejamiento: incluye "pares" y "respuesta_correcta" como arreglo de correspondencias. Usa solo 4 o 5 pares por bloque.
- pregunta_abierta: incluye "criterios_evaluacion" y "respuesta_correcta" como respuesta modelo breve.
- calculo_numerico: incluye "respuesta_correcta" numerica o con unidad si aplica.
- ordenacion_jerarquizacion: incluye "elementos" desordenados y "respuesta_correcta" como arreglo ordenado.

CONTEXTO ACADEMICO:
Plantel: ${plantel || 'No especificado'}
Grado/Nivel: ${grado || 'No especificado'}
Materia: ${materia || 'No especificada'}
Unidad: ${unidad || 'No especificada'}
Duracion objetivo del examen: ${tiempoMin || 50} minutos

TIPOS DE PREGUNTA SELECCIONADOS:
${tiposBlock}

TEMAS Y PLANEACIONES DISPONIBLES:
${topicsBlock}
`;
}
