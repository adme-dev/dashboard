import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockEmailsSend = vi.fn()
const mockGetResendClient = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockIsCampaignSendingEnabled = vi.fn()
const mockUploadBannerAsset = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, message?: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  readBody: typeof mockReadBody
  useRuntimeConfig: () => { public: { appName: string }, emailFrom: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody
testGlobal.useRuntimeConfig = () => ({ public: { appName: 'Dashboard' }, emailFrom: 'from@example.com' })

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  getResendClient: (...args: unknown[]) => mockGetResendClient(...args),
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.test'
}))

vi.mock('~~/server/utils/bannerStorage', () => ({
  uploadBannerAsset: (...args: unknown[]) => mockUploadBannerAsset(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaignSender', () => ({
  isCampaignSendingEnabled: (...args: unknown[]) => mockIsCampaignSendingEnabled(...args)
}))

const validDocument = {
  root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h', 'f'] } },
  h: { type: 'Heading', data: { props: { level: 'h2', text: 'Preview Root Test' }, style: {} } },
  f: { type: 'footer', data: { props: {}, style: {} } }
}

const documentWithImportedImage = {
  root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['html'] } },
  html: {
    type: 'Html',
    data: {
      props: {
        contents: '<img src="/email/postcards/glidex/car.png" alt="Car">'
      },
      style: {}
    }
  }
}

describe('email template test-send endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ email: 'author@example.com', name: 'Author User' })
    mockIsCampaignSendingEnabled.mockReturnValue(true)
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetResendClient.mockReturnValue({ emails: { send: mockEmailsSend } })
    mockEmailsSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null })
    mockUploadBannerAsset.mockResolvedValue({
      key: 'banner-assets/author-1/email/car.png',
      url: 'https://email-assets.example.com/car.png',
      size: 9
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('car-image'), {
      status: 200,
      headers: { 'content-type': 'image/png' }
    })))
    process.env.EMAIL_TEST_SENDING_ENABLED = 'true'
    process.env.EMAIL_SENDER_DOMAINS = 'example.com'
  })

  it('renders the provided editor document and sends it as a test email', async () => {
    const handler = (await import('~~/server/api/email/templates/test-send.post')).default
    mockReadBody.mockResolvedValue({
      to: 'test@example.com',
      subject: 'Subject line',
      preview_text: 'Inbox preview',
      body_source: validDocument
    })

    const result = await handler({} as never)

    expect(mockEmailsSend).toHaveBeenCalledOnce()
    expect(mockEmailsSend).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.stringContaining('<'),
      to: ['test@example.com'],
      subject: '[TEST] Subject line',
      html: expect.stringContaining('Preview Root Test'),
      text: expect.stringContaining('Preview Root Test')
    }))
    expect(result).toEqual(expect.objectContaining({
      sent_to: 'test@example.com',
      message_id: 'msg_123',
      sendability: expect.objectContaining({ ok: true })
    }))
  })

  it('blocks the send when sendability has errors', async () => {
    const handler = (await import('~~/server/api/email/templates/test-send.post')).default
    mockReadBody.mockResolvedValue({
      to: 'test@example.com',
      subject: '',
      preview_text: 'Inbox preview',
      body_source: validDocument
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: 'sendability_failed'
    })
    expect(mockEmailsSend).not.toHaveBeenCalled()
  })

  it('blocks the send when the configured From domain is not allowed', async () => {
    const handler = (await import('~~/server/api/email/templates/test-send.post')).default
    process.env.EMAIL_SENDER_DOMAINS = 'client.example'
    mockReadBody.mockResolvedValue({
      to: 'test@example.com',
      subject: 'Subject line',
      preview_text: 'Inbox preview',
      body_source: validDocument
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: 'sender_domain_not_allowed'
    })
    expect(mockEmailsSend).not.toHaveBeenCalled()
  })

  it('allows compose test sends without enabling the campaign send gate', async () => {
    const handler = (await import('~~/server/api/email/templates/test-send.post')).default
    mockIsCampaignSendingEnabled.mockReturnValue(false)
    mockReadBody.mockResolvedValue({
      to: 'test@example.com',
      subject: 'Subject line',
      preview_text: 'Inbox preview',
      body_source: validDocument
    })

    const result = await handler({} as never)

    expect(result).toEqual(expect.objectContaining({
      sent_to: 'test@example.com',
      message_id: 'msg_123'
    }))
    expect(mockEmailsSend).toHaveBeenCalledOnce()
  })

  it('mirrors imported image assets before sending the test email', async () => {
    const handler = (await import('~~/server/api/email/templates/test-send.post')).default
    mockRequireWriteAccess.mockResolvedValue({ id: 'author-1', email: 'author@example.com', name: 'Author User' })
    mockReadBody.mockResolvedValue({
      to: 'test@example.com',
      subject: 'Subject line',
      preview_text: 'Inbox preview',
      body_source: documentWithImportedImage
    })

    await handler({} as never)

    expect(fetch).toHaveBeenCalledWith('https://app.test/email/postcards/glidex/car.png')
    expect(mockUploadBannerAsset).toHaveBeenCalledWith(
      expect.any(Buffer),
      'car.png',
      'image/png',
      'author-1'
    )
    expect(mockEmailsSend).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('src="https://email-assets.example.com/car.png"')
    }))
    expect(mockEmailsSend.mock.calls[0]?.[0]?.html).not.toContain('https://app.test/email/postcards')
  })
})
