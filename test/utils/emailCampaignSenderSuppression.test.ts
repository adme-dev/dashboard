import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelIneligiblePendingRecipients } from '~~/server/utils/email-marketing/campaignSender'

const executeMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => executeMock(...args),
  queryRows: vi.fn(),
  queryOne: vi.fn()
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: vi.fn(() => true),
  getResendClient: vi.fn()
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
})
