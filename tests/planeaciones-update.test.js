// Offline contract tests. Source modules are linked to in-memory fakes so runtime
// configuration, Supabase, OpenAI and .env are never loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { buildPromptByLevel } from '../src/utils/buildPromptByLevel.js';
import {
  ACTIVIDADES_DIDACTICAS_POR_MOMENTO as CANONICAL_ACTIVITIES,
  ACTIVIDADES_DIDACTICAS_SETS,
  ACTIVIDADES_DIDACTICAS_SET
} from '../src/constants/actividadesDidacticas.js';

const serviceSource = readFileSync(
  new URL('../src/services/planeaciones.service.js', import.meta.url),
  'utf8'
);
const controllerSource = readFileSync(
  new URL('../src/controllers/planeaciones.controller.js', import.meta.url),
  'utf8'
);

function synthetic(context, exports) {
  return new SyntheticModule(Object.keys(exports), function setExports() {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
}

async function loadService({ completions = [], prompts = [], promptBuilder = () => '' } = {}) {
  let completionIndex = 0;
  const context = createContext({
    console: { info() {}, warn() {}, error() {}, log() {} },
    process: { env: { OPENAI_API_KEY: 'synthetic' } },
    Set,
    Map,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Date,
    JSON,
    Math,
    Promise,
    Reflect,
    Error
  });
  const service = new SourceTextModule(serviceSource, { context });
  const modules = {
    '../../supabaseClient.js': synthetic(context, {
      supabaseAdmin: { from() { throw new Error('admin fallback invoked'); } }
    }),
    openai: synthetic(context, { default: class OpenAI {
      constructor() {
        this.chat = { completions: { create: async (request) => {
          prompts.push(request.messages?.[1]?.content || '');
          const response = completions[completionIndex];
          completionIndex += 1;
          if (!response) throw new Error('Synthetic completion missing');
          return response;
        } } };
      }
    } }),
    crypto: synthetic(context, { randomUUID: () => 'synthetic-uuid' }),
    '../utils/buildPromptByLevel.js': synthetic(context, { buildPromptByLevel: promptBuilder }),
    '../constants/actividadesDidacticas.js': synthetic(context, {
      ACTIVIDADES_DIDACTICAS_POR_MOMENTO: CANONICAL_ACTIVITIES,
      ACTIVIDADES_DIDACTICAS_SETS,
      ACTIVIDADES_DIDACTICAS_SET
    }),
    './jerarquia.service.js': synthetic(context, {
      crearTemas: async () => [],
      obtenerContextoTema: async () => ({}),
      obtenerContextoUnidad: async () => ({})
    }),
    './imageEnrichment.service.js': synthetic(context, {
      enrichPlaneacionWithImages: async (value) => value,
      normalizeGenerarImagenesEn: (value) => value
    }),
    './aiMetrics.service.js': synthetic(context, {
      createAiJob: async () => null,
      finishAiJob: async () => {},
      failAiJob: async () => {},
      logAiCall: async () => {}
    })
  };
  await service.link((specifier) => {
    if (!modules[specifier]) throw new Error(`Unexpected import: ${specifier}`);
    return modules[specifier];
  });
  await service.evaluate();
  return service.namespace;
}

function validTablaIa() {
  return [
    { tiempo_sesion: 'Conocimientos previos', actividades: 'Inicio' },
    { tiempo_sesion: 'Desarrollo', actividades: 'Trabajo' },
    { tiempo_sesion: 'Cierre', actividades: 'Cierre' }
  ];
}

function fullDetalleTablaIa() {
  return [
    {
      tiempo_sesion: 'Conocimientos previos',
      actividades: '',
      tiempo_min: '10',
      producto: '',
      instrumento: 'Lista de cotejo',
      formativa: '',
      sumativa: '3',
      actividades_imagenes: []
    },
    {
      tiempo_sesion: 'Desarrollo',
      actividades: 'Trabajo sintetico',
      tiempo_min: '30',
      producto: 'Producto sintetico',
      instrumento: 'Rubrica',
      formativa: 'Formativa',
      sumativa: '5',
      actividades_imagenes: [
        {
          id: 'image-base',
          name: 'base.png',
          path: 'user/planeacion/desarrollo/base.png',
          mime_type: 'image/png',
          size: 128,
          uploaded_at: '2026-10-10T00:00:00.000Z'
        },
        {
          id: 'image-enriched',
          name: 'enriched.png',
          path: 'user/planeacion/desarrollo/enriched.png',
          mime_type: 'image/png',
          size: '256',
          uploaded_at: '2026-10-10T00:01:00.000Z',
          source: 'ai_suggested',
          query: 'synthetic classroom diagram'
        }
      ]
    },
    {
      tiempo_sesion: 'Cierre',
      actividades: 'Cierre sintetico',
      tiempo_min: '10',
      producto: 'Cierre',
      instrumento: '',
      formativa: '',
      sumativa: '2',
      actividades_imagenes: [
        {
          id: 'image-size-missing',
          name: 'missing.png',
          path: 'user/planeacion/cierre/missing.png',
          mime_type: '',
          uploaded_at: '2026-10-10T00:02:00.000Z'
        },
        {
          id: 'image-size-null',
          name: 'null.png',
          path: 'user/planeacion/cierre/null.png',
          mime_type: 'image/png',
          size: null,
          uploaded_at: '2026-10-10T00:03:00.000Z'
        },
        {
          id: 'image-size-empty',
          name: 'empty.png',
          path: 'user/planeacion/cierre/empty.png',
          mime_type: 'image/png',
          size: '',
          uploaded_at: '2026-10-10T00:04:00.000Z'
        }
      ]
    }
  ];
}

function createClient({ data = { id: 7, tabla_ia: validTablaIa() }, error = null } = {}) {
  const calls = { from: [], update: [], eq: [], select: 0, maybeSingle: 0 };
  const query = {
    update(payload) {
      calls.update.push(payload);
      return this;
    },
    eq(field, value) {
      calls.eq.push([field, value]);
      return this;
    },
    select() {
      calls.select += 1;
      return this;
    },
    async maybeSingle() {
      calls.maybeSingle += 1;
      return { data, error };
    }
  };
  const client = {
    from(table) {
      calls.from.push(table);
      return query;
    }
  };
  return { client, calls };
}

async function assertRejectedBeforeMutation(update, expectedStatus = 400) {
  const { actualizarPlaneacion } = await loadService();
  const { client, calls } = createClient();
  await assert.rejects(
    actualizarPlaneacion({ supabaseClient: client, id: 7, update, userId: 'user-a' }),
    (error) => error.status === expectedStatus
  );
  assert.equal(calls.from.length, 0);
  assert.equal(calls.update.length, 0);
}

test('allowlist exposes only tabla_ia', async () => {
  const { PLANEACION_EDITABLE_FIELDS } = await loadService();
  assert.deepEqual(Array.from(PLANEACION_EDITABLE_FIELDS), ['tabla_ia']);
});

test('updates own planeacion with the exact allowed payload and owner filters', async () => {
  const { actualizarPlaneacion } = await loadService();
  const { client, calls } = createClient();
  const tabla_ia = fullDetalleTablaIa();
  const result = await actualizarPlaneacion({
    supabaseClient: client,
    id: 7,
    update: { tabla_ia },
    userId: 'user-a'
  });
  assert.equal(result.id, 7);
  assert.deepEqual(calls.from, ['planeaciones']);
  assert.deepEqual(calls.eq, [['id', 7], ['user_id', 'user-a']]);
  assert.equal(calls.update.length, 1);
  assert.deepEqual(Object.keys(calls.update[0]), ['tabla_ia']);
  const persistedImages = calls.update[0].tabla_ia.flatMap((row) => row.actividades_imagenes);
  const enrichedImage = persistedImages.find((image) => image.id === 'image-enriched');
  assert.equal(enrichedImage.id, 'image-enriched');
  assert.equal(enrichedImage.name, 'enriched.png');
  assert.equal(enrichedImage.path, 'user/planeacion/desarrollo/enriched.png');
  assert.equal(enrichedImage.mime_type, 'image/png');
  assert.equal(enrichedImage.size, 256);
  assert.equal(enrichedImage.uploaded_at, '2026-10-10T00:01:00.000Z');
  assert.equal(enrichedImage.source, 'ai_suggested');
  assert.equal(enrichedImage.query, 'synthetic classroom diagram');
  assert.equal(
    persistedImages
      .filter((image) => image.id.startsWith('image-size-'))
      .map((image) => image.size)
      .join(','),
    '0,0,0'
  );
  assert.equal(calls.select, 1);
  assert.equal(calls.maybeSingle, 1);
});

for (const [name, update] of [
  ['empty body', {}],
  ['unknown field', { unexpected: true }],
  ['owner', { user_id: 'user-b' }],
  ['primary id', { id: 8 }],
  ['server timestamps', { created_at: '2026-01-01', updated_at: '2026-01-02' }],
  ['internal status', { status: 'ready' }],
  ['batch relation', { batch_id: 'synthetic-batch' }],
  ['tema relation', { tema_id: 'synthetic-tema' }],
  ['other protected relations', { unidad_id: 1, planeacion_ids: [7], tema_ids: ['x'], force_new_batch: true }],
  ['mixed allowed and forbidden fields', { tabla_ia: validTablaIa(), custom_title: 'No permitido' }],
  ['unexpected nested row field', {
    tabla_ia: validTablaIa().map((row, index) => index === 0 ? { ...row, user_id: 'user-b' } : row)
  }],
  ['nested object in a text field', {
    tabla_ia: validTablaIa().map((row, index) => index === 0 ? { ...row, actividades: { unexpected: true } } : row)
  }],
  ['unexpected nested image field', {
    tabla_ia: validTablaIa().map((row, index) => index === 0 ? {
      ...row,
      actividades_imagenes: [{
        id: 'image-1',
        name: 'image.png',
        path: 'synthetic/path',
        mime_type: 'image/png',
        size: 1,
        uploaded_at: '2026-10-10T00:00:00.000Z',
        token: 'forbidden'
      }]
    } : row)
  }],
  ['local preview_url image field', {
    tabla_ia: fullDetalleTablaIa().map((row, index) => index === 1 ? {
      ...row,
      actividades_imagenes: [{ ...row.actividades_imagenes[0], preview_url: 'blob:synthetic' }]
    } : row)
  }],
  ['local is_pending image field', {
    tabla_ia: fullDetalleTablaIa().map((row, index) => index === 1 ? {
      ...row,
      actividades_imagenes: [{ ...row.actividades_imagenes[0], is_pending: true }]
    } : row)
  }],
  ['local file image field', {
    tabla_ia: fullDetalleTablaIa().map((row, index) => index === 1 ? {
      ...row,
      actividades_imagenes: [{ ...row.actividades_imagenes[0], file: {} }]
    } : row)
  }],
  ['null tabla_ia', { tabla_ia: null }],
  ['array body', []]
]) {
  test(`rejects ${name} before mutation`, () => assertRejectedBeforeMutation(update));
}

for (const field of ['source', 'query']) {
  for (const value of [{}, [], true, 1]) {
    test(`rejects image ${field} type ${Array.isArray(value) ? 'array' : typeof value} before mutation`, async () => {
      const tabla_ia = fullDetalleTablaIa();
      tabla_ia[1].actividades_imagenes = [{
        ...tabla_ia[1].actividades_imagenes[0],
        [field]: value
      }];
      await assertRejectedBeforeMutation({ tabla_ia });
    });
  }
}

for (const [name, size] of [
  ['boolean', true],
  ['array', []],
  ['object', {}],
  ['non-numeric string', 'not-a-number'],
  ['whitespace string', '   '],
  ['negative number', -1],
  ['negative numeric string', '-1'],
  ['Infinity', Infinity],
  ['negative Infinity', -Infinity],
  ['NaN', NaN]
]) {
  test(`rejects image size ${name} before mutation`, async () => {
    const tabla_ia = fullDetalleTablaIa();
    tabla_ia[1].actividades_imagenes = [{
      ...tabla_ia[1].actividades_imagenes[0],
      size
    }];
    await assertRejectedBeforeMutation({ tabla_ia });
  });
}

test('rejects inherited input before mutation', async () => {
  const inherited = Object.create({ user_id: 'user-b' });
  inherited.tabla_ia = validTablaIa();
  await assertRejectedBeforeMutation(inherited);
});

test('rejects malformed, unsafe and non-positive IDs before mutation', async () => {
  const { actualizarPlaneacion } = await loadService();
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    const { client, calls } = createClient();
    await assert.rejects(
      actualizarPlaneacion({ supabaseClient: client, id, update: { tabla_ia: validTablaIa() }, userId: 'user-a' }),
      (error) => error.status === 400 && error.message === 'ID invalido'
    );
    assert.equal(calls.from.length, 0);
  }
});

test('requires user client and authenticated owner without admin fallback', async () => {
  const { actualizarPlaneacion } = await loadService();
  await assert.rejects(
    actualizarPlaneacion({ id: 7, update: { tabla_ia: validTablaIa() }, userId: 'user-a' }),
    /User Supabase client is required/
  );
  const { client, calls } = createClient();
  await assert.rejects(
    actualizarPlaneacion({ supabaseClient: client, id: 7, update: { tabla_ia: validTablaIa() } }),
    /Authenticated user is required/
  );
  assert.equal(calls.from.length, 0);
});

test('own-inaccessible and nonexistent planeaciones share the same 404 contract', async () => {
  const { actualizarPlaneacion } = await loadService();
  for (const label of ['cross-owner', 'missing']) {
    const { client, calls } = createClient({ data: null });
    await assert.rejects(
      actualizarPlaneacion({ supabaseClient: client, id: 7, update: { tabla_ia: validTablaIa() }, userId: 'user-a' }),
      (error) => error.status === 404 && error.message === 'Planeacion no encontrada'
    );
    assert.deepEqual(calls.eq, [['id', 7], ['user_id', 'user-a']], label);
    assert.equal(calls.update.length, 1);
  }
});

test('Supabase failure has a stable sanitized 500 contract', async () => {
  const { actualizarPlaneacion } = await loadService();
  const { client } = createClient({ error: new Error('provider secret response') });
  await assert.rejects(
    actualizarPlaneacion({ supabaseClient: client, id: 7, update: { tabla_ia: validTablaIa() }, userId: 'user-a' }),
    (error) => error.status === 500 &&
      error.message === 'Error al actualizar planeacion' &&
      !error.message.includes('provider')
  );
});

async function loadController({ serviceUpdate, createUserClient }) {
  const context = createContext({ Number, Array, JSON, console: { log() {}, error() {} } });
  const controller = new SourceTextModule(controllerSource, { context });
  const serviceExports = {
    listarPlaneaciones: async () => [],
    obtenerPlaneacionPorId: async () => null,
    actualizarPlaneacion: serviceUpdate,
    eliminarPlaneacion: async () => {},
    archivarPlaneacion: async () => {},
    restaurarPlaneacion: async () => {},
    archivarBatchPlaneaciones: async () => {},
    restaurarBatchPlaneaciones: async () => {},
    listarPlaneacionesArchivadas: async () => [],
    eliminarPlaneacionPermanentemente: async () => {},
    eliminarBatchPermanentemente: async () => {},
    eliminarPlaneacionDirecta: async () => {},
    generarPlaneacionesIA: async () => {},
    generarPlaneacionesIAConProgreso: async () => {},
    listarBatches: async () => [],
    listarPlaneacionesPorBatch: async () => []
  };
  const modules = {
    '../../supabaseClient.js': synthetic(context, { createUserClient }),
    '../services/planeaciones.service.js': synthetic(context, serviceExports)
  };
  await controller.link((specifier) => modules[specifier]);
  await controller.evaluate();
  return controller.namespace;
}

function createResponse() {
  return {
    statusCode: 200,
    payload: undefined,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; }
  };
}

test('controller derives owner and user client from authenticated request', async () => {
  const calls = [];
  const userClient = { synthetic: 'user-client' };
  const controller = await loadController({
    createUserClient(token) {
      assert.equal(token, 'session-token');
      return userClient;
    },
    async serviceUpdate(args) {
      calls.push(args);
      return { id: args.id };
    }
  });
  const req = {
    params: { id: '7' },
    body: { tabla_ia: validTablaIa() },
    accessToken: 'session-token',
    user: { id: 'user-a' }
  };
  const res = createResponse();
  await controller.updatePlaneacion(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].supabaseClient, userClient);
  assert.equal(calls[0].userId, 'user-a');
});

test('controller rejects malformed ID before creating a user client or calling service', async () => {
  let clients = 0;
  let serviceCalls = 0;
  const controller = await loadController({
    createUserClient() { clients += 1; return {}; },
    async serviceUpdate() { serviceCalls += 1; }
  });
  for (const id of ['abc', '0', '-1', '1.5', '9007199254740992']) {
    const res = createResponse();
    await controller.updatePlaneacion({ params: { id }, body: {}, user: { id: 'user-a' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload?.error, 'ID invalido');
    assert.deepEqual(Object.keys(res.payload || {}), ['error']);
  }
  assert.equal(clients, 0);
  assert.equal(serviceCalls, 0);
});

test('controller preserves stable validation, inaccessible and internal error contracts', async () => {
  for (const expected of [
    { status: 400, message: 'La actualizacion contiene campos no permitidos' },
    { status: 404, message: 'Planeacion no encontrada' },
    { status: 500, message: 'Error al actualizar planeacion' }
  ]) {
    const controller = await loadController({
      createUserClient() { return { synthetic: 'user-client' }; },
      async serviceUpdate() {
        const error = new Error(expected.message);
        error.status = expected.status;
        throw error;
      }
    });
    const res = createResponse();
    await controller.updatePlaneacion({
      params: { id: '7' },
      body: { tabla_ia: validTablaIa() },
      accessToken: 'session-token',
      user: { id: 'user-a' }
    }, res);
    assert.equal(res.statusCode, expected.status);
    assert.equal(res.payload?.error, expected.message);
  }

  const controller = await loadController({
    createUserClient() { return { synthetic: 'user-client' }; },
    async serviceUpdate() { throw new Error('provider details'); }
  });
  const res = createResponse();
  await controller.updatePlaneacion({
    params: { id: '7' },
    body: { tabla_ia: validTablaIa() },
    accessToken: 'session-token',
    user: { id: 'user-a' }
  }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload?.error, 'Error al actualizar planeacion');
});

test('activity catalog is exact per moment and normalization preserves representative values', async () => {
  const { ACTIVIDADES_DIDACTICAS_POR_MOMENTO, normalizeActividadesMomentos } = await loadService();
  const expected = {
    conocimientos_previos: [
      'Activación y diagnóstico', 'Lluvia de ideas', 'Preguntas detonadoras', 'Cuestionario diagnóstico',
      'Quiz interactivo', 'Estudio de caso', 'Análisis de imágenes', 'Análisis de videos',
      'Análisis de noticias', 'Diálogo en parejas', 'Cuadro SQA', 'Mapa mental', 'Red de conceptos',
      'Línea del tiempo', 'Exploración de materiales', 'Demostración experimental', 'Observación del entorno'
    ],
    desarrollo: [
      'Construcción y aplicación del conocimiento', 'Mapa conceptual', 'Mapa mental', 'Cuadro comparativo',
      'Cuadro sinóptico', 'Diagrama de flujo', 'Infografía', 'Esquema explicativo', 'Resumen',
      'Resolución de ejercicios', 'Resolución de problemas', 'Práctica de laboratorio', 'Simulación digital',
      'Práctica informática', 'Dibujo técnico', 'Modelado a escala', 'Lectura comentada', 'Análisis de textos',
      'Investigación documental', 'Matriz de análisis', 'Reporte técnico', 'Bitácora de trabajo',
      'Trabajo colaborativo', 'Elaboración de prototipos', 'Elaboración de maquetas', 'Redacción de ensayos',
      'Elaboración de propuestas', 'Producción audiovisual', 'Presentación digital'
    ],
    cierre: [
      'Evaluación y retroalimentación', 'Ticket de salida', 'Cuestionario final', 'Quiz de comprobación',
      'Ejercicio de aplicación', 'Preguntas de comprensión', 'Coevaluación', 'Autoevaluación',
      'Reflexión individual', 'Retroalimentación grupal', 'Conclusiones grupales', 'Exposición breve',
      'Galería de trabajos', 'Debate grupal', 'Mesa redonda', 'Portafolio de evidencias',
      'Mapa de síntesis', 'Cuadro de conclusiones'
    ]
  };
  for (const [momento, values] of Object.entries(expected)) {
    assert.deepEqual(Array.from(ACTIVIDADES_DIDACTICAS_POR_MOMENTO[momento]), values);
    assert.deepEqual(Array.from(CANONICAL_ACTIVITIES[momento]), values);
  }
  assert.equal(CANONICAL_ACTIVITIES.conocimientos_previos.length, 17);
  assert.equal(CANONICAL_ACTIVITIES.desarrollo.length, 29);
  assert.equal(CANONICAL_ACTIVITIES.cierre.length, 18);
  assert.equal(CANONICAL_ACTIVITIES.conocimientos_previos.includes('Mapa mental'), true);
  assert.equal(CANONICAL_ACTIVITIES.desarrollo.includes('Mapa mental'), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeActividadesMomentos({
      conocimientos_previos: 'Activación y diagnóstico',
      desarrollo: 'Construcción y aplicación del conocimiento',
      cierre: 'Evaluación y retroalimentación'
    }))),
    {
      conocimientos_previos: 'Activación y diagnóstico',
      desarrollo: 'Construcción y aplicación del conocimiento',
      cierre: 'Evaluación y retroalimentación'
    }
  );
  assert.throws(
    () => normalizeActividadesMomentos({ desarrollo: 'Activación y diagnóstico' }),
    (error) => error.status === 400
  );
});

test('selected activity texts have an explicit structured mandatory contract in the final prompt', () => {
  const actividades_momentos = {
    conocimientos_previos: 'Lluvia de ideas',
    desarrollo: 'Resolución de problemas',
    cierre: 'Evaluación y retroalimentación'
  };
  const prompt = buildPromptByLevel({
    materia: 'Ciencias', nivel: 'Secundaria', unidad: 'Unidad 1', tema: 'Energía', duracion: 50,
    actividades_momentos
  });
  for (const value of Object.values(actividades_momentos)) assert.match(prompt, new RegExp(value));
  assert.match(prompt, /Conocimientos previos: Lluvia de ideas/);
  assert.match(prompt, /Desarrollo: Resolución de problemas/);
  assert.match(prompt, /Cierre: Evaluación y retroalimentación/);
  assert.match(prompt, /actividad_seleccionada/);
  assert.match(prompt, /"actividad_seleccionada": "valor exacto seleccionado/);
  assert.match(prompt, /No agregues propiedades distintas de las enumeradas/);
  assert.match(prompt, /escribe exactamente ese valor/);
  assert.match(prompt, /metadato estructurado interno/);
  assert.match(prompt, /sin repetir mecanicamente su nombre/);
  assert.match(prompt, /solo aplican a momentos sin seleccion expresa/);
  assert.match(prompt, /primero la seleccion expresa del usuario/);
  assert.match(prompt, /El Cierre no debe repetir a escala reducida la actividad central del Desarrollo/);
  assert.match(prompt, /usa como evidencia el producto, respuesta o procedimiento elaborado durante el Desarrollo/);
  assert.doesNotMatch(prompt, /Catalogo de actividades que NO debes usar/);
  assert.doesNotMatch(prompt, /Juegos de mesa educativos, Debate académico/);
  assert.doesNotMatch(prompt, /No agregues campos nuevos al JSON/);
  assert.match(prompt, /"actividades": "El docente plantea una consigna/);
  assert.doesNotMatch(prompt, /"actividades": "Lluvia de ideas:/);
});

test('prompt-specific focuses use only reachable canonical activity names', () => {
  const focusBlock = /const enfoqueActividadSeleccionada = \{([\s\S]*?)\n  \};/.exec(
    readFileSync(new URL('../src/utils/buildPromptByLevel.js', import.meta.url), 'utf8')
  )?.[1] || '';
  const keys = Array.from(focusBlock.matchAll(/'([^']+)':/g), (match) => match[1]);
  assert.deepEqual(keys, [
    'Estudio de caso',
    'Lluvia de ideas',
    'Mapa conceptual',
    'Resolución de problemas',
    'Trabajo colaborativo',
    'Evaluación y retroalimentación'
  ]);
  for (const key of keys) assert.equal(ACTIVIDADES_DIDACTICAS_SET.has(key), true, key);
  for (const obsolete of ['Mapas conceptuales', 'Debate en clase', 'Trabajo en equipo', 'Preguntas de reflexión']) {
    assert.equal(keys.includes(obsolete), false, obsolete);
  }
});

const SELECTED_ACTIVITIES = {
  conocimientos_previos: 'Lluvia de ideas',
  desarrollo: 'Resolución de problemas',
  cierre: 'Evaluación y retroalimentación'
};

function generatedRows(overrides = {}) {
  return [
    {
      tiempo_sesion: 'Conocimientos previos', actividad_seleccionada: 'Lluvia de ideas',
      actividades: 'El docente plantea una consigna sobre el tema. Los estudiantes comparten libremente sus ideas y el docente organiza las aportaciones en la pizarra.', tiempo_min: 10,
      producto: 'Ideas', instrumento: 'Observación', formativa: 'Diagnóstica', sumativa: 2,
      ...(overrides.conocimientos_previos || {})
    },
    {
      tiempo_sesion: 'Desarrollo', actividad_seleccionada: 'Resolución de problemas',
      actividades: 'El docente presenta una situación contextualizada. Los equipos identifican los datos, proponen procedimientos y resuelven el problema.', tiempo_min: 30,
      producto: 'Solución', instrumento: 'Rúbrica', formativa: 'Formativa', sumativa: 5,
      ...(overrides.desarrollo || {})
    },
    {
      tiempo_sesion: 'Cierre', actividad_seleccionada: 'Evaluación y retroalimentación',
      actividades: 'Los equipos revisan las soluciones producidas durante el Desarrollo con criterios claros, identifican aciertos y errores, y ajustan su procedimiento a partir de retroalimentación específica.', tiempo_min: 10,
      producto: 'Evidencia', instrumento: 'Lista', formativa: 'Cierre', sumativa: 3,
      ...(overrides.cierre || {})
    }
  ];
}

function syntheticCompletion(rows) {
  return {
    choices: [{ message: { content: JSON.stringify({ tabla: rows }) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  };
}

function generationInput(actividades_momentos = SELECTED_ACTIVITIES, tema = 'Tema sintético') {
  return { materia: 'Ciencias', nivel: 'Secundaria', unidad: 'Unidad 1', tema, duracion: 50, actividades_momentos };
}

test('accepts the exact structured activity for every selected moment', async () => {
  const { validateTablaIaActividadesSeleccionadas } = await loadService();
  const result = validateTablaIaActividadesSeleccionadas(generatedRows(), SELECTED_ACTIVITIES);
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.violations), []);
});

test('rejects wrong, missing and swapped structured activities by moment', async () => {
  const { validateTablaIaActividadesSeleccionadas } = await loadService();
  const wrong = validateTablaIaActividadesSeleccionadas(generatedRows({
    conocimientos_previos: { actividad_seleccionada: 'Preguntas detonadoras' },
    desarrollo: { actividad_seleccionada: 'Lluvia de ideas' },
    cierre: { actividad_seleccionada: '' }
  }), SELECTED_ACTIVITIES);
  assert.equal(wrong.ok, false);
  assert.deepEqual(Array.from(wrong.violations, (item) => item.key), [
    'conocimientos_previos', 'desarrollo', 'cierre'
  ]);
  assert.deepEqual(Array.from(wrong.violations, (item) => item.reason), [
    'mismatch', 'mismatch', 'missing_field'
  ]);
});

test('retries once with moment-specific correction and accepts only the corrected table', async () => {
  const prompts = [];
  const first = generatedRows({
    conocimientos_previos: { actividad_seleccionada: 'Preguntas detonadoras' },
    cierre: { actividad_seleccionada: 'Debate grupal' }
  });
  const { generarTablaIa } = await loadService({
    prompts,
    completions: [syntheticCompletion(first), syntheticCompletion(generatedRows())]
  });
  const result = await generarTablaIa(generationInput());
  assert.equal(prompts.length, 2);
  assert.doesNotMatch(prompts[0], /CORRECCION OBLIGATORIA/);
  assert.match(prompts[1], /Conocimientos previos debía usar exactamente "Lluvia de ideas"/);
  assert.match(prompts[1], /Cierre debía usar exactamente "Evaluación y retroalimentación"/);
  assert.match(prompts[1], /El Cierre debe usar evidencia producida en Desarrollo y no repetir su actividad principal/);
  assert.doesNotMatch(prompts[1], /Desarrollo debía usar exactamente/);
  assert.equal(result.tablaIa[0].actividad_seleccionada, 'Lluvia de ideas');
  assert.equal(result.tablaIa[2].actividad_seleccionada, 'Evaluación y retroalimentación');
});

test('stops after two incompatible responses and does not return a fallback', async () => {
  const prompts = [];
  const invalid = generatedRows({ conocimientos_previos: { actividad_seleccionada: 'Preguntas detonadoras' } });
  const { generarTablaIa } = await loadService({
    prompts,
    completions: [syntheticCompletion(invalid), syntheticCompletion(invalid)]
  });
  await assert.rejects(
    generarTablaIa(generationInput()),
    (error) => error.status === 502 && error.message.includes('Conocimientos previos')
  );
  assert.equal(prompts.length, 2);
});

test('never uses fallback after two malformed responses when selections are explicit', async () => {
  const malformed = {
    choices: [{ message: { content: 'not-json' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  };
  const prompts = [];
  const { generarTablaIa } = await loadService({ prompts, completions: [malformed, malformed] });
  await assert.rejects(
    generarTablaIa(generationInput()),
    (error) => error.status === 502 && error.message.includes('Conocimientos previos')
  );
  assert.equal(prompts.length, 2);
});

test('empty sentinel keeps free generation and never inserts sentinel text', async () => {
  const prompts = [];
  const freeRows = generatedRows({
    conocimientos_previos: { actividad_seleccionada: 'Preguntas detonadoras' },
    desarrollo: { actividad_seleccionada: '' },
    cierre: { actividad_seleccionada: '' }
  });
  const { generarTablaIa } = await loadService({ prompts, completions: [syntheticCompletion(freeRows)] });
  const result = await generarTablaIa(generationInput({}));
  assert.equal(prompts.length, 1);
  assert.equal(result.tablaIa[0].actividad_seleccionada, 'Preguntas detonadoras');
  assert.doesNotMatch(JSON.stringify(result.tablaIa), /Sin actividad específica/i);
});

test('separate themes validate only their own selections and correction', async () => {
  const prompts = [];
  const firstSelections = { conocimientos_previos: 'Lluvia de ideas' };
  const secondSelections = { cierre: 'Ticket de salida' };
  const firstRows = generatedRows();
  const secondInvalid = generatedRows({ cierre: { actividad_seleccionada: 'Debate grupal' } });
  const secondValid = generatedRows({ cierre: { actividad_seleccionada: 'Ticket de salida' } });
  const { generarTablaIa } = await loadService({
    prompts,
    completions: [syntheticCompletion(firstRows), syntheticCompletion(secondInvalid), syntheticCompletion(secondValid)]
  });
  await generarTablaIa(generationInput(firstSelections, 'Tema uno'));
  const second = await generarTablaIa(generationInput(secondSelections, 'Tema dos'));
  assert.equal(prompts.length, 3);
  assert.match(prompts[2], /Cierre debía usar exactamente "Ticket de salida"/);
  assert.doesNotMatch(prompts[2], /Lluvia de ideas/);
  assert.equal(second.tablaIa[2].actividad_seleccionada, 'Ticket de salida');
});
