import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
import { createWorkersAI } from 'workers-ai-provider'
import type { LanguageModel } from 'ai'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { getCachedCfBinding } from '~~/server/utils/cfBindings'

let client: Anthropic | null = null

function getClient() {
  if (!client) {
    const config = useRuntimeConfig()
    const apiKey = (config as any).anthropicApiKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
    client = new Anthropic({ apiKey })
  }
  return client
}

export const CLAUDE_MODELS = {
  SONNET_4_6: 'claude-sonnet-4-6',
  OPUS_4_7: 'claude-opus-4-7',
  HAIKU_4_5: 'claude-haiku-4-5',
} as const

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS]

type ClaudeInsightOptions = {
  model?: ClaudeModel
  maxTokens?: number
  systemPrompt?: string
  cacheSystem?: boolean
  featureKey?: string
  userId?: string | null
  clientId?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
}

type ClaudeInsightResult = {
  text: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
}

async function recordClaudeInvocation(input: {
  options: ClaudeInsightOptions
  model: string
  startedAt: number
  status: 'success' | 'error'
  usage?: ClaudeInsightResult['usage']
  error?: unknown
}) {
  if (!input.options.featureKey) return
  const error = input.error as { code?: unknown, status?: unknown, message?: unknown } | undefined
  await recordAiInvocation({
    featureKey: input.options.featureKey,
    provider: 'anthropic',
    modelId: input.model,
    gatewayUsed: false,
    fallbackUsed: false,
    userId: input.options.userId,
    clientId: input.options.clientId,
    requestId: input.options.requestId,
    promptTokens: input.usage?.inputTokens ?? null,
    completionTokens: input.usage?.outputTokens ?? null,
    totalTokens: input.usage ? input.usage.inputTokens + input.usage.outputTokens : null,
    status: input.status,
    errorCode: input.error ? String(error?.code ?? error?.status ?? error?.message ?? 'unknown_error').slice(0, 160) : null,
    latencyMs: Date.now() - input.startedAt,
    metadata: {
      cacheReadTokens: input.usage?.cacheReadTokens ?? null,
      cacheCreationTokens: input.usage?.cacheCreationTokens ?? null,
      ...(input.options.metadata ?? {}),
    },
  })
}

export async function generateClaudeInsight(
  prompt: string,
  options: ClaudeInsightOptions = {}
): Promise<ClaudeInsightResult> {
  const {
    model = CLAUDE_MODELS.SONNET_4_6,
    maxTokens = 2500,
    systemPrompt,
    cacheSystem = true,
  } = options
  const startedAt = Date.now()

  const anthropic = getClient()

  const system = systemPrompt
    ? cacheSystem
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : [{ type: 'text' as const, text: systemPrompt }]
    : undefined

  let response
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    })
  } catch (error) {
    await recordClaudeInvocation({ options, model, startedAt, status: 'error', error })
    throw error
  }

  const firstText = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!firstText) {
    throw new Error('Claude returned no text content')
  }

  const result = {
    text: firstText.text,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  }
  await recordClaudeInvocation({ options, model: result.model, startedAt, status: 'success', usage: result.usage })
  return result
}

type ClaudeStructuredOptions<T extends z.ZodType> = Omit<ClaudeInsightOptions, never> & {
  schema: T
}

type ClaudeStructuredResult<T extends z.ZodType> = Omit<ClaudeInsightResult, 'text'> & {
  parsed: z.infer<T>
}

export async function generateClaudeStructured<T extends z.ZodType>(
  prompt: string,
  options: ClaudeStructuredOptions<T>
): Promise<ClaudeStructuredResult<T>> {
  const {
    schema,
    model = CLAUDE_MODELS.SONNET_4_6,
    maxTokens = 2500,
    systemPrompt,
    cacheSystem = true,
  } = options
  const startedAt = Date.now()

  const anthropic = getClient()

  const system = systemPrompt
    ? cacheSystem
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : [{ type: 'text' as const, text: systemPrompt }]
    : undefined

  let response
  try {
    response = await anthropic.messages.parse({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: zodOutputFormat(schema) },
    })
  } catch (error) {
    await recordClaudeInvocation({ options, model, startedAt, status: 'error', error })
    throw error
  }

  if (!response.parsed_output) {
    throw new Error(`Claude returned no parsed output (stop_reason=${response.stop_reason})`)
  }

  const result = {
    parsed: response.parsed_output as z.infer<T>,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  }
  await recordClaudeInvocation({ options, model: result.model, startedAt, status: 'success', usage: result.usage })
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// AI SDK v6 providers — used by the tool-calling loop (server/utils/ai/toolLoop.ts).
// All LLM calls route through the Cloudflare AI Gateway when AI_GATEWAY_URL is set
// (unified billing, caching, analytics); otherwise they hit the provider directly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the gateway base URL for a given provider. AI_GATEWAY_URL may already
 * carry a provider suffix (the existing groqClient.ts points it at `/groq`), so we
 * strip any known suffix and re-append the requested provider path.
 * Returns undefined when no gateway is configured → providers go direct.
 */
function gatewayBase(provider: 'anthropic' | 'groq'): string | undefined {
  const cfg = useRuntimeConfig()
  const base = runtimeConfigValue(cfg, 'aiGatewayUrl')
    || getCachedCfBinding('AI_GATEWAY_URL')
    || process.env.AI_GATEWAY_URL
  if (!base) return undefined
  const root = String(base)
    .replace(/\/(groq|anthropic|perplexity-ai)\/?$/, '')
    .replace(/\/+$/, '')
  return `${root}/${provider}`
}

function runtimeConfigValue(config: ReturnType<typeof useRuntimeConfig>, key: string): string | undefined {
  const value = (config as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function gatewayAuthHeaders(gatewayUrl: string | undefined, cfg: ReturnType<typeof useRuntimeConfig>): Record<string, string> | undefined {
  if (!gatewayUrl) return undefined
  const token = runtimeConfigValue(cfg, 'aiGatewayAuthToken')
    || getCachedCfBinding('AI_GATEWAY_AUTH_TOKEN')
    || process.env.AI_GATEWAY_AUTH_TOKEN
    || runtimeConfigValue(cfg, 'cfApiToken')
    || getCachedCfBinding('CF_API_TOKEN')
    || process.env.CF_API_TOKEN
    || getCachedCfBinding('CLOUDFLARE_API_TOKEN')
    || process.env.CLOUDFLARE_API_TOKEN
  const bearer = typeof token === 'string' ? token.trim().replace(/^Bearer\s+/i, '') : ''
  return bearer ? { 'cf-aig-authorization': `Bearer ${bearer}` } : undefined
}

export function getAnthropicProvider() {
  const cfg = useRuntimeConfig()
  const baseURL = gatewayBase('anthropic')
  const headers = gatewayAuthHeaders(baseURL, cfg)
  return createAnthropic({
    apiKey: runtimeConfigValue(cfg, 'anthropicApiKey')
      || getCachedCfBinding('ANTHROPIC_API_KEY')
      || process.env.ANTHROPIC_API_KEY,
    baseURL,
    ...(headers ? { headers } : {})
  })
}

export function getGroqProvider() {
  const cfg = useRuntimeConfig()
  const baseURL = gatewayBase('groq')
  const headers = gatewayAuthHeaders(baseURL, cfg)
  return createGroq({
    apiKey: runtimeConfigValue(cfg, 'groqApiKey')
      || getCachedCfBinding('GROQ_API_KEY')
      || process.env.GROQ_API_KEY,
    baseURL,
    ...(headers ? { headers } : {})
  })
}

/**
 * Cloudflare Workers AI provider — runs `@cf/...` models on CF's edge via the `AI` binding (no API
 * key, no egress). Pass the binding from the request: `event.context.cloudflare.env.AI`.
 * (REST mode `createWorkersAI({ accountId, apiKey })` is available too, but the binding is the
 * idiomatic edge path inside a Worker.)
 */
export function getWorkersAiProvider(binding: unknown) {
  if (!binding) throw new Error('Workers AI binding (env.AI) is unavailable in this context')
  return createWorkersAI({ binding: binding as any })
}

/**
 * Resolve a model spec string to an AI SDK LanguageModel.
 *   'groq/openai/gpt-oss-120b'                       → Groq, model 'openai/gpt-oss-120b'
 *   'anthropic/claude-sonnet-4-6'                    → Anthropic, model 'claude-sonnet-4-6'
 *   'workersai/@cf/meta/llama-3.3-70b-instruct-fp8-fast' → Cloudflare Workers AI (needs opts.aiBinding)
 */
export function resolveModel(spec: string, opts?: { aiBinding?: unknown }): LanguageModel {
  if (spec.startsWith('anthropic/')) return getAnthropicProvider()(spec.slice('anthropic/'.length))
  if (spec.startsWith('groq/')) return getGroqProvider()(spec.slice('groq/'.length))
  if (spec.startsWith('workersai/')) return getWorkersAiProvider(opts?.aiBinding)(spec.slice('workersai/'.length) as any)
  throw new Error(`Unknown model spec: ${spec}`)
}
