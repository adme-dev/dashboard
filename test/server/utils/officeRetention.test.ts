import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockEnsureOfficeGuestBadgesTable = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockDeleteFile = vi.fn()
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args),
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS: 2,
  OFFICE_LOBBY_PENDING_WINDOW_MINUTES: 30
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  ensureOfficeGuestBadgesTable: (...args: unknown[]) => mockEnsureOfficeGuestBadgesTable(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

vi.mock('~~/server/utils/storage', () => ({
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args)
}))

describe('officeRetention utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy.mockClear()
    mockEnsureOfficeLobbyRequestsTable.mockResolvedValue(undefined)
    mockEnsureOfficeGuestBadgesTable.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
    mockQueryRows.mockResolvedValue([])
    mockDeleteFile.mockResolvedValue(undefined)
  })

  it('expires guest access, archives recordings, and deletes expired meeting sessions', async () => {
    const { runOfficeRetentionCleanup } = await import('~~/server/utils/officeRetention')
    mockQueryOne
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 })
    mockQueryRows.mockResolvedValueOnce([
      { storage_key: 'office-recordings/one.webm', thumbnail_key: 'office-recordings/one.jpg' },
      { storage_key: 'office-recordings/one.webm', thumbnail_key: null },
      { storage_key: 'https://cdn.example.com/external.webm', thumbnail_key: '../unsafe.jpg' }
    ])

    const result = await runOfficeRetentionCleanup()

    expect(result).toEqual({
      archivedRecordings: 3,
      deletedRecordingAssets: 2,
      failedRecordingAssetDeletes: 0,
      deletedMeetingSessions: 2,
      expiredLobbyRequests: 4,
      expiredGuestBadges: 3
    })
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalled()
    expect(mockEnsureOfficeGuestBadgesTable).toHaveBeenCalled()
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalled()
    expect(mockEnsureOfficeRecordingsTables).toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('UPDATE office_lobby_requests')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('30 minutes')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('2 hours')
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('UPDATE office_guest_badges')
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('expires_at <= now()')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('SELECT storage_key, thumbnail_key')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_recordings')
    expect(mockDeleteFile).toHaveBeenCalledTimes(2)
    expect(mockDeleteFile).toHaveBeenCalledWith('office-recordings/one.webm')
    expect(mockDeleteFile).toHaveBeenCalledWith('office-recordings/one.jpg')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('UPDATE office_recordings')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('share_token = NULL')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('storage_key = NULL')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('thumbnail_key = NULL')
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('DELETE FROM office_meeting_sessions')
  })

  it('reports failed recording asset deletions and still archives records', async () => {
    const { runOfficeRetentionCleanup } = await import('~~/server/utils/officeRetention')
    mockQueryOne
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mockQueryRows.mockResolvedValueOnce([
      { storage_key: 'office-recordings/fail.webm', thumbnail_key: null }
    ])
    mockDeleteFile.mockRejectedValueOnce(new Error('storage unavailable'))

    const result = await runOfficeRetentionCleanup()

    expect(result).toMatchObject({
      archivedRecordings: 1,
      deletedRecordingAssets: 0,
      failedRecordingAssetDeletes: 1
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[OfficeRetention] Failed to delete recording asset:',
      'office-recordings/fail.webm',
      expect.any(Error)
    )
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('UPDATE office_recordings')
  })
})
