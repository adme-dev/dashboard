import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { customerEmailAvailable, sendCustomerSignInEmail } from '~~/server/utils/pageStudio/customerSignupEmail'

const mocks = vi.hoisted(() => ({ send: vi.fn(), resend: vi.fn(), dedicatedSend: vi.fn(), dedicatedClient: vi.fn(), configured: vi.fn(), gatewayAvailable: vi.fn() }))
vi.mock('~~/server/utils/email', () => ({ getResendClient: () => ({ emails: { send: mocks.resend } }), isEmailConfigured: mocks.configured }))
vi.mock('~~/server/utils/portalAuthEmailTransport', () => ({ sendPortalAuthTransactionalEmail: mocks.send }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.dedicatedSend }
    constructor(key: string) { mocks.dedicatedClient(key) }
  }
}))
vi.mock('~~/server/utils/cloudflareEmailGateway', () => ({ isCloudflareEmailGatewayAvailable: mocks.gatewayAvailable }))
describe('standalone sign-in email', () => {
  const event = { context: {} } as H3Event
  const config = { origin: 'https://studio.example.test', termsVersion: 'v1', from: 'studio@example.test' }
  const delivery = { email: 'owner@example.test', token: 'A'.repeat(64) }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.configured.mockReturnValue(false)
    mocks.gatewayAvailable.mockReturnValue(false)
    vi.unstubAllEnvs()
    vi.stubEnv('PAGE_STUDIO_CUSTOMER_RESEND_API_KEY', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  const dedicatedEvent = { context: { cloudflare: { env: { PAGE_STUDIO_CUSTOMER_RESEND_API_KEY: 'dedicated-test-key' } } } } as unknown as H3Event
  it('is available with only a dedicated Page Studio credential', () => {
    expect(customerEmailAvailable(dedicatedEvent)).toBe(true)
    expect(customerEmailAvailable(event)).toBe(false)
  })
  it('sends through the dedicated domain credential even when a shared gateway exists', async () => {
    mocks.gatewayAvailable.mockReturnValue(true)
    mocks.dedicatedSend.mockResolvedValue({ data: { id: 'delivered' } })
    await sendCustomerSignInEmail(dedicatedEvent, config, delivery)
    expect(mocks.dedicatedClient).toHaveBeenCalledWith('dedicated-test-key')
    expect(mocks.dedicatedSend).toHaveBeenCalledWith(expect.objectContaining({ from: 'Page Studio <studio@example.test>', to: delivery.email }))
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.resend).not.toHaveBeenCalled()
  })
  it('does not retry a rejected dedicated send through the shared sender', async () => {
    mocks.dedicatedSend.mockResolvedValue({ error: { message: 'private-provider-details' } })
    await expect(sendCustomerSignInEmail(dedicatedEvent, config, delivery)).rejects.toThrow('customer_email_delivery_failed')
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.resend).not.toHaveBeenCalled()
  })
  it('prefers the request credential over the local environment credential', async () => {
    vi.stubEnv('PAGE_STUDIO_CUSTOMER_RESEND_API_KEY', 'local-test-key')
    mocks.dedicatedSend.mockResolvedValue({ data: { id: 'delivered' } })
    await sendCustomerSignInEmail(dedicatedEvent, config, delivery)
    expect(mocks.dedicatedClient).toHaveBeenCalledWith('dedicated-test-key')
    await sendCustomerSignInEmail(event, config, delivery)
    expect(mocks.dedicatedClient).toHaveBeenLastCalledWith('local-test-key')
  })
  it('sanitizes dedicated provider exceptions without falling back', async () => {
    mocks.dedicatedSend.mockRejectedValue(new Error('private-provider-details'))
    await expect(sendCustomerSignInEmail(dedicatedEvent, config, delivery)).rejects.toThrow('customer_email_delivery_failed')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('uses the configured origin, token fragment and dedicated product copy', async () => {
    await sendCustomerSignInEmail(event, config, delivery)
    const options = mocks.send.mock.calls[0]![0]
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
  it('turns provider failures into a controlled error without provider details', async () => {
    mocks.send.mockImplementation(async options => options.resendSend())
    mocks.resend.mockResolvedValue({ error: { message: 'provider-private-data' } })
    await expect(sendCustomerSignInEmail(event, config, delivery)).rejects.toThrow('customer_email_delivery_failed')
  })
  it('uses the existing transactional fallback when selected', async () => {
    mocks.send.mockImplementation(async options => options.resendSend())
    mocks.resend.mockResolvedValue({ data: { id: 'delivered' } })
    await expect(sendCustomerSignInEmail(event, config, delivery)).resolves.toBeUndefined()
    expect(mocks.resend).toHaveBeenCalledWith(expect.objectContaining({ from: 'Page Studio <studio@example.test>' }))
  })
})
