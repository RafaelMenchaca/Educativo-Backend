export function buildPromptByLevel({
  materia,
  nivel,
  unidad,
  tema,
  duracion,
  actividad_cierre,
  actividades_momentos = {}
}) {
  const momentosActividades = [
    { key: 'conocimientos_previos', label: 'Conocimientos previos' },
    { key: 'desarrollo', label: 'Desarrollo' },
    { key: 'cierre', label: 'Cierre' }
  ];
  const actividadesDidacticasCatalogo = [
    'Juegos de mesa educativos',
    'Debate en clase',
    'Proyectos de investigación',
    'Aprendizaje basado en proyectos',
    'Simulación',
    'Trabajo en equipo',
    'Taller de escritura creativa',
    'Laboratorios científicos',
    'Estudio de caso',
    'Augmented learning',
    'Excursiones educativas',
    'Presentaciones multimedia',
    'Aprendizaje cooperativo',
    'Encuestas y entrevistas',
    'Juegos de rol',
    'Preguntas de reflexión',
    'Proyectos de arte',
    'Mapas conceptuales',
    'Podcasts educativos',
    'Tareas interdisciplinarias'
  ];
  const enfoqueActividadSeleccionada = {
    'Estudio de caso': 'centrate en analizar un caso, identificar problema, causas, consecuencias, alternativas, soluciones y justificar decisiones a partir del caso',
    'Mapas conceptuales': 'centrate en construir, completar, organizar, conectar o explicar un mapa conceptual',
    'Debate en clase': 'centrate en argumentar, contrastar posturas, usar evidencias y defender ideas de forma ordenada',
    'Trabajo en equipo': 'centrate en colaboracion organizada entre estudiantes, roles, acuerdos y producto comun',
    'Preguntas de reflexión': 'centrate en responder, analizar y compartir respuestas a preguntas detonadoras o reflexivas'
  };
  const actividadesSeleccionadas = actividades_momentos && typeof actividades_momentos === 'object'
    ? actividades_momentos
    : {};
  const actividadesLines = momentosActividades
    .map(({ key, label }) => {
      const actividad = typeof actividadesSeleccionadas[key] === 'string'
        ? actividadesSeleccionadas[key].trim()
        : '';
      return actividad ? `- ${label}: ${actividad}` : '';
    })
    .filter(Boolean);
  const enfoqueLines = momentosActividades
    .map(({ key, label }) => {
      const actividad = typeof actividadesSeleccionadas[key] === 'string'
        ? actividadesSeleccionadas[key].trim()
        : '';
      const enfoque = enfoqueActividadSeleccionada[actividad];
      return actividad && enfoque ? `- Si ${label} usa "${actividad}", ${enfoque}.` : '';
    })
    .filter(Boolean);
  const actividadesMomentosPrompt = actividadesLines.length > 0
    ? `Actividades didacticas seleccionadas por el usuario por momento:
${actividadesLines.join('\n')}

Reglas obligatorias:
1. Cada actividad seleccionada debe aplicarse unicamente al objeto cuyo "tiempo_sesion" corresponde a ese momento.
2. No uses una actividad seleccionada para un momento diferente.
3. Si un momento no tiene actividad seleccionada, genera su actividad normalmente segun el tema, nivel, materia y duracion.
4. No agregues campos nuevos al JSON.
5. No cambies los nombres de las propiedades existentes.
6. Solo adapta el contenido del campo "actividades" para hacerlo coherente con la actividad seleccionada en ese momento.
7. Manten los tres momentos: Conocimientos previos, Desarrollo y Cierre.
8. Manten la suma de "sumativa" en 10.
9. Manten el total de "tiempo_min" igual a la duracion solicitada.
10. Respeta la estructura actual de respuesta.
11. Si existe una actividad seleccionada para un momento, esa actividad debe ser la estrategia didactica principal y dominante del campo "actividades" en ese objeto.
12. No reemplaces, combines ni cierres ese mismo momento con otra actividad didactica principal del catalogo.
13. Catalogo de actividades que NO debes usar como actividad principal alternativa en un momento con actividad seleccionada, salvo que sea exactamente la seleccionada para ese mismo momento: ${actividadesDidacticasCatalogo.join(', ')}.
14. Evita frases que conviertan la actividad en otra estrategia principal, por ejemplo: "se abrira un debate en clase", "crearan un mapa conceptual", "realizaran un juego de rol", "haran una presentacion multimedia", "desarrollaran un proyecto de investigacion", salvo que esa sea exactamente la actividad seleccionada para ese momento.
15. Puedes incluir comentar, compartir ideas, responder preguntas, socializar resultados, reflexionar brevemente, recibir retroalimentacion, comparar respuestas o justificar decisiones como acciones de apoyo, pero deben quedar claramente subordinadas a la actividad seleccionada, no como una actividad didactica independiente.
16. Aplica esta logica a todas las actividades del catalogo ACTIVIDADES_DIDACTICAS.
${enfoqueLines.length > 0 ? `\nEnfoque especifico para las actividades seleccionadas:\n${enfoqueLines.join('\n')}` : ''}`
    : `Actividades didacticas seleccionadas por el usuario por momento:
- Conocimientos previos: Sin actividad especifica
- Desarrollo: Sin actividad especifica
- Cierre: Sin actividad especifica

Regla: como no hay actividades seleccionadas, genera las actividades normalmente segun el tema, nivel, materia y duracion.`;
  const base = `
Actúa como un DOCENTE EXPERTO en diseño de planeaciones didácticas para educación media superior.
No generes formatos genéricos. Diseña la clase como si fuera aplicada en un aula real.

Genera una planeación didáctica estructurada en tres momentos:
1️⃣ Conocimientos previos
2️⃣ Desarrollo
3️⃣ Cierre

Usa EXCLUSIVAMENTE el siguiente formato JSON:
[
  {
    "tiempo_sesion": "Conocimientos previos | Desarrollo | Cierre",
    "actividades": "...",
    "tiempo_min": número (en minutos, ajustado al total de ${duracion}),
    "producto": "...",
    "instrumento": "...",
    "formativa": "...",
    "sumativa": número entero (ponderación, los tres valores deben sumar exactamente 10)
  }
]

⚠️ REGLAS ESTRICTAS:
- Debe haber EXACTAMENTE tres objetos en el arreglo (uno por cada momento).
- NO incluyas texto fuera del JSON.
- La suma total de tiempo_min debe ser EXACTAMENTE ${duracion}.
- La suma de los valores de "sumativa" debe ser EXACTAMENTE 10.
- "sumativa" debe ser SOLO un número entero, sin texto.
- La planeación corresponde a UNA SOLA SESIÓN completa.

========================
CONOCIMIENTOS PREVIOS
========================
Presenta el tema de forma atractiva, contextualizada y significativa.
NO utilices siempre lluvia de ideas.
NO repitas actividades mecánicas o genéricas.

Selecciona la estrategia según el tipo de contenido:
- Situaciones problematizadoras reales o simuladas
- Análisis de imágenes, gráficas, tablas, mapas o casos
- Preguntas detonadoras bien estructuradas
- Historias breves, ejemplos cotidianos o escenarios hipotéticos
- Retos rápidos de activación cognitiva

Este momento debe conducir naturalmente al contenido del desarrollo.

========================
DESARROLLO
========================
En el campo "actividades" incluye OBLIGATORIAMENTE:

1) Procedimiento del docente:
Describe con claridad pedagógica:
- Qué hace el docente paso a paso
- Cómo explica el contenido
- Cómo guía, ejemplifica y acompaña a los estudiantes
- Qué estrategias didácticas utiliza (expositivo guiado, resolución de problemas, trabajo colaborativo, práctica supervisada, etc.)

2) Recursos didácticos y contenido:
Incluye contenido COMPLETO que realmente enseñe:
- Explicaciones desarrolladas (no solo definiciones)
- Conceptos clave explicados con lenguaje claro
- Ejemplos resueltos paso a paso (cuando aplique)
- Casos, contextos reales, historias o aplicaciones del tema
- Explicaciones que faciliten la comprensión profunda

❌ Evita listas superficiales.
✔️ El contenido debe permitir que el alumno COMPRENDA y APRENDA el tema.

========================
CIERRE
========================
Diseña una actividad de comprobación del aprendizaje.
Debe permitir evidenciar que el estudiante:
- Comprendió
- Aplicó
- Reflexionó

Varía las estrategias:
- Resolución de problemas o casos contextualizados
- Elaboración de productos (esquemas, mapas conceptuales, cuadros comparativos, infografías, etc.)
- Explicaciones escritas u orales
- Ejercicios prácticos o simulaciones

NO repitas siempre el mismo tipo de cierre.
Ajusta la actividad al tema y al nivel educativo.
========================
ACTIVIDADES DIDACTICAS OPCIONALES
========================
${actividadesMomentosPrompt}

========================
CRITERIOS GENERALES
========================
- Redacción clara, profesional y didáctica
- Lenguaje propio de nivel preparatoria
- Enfoque pedagógico real (no genérico)
- Coherencia entre conocimientos previos, desarrollo y cierre
- Distribuye la ponderación de "sumativa" según la importancia pedagógica de cada momento
`;


      // Adaptaciones según nivel educativo
      if (/primaria/i.test(nivel)) {
        return `
${base}
📘 Contexto: Nivel Primaria
Usa un lenguaje sencillo y alegre, con ejemplos concretos, visuales y actividades cortas (10–15 min).
Evita tecnicismos. Usa productos como dibujos, esquemas, dramatizaciones o explicaciones breves.
Materia: ${materia}
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
`;
      }

      if (/secundaria/i.test(nivel)) {
        return `
${base}
📗 Contexto: Nivel Secundaria
Usa un lenguaje intermedio, fomenta el trabajo colaborativo y la reflexión.
Incluye actividades de exploración, análisis, debates o resolución de problemas aplicados.
Materia: ${materia}
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
`;
      }

      if (/prepa|preparatoria|bachiller/i.test(nivel)) {
        return `
${base}
📙 Contexto: Nivel Preparatoria
Usa un lenguaje formal y técnico.
Promueve el pensamiento crítico, el trabajo autónomo y la aplicación de conocimientos.
Las actividades deben incluir análisis, exposición oral o proyectos escritos.
Materia: ${materia}
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
`;
      }

      if (/universidad|licenciatura|ingenier|posgrado/i.test(nivel)) {
        return `
${base}
📘 Contexto: Nivel Universitario
Usa un lenguaje académico, formal y técnico.
Fomenta la investigación, la argumentación y la aplicación práctica de conceptos teóricos.
Las actividades deben incluir análisis de casos, debates, proyectos integradores o exposiciones.
Promueve la autonomía y la evaluación por competencias.
Materia: ${materia}
Nivel: ${nivel}
Unidad: ${unidad}
Tema: ${tema}
Duración total: ${duracion} minutos
  `;
      }


      // Por defecto
      return `
      ${base}
      Materia: ${materia}
      Nivel: ${nivel}
      Unidad: ${unidad}
      Tema: ${tema}
      Duración total: ${duracion} minutos
      `;
}
