import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetCampaign = vi.fn()
const mockPrepareCampaignHtmlForSend = vi.fn()
const mockIsCampaignSendingEnabled = vi.fn()
const mockGetResendClient = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockEmailsSend = vi.fn()
const mockResolveCampaignSenderDomains = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, message?: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  readBody: typeof mockReadBody
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  prepareCampaignHtmlForSend: (...args: unknown[]) => mockPrepareCampaignHtmlForSend(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaignSender', () => ({
  isCampaignSendingEnabled: (...args: unknown[]) => mockIsCampaignSendingEnabled(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  getResendClient: (...args: unknown[]) => mockGetResendClient(...args),
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args)
}))

vi.mock('~~/server/utils/email-marketing/senderIdentity', () => ({
  resolveCampaignSenderDomains: (...args: unknown[]) => mockResolveCampaignSenderDomains(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.test'
}))

describe('campaign test-send preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('camp-1')
    mockReadBody.mockResolvedValue({ to: 'test@example.com' })
    mockRequireWriteAccess.mockResolvedValue({
      id: 'user-1',
      email: 'author@example.com',
      name: 'Author',
      role: 'admin'
    })
    mockIsCampaignSendingEnabled.mockReturnValue(true)
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetResendClient.mockReturnValue({ emails: { send: mockEmailsSend } })
    mockEmailsSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })
    mockPrepareCampaignHtmlForSend.mockImplementation(async campaign => campaign)
    mockResolveCampaignSenderDomains.mockReturnValue(['example.com'])
  })

  it('blocks campaign test sends when preflight has blocking checks', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/test-send.post')).default
    mockGetCampaign.mockResolvedValue({
      id: 'camp-1',
      subject: 'Subject',
      from_name: 'XeroFlow',
      from_email: 'sales@example.com',
      reply_to: null,
      client_id: null,
      body_html: '<p>No unsubscribe link</p>'
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: 'campaign_preflight_blocked'
    })
    expect(mockEmailsSend).not.toHaveBeenCalled()
  })

  it('prepares mirrored campaign HTML before sending a campaign test email', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/test-send.post')).default
    const campaign = {
      id: 'camp-1',
      subject: 'Subject',
      from_name: 'XeroFlow',
      from_email: 'sales@example.com',
      reply_to: null,
      client_id: null,
      body_html: [
        '<p>Offer</p>',
        '<img src="/email/postcards/car.png" alt="Car">',
        '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
        '<footer>XeroFlow Agency, 1 Market Street, Melbourne VIC 3000</footer>'
      ].join('')
    }
    mockGetCampaign.mockResolvedValue(campaign)
    mockPrepareCampaignHtmlForSend.mockResolvedValue({
      ...campaign,
      body_html: campaign.body_html.replace('/email/postcards/car.png', 'https://email-assets.example.com/car.png')
    })

    await handler({} as never)

    expect(mockPrepareCampaignHtmlForSend).toHaveBeenCalledWith(campaign, {
      appUrl: 'https://app.test',
      userId: 'user-1'
    })
    expect(mockEmailsSend).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('src="https://email-assets.example.com/car.png"')
    }))
    expect(mockEmailsSend.mock.calls[0]?.[0]?.html).not.toContain('/email/postcards/car.png')
  })
})
