import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANEXO_SCHEMA_VERSION_V2,
  TIPOS_CUADERNILLO,
  TIPO_CUADERNILLO_IDS,
  CUADERNILLO_TIPOS_METADATA,
  CUADERNILLO_BLUEPRINTS,
  CLASIFICACIONES_COMPONENTE,
  esTipoCuadernillo,
  obtenerMetadataTipoCuadernillo,
  obtenerBlueprintCuadernillo
} from '../src/domain/cuadernillos.js';
import {
  CUADERNILLO_V2_BLOCK_TYPES,
  CUADERNILLO_V2_ACTIVITY_MODALITIES,
  CUADERNILLO_V2_EVALUATION_MODALITIES,
  validateCuadernilloV2
} from '../src/validators/cuadernilloV2.validator.js';

const EXPECTED = {
  ejercicios_aplicacion: {
    label: 'Cuadernillo de ejercicios y aplicación',
    enfoque: 'Practicar y resolver',
    objetivo: 'Desarrollar habilidades y conocimientos mediante ejercicios progresivos, procedimientos y resolución de problemas.',
    sections: ['datos_generales', 'presentacion', 'repaso_teorico', 'ejemplos_resueltos', 'ejercicios_basicos', 'ejercicios_intermedios', 'retos_problemas', 'actividad_integradora', 'evaluacion', 'cierre'],
    components: 35
  },
  actividades_integradoras: {
    label: 'Cuadernillo de actividades integradoras',
    enfoque: 'Analizar, crear y resolver',
    objetivo: 'Promover la aplicación de conocimientos mediante situaciones problemáticas, análisis, actividades prácticas y elaboración de productos.',
    sections: ['datos_generales', 'presentacion_proyecto', 'fundamentacion_teorica', 'contextualizacion', 'actividades_analisis', 'actividades_aplicacion', 'produccion_proyecto', 'presentacion_resultados', 'evaluacion', 'cierre_reflexivo'],
    components: 45
  },
  aprendizaje_guiado: {
    label: 'Cuadernillo de aprendizaje guiado',
    enfoque: 'Aprender y comprender',
    objetivo: 'Proporcionar al estudiante la información teórica y explicativa necesaria para estudiar un tema de manera autónoma.',
    sections: ['datos_generales', 'presentacion_tema', 'desarrollo_teorico', 'apoyos_aprendizaje', 'actividades_comprension', 'actividades_aplicacion', 'evaluacion_aprendizaje', 'cierre'],
    components: 35
  }
};

function generalData() {
  return {
    institucion: { valor: '', modo: 'completar' },
    asignatura: { valor: 'Matemáticas', modo: 'backend' },
    unidad: { valor: '', modo: 'completar' },
    tema: { valor: 'Tema de prueba', modo: 'backend' },
    estudiante: { valor: '', modo: 'completar', lineas: 1 },
    grupo: { valor: '', modo: 'completar', lineas: 1 },
    fecha: { valor: '', modo: 'completar', lineas: 1 }
  };
}

function validFixture(type) {
  return {
    schema_version: 2,
    titulo: 'Cuadernillo de prueba',
    descripcion: 'Descripción útil para el estudiante.',
    datos_generales: generalData(),
    secciones: CUADERNILLO_BLUEPRINTS[type].map((section) => ({
      id: section.id,
      titulo: section.titulo,
      orden: section.orden,
      bloques: [{
        tipo: 'texto',
        titulo: 'Contenido de la sección',
        contenido: 'Contenido educativo suficiente para validar el contrato.',
        cobertura: section.cobertura_requerida.map(({ numero }) => numero)
      }]
    }))
  };
}

function expectInvalid(type, mutate, code) {
  const fixture = validFixture(type);
  mutate(fixture);
  assert.throws(
    () => validateCuadernilloV2(type, fixture),
    (error) => error.code === code && !error.message.includes(JSON.stringify(fixture))
  );
}

test('canonical type IDs, metadata and schema version are exact', () => {
  assert.equal(ANEXO_SCHEMA_VERSION_V2, 2);
  assert.deepEqual(TIPO_CUADERNILLO_IDS, Object.keys(EXPECTED));
  assert.deepEqual(TIPOS_CUADERNILLO, {
    EJERCICIOS_APLICACION: 'ejercicios_aplicacion',
    ACTIVIDADES_INTEGRADORAS: 'actividades_integradoras',
    APRENDIZAJE_GUIADO: 'aprendizaje_guiado'
  });
  for (const [id, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(CUADERNILLO_TIPOS_METADATA[id], { id, label: expected.label, enfoque: expected.enfoque, objetivo: expected.objetivo });
    assert.equal(esTipoCuadernillo(id), true);
    assert.equal(obtenerMetadataTipoCuadernillo(id), CUADERNILLO_TIPOS_METADATA[id]);
  }
  for (const value of ['', 'otro', null, 1, { id: 'aprendizaje_guiado' }]) {
    assert.equal(esTipoCuadernillo(value), false);
    assert.equal(obtenerMetadataTipoCuadernillo(value), null);
    assert.equal(obtenerBlueprintCuadernillo(value), null);
  }
});

test('blueprints expose exact section IDs, order and complete classified coverage', () => {
  const validClassifications = new Set(CLASIFICACIONES_COMPONENTE);
  for (const [type, expected] of Object.entries(EXPECTED)) {
    const blueprint = CUADERNILLO_BLUEPRINTS[type];
    assert.equal(blueprint.length, expected.sections.length);
    assert.deepEqual(blueprint.map(({ id }) => id), expected.sections);
    assert.deepEqual(blueprint.map(({ orden }) => orden), expected.sections.map((_, index) => index + 1));
    const components = blueprint.flatMap(({ cobertura_requerida }) => cobertura_requerida);
    assert.equal(components.length, expected.components);
    assert.deepEqual(components.map(({ numero }) => numero).sort((a, b) => a - b), Array.from({ length: expected.components }, (_, index) => index + 1));
    assert.equal(new Set(components.map(({ numero }) => numero)).size, expected.components);
    for (const section of blueprint) {
      assert.ok(section.titulo.trim());
      assert.equal(section.obligatoria, true);
      assert.ok(section.cobertura_requerida.length > 0);
    }
    for (const item of components) {
      assert.ok(item.nombre.trim());
      assert.equal(validClassifications.has(item.clasificacion), true);
      if (item.clasificacion === 'condicional') assert.ok(item.alternativa?.trim());
    }
  }
});

test('compact block and modality allowlists are exact', () => {
  assert.deepEqual(CUADERNILLO_V2_BLOCK_TYPES, ['texto', 'lista', 'conceptos', 'tabla', 'actividad', 'procedimiento', 'ejemplo_resuelto', 'proyecto', 'registro', 'evaluacion', 'espacio_respuesta']);
  assert.deepEqual(CUADERNILLO_V2_ACTIVITY_MODALITIES, ['preguntas', 'completar', 'relacionar', 'identificar', 'clasificar', 'ejercicio', 'problema', 'reflexion']);
  assert.deepEqual(CUADERNILLO_V2_EVALUATION_MODALITIES, ['rubrica', 'lista_cotejo', 'autoevaluacion']);
});

for (const type of TIPO_CUADERNILLO_IDS) {
  test(`minimal complete fixture validates for ${type}`, () => {
    const result = validateCuadernilloV2(type, validFixture(type));
    assert.deepEqual(result, { ok: true, schemaVersion: 2, tipoCuadernillo: type });
  });
}

test('validator rejects invalid type, schema and embedded canonical type', () => {
  assert.throws(() => validateCuadernilloV2('desconocido', validFixture('ejercicios_aplicacion')), (error) => error.code === 'tipo_cuadernillo_invalido');
  expectInvalid('ejercicios_aplicacion', (value) => { value.schema_version = 1; }, 'schema_version_invalida');
  expectInvalid('ejercicios_aplicacion', (value) => { value.tipo_cuadernillo = 'aprendizaje_guiado'; }, 'tipo_no_permitido_en_contenido');
});

test('validator rejects missing, duplicate, foreign and out-of-order sections', () => {
  expectInvalid('ejercicios_aplicacion', (value) => { value.secciones.pop(); }, 'cantidad_secciones_invalida');
  expectInvalid('ejercicios_aplicacion', (value) => { value.secciones[1].id = value.secciones[0].id; }, 'seccion_duplicada');
  expectInvalid('ejercicios_aplicacion', (value) => { value.secciones[1].id = 'presentacion_tema'; }, 'seccion_ajena_o_fuera_de_orden');
  expectInvalid('ejercicios_aplicacion', (value) => { value.secciones[1].orden = 3; }, 'orden_seccion_invalido');
});

test('validator rejects empty blocks, unknown discriminators and incomplete coverage', () => {
  expectInvalid('aprendizaje_guiado', (value) => { value.secciones[0].bloques = []; }, 'bloques_vacios');
  expectInvalid('aprendizaje_guiado', (value) => { value.secciones[0].bloques[0].tipo = 'imagen'; }, 'tipo_bloque_desconocido');
  expectInvalid('aprendizaje_guiado', (value) => { value.secciones[0].bloques[0].cobertura.pop(); }, 'cobertura_incompleta');
});

test('validator rejects non-rectangular tables', () => {
  expectInvalid('ejercicios_aplicacion', (value) => {
    value.secciones[0].bloques = [{ tipo: 'tabla', cobertura: [1, 2, 3, 4, 5, 6], columnas: ['A', 'B'], filas: [['solo una']] }];
  }, 'tabla_no_rectangular');
});

test('validator rejects questions or exercises without statements and duplicate item IDs', () => {
  expectInvalid('ejercicios_aplicacion', (value) => {
    value.secciones[0].bloques = [{ tipo: 'actividad', modalidad: 'preguntas', instrucciones: 'Responde.', cobertura: [1, 2, 3, 4, 5, 6], items: [{ id: 'p1', enunciado: '' }] }];
  }, 'texto_requerido');
  expectInvalid('ejercicios_aplicacion', (value) => {
    value.secciones[0].bloques = [{ tipo: 'actividad', modalidad: 'ejercicio', instrucciones: 'Resuelve.', cobertura: [1, 2, 3, 4, 5, 6], items: [{ id: 'e1' }] }];
  }, 'texto_requerido');
  expectInvalid('ejercicios_aplicacion', (value) => {
    value.secciones[0].bloques = [{ tipo: 'actividad', modalidad: 'preguntas', instrucciones: 'Responde.', cobertura: [1, 2, 3, 4, 5, 6], items: [{ id: 'p1', enunciado: 'Uno' }, { id: 'p1', enunciado: 'Dos' }] }];
  }, 'id_duplicado');
  expectInvalid('ejercicios_aplicacion', (value) => {
    value.secciones[0].bloques = [
      { tipo: 'actividad', modalidad: 'preguntas', instrucciones: 'Responde.', cobertura: [1, 2, 3], items: [{ id: 'global-1', enunciado: 'Uno' }] },
      { tipo: 'actividad', modalidad: 'ejercicio', instrucciones: 'Resuelve.', cobertura: [4, 5, 6], items: [{ id: 'global-1', enunciado: 'Dos' }] }
    ];
  }, 'id_duplicado');
});

test('validator rejects invalid response lines and structurally invented general data', () => {
  expectInvalid('aprendizaje_guiado', (value) => {
    value.secciones[0].bloques = [{ tipo: 'espacio_respuesta', etiqueta: 'Respuesta', lineas: 0, cobertura: [1, 2, 3, 4, 5, 6] }];
  }, 'lineas_invalidas');
  expectInvalid('aprendizaje_guiado', (value) => { value.datos_generales.estudiante.valor = 'Nombre inventado'; }, 'valor_completable_debe_estar_vacio');
  expectInvalid('aprendizaje_guiado', (value) => { value.datos_generales.asignatura.modo = 'completar'; }, 'modo_general_invalido');
  expectInvalid('aprendizaje_guiado', (value) => { value.datos_generales.institucion = { valor: 'Inventada', modo: 'completar' }; }, 'valor_completable_debe_estar_vacio');
});

test('v1 contract and frontend consumers remain compatible after additive backend dispatch', () => {
  const service = readFileSync(new URL('../src/services/anexos.service.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../src/controllers/anexos.controller.js', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../src/routes/anexos.routes.js', import.meta.url), 'utf8');
  const frontendPreview = readFileSync(new URL('../../frontend/js/features/anexos/anexo-preview.js', import.meta.url), 'utf8');
  const frontendWord = readFileSync(new URL('../../frontend/js/features/anexos/anexo-download.js', import.meta.url), 'utf8');

  assert.match(controller, /req\.body\?\.planeacion_id/);
  assert.match(routes, /router\.post\('\/generate',\s*requireAuth,\s*postGenerarAnexo\)/);
  assert.match(service, /v1_anexos_desde_planeacion/);
  assert.match(service, /Genera entre 3 y 5 anexos/);
  assert.match(service, /payload\.anexos\.length < 3 \|\| payload\.anexos\.length > 5/);
  assert.match(service, /tipo_cuadernillo/);
  assert.match(controller, /tipo_cuadernillo/);
  assert.doesNotMatch(routes, /tipo_cuadernillo/);
  assert.match(frontendPreview, /contenido\.anexos/);
  assert.match(frontendWord, /contenido\.anexos/);
  assert.doesNotMatch(frontendPreview, /schema_version|tipo_cuadernillo/);
  assert.doesNotMatch(frontendWord, /schema_version|tipo_cuadernillo/);
});

test('prepared SQL is nullable, idempotent, allowlisted and preserves existing constraints', () => {
  const sql = readFileSync(new URL('../docs/test-environment/anexos-cuadernillo-v2/02_migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS tipo_cuadernillo text NULL/i);
  assert.match(sql, /IF NOT EXISTS/i);
  for (const id of TIPO_CUADERNILLO_IDS) assert.match(sql, new RegExp(`'${id}'`));
  assert.doesNotMatch(sql, /UPDATE\s+public\.anexos/i);
  assert.doesNotMatch(sql, /SET\s+NOT\s+NULL|DEFAULT\s+'/i);
  assert.doesNotMatch(sql, /DROP\s+(INDEX|CONSTRAINT)|ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY/i);
});
