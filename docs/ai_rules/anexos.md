Estructura recomendada del JSON contenido

El campo contenido debe guardar algo fácil de renderizar y descargar.

Ejemplo:

{
  "titulo_general": "Anexos: Energía y fuerzas",
  "descripcion": "Material de apoyo para que los estudiantes realicen las actividades de la planeación.",
  "anexos": [
    {
      "numero": 1,
      "titulo": "Reflexión inicial: Energía y fuerzas",
      "tipo": "reflexion",
      "instrucciones": "Lee cada situación y responde las preguntas en tu cuaderno.",
      "contenido": [
        {
          "subtitulo": "Situación 1. El automóvil",
          "texto": "Un automóvil circula por la carretera y después frena hasta detenerse.",
          "preguntas": [
            "¿Qué tipo de energía tiene el automóvil al avanzar?",
            "¿Qué fuerza permite el movimiento del automóvil?",
            "¿Qué sucede cuando el conductor frena?"
          ]
        }
      ]
    },
    {
      "numero": 2,
      "titulo": "Lectura de análisis",
      "tipo": "lectura",
      "instrucciones": "Lee el siguiente texto.",
      "contenido": [
        {
          "subtitulo": "La energía eólica",
          "texto": "La energía eólica es una fuente de energía renovable que utiliza la fuerza del viento para producir electricidad."
        }
      ]
    },
    {
      "numero": 3,
      "titulo": "Actividad de análisis",
      "tipo": "tabla",
      "instrucciones": "Lee nuevamente el texto y completa la tabla.",
      "tabla": {
        "columnas": ["Pregunta", "Respuesta"],
        "filas": [
          ["¿Qué recurso natural utiliza la energía eólica?", ""],
          ["¿Qué función tienen los aerogeneradores?", ""],
          ["¿Qué beneficios aporta la energía eólica?", ""]
        ]
      }
    }
  ]
}

15. Prompt interno para generación de anexos

Este no es el prompt para Codex todavía. Este sería el prompt que tu backend le mandaría a OpenAI.

Prompt de sistema sugerido
Eres un asistente experto en diseño de materiales educativos para estudiantes.

Tu tarea es generar anexos de trabajo para alumnos a partir de una planeación docente ya existente.

No debes crear una nueva planeación.
No debes cambiar el tema.
No debes inventar actividades desconectadas.
Debes convertir las actividades de la planeación en materiales concretos para que los estudiantes puedan trabajar.

Los anexos deben ser solo texto.
No incluyas imágenes.
No incluyas glosario, a menos que se solicite explícitamente.
No incluyas información técnica, JSON visible, tokens, prompt, ni notas para desarrolladores.

El resultado debe ser claro, útil, conciso y listo para entregar a estudiantes.

Prompt de usuario sugerido
Genera anexos para estudiantes tomando como base la siguiente planeación.

Datos de la planeación:
Nivel: {{nivel}}
Materia: {{materia}}
Tema: {{tema}}
Duración: {{duracion}}

Tabla de planeación:
{{tabla_ia}}

Actividades por momentos:
{{actividades_momentos}}

Instrucciones:
- Genera entre 3 y 5 anexos.
- Cada anexo debe tener título, instrucciones y contenido.
- Los anexos deben servir directamente para realizar las actividades de la planeación.
- Si la planeación incluye reflexión inicial, crea preguntas o situaciones de análisis.
- Si la planeación incluye lectura, caso o explicación, crea una lectura breve de apoyo.
- Si la planeación incluye análisis, crea preguntas, tabla o ejercicios.
- Si la planeación incluye trabajo colaborativo, crea preguntas para equipo.
- Si la planeación incluye producto final, crea una guía breve y concisa para elaborarlo.
- No incluyas glosario.
- No incluyas imágenes.
- No repitas información innecesaria.
- Usa lenguaje adecuado para el nivel educativo.
- Devuelve únicamente JSON válido.

Formato obligatorio:
{
  "titulo_general": "string",
  "descripcion": "string",
  "anexos": [
    {
      "numero": 1,
      "titulo": "string",
      "tipo": "reflexion | lectura | analisis | tabla | colaborativo | producto_final | ejercicio",
      "instrucciones": "string",
      "contenido": [
        {
          "subtitulo": "string",
          "texto": "string",
          "preguntas": ["string"]
        }
      ],
      "tabla": {
        "columnas": ["string"],
        "filas": [["string"]]
      }
    }
  ]
}

17. Vista de detalle del anexo

Cuando el usuario haga clic en Ver anexo, mostrar algo como:

Anexos: Energía y fuerzas

ANEXO 1
Reflexión inicial: Energía y fuerzas

Instrucciones:
Lee cada situación y responde las preguntas en tu cuaderno.

Situación 1. El automóvil
Un automóvil circula por la carretera y después frena hasta detenerse.

Preguntas:
1. ¿Qué tipo de energía tiene el automóvil al avanzar?
2. ¿Qué fuerza permite el movimiento del automóvil?
3. ¿Qué sucede cuando el conductor frena?

Esto debe respetar el estilo actual de Biblioteca, no meter un diseño completamente nuevo.

