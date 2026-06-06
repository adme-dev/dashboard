import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
import type { LanguageModel } from 'ai'

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

  const anthropic = getClient()

  const system = systemPrompt
    ? cacheSystem
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : [{ type: 'text' as const, text: systemPrompt }]
    : undefined

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const firstText = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!firstText) {
    throw new Error('Claude returned no text content')
  }

  return {
    text: firstText.text,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  }
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

  const anthropic = getClient()

  const system = systemPrompt
    ? cacheSystem
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : [{ type: 'text' as const, text: systemPrompt }]
    : undefined

  const response = await anthropic.messages.parse({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: zodOutputFormat(schema) },
  })

  if (!response.parsed_output) {
    throw new Error(`Claude returned no parsed output (stop_reason=${response.stop_reason})`)
  }

  return {
    parsed: response.parsed_output as z.infer<T>,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  }
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
  const base = (cfg as any).aiGatewayUrl || process.env.AI_GATEWAY_URL
  if (!base) return undefined
  const root = String(base)
    .replace(/\/(groq|anthropic|perplexity-ai)\/?$/, '')
    .replace(/\/+$/, '')
  return `${root}/${provider}`
}

export function getAnthropicProvider() {
  const cfg = useRuntimeConfig()
  return createAnthropic({
    apiKey: (cfg as any).anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    baseURL: gatewayBase('anthropic'),
  })
}

export function getGroqProvider() {
  const cfg = useRuntimeConfig()
  return createGroq({
    apiKey: (cfg as any).groqApiKey || process.env.GROQ_API_KEY,
    baseURL: gatewayBase('groq'),
  })
}

/**
 * Resolve a model spec string to an AI SDK LanguageModel.
 *   'groq/openai/gpt-oss-120b'        → Groq, model 'openai/gpt-oss-120b'
 *   'groq/moonshotai/kimi-k2-instruct'→ Groq, model 'moonshotai/kimi-k2-instruct'
 *   'anthropic/claude-sonnet-4-6'     → Anthropic, model 'claude-sonnet-4-6'
 */
export function resolveModel(spec: string): LanguageModel {
  if (spec.startsWith('anthropic/')) return getAnthropicProvider()(spec.slice('anthropic/'.length))
  if (spec.startsWith('groq/')) return getGroqProvider()(spec.slice('groq/'.length))
  throw new Error(`Unknown model spec: ${spec}`)
}
