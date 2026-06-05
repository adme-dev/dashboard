import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelSuppressedPendingRecipients } from '~~/server/utils/email-marketing/campaignSender'

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

describe('cancelSuppressedPendingRecipients', () => {
  beforeEach(() => {
    executeMock.mockReset()
  })

  it('cancels pending recipients that became suppressed after materialization', async () => {
    executeMock.mockResolvedValueOnce(3)

    const cancelled = await cancelSuppressedPendingRecipients('camp-1')

    expect(cancelled).toBe(3)
    expect(String(executeMock.mock.calls[0][0])).toContain('suppression_list')
    expect(String(executeMock.mock.calls[0][0])).toContain("status = 'cancelled'")
    expect(executeMock.mock.calls[0][1]).toEqual(['camp-1'])
  })
})
