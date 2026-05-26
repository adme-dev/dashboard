import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args)
}))

describe('officeGuestBadges utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue({ id: 'badge-1', status: 'revoked' })
    mockEnsureOfficeLobbyRequestsTable.mockResolvedValue(undefined)
  })

  it('creates guest badge table and indexes once', async () => {
    const { ensureOfficeGuestBadgesTable } = await import('~~/server/utils/officeGuestBadges')

    await ensureOfficeGuestBadgesTable()
    await ensureOfficeGuestBadgesTable()

    expect(mockExecute).toHaveBeenCalledTimes(4)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_guest_badges')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_guest_badges')
    expect(mockExecute.mock.calls[2][0]).toContain('idx_office_guest_badges_office_status')
    expect(mockExecute.mock.calls[3][0]).toContain('idx_office_guest_badges_email')
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeGuestBadgesTable } = await import('~~/server/utils/officeGuestBadges')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeGuestBadgesTable()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeGuestBadgesTable()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(5)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_guest_badges')
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledTimes(2)
  })

  it('normalizes guest badge emails when upserting badges', async () => {
    const { upsertOfficeGuestBadge } = await import('~~/server/utils/officeGuestBadges')

    await upsertOfficeGuestBadge({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      guestName: 'Guest',
      guestEmail: ' Guest@Example.com ',
      allowedZoneId: 'zone-1',
      createdBy: 'admin-1',
      expiresAt: '2026-05-25T01:00:00.000Z'
    })

    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      'office-1',
      'request-1',
      'Guest',
      'guest@example.com',
      'zone-1',
      '2026-05-25T01:00:00.000Z',
      'admin-1'
    ])
  })

  it('updates badge lifecycle status by badge id', async () => {
    const { updateOfficeGuestBadgeStatus } = await import('~~/server/utils/officeGuestBadges')

    await updateOfficeGuestBadgeStatus({
      officeId: 'office-1',
      badgeId: 'badge-1',
      status: 'revoked',
      actorId: 'admin-1'
    })

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_guest_badges'),
      ['revoked', 'admin-1', 'office-1', 'badge-1']
    )
  })

  it('only reactivates badges that still have an approved room', async () => {
    const { updateOfficeGuestBadgeStatus } = await import('~~/server/utils/officeGuestBadges')

    await updateOfficeGuestBadgeStatus({
      officeId: 'office-1',
      badgeId: 'badge-1',
      status: 'active',
      actorId: 'admin-1',
      expiresAt: '2026-05-25T01:00:00.000Z'
    })

    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('allowed_zone_id IS NOT NULL')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      '2026-05-25T01:00:00.000Z',
      'office-1',
      'badge-1'
    ])
  })
})
