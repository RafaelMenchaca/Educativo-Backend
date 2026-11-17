export const ANEXO_SCHEMA_VERSION_V2 = 2;

export const TIPOS_CUADERNILLO = Object.freeze({
  EJERCICIOS_APLICACION: 'ejercicios_aplicacion',
  ACTIVIDADES_INTEGRADORAS: 'actividades_integradoras',
  APRENDIZAJE_GUIADO: 'aprendizaje_guiado'
});

export const TIPO_CUADERNILLO_IDS = Object.freeze(Object.values(TIPOS_CUADERNILLO));
export const TIPO_CUADERNILLO_SET = new Set(TIPO_CUADERNILLO_IDS);

export const CLASIFICACIONES_COMPONENTE = Object.freeze([
  'obligatorio',
  'condicional',
  'para_completar',
  'agrupable'
]);

const component = (numero, nombre, clasificacion, alternativa = null) => Object.freeze({
  numero,
  nombre,
  clasificacion,
  ...(alternativa ? { alternativa } : {})
});

const section = (id, titulo, orden, componentes, {
  obligatoria = true,
  condicionales = [],
  paraCompletar = []
} = {}) => Object.freeze({
  id,
  titulo,
  orden,
  obligatoria,
  cobertura_requerida: Object.freeze(componentes),
  elementos_condicionales: Object.freeze(condicionales),
  elementos_para_completar: Object.freeze(paraCompletar)
});

const FORMULAS_ALTERNATIVA = 'Si no aplican formulas, cubrir reglas, criterios, relaciones, metodos de analisis o procedimientos propios de la materia.';
const REPRESENTACIONES_ALTERNATIVA = 'Si una representacion grafica no aporta al tema, usar una tabla, organizador textual o ejemplo disciplinar equivalente.';

const ejerciciosComponentes = [
  component(1, 'Nombre de la institucion', 'agrupable'),
  component(2, 'Asignatura', 'obligatorio'),
  component(3, 'Unidad de aprendizaje', 'agrupable'),
  component(4, 'Tema', 'obligatorio'),
  component(5, 'Nombre del estudiante', 'para_completar'),
  component(6, 'Grupo y fecha', 'para_completar'),
  component(7, 'Titulo del cuadernillo', 'obligatorio'),
  component(8, 'Proposito de aprendizaje', 'obligatorio'),
  component(9, 'Competencias o aprendizajes esperados', 'obligatorio'),
  component(10, 'Instrucciones generales', 'obligatorio'),
  component(11, 'Conceptos fundamentales', 'obligatorio'),
  component(12, 'Definiciones necesarias', 'agrupable'),
  component(13, 'Formulas, reglas o propiedades', 'condicional', FORMULAS_ALTERNATIVA),
  component(14, 'Procedimientos de resolucion', 'obligatorio'),
  component(15, 'Ejemplos explicados paso a paso', 'obligatorio'),
  component(16, 'Procedimientos ilustrados', 'condicional', REPRESENTACIONES_ALTERNATIVA),
  component(17, 'Interpretacion de resultados', 'obligatorio'),
  component(18, 'Ejercicios de reconocimiento', 'obligatorio'),
  component(19, 'Ejercicios de identificacion', 'obligatorio'),
  component(20, 'Ejercicios de aplicacion directa', 'obligatorio'),
  component(21, 'Ejercicios de desarrollo', 'obligatorio'),
  component(22, 'Problemas de aplicacion', 'obligatorio'),
  component(23, 'Ejercicios de interpretacion', 'obligatorio'),
  component(24, 'Problemas contextualizados', 'obligatorio'),
  component(25, 'Situaciones de la vida cotidiana', 'agrupable'),
  component(26, 'Problemas de razonamiento', 'obligatorio'),
  component(27, 'Ejercicios de desafio', 'obligatorio'),
  component(28, 'Problema integrador', 'obligatorio'),
  component(29, 'Desarrollo del procedimiento', 'obligatorio'),
  component(30, 'Interpretacion de resultados', 'obligatorio'),
  component(31, 'Cuestionario de comprobacion', 'obligatorio'),
  component(32, 'Ejercicios de evaluacion individual', 'obligatorio'),
  component(33, 'Autoevaluacion', 'obligatorio'),
  component(34, 'Reflexion sobre los resultados', 'obligatorio'),
  component(35, 'Registro de aprendizajes', 'para_completar')
];

const integradorasComponentes = [
  component(1, 'Nombre de la institucion', 'agrupable'),
  component(2, 'Asignatura', 'obligatorio'),
  component(3, 'Unidad de aprendizaje', 'agrupable'),
  component(4, 'Tema', 'obligatorio'),
  component(5, 'Nombre del estudiante', 'para_completar'),
  component(6, 'Grupo y fecha', 'para_completar'),
  component(7, 'Titulo de la actividad integradora', 'obligatorio'),
  component(8, 'Proposito de aprendizaje', 'obligatorio'),
  component(9, 'Aprendizajes esperados', 'obligatorio'),
  component(10, 'Producto final', 'obligatorio'),
  component(11, 'Instrucciones generales', 'obligatorio'),
  component(12, 'Introduccion al tema', 'obligatorio'),
  component(13, 'Conceptos fundamentales', 'obligatorio'),
  component(14, 'Informacion necesaria para desarrollar las actividades', 'obligatorio'),
  component(15, 'Explicacion de principios y procedimientos', 'obligatorio'),
  component(16, 'Recursos informativos impresos dentro del cuadernillo', 'obligatorio'),
  component(17, 'Planteamiento de la situacion', 'obligatorio'),
  component(18, 'Descripcion del problema', 'obligatorio'),
  component(19, 'Informacion del contexto', 'obligatorio'),
  component(20, 'Preguntas de analisis', 'obligatorio'),
  component(21, 'Identificacion de problematicas', 'obligatorio'),
  component(22, 'Analisis de casos', 'obligatorio'),
  component(23, 'Interpretacion de informacion', 'obligatorio'),
  component(24, 'Comparacion de alternativas', 'obligatorio'),
  component(25, 'Argumentacion de respuestas', 'obligatorio'),
  component(26, 'Resolucion de situaciones', 'obligatorio'),
  component(27, 'Diseno de soluciones', 'obligatorio'),
  component(28, 'Aplicacion de conocimientos', 'obligatorio'),
  component(29, 'Desarrollo de propuestas', 'obligatorio'),
  component(30, 'Planeacion del producto', 'obligatorio'),
  component(31, 'Materiales necesarios', 'condicional', 'Si no se requieren materiales fisicos, especificar recursos informativos, herramientas o insumos conceptuales pertinentes.'),
  component(32, 'Procedimiento de elaboracion', 'obligatorio'),
  component(33, 'Desarrollo del producto', 'obligatorio'),
  component(34, 'Registro del proceso', 'para_completar'),
  component(35, 'Descripcion del producto', 'obligatorio'),
  component(36, 'Resultados obtenidos', 'para_completar'),
  component(37, 'Evidencias del trabajo', 'condicional', 'Solicitar evidencias textuales, tablas o registros cuando no correspondan evidencias visuales o fisicas.'),
  component(38, 'Conclusiones del proyecto', 'obligatorio'),
  component(39, 'Criterios de evaluacion', 'obligatorio'),
  component(40, 'Autoevaluacion', 'obligatorio'),
  component(41, 'Lista de cotejo', 'obligatorio'),
  component(42, 'Valoracion del producto final', 'obligatorio'),
  component(43, 'Aprendizajes adquiridos', 'para_completar'),
  component(44, 'Dificultades encontradas', 'para_completar'),
  component(45, 'Aplicacion de lo aprendido', 'obligatorio')
];

const guiadoComponentes = [
  component(1, 'Nombre de la institucion', 'agrupable'),
  component(2, 'Asignatura', 'obligatorio'),
  component(3, 'Unidad de aprendizaje', 'agrupable'),
  component(4, 'Tema', 'obligatorio'),
  component(5, 'Nombre del estudiante', 'para_completar'),
  component(6, 'Grupo y fecha', 'para_completar'),
  component(7, 'Titulo del tema', 'obligatorio'),
  component(8, 'Proposito de aprendizaje', 'obligatorio'),
  component(9, 'Aprendizajes esperados', 'obligatorio'),
  component(10, 'Introduccion', 'obligatorio'),
  component(11, 'Conceptos fundamentales', 'obligatorio'),
  component(12, 'Explicacion de los contenidos', 'obligatorio'),
  component(13, 'Caracteristicas y clasificaciones', 'agrupable'),
  component(14, 'Elementos y componentes', 'agrupable'),
  component(15, 'Reglas, principios o propiedades', 'obligatorio'),
  component(16, 'Formulas y procedimientos cuando corresponda', 'condicional', FORMULAS_ALTERNATIVA),
  component(17, 'Ejemplos explicados', 'obligatorio'),
  component(18, 'Esquemas ilustrativos', 'condicional', REPRESENTACIONES_ALTERNATIVA),
  component(19, 'Diagramas y representaciones', 'condicional', REPRESENTACIONES_ALTERNATIVA),
  component(20, 'Tablas informativas', 'condicional', REPRESENTACIONES_ALTERNATIVA),
  component(21, 'Glosario de conceptos', 'obligatorio'),
  component(22, 'Preguntas de comprension', 'obligatorio'),
  component(23, 'Completar enunciados', 'obligatorio'),
  component(24, 'Relacionar conceptos', 'obligatorio'),
  component(25, 'Identificar elementos', 'obligatorio'),
  component(26, 'Clasificar informacion', 'obligatorio'),
  component(27, 'Ejercicios practicos', 'obligatorio'),
  component(28, 'Analisis de situaciones', 'obligatorio'),
  component(29, 'Aplicacion de conceptos', 'obligatorio'),
  component(30, 'Actividad de integracion', 'obligatorio'),
  component(31, 'Cuestionario de evaluacion', 'obligatorio'),
  component(32, 'Actividad de comprobacion', 'obligatorio'),
  component(33, 'Autoevaluacion', 'obligatorio'),
  component(34, 'Sintesis del aprendizaje', 'obligatorio'),
  component(35, 'Reflexion final', 'obligatorio')
];

const byNumbers = (all, numbers) => numbers.map((numero) => all[numero - 1]);

export const CUADERNILLO_BLUEPRINTS = Object.freeze({
  [TIPOS_CUADERNILLO.EJERCICIOS_APLICACION]: Object.freeze([
    section('datos_generales', 'Datos generales', 1, byNumbers(ejerciciosComponentes, [1, 2, 3, 4, 5, 6]), { paraCompletar: ['estudiante', 'grupo', 'fecha'] }),
    section('presentacion', 'Presentacion', 2, byNumbers(ejerciciosComponentes, [7, 8, 9, 10])),
    section('repaso_teorico', 'Repaso teorico', 3, byNumbers(ejerciciosComponentes, [11, 12, 13, 14]), { condicionales: [13] }),
    section('ejemplos_resueltos', 'Ejemplos resueltos', 4, byNumbers(ejerciciosComponentes, [15, 16, 17]), { condicionales: [16] }),
    section('ejercicios_basicos', 'Ejercicios basicos', 5, byNumbers(ejerciciosComponentes, [18, 19, 20])),
    section('ejercicios_intermedios', 'Ejercicios intermedios', 6, byNumbers(ejerciciosComponentes, [21, 22, 23])),
    section('retos_problemas', 'Retos y problemas', 7, byNumbers(ejerciciosComponentes, [24, 25, 26, 27])),
    section('actividad_integradora', 'Actividad integradora', 8, byNumbers(ejerciciosComponentes, [28, 29, 30])),
    section('evaluacion', 'Evaluacion', 9, byNumbers(ejerciciosComponentes, [31, 32, 33])),
    section('cierre', 'Cierre', 10, byNumbers(ejerciciosComponentes, [34, 35]), { paraCompletar: ['registro_aprendizajes'] })
  ]),
  [TIPOS_CUADERNILLO.ACTIVIDADES_INTEGRADORAS]: Object.freeze([
    section('datos_generales', 'Datos generales', 1, byNumbers(integradorasComponentes, [1, 2, 3, 4, 5, 6]), { paraCompletar: ['estudiante', 'grupo', 'fecha'] }),
    section('presentacion_proyecto', 'Presentacion del proyecto', 2, byNumbers(integradorasComponentes, [7, 8, 9, 10, 11])),
    section('fundamentacion_teorica', 'Fundamentacion teorica', 3, byNumbers(integradorasComponentes, [12, 13, 14, 15, 16])),
    section('contextualizacion', 'Contextualizacion', 4, byNumbers(integradorasComponentes, [17, 18, 19, 20])),
    section('actividades_analisis', 'Actividades de analisis', 5, byNumbers(integradorasComponentes, [21, 22, 23, 24, 25])),
    section('actividades_aplicacion', 'Actividades de aplicacion', 6, byNumbers(integradorasComponentes, [26, 27, 28, 29])),
    section('produccion_proyecto', 'Produccion del proyecto', 7, byNumbers(integradorasComponentes, [30, 31, 32, 33, 34]), { condicionales: [31], paraCompletar: ['registro_proceso'] }),
    section('presentacion_resultados', 'Presentacion de resultados', 8, byNumbers(integradorasComponentes, [35, 36, 37, 38]), { condicionales: [37], paraCompletar: ['resultados', 'evidencias'] }),
    section('evaluacion', 'Evaluacion', 9, byNumbers(integradorasComponentes, [39, 40, 41, 42])),
    section('cierre_reflexivo', 'Cierre reflexivo', 10, byNumbers(integradorasComponentes, [43, 44, 45]), { paraCompletar: ['aprendizajes', 'dificultades'] })
  ]),
  [TIPOS_CUADERNILLO.APRENDIZAJE_GUIADO]: Object.freeze([
    section('datos_generales', 'Datos generales', 1, byNumbers(guiadoComponentes, [1, 2, 3, 4, 5, 6]), { paraCompletar: ['estudiante', 'grupo', 'fecha'] }),
    section('presentacion_tema', 'Presentacion del tema', 2, byNumbers(guiadoComponentes, [7, 8, 9, 10])),
    section('desarrollo_teorico', 'Desarrollo teorico', 3, byNumbers(guiadoComponentes, [11, 12, 13, 14, 15, 16]), { condicionales: [16] }),
    section('apoyos_aprendizaje', 'Apoyos para el aprendizaje', 4, byNumbers(guiadoComponentes, [17, 18, 19, 20, 21]), { condicionales: [18, 19, 20] }),
    section('actividades_comprension', 'Actividades de comprension', 5, byNumbers(guiadoComponentes, [22, 23, 24, 25, 26])),
    section('actividades_aplicacion', 'Actividades de aplicacion', 6, byNumbers(guiadoComponentes, [27, 28, 29, 30])),
    section('evaluacion_aprendizaje', 'Evaluacion del aprendizaje', 7, byNumbers(guiadoComponentes, [31, 32, 33])),
    section('cierre', 'Cierre', 8, byNumbers(guiadoComponentes, [34, 35]))
  ])
});

export const CUADERNILLO_TIPOS_METADATA = Object.freeze({
  [TIPOS_CUADERNILLO.EJERCICIOS_APLICACION]: Object.freeze({
    id: TIPOS_CUADERNILLO.EJERCICIOS_APLICACION,
    label: 'Cuadernillo de ejercicios y aplicación',
    enfoque: 'Practicar y resolver',
    objetivo: 'Desarrollar habilidades y conocimientos mediante ejercicios progresivos, procedimientos y resolución de problemas.'
  }),
  [TIPOS_CUADERNILLO.ACTIVIDADES_INTEGRADORAS]: Object.freeze({
    id: TIPOS_CUADERNILLO.ACTIVIDADES_INTEGRADORAS,
    label: 'Cuadernillo de actividades integradoras',
    enfoque: 'Analizar, crear y resolver',
    objetivo: 'Promover la aplicación de conocimientos mediante situaciones problemáticas, análisis, actividades prácticas y elaboración de productos.'
  }),
  [TIPOS_CUADERNILLO.APRENDIZAJE_GUIADO]: Object.freeze({
    id: TIPOS_CUADERNILLO.APRENDIZAJE_GUIADO,
    label: 'Cuadernillo de aprendizaje guiado',
    enfoque: 'Aprender y comprender',
    objetivo: 'Proporcionar al estudiante la información teórica y explicativa necesaria para estudiar un tema de manera autónoma.'
  })
});

export function esTipoCuadernillo(value) {
  return typeof value === 'string' && TIPO_CUADERNILLO_SET.has(value);
}

export function obtenerMetadataTipoCuadernillo(value) {
  return esTipoCuadernillo(value) ? CUADERNILLO_TIPOS_METADATA[value] : null;
}

export function obtenerBlueprintCuadernillo(value) {
  return esTipoCuadernillo(value) ? CUADERNILLO_BLUEPRINTS[value] : null;
}
