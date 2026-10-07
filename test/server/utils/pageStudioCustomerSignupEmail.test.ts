import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { sendCustomerSignInEmail } from '~~/server/utils/pageStudio/customerSignupEmail'

const mocks = vi.hoisted(() => ({ send: vi.fn(), resend: vi.fn() }))
vi.mock('~~/server/utils/email', () => ({ getResendClient: () => ({ emails: { send: mocks.resend } }), isEmailConfigured: () => true }))
vi.mock('~~/server/utils/portalAuthEmailTransport', () => ({ sendPortalAuthTransactionalEmail: mocks.send }))
describe('standalone sign-in email', () => {
  const event = { context: {} } as H3Event
  const config = { origin: 'https://studio.example.test', termsVersion: 'v1', from: 'studio@example.test' }
  const delivery = { email: 'owner@example.test', token: 'A'.repeat(64) }
  beforeEach(() => {
    vi.resetAllMocks()
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
    expect(options.message.html).toContain('15 minutes')
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
