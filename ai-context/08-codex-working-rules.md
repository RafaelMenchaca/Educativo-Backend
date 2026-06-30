# 08 - Codex Working Rules

## Reglas estrictas

- Hacer cambios minimos y localizados.
- No refactorizar sin permiso explicito.
- No tocar base de datos ni migraciones sin permiso explicito.
- No introducir frameworks o librerias nuevas sin permiso.
- No cambiar rutas, endpoints, imports o contratos de respuesta salvo que la tarea lo pida.
- No cambiar logica de generacion IA sin revisar servicios, prompts, consumidores frontend y metricas.
- No exponer secretos, tokens, API keys, stack traces ni errores internos al usuario.
- No revertir cambios ajenos.
- No editar archivos legacy salvo que la tarea lo requiera.

## Antes de modificar

- Leer `AI_CONTEXT.md` y docs relevantes en `docs/ai-context`.
- Identificar si el cambio es frontend, backend, DB o IA.
- Buscar patrones existentes con `rg`.
- Confirmar donde vive la responsabilidad: API, service, page, UI o CSS.

## Durante el cambio

- Mantener estilo del archivo.
- Preferir helpers existentes.
- No duplicar logica si ya hay servicio/helper.
- Mantener validaciones y errores amigables.
- Si se toca generacion IA, mantener metricas `createAiJob`, `logAiCall`, `finishAiJob`, `failAiJob`.
- Si se toca UI de generacion, mantener progreso visible en la card/lista de destino.

## Checklist de pruebas manuales

- Frontend:
  - Login o sesion requerida funciona.
  - Dashboard carga jerarquia.
  - Biblioteca carga conjuntos.
  - Tabs de Biblioteca cambian correctamente.
  - Modales abren/cierran y no dejan scroll bloqueado.
  - Descarga Word genera archivo con nombre esperado.
  - Mobile/responsive no rompe layout principal.
- Backend:
  - `GET /health` responde `{ ok: true }`.
  - Endpoints privados rechazan requests sin Bearer token.
  - Endpoint modificado responde errores 400/401/500 de forma segura.
  - RLS sigue usando cliente por usuario.
- IA:
  - Generacion devuelve estructura esperada.
  - Errores no muestran detalles internos al usuario.
  - Metricas se registran o fallan sin romper el flujo.

## Comandos utiles

- Backend: `npm run dev`, `npm start`.
- Frontend: `npm test`, `npm run build:css`, `npm run dev:css`.
- Buscar archivos: `rg --files`.
- Buscar referencias: `rg "texto"`.

## Formato sugerido de commits

- `docs: agrega contexto para ia`
- `fix(frontend): corrige descarga de anexos`
- `fix(backend): valida payload de examenes`
- `feat(biblioteca): agrega estado para listas`
- `chore: actualiza consultas de metricas`

Usar commits pequenos y descriptivos. No mezclar cambios de docs, frontend, backend y DB si no pertenecen a la misma tarea.
