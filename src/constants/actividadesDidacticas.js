export const ACTIVIDADES_DIDACTICAS_POR_MOMENTO = Object.freeze({
  conocimientos_previos: Object.freeze([
    'Activación y diagnóstico', 'Lluvia de ideas', 'Preguntas detonadoras', 'Cuestionario diagnóstico',
    'Quiz interactivo', 'Estudio de caso', 'Análisis de imágenes', 'Análisis de videos',
    'Análisis de noticias', 'Diálogo en parejas', 'Cuadro SQA', 'Mapa mental', 'Red de conceptos',
    'Línea del tiempo', 'Exploración de materiales', 'Demostración experimental', 'Observación del entorno'
  ]),
  desarrollo: Object.freeze([
    'Construcción y aplicación del conocimiento', 'Mapa conceptual', 'Mapa mental', 'Cuadro comparativo',
    'Cuadro sinóptico', 'Diagrama de flujo', 'Infografía', 'Esquema explicativo', 'Resumen',
    'Resolución de ejercicios', 'Resolución de problemas', 'Práctica de laboratorio', 'Simulación digital',
    'Práctica informática', 'Dibujo técnico', 'Modelado a escala', 'Lectura comentada', 'Análisis de textos',
    'Investigación documental', 'Matriz de análisis', 'Reporte técnico', 'Bitácora de trabajo',
    'Trabajo colaborativo', 'Elaboración de prototipos', 'Elaboración de maquetas', 'Redacción de ensayos',
    'Elaboración de propuestas', 'Producción audiovisual', 'Presentación digital'
  ]),
  cierre: Object.freeze([
    'Evaluación y retroalimentación', 'Ticket de salida', 'Cuestionario final', 'Quiz de comprobación',
    'Ejercicio de aplicación', 'Preguntas de comprensión', 'Coevaluación', 'Autoevaluación',
    'Reflexión individual', 'Retroalimentación grupal', 'Conclusiones grupales', 'Exposición breve',
    'Galería de trabajos', 'Debate grupal', 'Mesa redonda', 'Portafolio de evidencias',
    'Mapa de síntesis', 'Cuadro de conclusiones'
  ])
});

export const ACTIVIDADES_DIDACTICAS_SETS = Object.freeze(
  Object.fromEntries(
    Object.entries(ACTIVIDADES_DIDACTICAS_POR_MOMENTO)
      .map(([momento, actividades]) => [momento, new Set(actividades)])
  )
);

export const ACTIVIDADES_DIDACTICAS_COMBINADAS = Object.freeze(
  [...new Set(Object.values(ACTIVIDADES_DIDACTICAS_POR_MOMENTO).flat())]
);

export const ACTIVIDADES_DIDACTICAS_SET = new Set(ACTIVIDADES_DIDACTICAS_COMBINADAS);
