import type { H3Event } from 'h3'
import type { CloudflareEmailGatewayMessage } from '../../../server/utils/cloudflareEmailGateway'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMagicLinkEmail, sendClientPortalMagicLinkEmail, isMagicLinkEmailConfigured } from '../../../server/utils/email'

const resendSend = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'resend-test' }, error: null }))
vi.mock('resend', () => ({ Resend: class { emails = { send: resendSend } } }))

function eventWithAuthGateway(fetch: ReturnType<typeof vi.fn>): H3Event {
  return { context: { cloudflare: { env: {
    AGENCY_AUTH_EMAIL: { fetch },
    EMAIL_FROM: 'notification@adme.net.au',
    APP_NAME: 'XeroFlow Agency',
    APP_URL: 'https://app.xeroflow.io'
  } } } } as unknown as H3Event
}
async function sentMessage(fetch: ReturnType<typeof vi.fn>): Promise<CloudflareEmailGatewayMessage> {
  const request = fetch.mock.calls[0]?.[0] as Request | undefined
  if (!request) throw new Error('Gateway request missing')
  return await request.json() as CloudflareEmailGatewayMessage
}
const data = { to: 'member@example.com', name: 'Member', magicLinkUrl: 'https://app.xeroflow.io/api/auth/magic-link/callback?token=synthetic-token' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('agency magic-link identity and transport', () => {
  it('uses the dedicated Cloudflare gateway and notification@xeroflow.io despite the global ADME default', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ outcome: 'accepted', provider: 'cloudflare_email', providerMessageId: 'cf-auth-test', errorClass: null }, { status: 202 }))
    await sendMagicLinkEmail({ ...data, event: eventWithAuthGateway(fetch) })
    expect(fetch).toHaveBeenCalledOnce()
    const message = await sentMessage(fetch)
    expect(message.from).toEqual({ address: 'notification@xeroflow.io', name: 'XeroFlow Agency' })
    expect(message.to).toBe(data.to)
    expect(message.html).toContain(data.magicLinkUrl)
    expect(message.text).toContain(data.magicLinkUrl)
    expect(resendSend).not.toHaveBeenCalled()
  })

  it('uses the XeroFlow sender for the existing invited Page Studio account without a portal fallback', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ outcome: 'accepted', provider: 'cloudflare_email', providerMessageId: 'cf-studio-invited-test', errorClass: null }, { status: 202 }))
    await sendClientPortalMagicLinkEmail({ ...data, clientName: 'Example website', expiresInMinutes: 15, studio: true, event: eventWithAuthGateway(fetch) })
    expect(fetch).toHaveBeenCalledOnce()
    const message = await sentMessage(fetch)
    expect(message.from).toEqual({ address: 'notification@xeroflow.io', name: 'XeroFlow Page Studio' })
    expect(message.subject).toContain('Page Studio')
    expect(message.html).toContain('Continue to Page Studio')
    expect(message.html).not.toContain('Continue to client portal')
    expect(resendSend).not.toHaveBeenCalled()
  })

  it('requires the per-request auth binding and never borrows another mailer', async () => {
    const fetch = vi.fn()
    const event = { context: { cloudflare: { env: { TRANSACTIONAL_EMAIL: { fetch }, PAGE_STUDIO_CUSTOMER_EMAIL: { fetch }, RESEND_API_KEY: 'synthetic-key' } } } } as unknown as H3Event
    expect(isMagicLinkEmailConfigured(event)).toBe(false)
    expect(isMagicLinkEmailConfigured()).toBe(false)
    await expect(sendMagicLinkEmail({ ...data, event })).rejects.toThrow('Magic-link email service is not configured')
    expect(fetch).not.toHaveBeenCalled()
    expect(resendSend).not.toHaveBeenCalled()
  })

  it.each([
    [503, { outcome: 'retryable', provider: 'cloudflare_email', providerMessageId: null, errorClass: 'cloudflare_email_retryable' }],
    [422, { outcome: 'permanent_failure', provider: 'cloudflare_email', providerMessageId: null, errorClass: 'cloudflare_email_permanent_failure' }],
    [202, { outcome: 'accepted', provider: 'resend', providerMessageId: 'unexpected', errorClass: null }],
    [202, { outcome: 'accepted', provider: 'cloudflare_email', providerMessageId: null, errorClass: null }]
  ])('rejects non-authoritative receipt %# without retry or fallback', async (status, receipt) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(receipt, { status }))
    await expect(sendMagicLinkEmail({ ...data, event: eventWithAuthGateway(fetch) })).rejects.toThrow('Magic-link email could not be sent')
    expect(fetch).toHaveBeenCalledOnce()
    expect(resendSend).not.toHaveBeenCalled()
  })

  it('contains transport failure without exposing recipient or link', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error(`PRIVATE ${data.to} ${data.magicLinkUrl}`))
    await expect(sendMagicLinkEmail({ ...data, event: eventWithAuthGateway(fetch) })).rejects.toThrow('Magic-link email could not be sent')
    expect(fetch).toHaveBeenCalledOnce()
    expect(resendSend).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(data.to)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(data.magicLinkUrl)
  })

  it('fails a rejected gateway receipt without alternate delivery or exposing provider details', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ private: 'PRIVATE_PROVIDER_DETAIL' }, { status: 503 }))
    await expect(sendMagicLinkEmail({ ...data, event: eventWithAuthGateway(fetch) })).rejects.toThrow('Magic-link email could not be sent')
    expect(fetch).toHaveBeenCalledOnce()
    expect(resendSend).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVATE_PROVIDER_DETAIL')
  })
})
