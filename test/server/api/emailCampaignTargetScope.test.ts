import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockGetAssignedClientIds = vi.fn()
const mockGetRouterParam = vi.fn()
const mockReadBody = vi.fn()
const mockGetCampaign = vi.fn()
const mockGetCampaignListClientIds = vi.fn()
const mockMaterializeRecipients = vi.fn()
const mockScheduleCampaign = vi.fn()
const mockUpdateCampaign = vi.fn()
const mockPrepareCampaignHtmlForSend = vi.fn()
const mockSetCampaignStatus = vi.fn()
const mockBuildCampaignPreflight = vi.fn()
const mockCanEnterSending = vi.fn()
const mockIsCampaignSendingEnabled = vi.fn()
const mockRunCampaignSend = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockGetAppUrl = vi.fn()
const mockResolveCampaignSenderDomains = vi.fn()

const CLIENT_1 = '11111111-1111-4111-8111-111111111111'
const CLIENT_2 = '22222222-2222-4222-8222-222222222222'

const scopedUser = {
  id: 'user-1',
  email: 'am@example.com',
  name: 'Account Manager',
  role: 'account_manager',
  is_active: true
}

const baseCampaign = {
  id: 'camp-1',
  name: 'Client campaign',
  subject: 'Subject',
  from_name: 'XeroFlow',
  from_email: 'sales@example.com',
  reply_to: null,
  preview_text: null,
  body_source: null,
  body_html: [
    '<p>Offer</p>',
    '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
    '<footer>XeroFlow Agency, 1 Market Street, Melbourne VIC 3000</footer>'
  ].join(''),
  template_id: null,
  client_id: CLIENT_1,
  status: 'draft',
  scheduled_at: null,
  to_send: 1,
  sent: 0,
  failed: 0
}

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  getRouterParam: typeof mockGetRouterParam
  readBody: typeof mockReadBody
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getRouterParam = mockGetRouterParam
testGlobal.readBody = mockReadBody

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  getCampaignListClientIds: (...args: unknown[]) => mockGetCampaignListClientIds(...args),
  materializeRecipients: (...args: unknown[]) => mockMaterializeRecipients(...args),
  scheduleCampaign: (...args: unknown[]) => mockScheduleCampaign(...args),
  updateCampaign: (...args: unknown[]) => mockUpdateCampaign(...args),
  prepareCampaignHtmlForSend: (...args: unknown[]) => mockPrepareCampaignHtmlForSend(...args),
  setCampaignStatus: (...args: unknown[]) => mockSetCampaignStatus(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaignSend', () => ({
  buildCampaignPreflight: (...args: unknown[]) => mockBuildCampaignPreflight(...args),
  canEnterSending: (...args: unknown[]) => mockCanEnterSending(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaignSender', () => ({
  isCampaignSendingEnabled: (...args: unknown[]) => mockIsCampaignSendingEnabled(...args),
  runCampaignSend: (...args: unknown[]) => mockRunCampaignSend(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: (...args: unknown[]) => mockGetAppUrl(...args)
}))

vi.mock('~~/server/utils/email-marketing/senderIdentity', () => ({
  resolveCampaignSenderDomains: (...args: unknown[]) => mockResolveCampaignSenderDomains(...args)
}))

describe('campaign target client scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue(scopedUser)
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_1])
    mockGetRouterParam.mockReturnValue('camp-1')
    mockReadBody.mockResolvedValue({})
    mockGetCampaign.mockResolvedValue({ ...baseCampaign })
    mockGetCampaignListClientIds.mockResolvedValue([
      { client_id: CLIENT_1 },
      { client_id: CLIENT_2 }
    ])
    mockMaterializeRecipients.mockResolvedValue(1)
    mockScheduleCampaign.mockResolvedValue({ ...baseCampaign, status: 'scheduled' })
    mockUpdateCampaign.mockResolvedValue({ ...baseCampaign })
    mockPrepareCampaignHtmlForSend.mockResolvedValue({ ...baseCampaign })
    mockSetCampaignStatus.mockResolvedValue(undefined)
    mockBuildCampaignPreflight.mockReturnValue({ blocked: false, checks: [] })
    mockCanEnterSending.mockReturnValue({ ok: true })
    mockIsCampaignSendingEnabled.mockReturnValue(true)
    mockRunCampaignSend.mockResolvedValue({ drained: false, sent: 1, failed: 0 })
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetAppUrl.mockReturnValue('https://app.test')
    mockResolveCampaignSenderDomains.mockReturnValue(['example.com'])
  })

  it('blocks materialization when saved campaign lists cross client scope', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/materialize.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'campaign_mixed_client_lists'
    })
    expect(mockMaterializeRecipients).not.toHaveBeenCalled()
  })

  it('blocks scheduling when saved campaign lists cross client scope', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id].patch')).default
    mockReadBody.mockResolvedValueOnce({ scheduled_at: '2026-06-10T02:00:00.000Z' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'campaign_mixed_client_lists'
    })
    expect(mockUpdateCampaign).not.toHaveBeenCalled()
    expect(mockScheduleCampaign).not.toHaveBeenCalled()
  })

  it('blocks sends when saved campaign lists cross client scope', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/send.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'campaign_mixed_client_lists'
    })
    expect(mockRunCampaignSend).not.toHaveBeenCalled()
  })
})
