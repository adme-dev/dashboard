import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockGetResendClient = vi.fn()
const mockBatchSend = vi.fn()
const mockGetCampaign = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
  getResendClient: (...args: unknown[]) => mockGetResendClient(...args),
  getCachedBinding: vi.fn(() => undefined)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: vi.fn(() => 'https://app.test')
}))

vi.mock('~~/server/utils/crm/commsDb', () => ({
  bridgeCommunication: vi.fn()
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  prepareCampaignHtmlForSend: vi.fn(async campaign => campaign)
}))

const campaign = {
  id: 'camp-1',
  subject: 'June offers',
  from_name: null,
  from_email: 'sales@example.com',
  reply_to: null,
  body_html: [
    '<p>Offer</p>',
    '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
    '<footer>XeroFlow Agency, 1 Market Street, Melbourne VIC 3000</footer>'
  ].join(''),
  client_id: null,
  status: 'sending'
}

describe('runCampaignSend pause/cancel safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.EMAIL_SENDING_ENABLED = 'true'
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetResendClient.mockReturnValue({ batch: { send: mockBatchSend } })
    mockExecute.mockResolvedValue(0)
    mockBatchSend.mockResolvedValue({ data: { data: [{ id: 'msg-1' }] }, error: null })
    mockQueryRows
      .mockResolvedValueOnce([
        { id: 'recipient-1', subscriber_id: 'sub-1', email: 'one@example.com', name: null }
      ])
      .mockResolvedValueOnce([
        { id: 'recipient-2', subscriber_id: 'sub-2', email: 'two@example.com', name: null }
      ])
    mockQueryOne.mockResolvedValue({ n: 1 })
    mockGetCampaign
      .mockResolvedValueOnce({ ...campaign, status: 'sending' })
      .mockResolvedValueOnce({ ...campaign, status: 'paused' })
  })

  it('stops claiming new chunks when a campaign is paused after the current chunk', async () => {
    const { runCampaignSend } = await import('~~/server/utils/email-marketing/campaignSender')

    const result = await runCampaignSend(campaign as never, {
      maxChunks: 2,
      pacingMs: 0,
      prepareHtml: false
    })

    expect(mockBatchSend).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      sent: 1,
      failed: 0,
      remaining: 1,
      drained: false,
      rateLimited: false,
      retryAfterSec: 0
    })
  })
})
