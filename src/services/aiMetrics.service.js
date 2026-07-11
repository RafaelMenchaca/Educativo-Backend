import { supabaseAdmin } from '../../supabaseClient.js';

// Simple in-process cache for model prices (TTL: 5 min)
const MODEL_PRICE_CACHE = new Map();
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function safeErrorMessage(err) {
  if (!err) return null;
  const msg = err?.message || String(err);
  // Strip potential secrets: API keys look like "sk-..." or "Bearer ..."
  return msg.replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
            .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
            .slice(0, 500);
}

// ---------------------------------------------------------------------------
// normalizeOpenAiUsage
// Supports Chat Completions API and Responses API field names.
// ---------------------------------------------------------------------------
export function normalizeOpenAiUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0 };
  }

  const promptTokens     = Number(usage.prompt_tokens     ?? usage.input_tokens  ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const totalTokens      = Number(usage.total_tokens      ?? (promptTokens + completionTokens));

  // Cached tokens can be nested (prompt_tokens_details.cached_tokens) or flat
  const cachedTokens = Number(
    usage.prompt_tokens_details?.cached_tokens ??
    usage.cached_tokens ??
    0
  );

  // Reasoning tokens can be nested (completion_tokens_details.reasoning_tokens) or flat
  const reasoningTokens = Number(
    usage.completion_tokens_details?.reasoning_tokens ??
    usage.reasoning_tokens ??
    0
  );

  return { promptTokens, completionTokens, totalTokens, cachedTokens, reasoningTokens };
}

// ---------------------------------------------------------------------------
// getModelPrice
// Fetches from ai_model_prices with a short cache to avoid DB hits per call.
// ---------------------------------------------------------------------------
export async function getModelPrice(model) {
  const cached = MODEL_PRICE_CACHE.get(model);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL_MS) {
    return cached.price;
  }

  const { data } = await supabaseAdmin
    .from('ai_model_prices')
    .select('input_cost_per_1m, output_cost_per_1m, cached_input_cost_per_1m')
    .eq('model', model)
    .eq('active', true)
    .maybeSingle();

  if (data) {
    MODEL_PRICE_CACHE.set(model, { price: data, ts: Date.now() });
  }

  return data || null;
}

// ---------------------------------------------------------------------------
// calculateAiCost
// cost = (promptTokens / 1_000_000) * inputPer1M + (completionTokens / 1_000_000) * outputPer1M
// ---------------------------------------------------------------------------
export function calculateAiCost({ promptTokens, completionTokens, price }) {
  if (!price) return 0;
  const input  = (promptTokens     / 1_000_000) * Number(price.input_cost_per_1m  || 0);
  const output = (completionTokens / 1_000_000) * Number(price.output_cost_per_1m || 0);
  return Number((input + output).toFixed(9));
}

// ---------------------------------------------------------------------------
// createAiJob
// Creates a row in ai_generation_jobs and returns its UUID.
// Uses supabaseAdmin to bypass RLS (backend-only operation).
// ---------------------------------------------------------------------------
export async function createAiJob(payload) {
  const {
    userId,
    artifactType,
    actionType    = 'generate',
    batchId       = null,
    planeacionId  = null,
    examenId      = null,
    listaCotejoId = null,
    anexoId       = null,
    nivel         = null,
    materia       = null,
    tema          = null,
    titulo        = null,
    inputSummary  = {}
  } = payload;

  const { data, error } = await supabaseAdmin
    .from('ai_generation_jobs')
    .insert([{
      user_id:          userId,
      artifact_type:    artifactType,
      action_type:      actionType,
      status:           'started',
      batch_id:         batchId,
      planeacion_id:    planeacionId,
      examen_id:        examenId,
      lista_cotejo_id:  listaCotejoId,
      anexo_id:         anexoId,
      nivel,
      materia,
      tema,
      titulo,
      input_summary:    inputSummary,
      started_at:       nowIso()
    }])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// ---------------------------------------------------------------------------
// finishAiJob
// Marks a job as success (or 'partial' if passed explicitly).
// Optionally links the artifact id that was created.
// ---------------------------------------------------------------------------
export async function finishAiJob(jobId, payload = {}) {
  const {
    status        = 'success',
    outputSummary = {},
    planeacionId  = undefined,
    examenId      = undefined,
    listaCotejoId = undefined,
    anexoId       = undefined
  } = payload;

  const update = {
    status,
    output_summary: outputSummary,
    finished_at:    nowIso()
  };

  if (planeacionId  !== undefined) update.planeacion_id    = planeacionId;
  if (examenId      !== undefined) update.examen_id        = examenId;
  if (listaCotejoId !== undefined) update.lista_cotejo_id  = listaCotejoId;
  if (anexoId       !== undefined) update.anexo_id         = anexoId;

  const { error } = await supabaseAdmin
    .from('ai_generation_jobs')
    .update(update)
    .eq('id', jobId);

  if (error) {
    console.error('[aiMetrics] finishAiJob error:', error.message || error);
  } else {
    console.info('[aiMetrics] job:finished', { jobId, status, outputSummary });
  }
}

// ---------------------------------------------------------------------------
// failAiJob
// Marks a job as failed with a safe error message.
// ---------------------------------------------------------------------------
export async function failAiJob(jobId, payload = {}) {
  const {
    status           = 'error',
    errorType        = 'unknown',
    errorMessageSafe = null,
    outputSummary    = {}
  } = payload;

  const { error } = await supabaseAdmin
    .from('ai_generation_jobs')
    .update({
      status,
      error_type:          errorType,
      error_message_safe:  String(errorMessageSafe || '').slice(0, 500),
      output_summary:      outputSummary,
      finished_at:         nowIso()
    })
    .eq('id', jobId);

  if (error) {
    console.error('[aiMetrics] failAiJob error:', error.message || error);
  }
}

// ---------------------------------------------------------------------------
// logAiCall
// Inserts a row in ai_generation_calls and atomically* updates accumulator
// columns in ai_generation_jobs.
// (*select-then-update; acceptable for non-concurrent metric rows per job)
// ---------------------------------------------------------------------------
export async function logAiCall(payload) {
  const {
    jobId,
    userId,
    artifactType,
    callPurpose      = 'main_generation',
    model,
    promptVersion    = null,
    usage,
    status           = 'success',
    jsonOk           = null,
    validationOk     = null,
    retryNumber      = 0,
    durationMs       = null,
    requestId        = null,
    errorType        = null,
    errorMessageSafe = null,
    metadata         = {}
  } = payload;

  try {
    const norm     = normalizeOpenAiUsage(usage);
    const price    = await getModelPrice(model).catch(() => null);
    const costUsd  = calculateAiCost({
      promptTokens:     norm.promptTokens,
      completionTokens: norm.completionTokens,
      price
    });

    // 1. Insert call record
    const { error: callError } = await supabaseAdmin
      .from('ai_generation_calls')
      .insert([{
        job_id:             jobId,
        user_id:            userId,
        artifact_type:      artifactType,
        call_purpose:       callPurpose,
        model,
        prompt_version:     promptVersion,
        prompt_tokens:      norm.promptTokens,
        completion_tokens:  norm.completionTokens,
        total_tokens:       norm.totalTokens,
        cached_tokens:      norm.cachedTokens,
        reasoning_tokens:   norm.reasoningTokens,
        input_cost_per_1m:  price?.input_cost_per_1m  ?? null,
        output_cost_per_1m: price?.output_cost_per_1m ?? null,
        calculated_cost_usd: costUsd,
        status,
        json_ok:            jsonOk,
        validation_ok:      validationOk,
        retry_number:       retryNumber,
        duration_ms:        durationMs,
        request_id:         requestId,
        error_type:         errorType,
        error_message_safe: safeErrorMessage(errorMessageSafe),
        metadata
      }]);

    if (callError) {
      console.error('[aiMetrics] logAiCall insert error:', callError.message || callError);
      return;
    }

    // 2. Fetch current accumulators and update
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('ai_generation_jobs')
      .select('total_prompt_tokens, total_completion_tokens, total_tokens, total_cost_usd, calls_count, retries_count')
      .eq('id', jobId)
      .maybeSingle();

    if (fetchError || !job) {
      console.error('[aiMetrics] logAiCall: could not fetch job for accumulation');
      return;
    }

    const accumUpdate = {
      total_prompt_tokens:     Number(job.total_prompt_tokens     || 0) + norm.promptTokens,
      total_completion_tokens: Number(job.total_completion_tokens || 0) + norm.completionTokens,
      total_tokens:            Number(job.total_tokens            || 0) + norm.totalTokens,
      total_cost_usd:          Number(job.total_cost_usd          || 0) + costUsd,
      calls_count:             Number(job.calls_count             || 0) + 1
    };

    if (retryNumber > 0) {
      accumUpdate.retries_count = Number(job.retries_count || 0) + 1;
    }

    const { error: updateError } = await supabaseAdmin
      .from('ai_generation_jobs')
      .update(accumUpdate)
      .eq('id', jobId);

    if (updateError) {
      console.error('[aiMetrics] logAiCall accumulation error:', updateError.message || updateError);
    }
  } catch (err) {
    // Never let a metrics error surface to the caller
    console.error('[aiMetrics] logAiCall unexpected error:', err?.message || err);
  }
}
