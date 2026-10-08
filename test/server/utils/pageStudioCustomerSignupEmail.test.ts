import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { customerEmailAvailable, sendCustomerSignInEmail } from '~~/server/utils/pageStudio/customerSignupEmail'

const mocks = vi.hoisted(() => ({ send: vi.fn(), available: vi.fn(), sharedResend: vi.fn() }))
vi.mock('~~/server/utils/email', () => ({ getResendClient: mocks.sharedResend, isEmailConfigured: () => true }))
vi.mock('~~/server/utils/cloudflareEmailGateway', () => ({
  sendViaCloudflareEmailGateway: mocks.send,
  isCloudflareEmailGatewayAvailable: mocks.available
}))
describe('standalone sign-in email', () => {
  const event = { context: {} } as H3Event
  const config = { origin: 'https://studio.example.test', termsVersion: 'v1', from: 'studio@example.test' }
  const delivery = { email: 'owner@example.test', token: 'A'.repeat(64) }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.send.mockResolvedValue({ outcome: 'accepted', provider: 'cloudflare_email', providerMessageId: 'cf-message-1', errorClass: null })
  })
  it('uses the configured origin, token fragment and dedicated product copy', async () => {
    await sendCustomerSignInEmail(event, config, delivery)
    const options = { message: mocks.send.mock.calls[0]![1] }
    expect(options.message.to).toBe(delivery.email)
    expect(options.message.from).toEqual({ address: config.from, name: 'Page Studio' })
    const url = new URL(options.message.text.split(/\s+/)[4])
    expect(url.origin).toBe(config.origin)
    expect(url.pathname).toBe('/studio/signup/verify')
    expect(url.search).toBe('')
    expect(url.hash).toBe(`#token=${delivery.token}`)
    expect(options.message.subject).toBe('Continue to Page Studio')
    expect(options.message.html).toContain('15 minutes')
    expect(options.message.html).toContain('works once')
    // Both email-client CTA variants and the copyable fallback retain the same
    // configured verification URL; styling must not redirect to staff sign-in.
    const hrefs = [...options.message.html.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    expect(hrefs).toEqual([url.href, url.href, url.href])
    expect(options.message.html).not.toContain('/auth/')
  })
  it('requires the dedicated Cloudflare binding for customer mail', () => {
    mocks.available.mockReturnValue(false)
    expect(customerEmailAvailable(event)).toBe(false)
    expect(mocks.available).toHaveBeenCalledWith(event, 'PAGE_STUDIO_CUSTOMER_EMAIL')
    mocks.available.mockReturnValue(true)
    expect(customerEmailAvailable(event)).toBe(true)
  })
  it.each(['unavailable', 'retryable', 'permanent_failure'])('fails closed for a %s Cloudflare outcome', async (outcome) => {
    mocks.send.mockResolvedValue({ outcome, errorClass: 'private-provider-data' })
    await expect(sendCustomerSignInEmail(event, config, delivery)).rejects.toThrow('customer_email_delivery_failed')
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.sharedResend).not.toHaveBeenCalled()
  })
  it('selects the dedicated Cloudflare transport and preserves the configured sender', async () => {
    await expect(sendCustomerSignInEmail(event, config, delivery)).resolves.toBeUndefined()
    expect(mocks.send).toHaveBeenCalledWith(event, expect.objectContaining({ from: { address: config.from, name: 'Page Studio' } }), 'PAGE_STUDIO_CUSTOMER_EMAIL')
  })
})
