import { describe, expect, it } from 'vitest'
import { buildGatewayAuthHeaders, resolveGroqGatewayBaseUrl } from '~~/server/utils/groqClient'

describe('resolveGroqGatewayBaseUrl', () => {
  it('returns undefined when the gateway is not configured', () => {
    expect(resolveGroqGatewayBaseUrl()).toBeUndefined()
    expect(resolveGroqGatewayBaseUrl('')).toBeUndefined()
    expect(resolveGroqGatewayBaseUrl('   ')).toBeUndefined()
  })

  it('appends the Groq provider path to a Cloudflare AI Gateway root URL', () => {
    expect(resolveGroqGatewayBaseUrl('https://gateway.ai.cloudflare.com/v1/account/gateway')).toBe(
      'https://gateway.ai.cloudflare.com/v1/account/gateway/groq'
    )
  })

  it('keeps an existing Groq provider URL stable', () => {
    expect(resolveGroqGatewayBaseUrl('https://gateway.ai.cloudflare.com/v1/account/gateway/groq/')).toBe(
      'https://gateway.ai.cloudflare.com/v1/account/gateway/groq'
    )
  })

  it('replaces another provider suffix with the Groq provider path', () => {
    expect(resolveGroqGatewayBaseUrl('https://gateway.ai.cloudflare.com/v1/account/gateway/anthropic')).toBe(
      'https://gateway.ai.cloudflare.com/v1/account/gateway/groq'
    )
  })
})

describe('buildGatewayAuthHeaders', () => {
  const gatewayUrl = 'https://gateway.ai.cloudflare.com/v1/account/gateway/groq'

  it('does not add auth headers when no gateway URL or token is configured', () => {
    expect(buildGatewayAuthHeaders()).toBeUndefined()
    expect(buildGatewayAuthHeaders(gatewayUrl, '')).toBeUndefined()
    expect(buildGatewayAuthHeaders(undefined, 'token')).toBeUndefined()
  })

  it('adds Cloudflare AI Gateway auth only for gateway requests', () => {
    expect(buildGatewayAuthHeaders(gatewayUrl, 'abc123')).toEqual({
      'cf-aig-authorization': 'Bearer abc123',
    })
  })

  it('accepts a token that already includes the Bearer prefix', () => {
    expect(buildGatewayAuthHeaders(gatewayUrl, 'Bearer abc123')).toEqual({
      'cf-aig-authorization': 'Bearer abc123',
    })
  })
})
