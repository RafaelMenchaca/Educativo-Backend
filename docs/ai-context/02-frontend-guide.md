# 02 - Frontend Guide

## Aplica

Este workspace si contiene frontend: `educativo_frontend/planeacion-docente-ia`.

## Tecnologias

- HTML estatico.
- JavaScript vanilla.
- Tailwind CSS para area privada y estilos base.
- Bootstrap 5 en experiencia publica segun README.
- Supabase JS para autenticacion.
- Jest/JSDOM para pruebas unitarias.

## Paginas principales

- `index.html`: landing publica.
- `pages/login.html`, `registro.html`, `recuperar.html`: autenticacion.
- `pages/dashboard.html`: explorador academico y flujo principal privado.
- `pages/archivados.html`: restore y eliminacion permanente.
- `pages/detalle.html`: edicion/detalle de planeacion.
- `pages/batch.html`: vista legacy de lote.
- La Biblioteca vive como vista controlada por `js/pages/biblioteca.page.js`.

## Flujo general UI

1. `js/main.js` protege rutas privadas y carga el controlador de pagina.
2. El dashboard muestra jerarquia academica.
3. El usuario agrega temas y genera planeaciones.
4. La Biblioteca agrupa documentos por bloque/batch.
5. Tabs de Biblioteca: planeaciones, examenes, listas y anexos.
6. Las descargas pasan por modal de nombre de archivo cuando aplica.

## APIs frontend

- `js/api/planeaciones.api.js`
- `js/api/biblioteca.api.js`
- `js/api/anexos.api.js`
- `js/api/examenes.api.js`
- `js/api/listas_cotejo.api.js`
- `js/api/jerarquia.api.js`

Todas deben enviar Bearer token cuando llaman endpoints privados.

## Reglas de estilos

- Mantener Tailwind y clases existentes en area privada.
- Mantener Bootstrap/estilos existentes en paginas publicas.
- Reutilizar helpers de `js/ui/shared.ui.js` para toasts, pills y modal de descarga.
- No introducir frameworks ni librerias UI sin permiso.
- No cambiar estilos globales si el cambio es local a una pagina.

## Modales, cards, botones, tabs y descargas

- Biblioteca usa modales inyectados desde `biblioteca.page.js`.
- El progreso de generacion debe mostrarse en la card/lista donde aparecera el resultado, no solo dentro de un modal.
- Mantener tabs por conjunto en `bibliotecaState.activeTab`.
- Las descargas Word dependen de `js/ui/wordExport.js`; las zonas marcadas como protegidas no deben tocarse sin permiso.
- Preferir confirmar eliminaciones con el modal existente `showBibConfirm`.

## Responsive/mobile

- Tailwind config define colores, radios y sombras base.
- Varias paginas usan clases responsive `sm:`, `lg:` y CSS especifico por pagina.
- Antes de cambiar layouts privados, revisar `dashboard.css`, `archivados.css`, `batch.css` y la pagina afectada.
