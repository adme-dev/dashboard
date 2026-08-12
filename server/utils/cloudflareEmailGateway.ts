import type { H3Event } from 'h3'

export interface CloudflareEmailGatewayMessage {
  to: string
  from: {
    address: string
    name: string
  }
  subject: string
  text: string
  html: string
}

export interface CloudflareEmailGatewayResult {
  outcome: 'accepted' | 'retryable' | 'permanent_failure' | 'unavailable'
  provider: 'cloudflare_email'
  providerMessageId: string | null
  errorClass: string | null
}

interface FetcherBinding {
  fetch(request: Request): Promise<Response>
}

const GATEWAY_URL = 'https://transactional-email.internal/v1/send'
const CONTROLLED_ERROR_CLASS = /^[a-z0-9_]{1,120}$/u

function serviceBinding(event: H3Event): FetcherBinding | null {
  const context = event.context as Record<string, unknown>
  const cloudflare = context.cloudflare
  if (!cloudflare || typeof cloudflare !== 'object') return null
  const env = (cloudflare as Record<string, unknown>).env
  if (!env || typeof env !== 'object') return null
  const value = (env as Record<string, unknown>).TRANSACTIONAL_EMAIL
  if (
    !value
    || typeof value !== 'object'
    || !('fetch' in value)
    || typeof value.fetch !== 'function'
  ) return null
  return value as FetcherBinding
}

export function isCloudflareEmailGatewayAvailable(event?: H3Event): boolean {
  return !!event && serviceBinding(event) !== null
}

function unavailable(errorClass: string): CloudflareEmailGatewayResult {
  return {
    outcome: errorClass === 'cloudflare_email_binding_unavailable'
      ? 'unavailable'
      : 'retryable',
    provider: 'cloudflare_email',
    providerMessageId: null,
    errorClass
  }
}

function controlledResult(
  value: unknown,
  status: number
): CloudflareEmailGatewayResult | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  if (result.provider !== 'cloudflare_email') return null

  if (
    status === 202
    && result.outcome === 'accepted'
    && typeof result.providerMessageId === 'string'
    && result.providerMessageId.length > 0
    && result.providerMessageId.length <= 500
    && result.errorClass === null
  ) {
    return result as unknown as CloudflareEmailGatewayResult
  }

  const failedOutcome = result.outcome === 'retryable'
    || result.outcome === 'permanent_failure'
  const expectedStatus = result.outcome === 'retryable' ? 503 : 422
  if (
    failedOutcome
    && status === expectedStatus
    && result.providerMessageId === null
    && typeof result.errorClass === 'string'
    && CONTROLLED_ERROR_CLASS.test(result.errorClass)
  ) {
    return result as unknown as CloudflareEmailGatewayResult
  }

  return null
}

export async function sendViaCloudflareEmailGateway(
  event: H3Event,
  message: CloudflareEmailGatewayMessage
): Promise<CloudflareEmailGatewayResult> {
  const binding = serviceBinding(event)
  if (!binding) return unavailable('cloudflare_email_binding_unavailable')

  try {
    const response = await binding.fetch(new Request(GATEWAY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message)
    }))
    const body = await response.json().catch(() => null)
    return controlledResult(body, response.status)
      ?? unavailable('cloudflare_email_gateway_invalid_response')
  } catch {
    return unavailable('cloudflare_email_gateway_unavailable')
  }
}
