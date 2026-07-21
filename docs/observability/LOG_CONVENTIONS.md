# Convenciones de logs del backend

## Alcance

Este documento gobierna cómo agregar o modificar logs del backend. Se debe leer junto con [`LOG_AUDIT.md`](LOG_AUDIT.md) y [`../../AGENTS.md`](../../AGENTS.md).

El código ejecutable sigue siendo la fuente técnica real. Estas reglas no autorizan cambios de flujo, manejo de errores, payloads ni métricas.

## Convención de evento

Usar un prefijo estable por dominio y un nombre breve de evento:

```text
[recurso] accion:estado
```

Ejemplos de forma, no de eventos nuevos: `[anexos] generate:start`, `[planeaciones] generate:error`, `[biblioteca] delete:success`.

- `info`: inicio, éxito o transición operativa útil.
- `warn`: condición recuperable, fallback o inconsistencia corregida.
- `error`: fallo que termina o degrada la operación.
- Evitar `log` para eventos nuevos salvo arranque o compatibilidad localizada.

## Campos permitidos

Preferir objetos estructurados pequeños con IDs técnicos, conteos, estado, versión, duración y tipo seguro de error. Mantener nombres consistentes dentro de un dominio.

No incluir objetos completos de request/response, entidades completas ni contenido educativo cuando basta un ID o conteo. Los IDs deben usarse solo cuando ayuden a correlacionar una operación y no deben presentarse como datos de usuario.

## Información prohibida

No registrar:

- prompts system/user ni fragmentos de prompts;
- respuestas completas o contenido crudo de OpenAI;
- contenido completo de planeaciones, anexos, listas o exámenes;
- access tokens, Bearer tokens, API keys o cookies;
- headers de autorización o request headers completos;
- service role, URLs privadas o connection strings;
- emails, nombres reales u otros datos personales;
- tokens ni sus conteos en logs; esos datos pertenecen exclusivamente al sistema de métricas ya previsto;
- stack traces en respuestas al usuario.

Si un mensaje de proveedor puede contener secretos, sanitizarlo antes de persistirlo o registrarlo. La sanitización actual de métricas elimina patrones de API key y Bearer token; no confiar en ella para imprimir objetos arbitrarios.

## Errores y control de flujo

Agregar un log no debe:

- eliminar, envolver u ocultar un `throw` existente;
- cambiar un status HTTP, retorno, condición o fallback;
- convertir un error bloqueante en no bloqueante o viceversa;
- exponer al usuario el detalle interno registrado;
- duplicar el mismo fallo en controller y service sin una necesidad de correlación clara.

Registrar el error donde existe contexto útil. Si controller y service ya registran el mismo fallo, revisar [`LOG_AUDIT.md`](LOG_AUDIT.md) antes de añadir otro evento.

## IA y métricas

Los logs operativos no sustituyen `ai_generation_jobs` ni `ai_generation_calls`. No recalcular ni duplicar métricas IA en `console.*`.

Para generación IA se permiten resúmenes como modelo, versión, número de intento, estado de validación, duración y conteos. Se prohíben prompt, respuesta completa, request headers y secretos. Las reglas contractuales adicionales están en [`../AI_GENERATION_CONTRACTS.md`](../AI_GENERATION_CONTRACTS.md).

## Checklist antes de agregar un log

1. Confirmar que el evento no existe ya.
2. Elegir dominio, nivel y nombre estables.
3. Reducir el payload a IDs/conteos necesarios.
4. Verificar que no contenga secretos ni datos personales.
5. Conservar `throw`, retorno, status, fallback y mensaje de usuario.
6. Actualizar [`LOG_AUDIT.md`](LOG_AUDIT.md) y el handoff si cambia la cobertura.
