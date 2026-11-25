import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCuadernilloV3RequestMetadata,
  classifyOpenAIProviderError,
  validateOpenAiStructuredOutputSchema
} from '../src/services/cuadernilloV3.provider.js';
import { createCuadernilloV3Completer } from '../src/services/anexos.service.js';
import {
  construirPromptSegmentoCuadernilloV3,
  crearPlanSegmentosCuadernilloV3,
  generarCuadernilloV3
} from '../src/services/cuadernilloV3.engine.js';

const context = {
  materia: 'Matematicas', nivel: 'Universidad', tema: 'Algebra lineal', duracion: 60,
  tabla_ia: [], actividades_momentos: {}, datos_generales: {}
};

function providerError({ status = null, type = null, code = null, param = null, message = '', name = 'APIError', requestId = null } = {}) {
  const error = new Error(message);
  error.name = name;
  error.status = status;
  error.error = { type, code, param };
  error.request_id = requestId;
  return error;
}

test('provider classifier covers permanent, retryable and unknown failures without exposing messages', () => {
  const cases = [
    [providerError({ status: 404, code: 'model_not_found' }), 'model_not_found', false],
    [providerError({ status: 403, message: 'Project does not have access to this model' }), 'model_not_allowed', false],
    [providerError({ status: 429, code: 'insufficient_quota' }), 'insufficient_quota', false],
    [providerError({ status: 400, code: 'unsupported_parameter', param: 'temperature' }), 'unsupported_parameter', false],
    [providerError({ status: 400, code: 'unsupported_parameter', param: 'max_completion_tokens' }), 'unsupported_parameter', false],
    [providerError({ status: 400, code: 'invalid_json_schema', param: 'response_format' }), 'invalid_json_schema', false],
    [providerError({ status: 401, code: 'invalid_api_key' }), 'invalid_api_key', false],
    [providerError({ status: 429, type: 'rate_limit_error' }), 'rate_limit', true],
    [providerError({ code: 'ETIMEDOUT', name: 'APIConnectionTimeoutError' }), 'timeout', true],
    [providerError({ code: 'ECONNRESET', name: 'APIConnectionError' }), 'connection_error', true],
    [providerError({ status: 418, message: 'secret provider detail' }), 'unknown_provider_error', false]
  ];
  cases.forEach(([error, expectedClass, retryable]) => {
    const classified = classifyOpenAIProviderError(error);
    assert.equal(classified.providerClass, expectedClass);
    assert.equal(classified.retryable, retryable);
    assert.doesNotMatch(JSON.stringify(classified), /secret provider detail/);
  });
});

test('first exercise segment schema is serializable, strict and limited to supported keywords', () => {
  const segment = crearPlanSegmentosCuadernilloV3('ejercicios_aplicacion')[0];
  const prompt = construirPromptSegmentoCuadernilloV3({
    tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, segmento: segment
  });
  assert.doesNotThrow(() => validateOpenAiStructuredOutputSchema(prompt.jsonSchema));
  assert.doesNotThrow(() => JSON.stringify(prompt.jsonSchema));
  const serialized = JSON.stringify(prompt.jsonSchema);
  for (const unsupported of ['oneOf', 'minItems', 'maxItems', 'minLength', 'pattern', 'minimum', 'maximum']) {
    assert.doesNotMatch(serialized, new RegExp(`"${unsupported}"`));
  }
  assert.deepEqual(
    prompt.jsonSchema.properties.respuestas.items.anyOf.map((variant) => variant.properties.slot_id.enum[0]),
    segment.slots.map(({ slotId }) => slotId)
  );
});

test('local schema validation fails before provider on unsupported, incomplete, undefined and circular schemas', () => {
  const valid = { type: 'object', additionalProperties: false, properties: {}, required: [] };
  assert.equal(validateOpenAiStructuredOutputSchema(valid), true);
  assert.throws(() => validateOpenAiStructuredOutputSchema({ ...valid, oneOf: [] }), (error) => error.safeDetails.providerCode === 'schema_keyword_no_soportada');
  assert.throws(() => validateOpenAiStructuredOutputSchema({ type: 'object', properties: { value: { type: 'string' } }, required: [] }), (error) => error.safeDetails.providerCode === 'schema_objeto_no_estricto');
  assert.throws(() => validateOpenAiStructuredOutputSchema({ type: 'object', additionalProperties: false, properties: { value: undefined }, required: ['value'] }), (error) => error.safeDetails.providerCode === 'schema_undefined');
  const circular = { type: 'object', additionalProperties: false, properties: {}, required: [] };
  circular.properties.self = circular;
  circular.required.push('self');
  assert.throws(() => validateOpenAiStructuredOutputSchema(circular), (error) => error.safeDetails.providerCode === 'schema_circular');
});

test('safe request metadata contains configuration but no body, messages or schema', () => {
  const body = { model: 'gpt-6-luna', reasoning_effort: 'low', max_completion_tokens: 5000, response_format: { type: 'json_schema' } };
  const metadata = buildCuadernilloV3RequestMetadata({
    model: 'gpt-6-luna', reasoningEffort: 'low', body, timeoutMs: 120000,
    schemaName: 'cuadernillo_v3_slots', slots: [{ slotId: 'safe' }], segmento: { id: 'segmento_1' }
  });
  assert.deepEqual(metadata, {
    model: 'gpt-6-luna', reasoningEffort: 'low', hasTemperature: false,
    maxCompletionTokens: 5000, timeoutMs: 120000, responseFormatType: 'json_schema',
    schemaName: 'cuadernillo_v3_slots', slotCount: 1, segmentId: 'segmento_1'
  });
  assert.equal(Object.hasOwn(metadata, 'messages'), false);
  assert.equal(Object.hasOwn(metadata, 'schema'), false);
});

test('v3 adapter emits safe request and provider error events, then stops before segment 2', async () => {
  const events = [];
  const calls = [];
  const secret = 'sk-do-not-log';
  const client = { chat: { completions: { create: async (body, options) => {
    calls.push({ body, options });
    throw providerError({ status: 400, code: 'invalid_json_schema', param: 'response_format', message: secret, requestId: 'req_safe_123' });
  } } } };
  const complete = createCuadernilloV3Completer({
    openaiClient: client, env: {}, logCall: async () => {}, diagnosticar: (event) => events.push(event),
    tipoCuadernillo: 'ejercicios_aplicacion'
  });
  await assert.rejects(
    generarCuadernilloV3({ tipoCuadernillo: 'ejercicios_aplicacion', contextoPlaneacion: context, completar: complete }),
    (error) => error.code === 'completion_provider_fallida' && error.segmentId === 'segmento_1'
  );
  assert.equal(calls.length, 1);
  assert.equal(events.filter(({ eventType }) => eventType === 'completion_request').length, 1);
  const failed = events.find(({ eventType }) => eventType === 'completion_error');
  assert.equal(failed.providerClass, 'invalid_json_schema');
  assert.equal(failed.providerParam, 'response_format');
  assert.equal(failed.requestId, 'req_safe_123');
  assert.equal(failed.retryable, false);
  assert.equal(failed.segmentoId, 'segmento_1');
  assert.equal(failed.slotsSolicitados, 4);
  const logged = JSON.stringify(events);
  assert.doesNotMatch(logged, /sk-do-not-log|messages|prompt|properties|materia|Algebra/);
});
