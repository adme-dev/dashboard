import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

describe('officeLobbyRequests utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  it('does not mark notifications when no ids are provided', async () => {
    const { markOfficeLobbyNotificationsRead } = await import('~~/server/utils/officeLobbyRequests')

    await markOfficeLobbyNotificationsRead([])

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('marks notifications read when stale lobby requests expire', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ notification_ids: ['pending-1', 'pending-2'] }])
      .mockResolvedValueOnce([{ notification_ids: ['accepted-1'] }])

    const { expireStaleOfficeLobbyRequests } = await import('~~/server/utils/officeLobbyRequests')

    await expireStaleOfficeLobbyRequests('office-1')

    expect(mockQueryRows).toHaveBeenCalledTimes(2)
    expect(mockQueryRows.mock.calls[0][0]).toContain('RETURNING notification_ids')
    expect(mockQueryRows.mock.calls[0][0]).toContain('COALESCE(scheduled_start_at, created_at)')
    expect(mockQueryRows.mock.calls[1][0]).toContain('RETURNING notification_ids')

    const notificationUpdates = mockExecute.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE notifications')
    )
    expect(notificationUpdates).toHaveLength(2)
    expect(notificationUpdates[0][1]).toEqual([['pending-1', 'pending-2']])
    expect(notificationUpdates[1][1]).toEqual([['accepted-1']])
  })

  it('creates scheduled lobby request storage on bootstrap', async () => {
    const { ensureOfficeLobbyRequestsTable } = await import('~~/server/utils/officeLobbyRequests')

    await ensureOfficeLobbyRequestsTable()

    expect(mockExecute.mock.calls[0][0]).toContain('scheduled_start_at timestamptz')
    expect(mockExecute.mock.calls.some(([sql]) =>
      String(sql).includes('idx_office_lobby_requests_scheduled_start')
    )).toBe(true)
  })
})
