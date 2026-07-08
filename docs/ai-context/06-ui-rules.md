# 06 - UI Rules

## Reglas visuales generales

- Mantener el sistema actual: Tailwind en area privada y Bootstrap/estilos publicos donde ya existan.
- Mantener colores definidos en `tailwind.config.js`: primary azul, fondos claros, texto slate, success/warning/danger.
- No reescribir CSS global para resolver un caso local.
- Usar clases/componentes existentes antes de crear variantes nuevas.

## Biblioteca

- La Biblioteca es la vista principal de documentos.
- Mantener tabs: planeaciones, examenes, listas y anexos.
- Mantener feedback de generacion en el lugar donde aparecera el resultado: cards/listas dentro del bloque.
- No esconder progreso solo dentro de modales.
- Mantener estados `pending`, `generating`, `ready`, `error`, `skipped` donde ya se usan.

## Cards

- Usar cards existentes de Biblioteca y dashboard.
- Mantener informacion escaneable: titulo, metadata y acciones.
- No mezclar estilos publicos de marketing dentro del area privada.

## Modales

- Reutilizar modales existentes en `biblioteca.page.js` y helpers de `shared.ui.js`.
- Los modales de descarga deben permitir cambiar nombre de archivo.
- En eliminaciones, usar confirmacion antes de llamar API.
- Bloquear scroll del body cuando el modal esta abierto, como ya hacen los modales existentes.

## Botones

- Mantener estilos existentes:
  - primarios para acciones de generacion/confirmacion.
  - secundarios para cancelar o acciones alternativas.
  - danger para eliminar.
- No cambiar textos de acciones si hay logica que depende de `data-*`.

## Descargas

- `js/ui/wordExport.js` tiene zonas protegidas para descarga Word. No tocar esas partes sin permiso.
- Las descargas de Biblioteca deben pasar por modal de nombre cuando ya este implementado.
- Verificar que el nombre final no incluya caracteres invalidos.

## Responsive/mobile

- Respetar clases responsive existentes (`sm:`, `lg:`) y CSS por pagina.
- Revisar que modales entren en `92vw` o limites similares antes de cambiar ancho.
- No introducir layouts que dependan solo de hover para acciones criticas.

## Pendiente de confirmar

- Guia visual formal de marca fuera de `tailwind.config.js` y CSS existente.
