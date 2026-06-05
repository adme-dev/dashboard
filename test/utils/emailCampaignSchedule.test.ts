import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleCampaign } from '~~/server/utils/email-marketing/campaigns'

const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const transactionMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  transaction: (cb: unknown) => transactionMock(cb),
  execute: vi.fn()
}))

const draftCampaign = {
  id: 'camp-1',
  name: 'June offers',
  subject: 'June offers',
  from_name: 'XeroFlow',
  from_email: 'sales@example.com',
  reply_to: null,
  preview_text: 'Latest offers',
  body_source: null,
  body_html: [
    '<p>Offer</p>',
    '<img src="https://cdn.example.com/car.png">',
    '<a href="{{ unsubscribe_url }}">Unsubscribe</a>',
    '<footer>XeroFlow Agency, 1 Market Street, Melbourne VIC 3000</footer>'
  ].join(''),
  filter_rules: null,
  content_type: 'html',
  template_id: null,
  status: 'draft',
  scheduled_at: null,
  started_at: null,
  finished_at: null,
  client_id: null,
  created_by: 'user-1',
  to_send: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  preflight_result: null,
  preflight_checked_at: null,
  recipient_snapshot: null,
  created_at: '2026-06-05T00:00:00.000Z',
  updated_at: '2026-06-05T00:00:00.000Z'
}

describe('scheduleCampaign', () => {
  beforeEach(() => {
    queryOneMock.mockReset()
    queryRowsMock.mockReset()
    transactionMock.mockReset()
  })

  it('materializes recipients and stores preflight result plus recipient snapshot', async () => {
    const dbQueryMock = vi.fn()
    queryOneMock
      .mockResolvedValueOnce(draftCampaign)
      .mockResolvedValueOnce({ ...draftCampaign, to_send: 2 })
      .mockResolvedValueOnce({ ...draftCampaign, to_send: 2 })
      .mockResolvedValueOnce({
        deduped_recipients: 7,
        excluded_unsubscribed: 2,
        excluded_suppressed: 1,
        excluded_blocklisted: 2
      })
      .mockResolvedValueOnce({ ...draftCampaign, status: 'scheduled', to_send: 2 })
    queryRowsMock.mockResolvedValueOnce([{ list_id: 'list-1' }, { list_id: 'list-2' }])
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ n: 2 }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await scheduleCampaign('camp-1', '2026-06-06T00:00:00.000Z', {
      sendingConfigured: true,
      senderDomainAuthenticated: true,
      checkedAt: '2026-06-05T00:00:00.000Z'
    })

    expect(result.status).toBe('scheduled')
    const updateCall = queryOneMock.mock.calls.find(([sql]) =>
      String(sql).includes('preflight_result')
    )
    expect(updateCall?.[1]).toEqual([
      'camp-1',
      '2026-06-06T00:00:00.000Z',
      expect.stringContaining('"ok":true'),
      '2026-06-05T00:00:00.000Z',
      JSON.stringify({
        listIds: ['list-1', 'list-2'],
        dedupedRecipients: 7,
        excludedUnsubscribed: 2,
        excludedSuppressed: 1,
        excludedBlocklisted: 2,
        toSend: 2,
        generatedAt: '2026-06-05T00:00:00.000Z'
      })
    ])
  })

  it('rejects scheduling when preflight has blocked checks', async () => {
    const dbQueryMock = vi.fn()
    queryOneMock
      .mockResolvedValueOnce({ ...draftCampaign, from_email: null })
      .mockResolvedValueOnce({ ...draftCampaign, from_email: null, to_send: 1 })
      .mockResolvedValueOnce({ ...draftCampaign, from_email: null, to_send: 1 })
      .mockResolvedValueOnce({
        deduped_recipients: 1,
        excluded_unsubscribed: 0,
        excluded_suppressed: 0,
        excluded_blocklisted: 0
      })
    queryRowsMock.mockResolvedValueOnce([{ list_id: 'list-1' }])
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    await expect(scheduleCampaign('camp-1', '2026-06-06T00:00:00.000Z', {
      sendingConfigured: true,
      senderDomainAuthenticated: true,
      checkedAt: '2026-06-05T00:00:00.000Z'
    })).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: 'campaign_preflight_blocked'
    })
  })
})
