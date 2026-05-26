import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('officeAssistant utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  it('creates watch and job tables once', async () => {
    const { ensureOfficeAssistantTables } = await import('~~/server/utils/officeAssistant')

    await ensureOfficeAssistantTables()
    await ensureOfficeAssistantTables()

    expect(mockExecute).toHaveBeenCalledTimes(8)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_assistant_watches')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_assistant_watches')
    expect(mockExecute.mock.calls[4][0]).toContain('CREATE TABLE IF NOT EXISTS office_assistant_jobs')
    expect(mockExecute.mock.calls[5][0]).toContain('ALTER TABLE office_assistant_jobs')
    expect(mockExecute.mock.calls[6][0]).toContain('idx_office_assistant_jobs_office')
    expect(mockExecute.mock.calls[7][0]).toContain('idx_office_assistant_jobs_watch')
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeAssistantTables } = await import('~~/server/utils/officeAssistant')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeAssistantTables()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeAssistantTables()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(9)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_assistant_watches')
  })

  it('triggers when a watched person is available', async () => {
    const { evaluateOfficeAssistantWatch } = await import('~~/server/utils/officeAssistant')

    const trigger = evaluateOfficeAssistantWatch({
      id: 'watch-1',
      watch_type: 'person_available',
      label: 'Tell me when Alex is available',
      conditions: { userId: 'user-1' }
    }, {
      userStatuses: { 'user-1': 'online' }
    })

    expect(trigger?.title).toBe('Office assistant')
    expect(trigger?.metadata).toMatchObject({ userId: 'user-1', status: 'online' })
  })

  it('does not trigger person watches when the user is busy', async () => {
    const { evaluateOfficeAssistantWatch } = await import('~~/server/utils/officeAssistant')

    const trigger = evaluateOfficeAssistantWatch({
      id: 'watch-1',
      watch_type: 'person_available',
      label: 'Tell me when Alex is available',
      conditions: { userId: 'user-1' }
    }, {
      userStatuses: { 'user-1': 'dnd' }
    })

    expect(trigger).toBeNull()
  })

  it('triggers when guests are waiting in the lobby', async () => {
    const { evaluateOfficeAssistantWatch } = await import('~~/server/utils/officeAssistant')

    const trigger = evaluateOfficeAssistantWatch({
      id: 'watch-2',
      watch_type: 'lobby_guest_waiting',
      label: 'A guest is waiting',
      conditions: {}
    }, {
      pendingLobbyGuests: 2
    })

    expect(trigger?.title).toBe('Guest waiting in lobby')
    expect(trigger?.metadata).toMatchObject({ pendingLobbyGuests: 2 })
  })

  it('triggers for ended meetings by explicit meeting id', async () => {
    const { evaluateOfficeAssistantWatch } = await import('~~/server/utils/officeAssistant')

    const trigger = evaluateOfficeAssistantWatch({
      id: 'watch-3',
      watch_type: 'meeting_ended',
      label: 'Summarize the client sync',
      conditions: { meetingId: 'meeting-2' }
    }, {
      endedMeetingIds: ['meeting-1', 'meeting-2']
    })

    expect(trigger?.title).toBe('Meeting ended')
    expect(trigger?.metadata).toMatchObject({ meetingId: 'meeting-2' })
  })

  it('triggers when a watched room is occupied', async () => {
    const { evaluateOfficeAssistantWatch } = await import('~~/server/utils/officeAssistant')

    const trigger = evaluateOfficeAssistantWatch({
      id: 'watch-4',
      watch_type: 'room_occupied',
      label: 'Tell me when the war room is occupied',
      conditions: { zoneId: 'zone-1' }
    }, {
      occupiedZoneIds: ['zone-1']
    })

    expect(trigger?.title).toBe('Room is occupied')
    expect(trigger?.metadata).toMatchObject({ zoneId: 'zone-1' })
  })

  it('triggers when all watched people are co-present', async () => {
    const { evaluateOfficeAssistantWatch } = await import('~~/server/utils/officeAssistant')

    const trigger = evaluateOfficeAssistantWatch({
      id: 'watch-5',
      watch_type: 'co_presence',
      label: 'Tell me when Alex and Sam are together',
      conditions: { userIds: ['user-1', 'user-2'] }
    }, {
      coPresenceUserIds: ['user-1', 'user-2', 'user-3']
    })

    expect(trigger?.title).toBe('People are together')
    expect(trigger?.metadata).toMatchObject({ userIds: ['user-1', 'user-2'] })
  })
})
