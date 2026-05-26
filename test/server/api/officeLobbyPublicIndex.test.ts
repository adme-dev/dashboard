import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockEnsureOfficePresenceLocationsTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officePresenceLocations', () => ({
  ensureOfficePresenceLocationsTable: (...args: unknown[]) => mockEnsureOfficePresenceLocationsTable(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/public/office-lobby/[officeId]/index.get'
)

function fakeEvent(query: Record<string, string> = {}) {
  return {
    context: { params: { officeId: 'office-1' } },
    query
  } satisfies TestEvent
}

describe('GET /api/public/office-lobby/:officeId', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficePresenceLocationsTable.mockReset()

    mockQueryRows.mockResolvedValue([
      { id: 'zone-1', slug: 'lobby', name: 'Lobby', zone_type: 'lobby', capacity: 50 }
    ])
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('returns availability for office-presence lobbies with online hosts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        name: 'Sales Lobby',
        description: '',
        destination_zone_id: 'zone-1',
        config: {
          availability_mode: 'office_presence',
          event_duration_minutes: 45,
          minimum_notice_minutes: 10,
          daily_cap: 4
        },
        destination_zone_slug: 'lobby',
        destination_zone_name: 'Lobby'
      })
      .mockResolvedValueOnce({ online_staff_count: 2 })

    const response = await handler(fakeEvent({ lobby: 'sales' }))

    expect(response.availability).toEqual({
      mode: 'office_presence',
      isAvailable: true,
      reason: null,
      onlineStaffCount: 2,
      eventDurationMinutes: 45,
      minimumNoticeMinutes: 10,
      dailyCap: 4,
      availabilityWindows: []
    })
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficePresenceLocationsTable).toHaveBeenCalledOnce()
  })

  it('returns configured availability windows for scheduled lobbies', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        name: 'Sales Lobby',
        description: '',
        destination_zone_id: 'zone-1',
        config: {
          availability_mode: 'scheduled',
          event_duration_minutes: 30,
          minimum_notice_minutes: 20,
          availability_windows: [
            {
              days: [1, 2, 3, 4, 5],
              start: '09:00',
              end: '17:00',
              timezone: 'Australia/Melbourne'
            }
          ]
        },
        destination_zone_slug: 'lobby',
        destination_zone_name: 'Lobby'
      })

    const response = await handler(fakeEvent({ lobby: 'sales' }))

    expect(response.availability).toMatchObject({
      mode: 'scheduled',
      isAvailable: true,
      eventDurationMinutes: 30,
      minimumNoticeMinutes: 20,
      availabilityWindows: [
        {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '17:00',
          timezone: 'Australia/Melbourne'
        }
      ]
    })
    expect(mockEnsureOfficePresenceLocationsTable).not.toHaveBeenCalled()
  })

  it('marks office-presence lobbies unavailable when no hosts are online', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        name: 'Sales Lobby',
        description: '',
        destination_zone_id: 'zone-1',
        config: { availability_mode: 'office_presence' },
        destination_zone_slug: 'lobby',
        destination_zone_name: 'Lobby'
      })
      .mockResolvedValueOnce({ online_staff_count: 0 })

    const response = await handler(fakeEvent({ lobby: 'sales' }))

    expect(response.availability?.isAvailable).toBe(false)
    expect(response.availability?.reason).toBe('No hosts are currently available for drop-ins.')
  })

  it('rejects missing lobby handles', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ lobby: 'missing' }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Lobby link not found'
    })
  })

  it('returns meeting-specific guest intake prompt for invite links', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Client Review',
        zone_id: 'zone-1',
        zone_slug: 'lobby',
        zone_name: 'Lobby',
        scheduled_start_at: '2026-05-25T01:00:00.000Z',
        duration_minutes: 45,
        intake_prompt: 'What should we review first?'
      })

    const response = await handler(fakeEvent({
      meeting: '11111111-1111-4111-8111-111111111111'
    }))

    expect(response.meeting).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Client Review',
      intake_prompt: 'What should we review first?'
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('intake_prompt')
  })
})
