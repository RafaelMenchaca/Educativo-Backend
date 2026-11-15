import { ACTIVIDADES_DIDACTICAS_SET } from '../constants/actividadesDidacticas.js';

export function buildPromptByLevel({
  materia,
  nivel,
  unidad,
  tema,
  duracion,
  actividad_cierre,
  actividades_momentos = {},
  contextoVariedad = []
}) {
  const CONTEXTO_VARIEDAD_MAX_TEMAS = 5;
  const CONTEXTO_VARIEDAD_MAX_ACTIVIDADES_POR_TEMA = 3;
  const CONTEXTO_VARIEDAD_MAX_CARACTERES = 240;
  const normalizeContextoText = (value, maxLength) => {
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
  };
  const momentosActividades = [
    { key: 'conocimientos_previos', label: 'Conocimientos previos' },
    { key: 'desarrollo', label: 'Desarrollo' },
    { key: 'cierre', label: 'Cierre' }
  ];
  const enfoqueActividadSeleccionada = {
    'Estudio de caso': 'centrate en analizar un caso, identificar problema, causas, consecuencias, alternativas, soluciones y justificar decisiones a partir del caso',
    'Lluvia de ideas': 'recopila aportaciones diversas sin evaluarlas de inmediato, organizalas visiblemente y usalas para activar lo que el grupo ya sabe',
    'Mapa conceptual': 'construye, completa, organiza, conecta o explica conceptos y sus relaciones',
    'Resolución de problemas': 'plantea un problema central, guia la identificacion de datos y procedimientos, y acompana su resolucion razonada durante el Desarrollo',
    'Trabajo colaborativo': 'organiza roles, acuerdos, interdependencia y un producto comun entre estudiantes',
    'Evaluación y retroalimentación': 'usa como evidencia el producto, respuesta o procedimiento elaborado durante el Desarrollo; aplica criterios claros para identificar aciertos, errores y aspectos por mejorar; ofrece retroalimentacion especifica y permite corregir, explicar o ajustar el trabajo; no introduzcas un nuevo problema, caso o producto central'
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
      const enfoque = ACTIVIDADES_DIDACTICAS_SET.has(actividad)
        ? enfoqueActividadSeleccionada[actividad]
        : '';
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
4. No agregues propiedades distintas de las enumeradas en el esquema JSON.
5. No cambies los nombres de las propiedades existentes.
6. Solo adapta el contenido del campo "actividades" para hacerlo coherente con la actividad seleccionada en ese momento.
7. Manten los tres momentos: Conocimientos previos, Desarrollo y Cierre.
8. Manten la suma de "sumativa" en 10.
9. Manten el total de "tiempo_min" igual a la duracion solicitada.
10. Respeta la estructura actual de respuesta.
11. Si existe una actividad seleccionada para un momento, esa actividad debe ser la estrategia didactica principal y dominante del campo "actividades" en ese objeto.
12. No reemplaces ni combines la seleccion con otra tecnica principal.
13. No sustituyas la actividad seleccionada por otra tecnica, aunque otra sugerencia generica parezca adecuada.
14. Evita frases que conviertan la actividad en otra estrategia principal, por ejemplo: "se abrira un debate en clase", "crearan un mapa conceptual", "realizaran un juego de rol", "haran una presentacion multimedia", "desarrollaran un proyecto de investigacion", salvo que esa sea exactamente la actividad seleccionada para ese momento.
15. Puedes incluir comentar, compartir ideas, responder preguntas, socializar resultados, reflexionar brevemente, recibir retroalimentacion, comparar respuestas o justificar decisiones como acciones de apoyo, pero deben quedar claramente subordinadas a la actividad seleccionada, no como una actividad didactica independiente.
16. Aplica esta logica a cualquier actividad seleccionada del catalogo vigente por momento.
17. Para cada momento con seleccion expresa, escribe exactamente ese valor en "actividad_seleccionada". Es metadato estructurado interno que declara la tecnica que el contenido implementa realmente; no lo uses como titulo, etiqueta ni prefijo visible.
18. El campo "actividades" debe describir de forma natural, directa y fluida como se ejecutara realmente esa tecnica, sin repetir mecanicamente su nombre. No basta con declarar el metadato si el procedimiento corresponde a otra estrategia.
19. El catalogo auxiliar y las sugerencias generales de estrategias solo aplican a momentos sin seleccion expresa; nunca compiten con una seleccion del usuario.
20. Estas selecciones pertenecen exclusivamente al tema actual (${tema}) y al momento indicado.

Ejemplo minimo de la relacion requerida:
{
  "tiempo_sesion": "Conocimientos previos",
  "actividad_seleccionada": "Lluvia de ideas",
  "actividades": "El docente plantea una consigna sobre las aplicaciones del tema. Los estudiantes comparten sus ideas y el docente organiza las aportaciones en la pizarra..."
}
${enfoqueLines.length > 0 ? `\nEnfoque especifico para las actividades seleccionadas:\n${enfoqueLines.join('\n')}` : ''}`
    : `Actividades didacticas seleccionadas por el usuario por momento:
- Conocimientos previos: Sin actividad especifica
- Desarrollo: Sin actividad especifica
- Cierre: Sin actividad especifica

Regla: como no hay actividades seleccionadas, genera las actividades normalmente segun el tema, nivel, materia y duracion.`;
  const contextoVariedadLines = (Array.isArray(contextoVariedad) ? contextoVariedad : [])
    .slice(-CONTEXTO_VARIEDAD_MAX_TEMAS)
    .flatMap((temaPrevio) => {
      const temaPrevioNombre = normalizeContextoText(temaPrevio?.tema, 100);
      const actividadesPrevias = Array.isArray(temaPrevio?.actividades)
        ? temaPrevio.actividades.slice(0, CONTEXTO_VARIEDAD_MAX_ACTIVIDADES_POR_TEMA)
        : [];

      return actividadesPrevias
        .map((referencia) => {
          const momento = normalizeContextoText(referencia?.momento, 60);
          const actividad = normalizeContextoText(
            referencia?.actividad,
            CONTEXTO_VARIEDAD_MAX_CARACTERES
          );
          if (!actividad) return '';
          return `- ${temaPrevioNombre ? `Tema "${temaPrevioNombre}" · ` : ''}${momento ? `${momento}: ` : ''}${actividad}`;
        })
        .filter(Boolean);
    });
  const contextoVariedadPrompt = contextoVariedadLines.length > 0
    ? `
========================
VARIEDAD ENTRE TEMAS
========================
En temas anteriores de esta misma generacion ya se utilizaron estrategias como:
${contextoVariedadLines.join('\n')}

Para los momentos donde el docente NO selecciono una actividad especifica:
- Evita repetir innecesariamente estas estrategias cuando otra dinamica sea pedagogicamente coherente.
- Prioriza variedad real; cambiar solo la redaccion de la misma dinamica no cuenta como variedad.
- Si el docente selecciono explicitamente una actividad para un momento, respeta esa seleccion aunque aparezca en esta lista.`
    : '';
  const variedadMomentosPrompt = `
========================
VARIEDAD ENTRE MOMENTOS
========================
- En los momentos sin actividad seleccionada, procura que Conocimientos previos, Desarrollo y Cierre utilicen dinamicas claramente diferenciadas entre si.
- No consideres variedad cambiar solamente la redaccion mientras mantienes exactamente la misma dinamica.
- Esta regla no sustituye una seleccion explicita del docente: respetala aunque se repita entre momentos o respecto de temas anteriores.
- Progresion pedagogica: Conocimientos previos activa o diagnostica; Desarrollo construye, explica, practica o aplica el conocimiento principal; Cierre recupera evidencia del Desarrollo para comprobar, sintetizar, reflexionar o retroalimentar.
- El Cierre no debe repetir a escala reducida la actividad central del Desarrollo ni iniciar otro problema extenso, caso central, producto complejo o secuencia equivalente.
- El Cierre debe trabajar con el producto, procedimiento, respuesta o evidencia obtenida en Desarrollo para identificar aprendizajes, aciertos, errores o dudas y cerrar la sesion.
- Si el Cierre seleccionado es Ejercicio de aplicacion, Cuestionario final, Quiz de comprobacion o Preguntas de comprension, la comprobacion debe ser breve, usar lo trabajado en la sesion y no convertirse en un segundo Desarrollo.
- Prioridad: primero la seleccion expresa del usuario, despues la funcion pedagogica del momento y finalmente las sugerencias generales.`;
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
    "actividad_seleccionada": "valor exacto seleccionado para ese momento, o texto vacio si no hubo seleccion",
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

Trabaja prioritariamente con la evidencia producida en Desarrollo. No vuelvas a enseñar desde cero ni repitas su actividad central.

Solo cuando no exista una selección expresa, puedes variar entre estrategias breves como:
- Resolución de problemas o casos contextualizados
- Elaboración de productos (esquemas, mapas conceptuales, cuadros comparativos, infografías, etc.)
- Explicaciones escritas u orales
- Ejercicios prácticos o simulaciones

NO repitas siempre el mismo tipo de cierre.
Ajusta la actividad al tema y al nivel educativo.
Si existe una selección expresa, esa selección tiene prioridad y estas sugerencias solo aplican cuando sean compatibles con ella.
========================
ACTIVIDADES DIDACTICAS OPCIONALES
========================
${actividadesMomentosPrompt}
${variedadMomentosPrompt}
${contextoVariedadPrompt}

========================
CRITERIOS GENERALES
========================
- Redacción clara, profesional y didáctica
- Lenguaje propio de nivel preparatoria
- Enfoque pedagógico real (no genérico)
- Coherencia entre conocimientos previos, desarrollo y cierre
- Distribuye la ponderación de "sumativa" según la importancia pedagógica de cada momento
- Las sugerencias generales y por nivel educativo nunca sustituyen una actividad seleccionada expresamente.
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
Cuando no contradigan una selección expresa, puedes incluir exploración, análisis, debates o resolución de problemas aplicados.
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
Cuando sean compatibles con las selecciones expresas, las actividades pueden incluir análisis, exposición oral o proyectos escritos.
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
Cuando sean compatibles con las selecciones expresas, las actividades pueden incluir análisis de casos, debates, proyectos integradores o exposiciones.
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
