import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
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
const mockExpireStaleOfficeLobbyRequests = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  expireStaleOfficeLobbyRequests: (...args: unknown[]) => mockExpireStaleOfficeLobbyRequests(...args),
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS: 2,
  OFFICE_LOBBY_PENDING_EXPIRES_SQL: 'COALESCE(scheduled_start_at, created_at) + interval \'30 minutes\'',
  OFFICE_LOBBY_PENDING_WINDOW_MINUTES: 30
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { default: handler } = await import(
  '../../../../../../server/api/public/office-lobby/[officeId]/request/[requestId].get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', requestId: 'request-1' } }
  } satisfies TestEvent
}

describe('GET /api/public/office-lobby/:officeId/request/:requestId', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockExpireStaleOfficeLobbyRequests.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('returns accepted expiry metadata and room handoff for room-approved requests', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      status: 'accepted',
      created_at: '2026-05-25T00:00:00.000Z',
      handled_at: '2026-05-25T00:05:00.000Z',
      scheduled_start_at: '2026-05-25T01:00:00.000Z',
      message: [
        'Can we review blockers?',
        'Intake:',
        'What should we review first?: Launch blockers',
        'Meeting ID: 11111111-1111-4111-8111-111111111111',
        'Meeting: Client Review'
      ].join('\n'),
      zone_id: 'zone-1',
      pending_expires_at: '2026-05-25T00:30:00.000Z',
      accepted_expires_at: '2026-05-25T02:05:00.000Z',
      zone_name: 'Meeting Room',
      zone_slug: 'meeting-room'
    })
    mockQueryOne.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      zone_id: 'zone-1',
      zone_name: 'Meeting Room',
      zone_slug: 'meeting-room',
      scheduled_start_at: '2026-05-25T01:15:00.000Z',
      duration_minutes: 45
    })

    const response = await handler(fakeEvent())

    expect('message' in response.request).toBe(false)
    expect(response.request.accepted_expires_at).toBe('2026-05-25T02:05:00.000Z')
    expect(response.request.scheduled_start_at).toBe('2026-05-25T01:00:00.000Z')
    expect(response.handoff).toEqual({
      type: 'room',
      label: 'Meeting Room',
      path: '/lobby-room/office-1/request-1'
    })
    expect(response.meeting).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      scheduledStartAt: '2026-05-25T01:15:00.000Z',
      durationMinutes: 45
    })
    expect(response.guestContext).toEqual({
      note: 'Can we review blockers?',
      intakeAnswers: [
        {
          label: 'What should we review first?',
          value: 'Launch blockers'
        }
      ]
    })
    expect(mockExpireStaleOfficeLobbyRequests).toHaveBeenCalledWith('office-1', 'request-1')
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
  })

  it('returns handoff from the meeting room for accepted legacy requests without a request room', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      status: 'accepted',
      created_at: '2026-05-25T00:00:00.000Z',
      handled_at: '2026-05-25T00:05:00.000Z',
      scheduled_start_at: null,
      message: 'Meeting ID: 11111111-1111-4111-8111-111111111111\nMeeting: Client Review',
      zone_id: null,
      pending_expires_at: '2026-05-25T00:30:00.000Z',
      accepted_expires_at: '2026-05-25T02:05:00.000Z',
      zone_name: null,
      zone_slug: null
    })
    mockQueryOne.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      zone_id: 'meeting-zone-1',
      zone_name: 'Meeting Room D',
      zone_slug: 'meeting-room-d',
      scheduled_start_at: null,
      duration_minutes: null
    })

    const response = await handler(fakeEvent())

    expect(response.handoff).toEqual({
      type: 'room',
      label: 'Meeting Room D',
      path: '/lobby-room/office-1/request-1'
    })
    expect(response.meeting).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      scheduledStartAt: null,
      durationMinutes: null
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
  })

  it('falls back to stored meeting title when the canonical meeting row is gone', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      status: 'pending',
      created_at: '2026-05-25T00:00:00.000Z',
      handled_at: null,
      scheduled_start_at: '2026-05-25T01:00:00.000Z',
      message: 'Meeting ID: 11111111-1111-4111-8111-111111111111\nMeeting: Client Review',
      zone_id: 'zone-1',
      pending_expires_at: '2026-05-25T00:30:00.000Z',
      accepted_expires_at: null,
      zone_name: 'Meeting Room',
      zone_slug: 'meeting-room'
    })
    mockQueryOne.mockResolvedValueOnce(null)

    const response = await handler(fakeEvent())

    expect(response.meeting).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Client Review',
      scheduledStartAt: '2026-05-25T01:00:00.000Z',
      durationMinutes: null
    })
  })
})
