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
  body_html: '<p>Offer</p><a href="{{ unsubscribe_url }}">Unsubscribe</a><footer>Agency, 1 Market Street, Melbourne VIC 3000</footer>',
  client_id: null
}

describe('sendCampaignChunk rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.EMAIL_SENDING_ENABLED = 'true'
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetResendClient.mockReturnValue({ batch: { send: mockBatchSend } })
    mockExecute.mockResolvedValue(0)
    mockGetCampaign.mockResolvedValue({ ...campaign, status: 'sending' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'recipient-1',
        subscriber_id: 'sub-1',
        email: 'person@example.com',
        name: null
      }
    ])
  })

  it('returns the provider retry-after delay when Resend rate-limits a batch', async () => {
    const { sendCampaignChunk } = await import('~~/server/utils/email-marketing/campaignSender')
    mockBatchSend.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: 429,
        message: 'Too many requests',
        headers: { 'retry-after': '17' }
      }
    })

    const result = await sendCampaignChunk(campaign as never)

    expect(result).toEqual({
      sent: 0,
      failed: 0,
      rateLimited: true,
      retryAfterSec: 17
    })
    expect(String(mockExecute.mock.calls.at(-1)?.[0])).toContain('claimed_at = NULL')
  })

  it('releases every claim and never contacts the provider when final recipient content is blocked', async () => {
    const { sendCampaignChunk } = await import('~~/server/utils/email-marketing/campaignSender')
    await expect(sendCampaignChunk({ ...campaign, body_html: '<!--xf-condition:v1:close:c1-->' } as never)).rejects.toMatchObject({ statusCode: 422, statusMessage: 'campaign_final_content_blocked' })
    expect(mockBatchSend).not.toHaveBeenCalled()
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('claimed_at = NULL'), [['recipient-1']])
    expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('status = \'failed\''))).toBe(false)
  })

  it('propagates the provider retry-after delay from a send run', async () => {
    const { runCampaignSend } = await import('~~/server/utils/email-marketing/campaignSender')
    mockBatchSend.mockResolvedValueOnce({
      data: null,
      error: {
        statusCode: 429,
        message: 'Too many requests',
        headers: { 'retry-after': '23' }
      }
    })
    mockQueryOne.mockResolvedValueOnce({ n: 1 })

    const result = await runCampaignSend(campaign as never, { pacingMs: 0 })

    expect(result).toEqual({
      sent: 0,
      failed: 0,
      remaining: 1,
      drained: false,
      rateLimited: true,
      retryAfterSec: 23
    })
  })
})
