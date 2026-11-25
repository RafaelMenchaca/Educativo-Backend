import { resolverRepresentacionSlotCuadernillo } from './cuadernilloRepresentations.js';
import { obtenerNivelProcedimentalSlotV3 } from './cuadernillosV3.js';

const SCHEMAS = Object.freeze({
  texto: Object.freeze({ tipo: 'texto', contenido: '<texto directo, especifico y no vacio>' }),
  lista: Object.freeze({ tipo: 'lista', items: Object.freeze(['<elemento especifico no vacio>']) }),
  conceptos: Object.freeze({ tipo: 'conceptos', items: Object.freeze([Object.freeze({ termino: '<termino>', explicacion: '<explicacion especifica>', ejemplo: '<ejemplo opcional>' })]) }),
  tabla: Object.freeze({ tipo: 'tabla', columnas: Object.freeze(['<encabezado concreto>']), filas: Object.freeze([Object.freeze(['<celda concreta>'])]) }),
  actividad: Object.freeze({ tipo: 'actividad', modalidad: '<modalidad indicada>', instrucciones: '<orden concreta al estudiante iniciada con verbo>', items: Object.freeze([Object.freeze({ enunciado: '<consigna completa vinculada con materia y tema>' })]), contrato_tarea: Object.freeze({ conceptos_requeridos: Object.freeze(['<concepto canonico usado>']), familia_tarea: '<familia concreta>', datos_necesarios: Object.freeze(['<dato suficiente>']), objetivo: '<resultado o producto solicitado>', condicion_suficiencia: '<por que los datos bastan>', aplicacion_tema: '<conexion explicita con el tema>' }) }),
  procedimiento: Object.freeze({ tipo: 'procedimiento', pasos: Object.freeze(['<primer paso ejecutable y especifico>', '<siguiente paso con la operacion o decision concreta>']) }),
  ejemplo_resuelto: Object.freeze({ tipo: 'ejemplo_resuelto', enunciado: '<situacion completa>', pasos: Object.freeze(['<primer paso desarrollado>', '<siguiente operacion o transformacion concreta>']), resultado: '<resultado sin etiqueta repetida>', verificacion: Object.freeze(['<sustitucion u operacion concreta aplicada a todas las condiciones originales>']), interpretacion: '<interpretacion sin conclusion redundante>', contrato_cuantitativo: Object.freeze({ familia_problema: 'no_cuantitativo' }) }),
  proyecto: Object.freeze({ tipo: 'proyecto', producto: '<entregable concreto>', instrucciones: '<orden directa al estudiante>', etapas: Object.freeze(['<etapa ejecutable>']), espacio_respuesta: Object.freeze({ lineas: 3 }), contrato_tarea: Object.freeze({ conceptos_requeridos: Object.freeze(['<concepto canonico usado>']), familia_tarea: '<familia concreta>', datos_necesarios: Object.freeze(['<dato suficiente>']), objetivo: '<resultado o producto solicitado>', condicion_suficiencia: '<por que los datos bastan>', aplicacion_tema: '<conexion explicita con el tema>' }) }),
  registro: Object.freeze({ tipo: 'registro', campos: Object.freeze(['<dato concreto que registra el estudiante>']), espacio_respuesta: Object.freeze({ lineas: 2 }) }),
  evaluacion: Object.freeze({ tipo: 'evaluacion', modalidad: '<modalidad indicada>', criterios: Object.freeze([Object.freeze({ texto: '<criterio observable>' })]) }),
  espacio_respuesta: Object.freeze({ tipo: 'espacio_respuesta', etiqueta: '<accion o respuesta solicitada>', lineas: 3 })
});

function schemaForType(tipo, modalidad = null) {
  const schema = structuredClone(SCHEMAS[tipo]);
  if (Object.hasOwn(schema, 'modalidad')) {
    schema.modalidad = modalidad || (tipo === 'evaluacion' ? 'lista_cotejo' : 'preguntas');
  }
  return Object.freeze(schema);
}

function schemasForRepresentation(representation) {
  return Object.freeze(representation.bloquesPermitidos.map((tipo) => Object.freeze({
    tipo,
    esquema: schemaForType(
      tipo,
      representation.recomendacionPrincipal.tipo === tipo
        ? representation.recomendacionPrincipal.modalidad
        : null
    )
  })));
}

function proceduralRules(level) {
  if (level === 'demostrativo') return [
    'Desarrolla el metodo con datos concretos, sustituciones, operaciones intermedias, transformaciones y decisiones necesarias; no basta con nombrar acciones.',
    'En un procedimiento cuantitativo muestra expresiones y valores intermedios; en uno conceptual indica que observar, comparar o decidir y como llegar a la conclusion.',
    'Usa pasos breves, una accion concreta por paso, sin repetir en prosa las operaciones ni duplicar resultado, verificacion o interpretacion.'
  ];
  if (level === 'orientador') return [
    'Indica una ruta clara y recuerda condiciones o formulas necesarias, pero deja las operaciones y el resultado final al estudiante.',
    'No resuelvas por el estudiante ni conviertas la orientacion en un ejemplo completamente resuelto.'
  ];
  if (level === 'operativo') return [
    'Ordena acciones, decisiones, entregables y evidencias; no fabriques resultados, observaciones o conclusiones que el estudiante aun no obtiene.',
    'Cada fase debe indicar que se analiza, construye, registra o revisa, sin reducirse a verbos genericos.'
  ];
  return [];
}

function completeRepresentation(representation, slot = null) {
  const proceduralLevel = obtenerNivelProcedimentalSlotV3(slot);
  const consistencyRules = representation.recomendacionPrincipal.tipo === 'ejemplo_resuelto'
    ? [
        'Para familias cuantitativas soportadas devuelve exclusivamente datos matematicos de entrada racionales.',
        'El backend construye pasos, determinantes, solucion, resultado, comprobacion e interpretacion canonica.',
        'No incluyas contexto, texto libre, resultado_estructurado, verificacion_estructurada, soluciones, igualdades calculadas ni operaciones resueltas.',
        'Usa no_cuantitativo solo cuando no presentes una solucion numerica libre.'
      ]
    : [];
  return Object.freeze({
    ...representation,
    bloquesPermitidos: Object.freeze([representation.recomendacionPrincipal.tipo]),
    schemasPermitidos: schemasForRepresentation({ ...representation, bloquesPermitidos: [representation.recomendacionPrincipal.tipo] }),
    reglas: Object.freeze([...representation.reglas, ...consistencyRules, ...proceduralRules(proceduralLevel)]),
    ...(proceduralLevel ? { nivelProcedimental: proceduralLevel } : {})
  });
}

function representationForCompletable(slot) {
  if (slot.clasificacion !== 'para_completar') return null;
  if (/registro/i.test(slot.nombre)) {
    return completeRepresentation({
      familia: 'registro_estudiante',
      bloquesPermitidos: Object.freeze(['registro']),
      recomendacionPrincipal: Object.freeze({ tipo: 'registro' }),
      esquemaMinimo: SCHEMAS.registro,
      reglas: Object.freeze(['Solicita datos o evidencias concretas y deja espacio para que el estudiante los registre.'])
    }, slot);
  }
  return completeRepresentation({
    familia: 'respuesta_estudiante',
    bloquesPermitidos: Object.freeze(['espacio_respuesta', 'actividad', 'registro']),
    recomendacionPrincipal: Object.freeze({ tipo: 'espacio_respuesta' }),
    esquemaMinimo: SCHEMAS.espacio_respuesta,
    reglas: Object.freeze(['Formula una solicitud concreta y deja espacio de trabajo; no inventes la respuesta del estudiante.'])
  });
}

export function resolverRepresentacionSlotCuadernilloV3(slot) {
  if (slot.slotId === 'ejercicios_aplicacion:repaso_teorico:11') {
    return completeRepresentation({
      familia: 'panorama_relacional',
      bloquesPermitidos: Object.freeze(['lista', 'tabla', 'texto']),
      recomendacionPrincipal: Object.freeze({ tipo: 'lista' }),
      esquemaMinimo: SCHEMAS.lista,
      reglas: Object.freeze(['Relaciona brevemente los conceptos entre si; no repitas definiciones operativas completas.'])
    }, slot);
  }
  if (slot.slotId === 'ejercicios_aplicacion:repaso_teorico:12') {
    return completeRepresentation({
      familia: 'definiciones_operativas',
      bloquesPermitidos: Object.freeze(['conceptos']),
      recomendacionPrincipal: Object.freeze({ tipo: 'conceptos' }),
      esquemaMinimo: SCHEMAS.conceptos,
      reglas: Object.freeze(['Incluye definiciones operativas precisas sin repetir el panorama relacional.'])
    }, slot);
  }
  const completable = representationForCompletable(slot);
  if (completable) return completable;
  const historical = resolverRepresentacionSlotCuadernillo(slot);
  if (!historical) return null;
  const { tipo, modalidad } = historical.recomendacionPrincipal;
  const schema = structuredClone(SCHEMAS[tipo]);
  if (modalidad) schema.modalidad = modalidad;
  return completeRepresentation({
    familia: historical.familia,
    bloquesPermitidos: Object.freeze([...historical.bloquesPermitidos]),
    recomendacionPrincipal: Object.freeze({ ...historical.recomendacionPrincipal }),
    esquemaMinimo: Object.freeze(schema),
    reglas: Object.freeze([...historical.reglas])
  }, slot);
}
