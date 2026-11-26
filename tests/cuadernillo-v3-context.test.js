import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPO_CUADERNILLO_IDS } from '../src/domain/cuadernillos.js';
import { obtenerSlotsCuadernilloV3 } from '../src/domain/cuadernillosV3.js';
import { resolverRepresentacionSlotCuadernilloV3 } from '../src/domain/cuadernilloV3Representations.js';
import { construirBloqueV3DesdeSlot } from '../src/validators/cuadernilloV2.validator.js';
import {
  construirFamiliasEsperadasSegmentoV3,
  construirPromptSegmentoCuadernilloV3,
  crearPlanSegmentosCuadernilloV3
} from '../src/services/cuadernilloV3.engine.js';

const fixtures = Object.freeze([
  { materia: 'Matemáticas', tema: 'Álgebra lineal', nivel: 'Universidad', unidad: 'Modelos lineales', titulo: 'Aplicaciones de sistemas' },
  { materia: 'Química', tema: 'Enlaces químicos', nivel: 'Medio superior', unidad: 'Estructura de la materia', titulo: 'Tipos de enlace' },
  { materia: 'Biología', tema: 'Mitosis y meiosis', nivel: 'Bachillerato', unidad: 'Reproducción celular', titulo: 'División celular' },
  { materia: 'Historia', tema: 'Revolución mexicana', nivel: 'Secundaria', unidad: 'México contemporáneo', titulo: 'Fuentes de la Revolución' },
  { materia: 'Literatura', tema: 'Recursos argumentativos', nivel: 'Secundaria', unidad: 'Textos persuasivos', titulo: 'Argumentación' },
  { materia: 'Electrónica', tema: 'Diagnóstico de circuitos', nivel: 'Técnico', unidad: 'Mantenimiento', titulo: 'Fallas de continuidad' }
]);

function context(fixture) {
  return {
    ...fixture,
    subtema: '', actividad_cierre: 'Integra una conclusión sustentada.', duracion: 50,
    tabla_ia: [{ momento: 'Desarrollo', actividad: `Analizar ${fixture.tema}`, estrategia: 'Caso guiado' }],
    actividades_momentos: { desarrollo: `Aplicación contextual de ${fixture.tema}` },
    datos_generales: {}
  };
}

function promptFor(tipo, fixture, segment, errors = []) {
  const academicContext = context(fixture);
  return construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: tipo,
    contextoPlaneacion: academicContext,
    segmento: segment,
    errores: errors,
    familiasEsperadas: construirFamiliasEsperadasSegmentoV3(tipo, academicContext, segment)
  });
}

test('six academic fixtures reconstruct four contextual prompts for every v3 modality', () => {
  for (const fixture of fixtures) {
    for (const tipo of TIPO_CUADERNILLO_IDS) {
      const plan = crearPlanSegmentosCuadernilloV3(tipo);
      assert.equal(plan.length, 4);
      for (const segment of plan) {
        const { userPrompt } = promptFor(tipo, fixture, segment);
        assert.match(userPrompt, new RegExp(fixture.materia, 'i'));
        assert.match(userPrompt, new RegExp(fixture.tema, 'i'));
        assert.match(userPrompt, new RegExp(fixture.nivel, 'i'));
        assert.match(userPrompt, new RegExp(fixture.unidad, 'i'));
        assert.match(userPrompt, new RegExp(fixture.titulo, 'i'));
        assert.match(userPrompt, /caso concreto del tema|informacion indispensable|conceptos del tema/i);
      }
    }
  }
});

test('non-mathematical fixtures receive neither mathematical narrative nor mathematical schema branches', () => {
  for (const fixture of fixtures.slice(1)) {
    for (const tipo of TIPO_CUADERNILLO_IDS) {
      for (const segment of crearPlanSegmentosCuadernilloV3(tipo)) {
        const prompt = promptFor(tipo, fixture, segment);
        const serializedSchema = JSON.stringify(prompt.jsonSchema);
        assert.doesNotMatch(prompt.userPrompt, /algebra lineal|matrices|determinantes|cramer|sistema_lineal_2x2|determinante_2x2/i);
        assert.doesNotMatch(serializedSchema, /sistema_lineal_2x2|determinante_2x2|aritmetica_racional|"matriz"|"metodo"/i);
      }
    }
  }
});

test('exact algebra context alone receives supported families and its central matrix contract', () => {
  const algebra = fixtures[0];
  const exerciseSegment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
  const exercisePrompt = promptFor('ejercicios_aplicacion', algebra, exerciseSegment);
  assert.match(JSON.stringify(exercisePrompt.jsonSchema), /determinante_2x2/);
  assert.match(JSON.stringify(exercisePrompt.jsonSchema), /sistema_lineal_2x2/);
  assert.match(exercisePrompt.userPrompt, /POLITICA DISCIPLINAR CONDICIONAL/);
  const projectSegment = crearPlanSegmentosCuadernilloV3('actividades_integradoras')[2];
  assert.match(JSON.stringify(promptFor('actividades_integradoras', algebra, projectSegment).jsonSchema), /vector_b/);
});

test('conceptual solved examples require developed disciplinary analysis and accept no mathematical family', () => {
  const slot = obtenerSlotsCuadernilloV3('ejercicios_aplicacion').find(({ numero }) => numero === 15);
  const block = {
    tipo: 'ejemplo_resuelto',
    enunciado: 'Lee la fuente breve incluida y determina la postura de su autor.',
    pasos: [
      'Identifica al autor, la fecha y el contexto indicados en la fuente.',
      'Separa la afirmación principal de la evidencia breve que la respalda.',
      'Contrasta la postura con el contexto y formula una conclusión sustentada.'
    ],
    resultado: 'La fuente sostiene una postura respaldada por la evidencia identificada.',
    verificacion: ['La conclusión cita la afirmación y la evidencia incluidas en el caso.'],
    interpretacion: 'La relación entre postura y evidencia permite valorar el alcance histórico de la fuente.',
    contrato_cuantitativo: { familia_problema: 'no_cuantitativo' }
  };
  assert.doesNotThrow(() => construirBloqueV3DesdeSlot(slot, structuredClone(block)));
  assert.throws(
    () => construirBloqueV3DesdeSlot(slot, { ...structuredClone(block), pasos: ['Analiza el caso.', 'Obtén una conclusión.'] }),
    (error) => error.code === 'procedimiento_demostrativo_superficial'
  );
});

test('retry reconstruction preserves canonical context and generations do not share mutable policy state', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[1];
  const algebra = promptFor('ejercicios_aplicacion', fixtures[0], segment);
  const chemistry = promptFor('ejercicios_aplicacion', fixtures[1], segment, [{
    code: 'paso_demostrativo_generico', path: 'slots[x].bloque.pasos[0]', slotId: segment.slots[0].slotId
  }]);
  assert.match(chemistry.userPrompt, /SEGUNDO Y ULTIMO INTENTO/);
  assert.match(chemistry.userPrompt, /Química/);
  assert.match(chemistry.userPrompt, /Enlaces químicos/);
  assert.doesNotMatch(chemistry.userPrompt, /Álgebra lineal|determinante|cramer|matrices/i);
  assert.match(algebra.userPrompt, /Álgebra lineal/);
  assert.doesNotMatch(promptFor('ejercicios_aplicacion', fixtures[1], segment).userPrompt, /Álgebra lineal|determinante|cramer|matrices/i);
});

test('all example owners expose the universal demonstrative contract', () => {
  const examples = TIPO_CUADERNILLO_IDS.flatMap(obtenerSlotsCuadernilloV3)
    .filter((slot) => resolverRepresentacionSlotCuadernilloV3(slot).recomendacionPrincipal.tipo === 'ejemplo_resuelto');
  assert.ok(examples.length >= 3);
  for (const slot of examples) {
    const rules = resolverRepresentacionSlotCuadernilloV3(slot).reglas.join(' ');
    assert.match(rules, /al menos tres acciones distinguibles/);
    assert.match(rules, /evidencia del caso/);
  }
});
