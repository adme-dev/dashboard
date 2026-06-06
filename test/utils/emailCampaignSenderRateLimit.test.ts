import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockGetResendClient = vi.fn()
const mockBatchSend = vi.fn()

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

const campaign = {
  id: 'camp-1',
  subject: 'June offers',
  from_name: null,
  from_email: 'sales@example.com',
  reply_to: null,
  body_html: '<p>Offer</p><a href="{{ unsubscribe_url }}">Unsubscribe</a>',
  client_id: null
}

describe('sendCampaignChunk rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.EMAIL_SENDING_ENABLED = 'true'
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetResendClient.mockReturnValue({ batch: { send: mockBatchSend } })
    mockExecute.mockResolvedValue(0)
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
