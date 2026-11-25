const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$defs', '$ref', 'type', 'additionalProperties', 'properties', 'required', 'items',
  'enum', 'anyOf', 'description'
]);

const PERMANENT_PROVIDER_CLASSES = new Set([
  'model_not_found', 'model_not_allowed', 'insufficient_quota', 'invalid_api_key',
  'invalid_request', 'unsupported_parameter', 'invalid_json_schema'
]);

export class CuadernilloV3ProviderError extends Error {
  constructor(stage, safeDetails, cause = null) {
    super('cuadernillo_v3_provider_error');
    this.name = 'CuadernilloV3ProviderError';
    this.code = 'completion_provider_fallida';
    this.stage = stage;
    this.safeDetails = Object.freeze({ ...safeDetails, stage });
    this.isCuadernilloV3ProviderError = true;
    if (cause) this.cause = cause;
  }
}

const safeToken = (value, fallback = null) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().slice(0, 120);
  return /^[a-zA-Z0-9_.:/-]+$/.test(normalized) ? normalized : fallback;
};

export function buildCuadernilloV3RequestMetadata({
  model, reasoningEffort, body, timeoutMs, schemaName, slots, segmento
}) {
  return Object.freeze({
    model,
    reasoningEffort,
    hasTemperature: Object.hasOwn(body, 'temperature'),
    maxCompletionTokens: body.max_completion_tokens,
    timeoutMs,
    responseFormatType: body.response_format?.type || null,
    schemaName,
    slotCount: Array.isArray(slots) ? slots.length : 0,
    segmentId: segmento?.id || null
  });
}

export function validateOpenAiStructuredOutputSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') {
    throw new CuadernilloV3ProviderError('schema_validation', {
      providerClass: 'invalid_json_schema', providerCode: 'schema_root_invalida', retryable: false
    });
  }
  const ancestors = new WeakSet();
  const visit = (value, path, isSchema = true) => {
    if (value === undefined) throw new CuadernilloV3ProviderError('schema_validation', {
      providerClass: 'invalid_json_schema', providerCode: 'schema_undefined', providerParam: path, retryable: false
    });
    if (!value || typeof value !== 'object') return;
    if (ancestors.has(value)) throw new CuadernilloV3ProviderError('schema_validation', {
      providerClass: 'invalid_json_schema', providerCode: 'schema_circular', providerParam: path, retryable: false
    });
    ancestors.add(value);
    if (isSchema && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) throw new CuadernilloV3ProviderError('schema_validation', {
          providerClass: 'invalid_json_schema', providerCode: 'schema_keyword_no_soportada', providerParam: `${path}.${key}`, retryable: false
        });
      }
      if (value.type === 'object') {
        const properties = value.properties;
        if (!properties || typeof properties !== 'object' || Array.isArray(properties) || value.additionalProperties !== false) {
          throw new CuadernilloV3ProviderError('schema_validation', {
            providerClass: 'invalid_json_schema', providerCode: 'schema_objeto_no_estricto', providerParam: path, retryable: false
          });
        }
        const propertyNames = Object.keys(properties).sort();
        const required = Array.isArray(value.required) ? [...value.required].sort() : [];
        if (JSON.stringify(propertyNames) !== JSON.stringify(required)) throw new CuadernilloV3ProviderError('schema_validation', {
          providerClass: 'invalid_json_schema', providerCode: 'schema_required_incompleto', providerParam: path, retryable: false
        });
      }
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`, isSchema));
    else for (const [key, item] of Object.entries(value)) {
      const childIsSchema = !['properties', '$defs'].includes(key);
      if (['properties', '$defs'].includes(key)) {
        for (const [childKey, child] of Object.entries(item || {})) visit(child, `${path}.${key}.${childKey}`, true);
      } else if (key !== 'required' && key !== 'enum') visit(item, `${path}.${key}`, childIsSchema);
    }
    ancestors.delete(value);
  };
  visit(schema, 'schema');
  JSON.stringify(schema);
  return true;
}

function requestId(error) {
  return safeToken(error?.request_id || error?.requestId || error?.headers?.get?.('x-request-id'));
}

export function classifyOpenAIProviderError(error, stage = 'provider_request') {
  if (error instanceof CuadernilloV3ProviderError) return error.safeDetails;
  const status = Number.isInteger(error?.status) ? error.status : null;
  const providerType = safeToken(error?.error?.type || error?.type);
  const providerCode = safeToken(error?.error?.code || error?.code);
  const providerParam = safeToken(error?.error?.param || error?.param);
  const className = safeToken(error?.constructor?.name || error?.name, 'Error');
  const lowerMessage = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  let providerClass = 'unknown_provider_error';
  const combined = `${providerType || ''} ${providerCode || ''} ${providerParam || ''} ${lowerMessage}`;
  if (providerCode === 'insufficient_quota' || combined.includes('insufficient_quota')) providerClass = 'insufficient_quota';
  else if (status === 401 || providerCode === 'invalid_api_key' || combined.includes('api key')) providerClass = 'invalid_api_key';
  else if (providerCode === 'model_not_found' || combined.includes('model_not_found')) providerClass = 'model_not_found';
  else if (combined.includes('does not have access') || combined.includes('not allowed')) providerClass = 'model_not_allowed';
  else if (providerCode === 'invalid_json_schema' || providerParam?.includes('response_format') || combined.includes('json schema')) providerClass = 'invalid_json_schema';
  else if (providerCode === 'unsupported_parameter' || combined.includes('unsupported parameter')) providerClass = 'unsupported_parameter';
  else if (status === 429 || providerType === 'rate_limit_error') providerClass = 'rate_limit';
  else if (className?.toLowerCase().includes('timeout') || ['ETIMEDOUT', 'ABORT_ERR'].includes(providerCode)) providerClass = 'timeout';
  else if (className?.toLowerCase().includes('connection') || ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(providerCode)) providerClass = 'connection_error';
  else if (providerType === 'invalid_request_error' || status === 400 || status === 422) providerClass = 'invalid_request';
  const retryable = !PERMANENT_PROVIDER_CLASSES.has(providerClass)
    && (['rate_limit', 'timeout', 'connection_error'].includes(providerClass) || (status !== null && status >= 500));
  return Object.freeze({
    stage,
    providerClass,
    className,
    status,
    providerType,
    providerCode,
    providerParam,
    requestId: requestId(error),
    retryable,
    timeout: providerClass === 'timeout'
  });
}
