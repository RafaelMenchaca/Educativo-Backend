# 00 - Project Overview

## Que es

Educativo IA / Planea es una aplicacion web para docentes que ayuda a crear y gestionar recursos didacticos con IA.

El producto combina:

- Un frontend estatico en `educativo_frontend/planeacion-docente-ia`.
- Un backend REST en `educativo_backend/Educativo-Backend`.
- Supabase para autenticacion, persistencia y RLS.
- OpenAI para generacion de contenido educativo.

## Problema que resuelve

Ayuda a docentes a preparar materiales de clase desde una jerarquia academica organizada: planteles, grados, materias, unidades y temas. La Biblioteca agrupa los documentos generados por unidad/batch para que puedan consultarse, editarse, descargarse o eliminarse desde un solo lugar.

## Recursos que genera

- Planeaciones didacticas.
- Anexos de trabajo para alumnos.
- Listas de cotejo.
- Examenes.

## Publico objetivo

Docentes y equipos educativos que necesitan crear materiales editables y exportables para planeacion de clases.

## Stack identificado

- Frontend: HTML, CSS, JavaScript vanilla, Tailwind CSS, Bootstrap 5, Supabase JS, Jest/JSDOM.
- Backend: Node.js con ES Modules, Express 4, Supabase JS, OpenAI SDK, CORS, dotenv.
- Base de datos: Supabase/PostgreSQL con RLS.
- Exportaciones: Word mediante HTML/Blob en frontend; ExcelJS aparece como dependencia del backend.

## Conceptos principales

- `jerarquia academica`: planteles -> grados -> materias -> unidades -> temas.
- `planeacion`: documento principal generado por tema.
- `batch` o `planeacion_batches`: agrupa planeaciones generadas juntas y funciona como base de la Biblioteca.
- `Biblioteca`: vista principal privada que agrupa planeaciones, anexos, listas de cotejo y examenes por bloque.
- `artifact_type`: tipo usado por metricas de IA: `planeacion`, `examen`, `lista_cotejo`, `anexo`.
- `RLS`: las consultas de usuario deben ejecutarse con cliente Supabase ligado al access token.

## Pendiente de confirmar

- Nombre comercial definitivo entre "Educativo IA" y "Planea".
- Politica comercial/licencia del producto.
