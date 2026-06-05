import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockGetCampaign = vi.fn()
const mockMaterializeRecipients = vi.fn()
const mockSetCampaignStatus = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockResolveCampaignSenderDomains = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
  getResendClient: vi.fn()
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: vi.fn(() => 'https://app.test')
}))

vi.mock('~~/server/utils/crm/commsDb', () => ({
  bridgeCommunication: vi.fn()
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  materializeRecipients: (...args: unknown[]) => mockMaterializeRecipients(...args),
  prepareCampaignHtmlForSend: vi.fn(async campaign => campaign),
  setCampaignStatus: (...args: unknown[]) => mockSetCampaignStatus(...args)
}))

vi.mock('~~/server/utils/email-marketing/senderIdentity', () => ({
  resolveCampaignSenderDomains: (...args: unknown[]) => mockResolveCampaignSenderDomains(...args)
}))

const scheduledCampaign = {
  id: 'camp-1',
  subject: 'June offers',
  from_email: 'sales@example.com',
  body_html: [
    '<p>Offer</p>',
    '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
    '<footer>XeroFlow Agency, 1 Market Street, Melbourne VIC 3000</footer>'
  ].join(''),
  status: 'scheduled',
  to_send: 10
}

describe('dispatchCampaigns scheduled recipient snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.EMAIL_SENDING_ENABLED = 'true'
    mockIsEmailConfigured.mockReturnValue(true)
    mockResolveCampaignSenderDomains.mockReturnValue(['example.com'])
    mockGetCampaign.mockResolvedValue(scheduledCampaign)
    mockMaterializeRecipients.mockResolvedValue(99)
    mockSetCampaignStatus.mockResolvedValue(undefined)
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'camp-1' }])
      .mockResolvedValueOnce([])
  })

  it('promotes due scheduled campaigns without rebuilding their locked recipient queue', async () => {
    const { dispatchCampaigns } = await import('~~/server/utils/email-marketing/campaignSender')

    const result = await dispatchCampaigns()

    expect(result.promoted).toBe(1)
    expect(mockMaterializeRecipients).not.toHaveBeenCalled()
    expect(mockGetCampaign).toHaveBeenCalledWith('camp-1')
    expect(mockSetCampaignStatus).toHaveBeenCalledWith('camp-1', 'sending')
  })
})
