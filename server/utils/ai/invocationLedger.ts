import { execute } from '~~/server/utils/db'

export type AiInvocationStatus = 'success' | 'error'

export interface AiInvocationUsage {
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  cachedInputTokens?: number | null
}

export interface AiInvocationInput extends AiInvocationUsage {
  featureKey: string
  provider: string
  modelId: string
  gatewayUsed?: boolean
  fallbackUsed?: boolean
  agentRunId?: string | null
  userId?: string | null
  clientId?: string | null
  requestId?: string | null
  estimatedCostUsd?: number | null
  status?: AiInvocationStatus
  errorCode?: string | null
  latencyMs?: number | null
  metadata?: Record<string, unknown> | null
}

let warnedMissingLedger = false

const TOKEN_PRICING_PER_MILLION: Record<string, { input: number, output: number, cachedInput?: number }> = {
  'openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
  'openai/gpt-oss-20b': { input: 0.10, output: 0.40 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  '@cf/moonshotai/kimi-k2.7-code': { input: 0.95, output: 4, cachedInput: 0.19 }
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function nullableInteger(value: unknown): number | null {
  const numberValue = finiteNumber(value)
  return numberValue == null ? null : Math.max(0, Math.round(numberValue))
}

function isMissingLedgerError(error: unknown): boolean {
  const err = error as { code?: unknown, message?: unknown }
  return err?.code === '42P01' || String(err?.message || '').includes('ai_invocations')
}

export function estimateAiInvocationCostUsd(input: {
  modelId: string
  promptTokens?: number | null
  completionTokens?: number | null
  cachedInputTokens?: number | null
}): number | null {
  const normalized = input.modelId.replace(/^groq\//, '').replace(/^anthropic\//, '')
  const pricing = TOKEN_PRICING_PER_MILLION[normalized]
  if (!pricing) return null

  const measuredPromptTokens = nullableInteger(input.promptTokens)
  const measuredCompletionTokens = nullableInteger(input.completionTokens)
  if (measuredPromptTokens === null || measuredCompletionTokens === null) return null
  const promptTokens = measuredPromptTokens
  const completionTokens = measuredCompletionTokens
  const cachedInputTokens = Math.min(
    promptTokens,
    nullableInteger(input.cachedInputTokens) ?? 0
  )
  const uncachedInputTokens = promptTokens - cachedInputTokens
  return (
    (uncachedInputTokens * pricing.input)
    + (cachedInputTokens * (pricing.cachedInput ?? pricing.input))
    + (completionTokens * pricing.output)
  ) / 1_000_000
}

export async function recordAiInvocation(input: AiInvocationInput): Promise<void> {
  const promptTokens = nullableInteger(input.promptTokens)
  const completionTokens = nullableInteger(input.completionTokens)
  const totalTokens = nullableInteger(input.totalTokens) ?? (
    promptTokens != null || completionTokens != null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : null
  )
  const estimatedCostUsd = finiteNumber(input.estimatedCostUsd)
    ?? estimateAiInvocationCostUsd({
      modelId: input.modelId,
      promptTokens,
      completionTokens,
      cachedInputTokens: input.cachedInputTokens
    })

  try {
    await execute(`
      INSERT INTO ai_invocations (
        feature_key,
        provider,
        model_id,
        gateway_used,
        fallback_used,
        agent_run_id,
        user_id,
        client_id,
        request_id,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost_usd,
        status,
        error_code,
        latency_ms,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
    `, [
      input.featureKey,
      input.provider,
      input.modelId,
      Boolean(input.gatewayUsed),
      Boolean(input.fallbackUsed),
      input.agentRunId ?? null,
      input.userId ?? null,
      input.clientId ?? null,
      input.requestId ?? null,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      input.status ?? 'success',
      input.errorCode ?? null,
      nullableInteger(input.latencyMs),
      JSON.stringify(input.metadata ?? {})
    ])
  } catch (error) {
    if (isMissingLedgerError(error)) {
      if (!warnedMissingLedger) {
        warnedMissingLedger = true
        console.warn('[ai-invocation-ledger] ai_invocations table is missing; run migration 202_ai_invocations.sql to enable telemetry.')
      }
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[ai-invocation-ledger] record failed:', message)
  }
}

/** Attach the persisted assistant message to every attempt in one server-generated turn. */
export async function linkAiInvocationTurnMessage(turnId: string, userId: string, assistantMessageId: string): Promise<void> {
  try {
    const linked = await execute(`
      UPDATE ai_invocations
         SET metadata = metadata || jsonb_build_object('assistantMessageId', $3::text)
       WHERE metadata ->> 'turnId' = $1
         AND user_id = $2::uuid
         AND (NOT (metadata ? 'assistantMessageId') OR metadata ->> 'assistantMessageId' = $3)
    `, [turnId, userId, assistantMessageId])
    if (linked < 1) throw new AiInvocationLinkError()
  } catch (error) {
    if (error instanceof AiInvocationLinkError) throw error
    throw new AiInvocationLinkError()
  }
}

export class AiInvocationLinkError extends Error {
  constructor() {
    super('Assistant message linkage was not acknowledged')
    this.name = 'AiInvocationLinkError'
  }
}
