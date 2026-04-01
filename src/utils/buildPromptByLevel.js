export function buildPromptByLevel({
  materia,
  nivel,
  unidad,
  tema,
  duracion,
  actividad_cierre
}) {
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
La actividad del momento Cierre debe basarse obligatoriamente en esta actividad seleccionada por el usuario: ${actividad_cierre}
En el objeto donde "tiempo_sesion": "Cierre", el campo "actividades" debe describir una actividad coherente con ${actividad_cierre}
No sustituyas esa actividad por otra distinta.
Puede adaptarse pedagogicamente al tema y al nivel, pero debe conservar claramente el tipo de actividad seleccionado.

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
