# AGENTS.md — Reglas para IA en Educativo IA

## 1. Propósito

Este archivo define las reglas obligatorias para cualquier agente de IA que analice, modifique o refactorice el código de Educativo IA.

El objetivo principal es mejorar la arquitectura del proyecto sin romper comportamiento existente, sin mezclar flujos antiguos con el sistema actual y sin introducir cambios no solicitados.

Estas reglas tienen prioridad sobre cualquier interpretación libre del código.

---

## Fuentes de verdad obligatorias

Las migraciones SQL y el código ejecutable son la fuente técnica real. La documentación explica y protege los contratos observados, pero no autoriza a inventar tablas, columnas, relaciones, constraints, endpoints ni contratos que no existan en esas fuentes.

| Tema | Fuente obligatoria |
| --- | --- |
| Reglas para agentes | `AGENTS.md` |
| Tablas y relaciones | `docs/DATABASE_SCHEMA.md` |
| Prompts y contratos IA | `docs/AI_GENERATION_CONTRACTS.md` |
| Arquitectura y rutas | `docs/03-backend-guide.md` |
| Convenciones de logs | `docs/observability/LOG_CONVENTIONS.md` |
| Auditoría actual de logs | `docs/observability/LOG_AUDIT.md` |
| Implementación real | código y migraciones SQL |

Si un documento contradice el código o las migraciones, detener el cambio, documentar la contradicción y pedir autorización. No elegir silenciosamente una versión ni “corregir” el contrato por conveniencia.

### Código y migraciones

- Las migraciones SQL y el código ejecutable son la fuente técnica real.
- No inventar tablas, columnas, relaciones, constraints, endpoints ni contratos.
- No crear columnas o tablas desde código.

### Base de datos

Antes de cambiar tablas, columnas, PK, FK, relaciones, cascadas, constraints, índices, RLS, `user_id`, `batch_id`, `unidad_id`, `tema_id`, `tema_ids` o `planeacion_ids`, leer obligatoriamente `docs/DATABASE_SCHEMA.md`.

- No reinterpretar IDs ni cambiar relaciones sin autorización explícita.
- No cambiar relaciones del schema para facilitar un refactor.
- No cambiar `unidad_id`, `planeacion_ids`, `tema_id` o `tema_ids` sin autorización explícita.
- No tratar IDs de planeaciones como IDs de temas.
- No usar `unidad_id` como única fuente de verdad para seleccionar temas de examen cuando el contrato vigente usa `planeacion_ids`.

### Generación con IA

Antes de cambiar prompts, mensajes system/user, schemas de salida, nombres de campos, parsing, normalización, validación, modelos, `temperature`, retries, detección de duplicados, jobs, polling backend o métricas de IA, leer obligatoriamente `docs/AI_GENERATION_CONTRACTS.md`.

- No modificar estas áreas durante refactors estructurales, logging, documentación o limpieza, salvo autorización explícita.
- No modificar prompts durante refactors.
- No modificar `prompt_version` sin documentar la nueva versión.
- No cambiar retries ni detección o sustitución de duplicados como parte de una extracción.
- No alterar métricas IA accidentalmente.

### Observabilidad

Antes de agregar o cambiar logs, leer obligatoriamente:

- `docs/observability/LOG_CONVENTIONS.md`
- `docs/observability/LOG_AUDIT.md`

No duplicar eventos ni registrar información sensible. No ocultar errores ni eliminar un `throw` al agregar logs. No registrar prompts, respuestas completas, tokens, headers de autorización, access tokens, API keys ni credenciales en logs.

### Arquitectura

Para entender rutas, capas y servicios, leer `docs/03-backend-guide.md`. Ese archivo es descriptivo: no sustituye los contratos específicos, el schema documental, estas reglas ni la implementación real.

### Autenticación, RLS y contratos públicos

- No asumir que el body es una fuente confiable de `user_id`; `user_id` siempre debe provenir de `req.user.id`.
- No usar service role en flujos sujetos a RLS salvo que el diseño actual lo autorice explícitamente.
- No cambiar `createUserClient(req.accessToken)` por un cliente admin por conveniencia.
- No renombrar campos públicos sin revisar frontend, backend, schema y contratos IA.
- Todo cambio debe conservar los contratos existentes salvo que el alcance autorice modificarlos.
- Toda sesión debe actualizar `docs/refactor/SESSION_HANDOFF.md`.

---

## 2. Contexto actual del proyecto

Educativo IA es una aplicación web para generar recursos educativos con IA.

El flujo vigente del producto está basado en **Biblioteca**.

Biblioteca organiza y muestra:

- Planeaciones
- Anexos
- Listas de cotejo
- Exámenes

El sistema anterior basado en jerarquías puede seguir teniendo código residual en el frontend.

Ese código debe considerarse legado hasta que se demuestre lo contrario.

No se debe asumir que una función sigue activa solamente porque existe en el repositorio.

Tampoco se debe asumir que una función puede eliminarse solamente porque parece antigua.

Antes de modificar o eliminar código relacionado con jerarquías, se deben localizar y documentar todos sus consumidores.

---

## 3. Regla principal

Durante el refactor, preservar comportamiento antes que mejorar diseño interno.

La prioridad es:

1. Entender.
2. Documentar.
3. Extraer.
4. Validar.
5. Simplificar.
6. Eliminar legado confirmado.

Nunca invertir este orden.

---

## 4. Restricciones obligatorias

La IA no debe realizar ninguno de los siguientes cambios sin autorización explícita:

- Modificar el backend fuera del alcance autorizado para la sesión.
- Modificar Supabase.
- Crear o alterar migraciones SQL.
- Cambiar endpoints.
- Cambiar payloads de API.
- Renombrar campos usados por frontend, backend o base de datos.
- Cambiar comportamiento visible.
- Rediseñar la interfaz.
- Cambiar Bootstrap.
- Migrar a React, Vue, Angular u otro framework.
- Convertir todo el proyecto a TypeScript.
- Cambiar autenticación.
- Cambiar permisos o reglas RLS.
- Cambiar la lógica de generación con IA.
- Cambiar prompts de IA.
- Modificar precios, métricas o cálculo de tokens.
- Formatear todo el repositorio.
- Introducir dependencias nuevas sin justificar su necesidad.
- Eliminar código por parecer duplicado, antiguo o innecesario.
- Reescribir módulos completos si una extracción pequeña es suficiente.
- Mezclar refactor con nuevas funcionalidades.
- Cambiar nombres públicos expuestos en `window` sin mantener compatibilidad.

---

## 5. Sistema vigente frente a sistema legado

### Sistema vigente

El sistema vigente es Biblioteca.

Incluye:

- Bloques o conjuntos de Biblioteca.
- Tabs de Planeaciones, Anexos, Listas de cotejo y Exámenes.
- Generación, preview, descarga y eliminación de documentos.
- Estados de generación asociados a cards.
- Flujos actuales usados por usuarios reales.

### Sistema legado

El sistema de jerarquías anterior puede incluir:

- Planteles.
- Grados.
- Materias.
- Unidades.
- Exploradores antiguos.
- Selectores o modales anteriores.
- Estados globales antiguos.
- Funciones de navegación que ya no aparecen en la UI actual.

Toda referencia a jerarquías debe clasificarse antes de tocarse:

- `ACTIVE`: todavía usada por el flujo vigente.
- `COMPATIBILITY`: necesaria como puente temporal.
- `LEGACY_CONFIRMED`: comprobado que ya no se usa.
- `UNKNOWN`: uso no confirmado.

Solo se puede eliminar código marcado como `LEGACY_CONFIRMED`.

---

## 6. Método obligatorio de refactor

Cada refactor debe seguir estas etapas.

### Etapa A — Inspección

Antes de modificar código:

- Identificar responsabilidad actual.
- Buscar todas las referencias.
- Revisar HTML relacionado.
- Revisar atributos inline como `onclick`.
- Revisar propiedades expuestas en `window`.
- Revisar listeners.
- Revisar llamadas API.
- Revisar estado global usado.
- Revisar orden de carga de scripts.
- Identificar dependencias cruzadas.

### Etapa B — Extracción literal

Mover código sin cambiar su comportamiento.

No simplificar al mismo tiempo.

No renombrar variables innecesariamente.

No cambiar condiciones.

No cambiar payloads.

No cambiar mensajes visibles.

No cambiar orden de ejecución.

### Etapa C — Compatibilidad

Cuando una función existente tenga consumidores antiguos, conservar un wrapper temporal.

Ejemplo:

```js
window.downloadExamWord = (...args) =>
  window.ExamenesDownload.downloadWord(...args);
```

No eliminar el wrapper hasta comprobar que ya no existen consumidores.

### Etapa D — Validación

Después de cada extracción:

- Ejecutar pruebas disponibles.
- Abrir la aplicación.
- Revisar consola.
- Verificar que no existan errores nuevos.
- Verificar que no existan peticiones duplicadas.
- Verificar que los listeners no se registren dos veces.
- Verificar que el flujo modificado siga funcionando.

### Etapa E — Simplificación

Solo después de validar la extracción se puede:

- Renombrar.
- Unificar duplicados.
- Reducir complejidad.
- Eliminar wrappers.
- Eliminar legado confirmado.

---

## 7. Responsabilidades que deben separarse

La IA debe evitar mezclar las siguientes responsabilidades en una sola función o archivo:

- Inicialización de página.
- Estado.
- Acceso a API.
- Transformación de datos.
- Renderizado.
- Eventos.
- Polling.
- Modales.
- Toasts.
- Descargas.
- Confirmaciones.
- Manejo de errores.

Una función de renderizado no debe:

- Llamar a la API.
- Crear intervalos.
- Actualizar la base de datos.
- Descargar archivos.
- Registrar listeners globales.
- Cambiar estado global de forma oculta.

Una función de API no debe:

- Manipular el DOM.
- Mostrar modales.
- Mostrar toasts.
- Renderizar cards.

Una función de eventos no debe contener grandes plantillas HTML ni lógica completa de negocio.

---

## 8. Arquitectura objetivo

La arquitectura objetivo puede organizarse de esta forma:

```text
js/
├── core/
│   ├── config.js
│   ├── auth.js
│   ├── api-client.js
│   ├── errors.js
│   └── logger.js
│
├── api/
│   ├── biblioteca.api.js
│   ├── planeaciones.api.js
│   ├── anexos.api.js
│   ├── listas-cotejo.api.js
│   └── examenes.api.js
│
├── state/
│   ├── app.state.js
│   ├── biblioteca.state.js
│   └── generation.state.js
│
├── ui/
│   ├── shared.ui.js
│   ├── modal.ui.js
│   ├── toast.ui.js
│   ├── loading.ui.js
│   └── download.ui.js
│
├── features/
│   ├── biblioteca/
│   ├── planeaciones/
│   ├── anexos/
│   ├── listas-cotejo/
│   └── examenes/
│
└── pages/
    ├── dashboard.page.js
    ├── biblioteca.page.js
    ├── login.page.js
    └── landing.page.js
```

Esta estructura es una dirección, no una orden para mover todo de una sola vez.

No crear módulos vacíos solo para aparentar arquitectura.

Cada extracción debe responder a una responsabilidad real.

---

## 9. Reglas sobre archivos grandes

Los archivos grandes deben reducirse gradualmente.

No dividir un archivo únicamente por cantidad de líneas.

Dividir por responsabilidad.

Prioridad recomendada:

1. Descargas compartidas.
2. Modales y previews.
3. API compartida.
4. Anexos.
5. Listas de cotejo.
6. Exámenes.
7. Planeaciones.
8. Contenedor de Biblioteca.
9. Inicialización de páginas.
10. Eliminación de jerarquías confirmadas.

No refactorizar todos estos puntos en una sola sesión.

---

## 10. Reglas sobre duplicados

Antes de unificar funciones duplicadas:

- Comparar parámetros.
- Comparar retornos.
- Comparar efectos secundarios.
- Comparar mensajes visibles.
- Comparar manejo de errores.
- Comparar consumidores.
- Confirmar si una versión pertenece al sistema vigente o al legado.

Dos funciones con nombres parecidos no necesariamente son equivalentes.

No reemplazar una por otra sin demostrar equivalencia funcional.

---

## 11. Reglas sobre `window`

No agregar nuevas propiedades globales en `window` salvo que sea necesario como adaptador temporal.

Cuando se use `window` por compatibilidad:

- Documentar por qué existe.
- Indicar qué consumidores lo requieren.
- Marcarlo como temporal.
- Crear una tarea para eliminarlo después.

No renombrar ni eliminar propiedades existentes en `window` sin buscar todos sus consumidores.

---

## 12. Reglas sobre eventos

Antes de registrar un listener:

- Verificar si ya se registra en otro archivo.
- Verificar si la función de inicialización puede ejecutarse más de una vez.
- Evitar listeners duplicados.
- Preferir delegación de eventos cuando sea apropiado.
- Mantener funciones de cleanup cuando existan modales, polling o vistas dinámicas.

Nunca agregar un listener dentro de una función de render sin comprobar si el render puede repetirse.

---

## 13. Reglas sobre estado

No crear nuevas variables globales dispersas.

El estado debe tener propietario claro.

No mantener dos estados paralelos para representar la misma información.

No mezclar estado del sistema antiguo de jerarquías con estado de Biblioteca.

Toda migración de estado debe:

- Mantener compatibilidad temporal.
- Documentar origen y destino.
- Validar todos los consumidores.
- Eliminar el estado antiguo solo al final.

---

## 14. Reglas sobre API

Toda llamada API debe respetar los contratos existentes.

No cambiar:

- Método HTTP.
- Ruta.
- Headers.
- Nombres de campos.
- Tipos de datos.
- Manejo de autenticación.
- Interpretación de respuestas.

Si se centralizan llamadas en un API client, primero debe comportarse igual que la implementación anterior.

Los errores HTTP, respuestas vacías y respuestas JSON deben manejarse de forma explícita.

---

## 15. Reglas sobre descargas

Las descargas desde cards y previews deben usar una implementación compartida cuando se confirme que tienen el mismo contrato.

La IA debe preservar:

- Nombre sugerido.
- Posibilidad de editar nombre.
- Sanitización de filename.
- Extensión correcta.
- Tipo MIME.
- Manejo de Blob.
- Mensajes de error.
- Comportamiento de descarga.

No crear una nueva implementación paralela si ya existe una canónica.

---

## 16. Reglas sobre generación y polling

No cambiar la lógica de generación durante un refactor estructural.

Preservar:

- Creación de jobs.
- IDs de recursos.
- IDs de unidad o planeación.
- Estado visual del card.
- Polling.
- Intervalos.
- Condiciones de finalización.
- Manejo de errores.
- Feedback mostrado al usuario.

No permitir que el polling de un recurso actualice el card de otro recurso.

No crear múltiples intervalos para el mismo job.

Todo intervalo debe tener una condición clara de limpieza.

---

## 17. Reglas sobre comportamiento visible

Durante una extracción no se deben cambiar:

- Textos.
- Botones.
- Orden de tabs.
- Clases CSS.
- IDs del DOM.
- Data attributes.
- Estructura de cards.
- Modales.
- Feedback.
- Animaciones.
- Nombres de archivos descargados.

Si se detecta un problema visual o funcional no relacionado con la tarea:

- Documentarlo.
- No corregirlo en el mismo cambio.
- Proponer una tarea separada.

---

## 18. Reglas sobre cambios automáticos

No realizar cambios masivos con reemplazos globales sin revisar cada coincidencia.

No usar scripts de búsqueda y reemplazo para eliminar jerarquías de forma indiscriminada.

No ejecutar formateadores sobre archivos no relacionados.

No cambiar finales de línea de todo el repositorio.

No renombrar archivos sin actualizar y validar el orden de carga de scripts.

---

## 19. Tamaño y alcance de cada sesión

Cada sesión debe tener un objetivo concreto.

Ejemplos válidos:

- Auditar descargas duplicadas.
- Extraer el preview de exámenes.
- Centralizar el API client sin cambiar contratos.
- Separar eventos de anexos.
- Documentar jerarquías activas y obsoletas.

Ejemplos no válidos:

- Refactorizar todo el frontend.
- Limpiar todo el código viejo.
- Modernizar toda la aplicación.
- Reescribir Biblioteca completa.

Si durante una sesión aparece trabajo adicional, se debe registrar como pendiente en lugar de ampliar el alcance sin control.

---

## 20. Validación mínima obligatoria

Después de cada cambio, validar como mínimo:

### Aplicación

- La página carga.
- No aparecen nuevos errores de consola.
- No faltan funciones globales requeridas.
- No se rompen imports o scripts.

### Biblioteca

- Se cargan los bloques.
- Se abre un bloque.
- Se puede cambiar entre tabs.

### Recurso afectado

- Se muestran sus cards.
- Se abre preview.
- Se ejecuta la acción modificada.
- Se conserva feedback.
- Se conserva descarga.
- Se conserva eliminación cuando corresponda.

### Red

- No hay peticiones duplicadas nuevas.
- Los payloads mantienen su forma.
- Los endpoints siguen siendo los mismos.

### Eventos

- Un clic ejecuta una sola acción.
- No se duplican modales.
- No se crean intervalos duplicados.

---

## 21. Archivos de documentación obligatorios

Antes de iniciar una modificación grande, leer cuando existan:

- `README.md`
- `AGENTS.md`
- `docs/03-backend-guide.md`
- `docs/DATABASE_SCHEMA.md` cuando el cambio toque datos, IDs, relaciones, RLS o persistencia
- `docs/AI_GENERATION_CONTRACTS.md` cuando el cambio toque generación IA o sus métricas
- `docs/observability/LOG_CONVENTIONS.md` y `docs/observability/LOG_AUDIT.md` cuando el cambio toque logs
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND_MAP.md`
- `docs/refactor/FRONTEND_AUDIT.md`
- `docs/refactor/CURRENT_BEHAVIOR.md`
- `docs/refactor/LEGACY_HIERARCHY.md`
- `docs/refactor/TEST_MATRIX.md`
- `docs/refactor/SESSION_HANDOFF.md`

Si alguno no existe, no inventar su contenido.

Indicar que falta y continuar únicamente si la tarea puede hacerse con seguridad.

---

## 22. Entrega obligatoria al terminar una sesión

Toda sesión debe terminar con un reporte que incluya:

### Objetivo realizado

Descripción breve y concreta.

### Archivos modificados

Lista exacta.

### Cambios realizados

Qué se movió, extrajo, documentó o eliminó.

### Compatibilidad

Wrappers, aliases o puentes temporales que quedaron activos.

### Validaciones ejecutadas

Comandos y pruebas manuales.

### Riesgos encontrados

Dependencias ocultas, estado global, listeners, código legado o contratos frágiles.

### Pendientes

Trabajo detectado pero no incluido.

### Próximo paso recomendado

Una sola tarea siguiente, pequeña y verificable.

También se debe actualizar `docs/refactor/SESSION_HANDOFF.md` cuando exista.

---

## 23. Formato de commits

Los commits deben ser pequeños y describir una sola intención.

Ejemplos:

```text
refactor(frontend): extract shared download helpers
refactor(exams): move preview rendering to feature module
refactor(attachments): separate API calls from rendering
chore(refactor): document legacy hierarchy consumers
```

Evitar commits como:

```text
refactor everything
cleanup code
fix frontend
large changes
```

---

## 24. Criterio para detenerse

La IA debe detener una modificación y reportar el riesgo cuando:

- No puede determinar si una función pertenece al flujo vigente o legado.
- Existen múltiples contratos incompatibles.
- El orden de carga de scripts no está claro.
- Una función depende de estado global no documentado.
- El cambio requiere modificar backend o base de datos.
- El cambio altera comportamiento visible no autorizado.
- No existe una forma razonable de validar el resultado.

Detenerse no significa abandonar la tarea.

Debe entregar:

- Lo descubierto.
- La evidencia.
- El riesgo.
- La opción más segura para continuar.

---

## 25. Instrucción final

No buscar una solución elegante a costa de estabilidad.

No asumir.

No borrar primero.

No reescribir por impulso.

No mezclar sistemas.

Entender el flujo actual de Biblioteca, conservar compatibilidad y avanzar mediante cambios pequeños, comprobables y reversibles.
