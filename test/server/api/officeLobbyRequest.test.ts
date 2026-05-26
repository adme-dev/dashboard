import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
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
const mockExecute = vi.fn()
const mockCreateNotification = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockGetOfficeSettings = vi.fn()
const mockEnsureOfficePresenceLocationsTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args),
  OFFICE_LOBBY_PENDING_EXPIRES_SQL: 'COALESCE(scheduled_start_at, created_at) + interval \'30 minutes\'',
  OFFICE_LOBBY_PENDING_WINDOW_MINUTES: 30
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeSettings', () => ({
  getOfficeSettings: (...args: unknown[]) => mockGetOfficeSettings(...args)
}))

vi.mock('~~/server/utils/officePresenceLocations', () => ({
  ensureOfficePresenceLocationsTable: (...args: unknown[]) => mockEnsureOfficePresenceLocationsTable(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/public/office-lobby/[officeId]/request.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/public/office-lobby/:officeId/request', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockCreateNotification.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockGetOfficeSettings.mockReset()
    mockEnsureOfficePresenceLocationsTable.mockReset()
    mockGetOfficeSettings.mockResolvedValue({
      guest_access_enabled: true,
      public_lobbies_enabled: true
    })
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('rejects stale room invite links instead of creating office-wide requests', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      roomSlug: 'missing-room',
      message: 'Joining now'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Room not found'
    })

    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeLobbiesTable).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('defaults direct API requests without roomSlug to the office lobby', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({ id: 'zone-lobby', slug: 'lobby', name: 'Lobby' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'request-1',
        pending_expires_at: '2026-05-25T00:30:00.000Z'
      })
    mockQueryRows.mockResolvedValueOnce([{ user_id: 'admin-1' }])
    mockCreateNotification.mockResolvedValueOnce({ id: 'notification-1' })

    const response = await handler(fakeEvent({
      name: 'Guest',
      email: ' Guest@Example.com ',
      message: 'Joining now'
    }))

    expect(response).toMatchObject({
      ok: true,
      requestId: 'request-1',
      room: { id: 'zone-lobby', slug: 'lobby', name: 'Lobby' }
    })

    const insertCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO office_lobby_requests')
    )
    const existingPendingCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('FROM office_lobby_requests')
      && String(sql).includes('status = \'pending\'')
    )
    expect(existingPendingCall?.[1]).toEqual(['office-1', 'zone-lobby', null, 'guest@example.com', null])
    expect(String(existingPendingCall?.[0])).toContain('message !~*')
    expect(insertCall?.[1]).toEqual(['office-1', null, 'zone-lobby', 'Guest', 'guest@example.com', 'Joining now', null])
  })

  it('persists embed attribution in the request message and notification metadata', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({ id: 'zone-lobby', slug: 'lobby', name: 'Lobby' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'request-1',
        pending_expires_at: '2026-05-25T00:30:00.000Z'
      })
    mockQueryRows.mockResolvedValueOnce([{ user_id: 'admin-1' }])
    mockCreateNotification.mockResolvedValueOnce({ id: 'notification-1' })

    await handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      source: 'embed',
      message: 'Joining from the website'
    }))

    const insertCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO office_lobby_requests')
    )
    expect(insertCall?.[1]).toEqual([
      'office-1',
      null,
      'zone-lobby',
      'Guest',
      'guest@example.com',
      'Joining from the website\nSource: embed',
      null
    ])
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        source: 'office_lobby',
        requestSource: 'embed'
      })
    }))
  })

  it('rejects unsupported lobby request attribution sources', async () => {
    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      source: 'partner-widget'
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('persists scheduled start time for direct room meeting invites', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const staleQueryScheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Canonical Client Review',
        zone_id: 'zone-meeting',
        zone_slug: 'meeting-room-a',
        scheduled_start_at: scheduledAt,
        duration_minutes: 60,
        intake_prompt: null
      })
      .mockResolvedValueOnce({ id: 'zone-meeting', slug: 'meeting-room-a', name: 'Meeting Room A' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'request-1',
        pending_expires_at: '2026-05-25T00:30:00.000Z'
      })
    mockQueryRows.mockResolvedValueOnce([{ user_id: 'admin-1' }])
    mockCreateNotification.mockResolvedValueOnce({ id: 'notification-1' })

    const response = await handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      roomSlug: 'meeting-room-a',
      scheduledStartAt: staleQueryScheduledAt,
      meetingId: '11111111-1111-4111-8111-111111111111',
      meetingTitle: 'Client Review',
      meetingDurationMinutes: 45,
      message: 'Joining Client Review'
    }))

    expect(response.meeting).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      scheduledStartAt: scheduledAt,
      durationMinutes: 60
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()

    const insertCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO office_lobby_requests')
    )
    const existingPendingCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('FROM office_lobby_requests')
      && String(sql).includes('status = \'pending\'')
    )
    expect(String(existingPendingCall?.[0])).toContain('meeting id')
    expect(existingPendingCall?.[1]).toEqual([
      'office-1',
      'zone-meeting',
      null,
      'guest@example.com',
      '11111111-1111-4111-8111-111111111111'
    ])
    expect(insertCall?.[1]).toEqual([
      'office-1',
      null,
      'zone-meeting',
      'Guest',
      'guest@example.com',
      [
        'Joining Client Review',
        'Meeting ID: 11111111-1111-4111-8111-111111111111',
        'Meeting: Canonical Client Review'
      ].join('\n'),
      scheduledAt
    ])
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/Meeting: Canonical Client Review[\s\S]*Scheduled/),
      metadata: expect.objectContaining({
        meetingId: '11111111-1111-4111-8111-111111111111',
        meetingTitle: 'Canonical Client Review',
        meetingDurationMinutes: 60,
        scheduledStartAt: scheduledAt
      })
    }))
  })

  it('uses the meeting room when an invite link has no room slug', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Canonical Client Review',
        zone_id: 'zone-meeting',
        zone_slug: 'meeting-room-a',
        scheduled_start_at: scheduledAt,
        duration_minutes: 60,
        intake_prompt: null
      })
      .mockResolvedValueOnce({ id: 'zone-meeting', slug: 'meeting-room-a', name: 'Meeting Room A' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'request-1',
        pending_expires_at: '2026-05-25T00:30:00.000Z'
      })
    mockQueryRows.mockResolvedValueOnce([{ user_id: 'admin-1' }])
    mockCreateNotification.mockResolvedValueOnce({ id: 'notification-1' })

    const response = await handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      meetingId: '11111111-1111-4111-8111-111111111111',
      message: 'Joining Client Review'
    }))

    expect(response).toMatchObject({
      ok: true,
      requestId: 'request-1',
      room: { id: 'zone-meeting', slug: 'meeting-room-a', name: 'Meeting Room A' },
      meeting: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Canonical Client Review',
        scheduledStartAt: scheduledAt,
        durationMinutes: 60
      }
    })
    const insertCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO office_lobby_requests')
    )
    expect(insertCall?.[1]).toEqual([
      'office-1',
      null,
      'zone-meeting',
      'Guest',
      'guest@example.com',
      [
        'Joining Client Review',
        'Meeting ID: 11111111-1111-4111-8111-111111111111',
        'Meeting: Canonical Client Review'
      ].join('\n'),
      scheduledAt
    ])
  })

  it('rejects meeting invite links before the meeting has an approved room', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Client Review',
        zone_id: null,
        zone_slug: null,
        scheduled_start_at: null,
        duration_minutes: null,
        intake_prompt: null
      })

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      meetingId: '11111111-1111-4111-8111-111111111111',
      message: 'Joining Client Review'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Meeting invite is missing an approved room'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('rejects meeting invite ids outside this office', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      roomSlug: 'meeting-room-a',
      scheduledStartAt: scheduledAt,
      meetingId: '11111111-1111-4111-8111-111111111111',
      meetingTitle: 'Client Review',
      message: 'Joining Client Review'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting invite not found'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('rejects meeting invite room mismatches', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Client Review',
        zone_id: 'zone-meeting-a',
        zone_slug: 'meeting-room-a',
        scheduled_start_at: scheduledAt,
        duration_minutes: 45,
        intake_prompt: null
      })
      .mockResolvedValueOnce({ id: 'zone-meeting-b', slug: 'meeting-room-b', name: 'Meeting Room B' })

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      roomSlug: 'meeting-room-b',
      scheduledStartAt: scheduledAt,
      meetingId: '11111111-1111-4111-8111-111111111111',
      meetingTitle: 'Client Review',
      message: 'Joining Client Review'
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Meeting invite room does not match this lobby request'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('requires the meeting intake answer before creating an invite request', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Client Review',
        zone_id: 'zone-meeting',
        zone_slug: 'meeting-room-a',
        scheduled_start_at: scheduledAt,
        duration_minutes: 45,
        intake_prompt: 'What should we review first?'
      })

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      meetingId: '11111111-1111-4111-8111-111111111111',
      message: [
        'Joining Client Review',
        'Intake:',
        'What should we review first?:'
      ].join('\n')
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Answer the meeting intake question before requesting entry'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('accepts meeting invite requests with the required intake answer', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const message = [
      'Joining Client Review',
      'Intake:',
      'What should we review first?: Launch blockers'
    ].join('\n')
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Client Review',
        zone_id: 'zone-meeting',
        zone_slug: 'meeting-room-a',
        scheduled_start_at: scheduledAt,
        duration_minutes: 45,
        intake_prompt: 'What should we review first?'
      })
      .mockResolvedValueOnce({ id: 'zone-meeting', slug: 'meeting-room-a', name: 'Meeting Room A' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'request-1',
        pending_expires_at: '2026-05-25T00:30:00.000Z'
      })
    mockQueryRows.mockResolvedValueOnce([{ user_id: 'admin-1' }])
    mockCreateNotification.mockResolvedValueOnce({ id: 'notification-1' })

    const response = await handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      meetingId: '11111111-1111-4111-8111-111111111111',
      message
    }))

    expect(response).toMatchObject({
      ok: true,
      requestId: 'request-1'
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    const insertCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO office_lobby_requests')
    )
    expect(insertCall?.[1]).toEqual([
      'office-1',
      null,
      'zone-meeting',
      'Guest',
      'guest@example.com',
      [
        message,
        'Meeting ID: 11111111-1111-4111-8111-111111111111',
        'Meeting: Client Review'
      ].join('\n'),
      scheduledAt
    ])
  })

  it('enforces daily caps for persistent lobby handles', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        destination_zone_id: 'zone-sales',
        config: { daily_cap: 1 }
      })
      .mockResolvedValueOnce({ request_count: 1 })

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      lobbyHandle: 'sales',
      message: 'Joining now'
    }))).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'This lobby has reached its daily request limit'
    })

    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('rejects office-presence lobby requests when no staff are online', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        destination_zone_id: 'zone-sales',
        config: { availability_mode: 'office_presence' }
      })
      .mockResolvedValueOnce({ online_staff_count: 0 })

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      lobbyHandle: 'sales',
      message: 'Joining now'
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'No hosts are currently available for drop-ins'
    })

    expect(mockEnsureOfficePresenceLocationsTable).toHaveBeenCalledOnce()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('persists scheduled start time for scheduled lobby requests', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        destination_zone_id: 'zone-sales',
        config: { availability_mode: 'scheduled', minimum_notice_minutes: 15 }
      })
      .mockResolvedValueOnce({ id: 'zone-sales', slug: 'sales', name: 'Sales Room' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'request-1',
        pending_expires_at: '2026-05-25T00:30:00.000Z'
      })
    mockQueryRows.mockResolvedValueOnce([{ user_id: 'admin-1' }])
    mockCreateNotification.mockResolvedValueOnce({ id: 'notification-1' })

    await handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      lobbyHandle: 'sales',
      scheduledStartAt: scheduledAt,
      message: 'Joining later'
    }))

    const insertCall = mockQueryOne.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO office_lobby_requests')
    )
    expect(insertCall?.[1]).toEqual([
      'office-1',
      'lobby-1',
      'zone-sales',
      'Guest',
      'guest@example.com',
      'Joining later',
      scheduledAt
    ])
  })

  it('rejects scheduled lobby requests outside configured availability windows', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'office-1', name: 'XeroFlow HQ' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        destination_zone_id: 'zone-sales',
        config: {
          availability_mode: 'scheduled',
          availability_windows: [
            {
              days: [1],
              start: '09:00',
              end: '10:00',
              timezone: 'UTC'
            }
          ]
        }
      })

    await expect(handler(fakeEvent({
      name: 'Guest',
      email: 'guest@example.com',
      lobbyHandle: 'sales',
      scheduledStartAt: '2026-05-26T12:00:00.000Z',
      message: 'Joining later'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Meeting time is outside this lobby availability window'
    })

    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})
