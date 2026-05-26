import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockCreateNotification = vi.fn()
const mockEnsureOfficeAssistantTables = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockEnsureOfficePresenceLocationsTable = vi.fn()
const mockGetOfficeSettings = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}))

vi.mock('~~/server/utils/officeAssistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/officeAssistant')>()
  return {
    ...actual,
    ensureOfficeAssistantTables: (...args: unknown[]) => mockEnsureOfficeAssistantTables(...args)
  }
})

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officePresenceLocations', () => ({
  ensureOfficePresenceLocationsTable: (...args: unknown[]) => mockEnsureOfficePresenceLocationsTable(...args)
}))

vi.mock('~~/server/utils/officeSettings', () => ({
  getOfficeSettings: (...args: unknown[]) => mockGetOfficeSettings(...args)
}))

describe('officeAssistantEvaluator utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockEnsureOfficeAssistantTables.mockResolvedValue(undefined)
    mockEnsureOfficeLobbyRequestsTable.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficePresenceLocationsTable.mockResolvedValue(undefined)
    mockGetOfficeSettings.mockResolvedValue({ assistant_enabled: true })
    mockCreateNotification.mockResolvedValue({ id: 'notification-1' })
  })

  it('creates notify jobs and notifications for triggered watches', async () => {
    const { evaluateOfficeAssistantWatches } = await import('~~/server/utils/officeAssistantEvaluator')

    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'watch-1',
          office_id: 'office-1',
          user_id: 'user-1',
          watch_type: 'person_available',
          status: 'active',
          label: 'Alex is available',
          conditions: { userId: 'user-2' },
          delivery: { notification: true },
          last_triggered_at: null,
          created_at: '2026-05-24T20:00:00.000Z',
          updated_at: '2026-05-24T20:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([{ user_id: 'user-2', status: 'online' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    mockQueryOne
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockResolvedValueOnce({ id: 'watch-1' })

    const result = await evaluateOfficeAssistantWatches({ officeId: 'office-1', userId: 'user-1' })

    expect(result.evaluated).toBe(1)
    expect(result.triggered).toEqual([{ id: 'job-1' }])
    expect(mockQueryOne.mock.calls[1]?.[0]).toContain('INSERT INTO office_assistant_jobs')
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      title: 'Office assistant',
      message: 'Alex is available',
      link: '/office'
    }))
  })
})
