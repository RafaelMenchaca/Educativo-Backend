import { resolverRepresentacionSlotCuadernillo } from './cuadernilloRepresentations.js';
import { obtenerContratoDatosActividadCentralV3, obtenerContratoPedagogicoSlotV3, obtenerNivelProcedimentalSlotV3 } from './cuadernillosV3.js';

const SCHEMAS = Object.freeze({
  texto: Object.freeze({ tipo: 'texto', contenido: '<texto directo, especifico y no vacio>' }),
  lista: Object.freeze({ tipo: 'lista', items: Object.freeze(['<elemento especifico no vacio>']) }),
  conceptos: Object.freeze({ tipo: 'conceptos', items: Object.freeze([Object.freeze({ termino: '<termino>', explicacion: '<explicacion especifica>', ejemplo: '<ejemplo opcional>' })]) }),
  tabla: Object.freeze({ tipo: 'tabla', columnas: Object.freeze(['<encabezado concreto>']), filas: Object.freeze([Object.freeze(['<celda concreta>'])]) }),
  actividad: Object.freeze({ tipo: 'actividad', modalidad: '<modalidad indicada>', instrucciones: '<orden concreta al estudiante iniciada con verbo>', items: Object.freeze([Object.freeze({ enunciado: '<consigna completa vinculada con materia y tema>', espacio_respuesta: Object.freeze({ lineas: 4 }) })]), contrato_tarea: Object.freeze({ conceptos_requeridos: Object.freeze(['<concepto canonico usado>']), familia_tarea: '<familia concreta>', datos_necesarios: Object.freeze(['<dato suficiente>']), objetivo: '<resultado o producto solicitado>', condicion_suficiencia: '<por que los datos bastan>', aplicacion_tema: '<conexion explicita con el tema>' }) }),
  procedimiento: Object.freeze({ tipo: 'procedimiento', pasos: Object.freeze(['<primer paso ejecutable y especifico>', '<siguiente paso con la operacion o decision concreta>']) }),
  ejemplo_resuelto: Object.freeze({ tipo: 'ejemplo_resuelto', enunciado: '<situacion completa>', pasos: Object.freeze(['<observacion concreta de la evidencia incluida>', '<comparacion, seleccion u operacion aplicada al caso>', '<decision que conduce al resultado o conclusion>']), resultado: '<resultado o conclusion sin etiqueta repetida>', verificacion: Object.freeze(['<comprobacion concreta contra la evidencia o condiciones originales>']), interpretacion: '<interpretacion disciplinar sin conclusion redundante>', contrato_cuantitativo: Object.freeze({ familia_problema: 'no_cuantitativo' }) }),
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
        'Desarrolla un caso concreto del tema con enunciado, al menos tres acciones distinguibles, resultado o conclusion e interpretacion.',
        'En un ejemplo conceptual muestra la evidencia del caso, que se observa o compara, la decision aplicada y como se alcanza la conclusion.',
        'No reduzcas el procedimiento a nombrar acciones genericas ni introduzcas metodos de otra disciplina.'
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

export function resolverRepresentacionSlotCuadernilloV3(slot, contextoPlaneacion = null) {
  if (slot.slotId === 'actividades_integradoras:contextualizacion:18'
    && obtenerContratoDatosActividadCentralV3(contextoPlaneacion)) {
    return completeRepresentation({
      familia: 'datos_matriz_vector_actividad_central',
      bloquesPermitidos: Object.freeze(['tabla']),
      recomendacionPrincipal: Object.freeze({ tipo: 'tabla' }),
      esquemaMinimo: Object.freeze({
        tipo: 'tabla',
        variables: Object.freeze([Object.freeze({ simbolo: '<variable>', significado: '<significado contextual>' })]),
        etiquetas_filas: Object.freeze(['<etiqueta de fila>']),
        matriz: Object.freeze([Object.freeze(['<valor racional>'])]),
        vector_b: Object.freeze(['<valor racional>'])
      }),
      reglas: Object.freeze([
        'Entrega exclusivamente los datos numericos completos del caso: matriz A numerica 3x3, vector b de tres componentes, tres variables ordenadas y tres etiquetas de fila.',
        'No calcules determinante, rango, solucion ni conclusion; el estudiante realizara esas operaciones.',
        'No remitas a datos entregados por un laboratorio, recurso externo o fuente que no aparezca en este bloque.'
      ])
    }, slot);
  }
  if (slot.slotId === 'actividades_integradoras:contextualizacion:20') {
    return completeRepresentation({
      familia: 'tres_preguntas_caso',
      bloquesPermitidos: Object.freeze(['actividad']),
      recomendacionPrincipal: Object.freeze({ tipo: 'actividad', modalidad: 'preguntas' }),
      esquemaMinimo: Object.freeze({
        tipo: 'actividad',
        modalidad: 'preguntas',
        instrucciones: '<orden concreta para analizar el caso>',
        pregunta_1: '<primera pregunta completa>',
        pregunta_2: '<segunda pregunta completa>',
        pregunta_3: '<tercera pregunta completa>',
        contrato_tarea: SCHEMAS.actividad.contrato_tarea
      }),
      espacioRespuestaBackend: true,
      reglas: Object.freeze([
        'Devuelve exactamente tres preguntas diferentes en pregunta_1, pregunta_2 y pregunta_3.',
        'Cada pregunta analiza el mismo caso y contribuye a construir la evidencia unica; no introduzcas otro proyecto.'
      ])
    }, slot);
  }
  if (slot.slotId === 'actividades_integradoras:presentacion_proyecto:8') {
    return completeRepresentation({
      familia: 'tres_aprendizajes_proyecto',
      bloquesPermitidos: Object.freeze(['lista']),
      recomendacionPrincipal: Object.freeze({ tipo: 'lista' }),
      esquemaMinimo: Object.freeze({
        tipo: 'lista',
        aprendizaje_1: '<aprendizaje observable 1>',
        aprendizaje_2: '<aprendizaje observable 2>',
        aprendizaje_3: '<aprendizaje observable 3>'
      }),
      reglas: Object.freeze([
        'Devuelve exactamente tres aprendizajes diferentes en aprendizaje_1, aprendizaje_2 y aprendizaje_3.',
        'Cada aprendizaje describe una capacidad observable necesaria para desarrollar la actividad integradora.'
      ])
    }, slot);
  }
  if (slot.slotId === 'actividades_integradoras:presentacion_proyecto:11') {
    return completeRepresentation({
      familia: 'dos_acciones_ruta_compacta',
      bloquesPermitidos: Object.freeze(['lista']),
      recomendacionPrincipal: Object.freeze({ tipo: 'lista' }),
      esquemaMinimo: Object.freeze({
        tipo: 'lista',
        accion_1: '<primera accion compacta>',
        accion_2: '<segunda accion compacta>'
      }),
      reglas: Object.freeze([
        'Devuelve exactamente dos acciones diferentes en accion_1 y accion_2.',
        'Describe una ruta compacta sin anunciar fases ni crear actividades o productos adicionales.'
      ])
    }, slot);
  }
  if (slot.slotId === 'aprendizaje_guiado:presentacion_tema:8') {
    return completeRepresentation({
      familia: 'tres_aprendizajes_esperados',
      bloquesPermitidos: Object.freeze(['lista']),
      recomendacionPrincipal: Object.freeze({ tipo: 'lista' }),
      esquemaMinimo: Object.freeze({
        tipo: 'lista',
        aprendizaje_1: '<capacidad observable 1>',
        aprendizaje_2: '<capacidad observable 2>',
        aprendizaje_3: '<capacidad observable 3>'
      }),
      reglas: Object.freeze([
        'Devuelve exactamente tres aprendizajes diferentes en aprendizaje_1, aprendizaje_2 y aprendizaje_3.',
        'Cada aprendizaje se dirige al estudiante, comienza con una capacidad observable y se relaciona con el tema.',
        'No redactes actividades, evaluaciones ni resultados inventados.'
      ])
    }, slot);
  }
  if (slot.slotId === 'aprendizaje_guiado:actividades_comprension:26') {
    return completeRepresentation({
      familia: 'clasificacion_estructurada',
      bloquesPermitidos: Object.freeze(['tabla']),
      recomendacionPrincipal: Object.freeze({ tipo: 'tabla' }),
      esquemaMinimo: Object.freeze({
        tipo: 'tabla',
        categorias: Object.freeze(['<categoria completa>']),
        elementos: Object.freeze(['<elemento completo para clasificar>'])
      }),
      reglas: Object.freeze([
        'Devuelve categorias y al menos cuatro elementos completos para clasificar; no incluyas las respuestas.',
        'No dibujes celdas, lineas, guiones bajos ni marcadores visuales; el backend construye la tabla con una celda de respuesta vacia.'
      ])
    }, slot);
  }
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
  const pedagogical = obtenerContratoPedagogicoSlotV3(slot);
  if (pedagogical) {
    const { tipo, modalidad } = pedagogical;
    const schema = structuredClone(SCHEMAS[tipo]);
    if (modalidad) schema.modalidad = modalidad;
    if (tipo === 'actividad' && pedagogical.requiereEspacio) {
      delete schema.items[0].espacio_respuesta;
    }
    if (tipo === 'actividad' && pedagogical.requiereOpciones) {
      schema.items[0].opciones = ['<opcion concreta 1>', '<opcion concreta 2>'];
    }
    if (slot.slotId === 'aprendizaje_guiado:actividades_comprension:23') {
      schema.items[0].respuesta_correcta = '<opcion exacta del banco, solo metadata interna>';
    }
    return completeRepresentation({
      familia: `plantilla_${tipo}`,
      bloquesPermitidos: Object.freeze([tipo]),
      recomendacionPrincipal: Object.freeze({ tipo, ...(modalidad ? { modalidad } : {}) }),
      esquemaMinimo: Object.freeze(schema),
      ...(pedagogical.requiereEspacio ? { espacioRespuestaBackend: true } : {}),
      reglas: Object.freeze([
        'Cumple la funcion y cardinalidad canonicas del slot sin agregar otra actividad dentro del mismo bloque.',
        ...(tipo === 'actividad' && pedagogical.itemsExact === 1 ? ['Devuelve exactamente un item dentro de items; ese item contiene el caso o consigna principal y su espacio de respuesta.'] : []),
        ...(pedagogical.requiereEspacio ? ['Devuelve solo consignas completas: no dibujes lineas, guiones bajos, recuadros ni marcadores visuales; el backend agrega espacio_respuesta a cada item.'] : []),
        ...(slot.slotId === 'aprendizaje_guiado:actividades_comprension:23' ? [
          'Formula el item como una descripcion u oracion completa para identificar un termino del banco; no incrustes huecos ni menciones la solucion en el enunciado.',
          'Incluye respuesta_correcta solo como metadata interna: debe coincidir exactamente con una opcion y no sera persistida ni mostrada.'
        ] : []),
        ...(slot.slotId === 'aprendizaje_guiado:actividades_comprension:24' ? ['Usa elementos y opciones completos para relacionar con identificadores neutrales; no incluyas correspondencias resueltas.'] : []),
        ...(pedagogical.requiereOpciones ? ['Incluye opciones concretas como banco de palabras o columna de relacion; no uses placeholders.'] : [])
      ])
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
