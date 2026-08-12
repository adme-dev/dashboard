import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  sendViaCloudflareEmailGateway
} from '../../../server/utils/cloudflareEmailGateway'

function eventWithBinding(fetch: ReturnType<typeof vi.fn>) {
  return {
    context: {
      cloudflare: {
        env: {
          TRANSACTIONAL_EMAIL: { fetch }
        }
      }
    }
  } as unknown as H3Event
}

const message = {
  to: 'client@example.com',
  from: {
    address: 'notification@adme.net.au',
    name: 'XeroFlow Agency'
  },
  subject: 'Your secure portal sign-in link',
  text: 'Open the secure link.',
  html: '<p>Open the secure link.</p>'
}

describe('Cloudflare transactional email service client', () => {
  it('sends portal mail through the request-owned service binding', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      outcome: 'accepted',
      provider: 'cloudflare_email',
      providerMessageId: 'cf-message-1',
      errorClass: null
    }, { status: 202 }))

    await expect(sendViaCloudflareEmailGateway(
      eventWithBinding(fetch),
      message
    )).resolves.toEqual({
      outcome: 'accepted',
      provider: 'cloudflare_email',
      providerMessageId: 'cf-message-1',
      errorClass: null
    })

    const request = fetch.mock.calls[0][0] as Request
    expect(request.url).toBe('https://transactional-email.internal/v1/send')
    expect(request.method).toBe('POST')
    expect(await request.json()).toEqual(message)
    expect(request.headers.get('authorization')).toBeNull()
  })

  it('reports an unavailable binding so Resend can be used during rollout', async () => {
    await expect(sendViaCloudflareEmailGateway(
      { context: {} } as unknown as H3Event,
      message
    ))
      .resolves.toEqual({
        outcome: 'unavailable',
        provider: 'cloudflare_email',
        providerMessageId: null,
        errorClass: 'cloudflare_email_binding_unavailable'
      })
  })

  it.each(['retryable', 'permanent_failure'] as const)(
    'preserves a controlled %s gateway outcome',
    async (outcome) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({
        outcome,
        provider: 'cloudflare_email',
        providerMessageId: null,
        errorClass: `cloudflare_email_${outcome}`
      }, { status: outcome === 'retryable' ? 503 : 422 }))

      await expect(sendViaCloudflareEmailGateway(
        eventWithBinding(fetch),
        message
      )).resolves.toEqual({
        outcome,
        provider: 'cloudflare_email',
        providerMessageId: null,
        errorClass: `cloudflare_email_${outcome}`
      })
    }
  )

  it('reduces malformed or failed gateway responses without exposing details', async () => {
    const fetch = vi.fn().mockRejectedValue(
      new Error('client@example.com sensitive provider detail')
    )

    await expect(sendViaCloudflareEmailGateway(
      eventWithBinding(fetch),
      message
    )).resolves.toEqual({
      outcome: 'retryable',
      provider: 'cloudflare_email',
      providerMessageId: null,
      errorClass: 'cloudflare_email_gateway_unavailable'
    })
  })
})
