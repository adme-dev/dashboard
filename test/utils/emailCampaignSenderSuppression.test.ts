import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelIneligiblePendingRecipients, sendCampaignChunk } from '~~/server/utils/email-marketing/campaignSender'

const executeMock = vi.fn()
const queryRowsMock = vi.fn()
const queryOneMock = vi.fn()
const getResendClientMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => executeMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  queryOne: (...args: unknown[]) => queryOneMock(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: vi.fn(() => true),
  getResendClient: (...args: unknown[]) => getResendClientMock(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: vi.fn(() => 'https://app.test')
}))

vi.mock('~~/server/utils/crm/commsDb', () => ({
  bridgeCommunication: vi.fn()
}))

describe('cancelIneligiblePendingRecipients', () => {
  beforeEach(() => {
    executeMock.mockReset()
    queryRowsMock.mockReset()
    queryOneMock.mockReset()
    getResendClientMock.mockReset()
    delete process.env.EMAIL_SENDING_ENABLED
  })

  it('cancels pending recipients that became suppressed after materialization', async () => {
    executeMock.mockResolvedValueOnce(3)

    const cancelled = await cancelIneligiblePendingRecipients('camp-1')

    expect(cancelled).toBe(3)
    expect(String(executeMock.mock.calls[0][0])).toContain('suppression_list')
    expect(String(executeMock.mock.calls[0][0])).toContain('status = \'cancelled\'')
    expect(executeMock.mock.calls[0][1]).toEqual(['camp-1'])
  })

  it('cancels pending recipients that unsubscribed from all targeted lists before send', async () => {
    executeMock.mockResolvedValueOnce(2)

    const cancelled = await cancelIneligiblePendingRecipients('camp-1')
    const sql = String(executeMock.mock.calls[0][0])

    expect(cancelled).toBe(2)
    expect(sql).toContain('FROM campaign_lists cl')
    expect(sql).toContain('JOIN subscriber_lists sl')
    expect(sql).toContain('sl.status <> \'unsubscribed\'')
    expect(sql).toContain('s.status = \'enabled\'')
    expect(sql).toContain('subscriber_ineligible_at_send_time')
    expect(sql).toContain('unsubscribed_at_send_time')
    expect(executeMock.mock.calls[0][1]).toEqual(['camp-1'])
  })

  it('rechecks suppression and membership eligibility inside the recipient claim query', async () => {
    process.env.EMAIL_SENDING_ENABLED = 'true'
    executeMock.mockResolvedValueOnce(0)
    queryRowsMock.mockResolvedValueOnce([])
    getResendClientMock.mockReturnValue({ batch: { send: vi.fn() } })

    await sendCampaignChunk({ id: 'camp-1' } as never)

    const claimSql = String(queryRowsMock.mock.calls[0]?.[0])
    expect(claimSql).toContain('suppression_list sup')
    expect(claimSql).toContain('email_subscribers s')
    expect(claimSql).toContain('subscriber_lists sl')
    expect(claimSql).toContain('s.status = \'enabled\'')
    expect(claimSql).toContain('sl.status <> \'unsubscribed\'')
  })
})
