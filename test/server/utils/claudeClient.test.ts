import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mockRecordAiInvocation = vi.fn()
const mockParse = vi.fn()
const mockCreateAnthropic = vi.fn(() => vi.fn())
const mockCreateGroq = vi.fn(() => vi.fn())
const mockGetCachedCfBinding = vi.fn()
let runtimeConfig: Record<string, unknown>

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

vi.mock('~~/server/utils/cfBindings', () => ({
  getCachedCfBinding: (...args: unknown[]) => mockGetCachedCfBinding(...args)
}))

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      parse: (...args: unknown[]) => mockParse(...args),
      create: vi.fn(),
    }
  }
  return { default: Anthropic }
})

vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: (schema: unknown) => schema,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (...args: unknown[]) => mockCreateAnthropic(...args),
}))

vi.mock('@ai-sdk/groq', () => ({
  createGroq: (...args: unknown[]) => mockCreateGroq(...args),
}))

vi.mock('workers-ai-provider', () => ({
  createWorkersAI: () => vi.fn(),
}))

beforeEach(() => {
  runtimeConfig = {
    anthropicApiKey: 'test-anthropic-key',
    groqApiKey: 'test-groq-key'
  }
  vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)
  mockRecordAiInvocation.mockReset()
  mockRecordAiInvocation.mockResolvedValue(undefined)
  mockParse.mockReset()
  mockCreateAnthropic.mockClear()
  mockCreateGroq.mockClear()
  mockGetCachedCfBinding.mockReset()
  mockGetCachedCfBinding.mockReturnValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AI Gateway provider authentication', () => {
  it('sends the normalized highest-precedence Gateway token to both providers', async () => {
    runtimeConfig = {
      anthropicApiKey: 'test-anthropic-key',
      groqApiKey: 'test-groq-key',
      aiGatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/default/groq/',
      aiGatewayAuthToken: 'Bearer gateway-token',
      cfApiToken: 'lower-precedence-token'
    }

    const { getAnthropicProvider, getGroqProvider } = await import('~~/server/utils/claudeClient')
    getAnthropicProvider()
    getGroqProvider()

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: 'test-anthropic-key',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/account/default/anthropic',
      headers: { 'cf-aig-authorization': 'Bearer gateway-token' }
    })
    expect(mockCreateGroq).toHaveBeenCalledWith({
      apiKey: 'test-groq-key',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/account/default/groq',
      headers: { 'cf-aig-authorization': 'Bearer gateway-token' }
    })
  })

  it('uses the runtime Cloudflare token when no dedicated Gateway token is configured', async () => {
    runtimeConfig = {
      anthropicApiKey: 'test-anthropic-key',
      aiGatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/default',
      cfApiToken: 'cf-runtime-token'
    }

    const { getAnthropicProvider } = await import('~~/server/utils/claudeClient')
    getAnthropicProvider()

    expect(mockCreateAnthropic).toHaveBeenCalledWith(expect.objectContaining({
      headers: { 'cf-aig-authorization': 'Bearer cf-runtime-token' }
    }))
  })

  it('uses the Cloudflare environment token only after more specific token sources', async () => {
    vi.stubEnv('AI_GATEWAY_AUTH_TOKEN', 'environment-gateway-token')
    vi.stubEnv('CF_API_TOKEN', 'environment-cf-token')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'environment-cloudflare-token')
    runtimeConfig = {
      groqApiKey: 'test-groq-key',
      aiGatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/default'
    }

    const { getGroqProvider } = await import('~~/server/utils/claudeClient')
    getGroqProvider()

    expect(mockCreateGroq).toHaveBeenCalledWith(expect.objectContaining({
      headers: { 'cf-aig-authorization': 'Bearer environment-gateway-token' }
    }))
  })

  it('uses cached Pages bindings for the Gateway, provider keys, and authentication', async () => {
    const cachedBindings: Record<string, string> = {
      AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/account/default',
      ANTHROPIC_API_KEY: 'pages-anthropic-key',
      GROQ_API_KEY: 'pages-groq-key',
      CF_API_TOKEN: 'pages-cf-token'
    }
    runtimeConfig = {}
    mockGetCachedCfBinding.mockImplementation((key: string) => cachedBindings[key])

    const { getAnthropicProvider, getGroqProvider } = await import('~~/server/utils/claudeClient')
    getAnthropicProvider()
    getGroqProvider()

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: 'pages-anthropic-key',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/account/default/anthropic',
      headers: { 'cf-aig-authorization': 'Bearer pages-cf-token' }
    })
    expect(mockCreateGroq).toHaveBeenCalledWith({
      apiKey: 'pages-groq-key',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/account/default/groq',
      headers: { 'cf-aig-authorization': 'Bearer pages-cf-token' }
    })
  })

  it('does not send Gateway authentication without a Gateway URL', async () => {
    runtimeConfig = {
      groqApiKey: 'test-groq-key',
      aiGatewayAuthToken: 'gateway-token'
    }

    const { getGroqProvider } = await import('~~/server/utils/claudeClient')
    getGroqProvider()

    expect(mockCreateGroq).toHaveBeenCalledWith({
      apiKey: 'test-groq-key',
      baseURL: undefined
    })
  })

  it('does not send Gateway authentication without a token', async () => {
    runtimeConfig = {
      anthropicApiKey: 'test-anthropic-key',
      aiGatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/default'
    }

    const { getAnthropicProvider } = await import('~~/server/utils/claudeClient')
    getAnthropicProvider()

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: 'test-anthropic-key',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/account/default/anthropic'
    })
  })
})

describe('generateClaudeStructured', () => {
  it('records invocation telemetry when featureKey is supplied', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { ok: true },
      model: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 100,
        output_tokens: 25,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    })

    const { generateClaudeStructured } = await import('~~/server/utils/claudeClient')
    const result = await generateClaudeStructured('prompt', {
      schema: z.object({ ok: z.boolean() }),
      featureKey: 'financial_advisor',
      clientId: 'client-1',
      metadata: { route: '/api/test' },
    })

    expect(result.parsed).toEqual({ ok: true })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'financial_advisor',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      clientId: 'client-1',
      promptTokens: 100,
      completionTokens: 25,
      totalTokens: 125,
      status: 'success',
    }))
  })
})
