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

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockCreateMeetingCloseoutArtifact = vi.fn()
const mockPrepareMeetingActionItemsForFollowUp = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  createMeetingCloseoutArtifact: (...args: unknown[]) => mockCreateMeetingCloseoutArtifact(...args),
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args),
  prepareMeetingActionItemsForFollowUp: (...args: unknown[]) => mockPrepareMeetingActionItemsForFollowUp(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/meetings/:meetingId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockCreateMeetingCloseoutArtifact.mockReset()
    mockPrepareMeetingActionItemsForFollowUp.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockCreateMeetingCloseoutArtifact.mockResolvedValue(undefined)
    mockPrepareMeetingActionItemsForFollowUp.mockResolvedValue(undefined)
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
  })

  it('moves a meeting into live status', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({ id: 'meeting-1', status: 'planned', zone_id: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({ id: 'meeting-1', status: 'live' })

    const result = await handler(fakeEvent({ status: 'live' }))

    expect(result.session).toMatchObject({ id: 'meeting-1', status: 'live' })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('started_at')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'live',
      null,
      false,
      null,
      false,
      [],
      false,
      '{}',
      false,
      null,
      'meeting-1',
      'office-1'
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'user-1',
      action: 'meeting.live',
      targetType: 'office_meeting_session',
      targetId: 'meeting-1'
    }))
  })

  it('rejects moving a roomless meeting into live status', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({ id: 'meeting-1', status: 'planned', zone_id: null })

    await expect(handler(fakeEvent({ status: 'live' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Live meetings require a room'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects clearing the room while starting a live meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({ id: 'meeting-1', status: 'planned', zone_id: '11111111-1111-4111-8111-111111111111' })

    await expect(handler(fakeEvent({
      status: 'live',
      zone_id: null
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Live meetings require a room'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('updates editable setup metadata', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'meeting-1', title: 'Updated planning' })

    const result = await handler(fakeEvent({
      title: 'Updated planning',
      zone_id: '11111111-1111-4111-8111-111111111111',
      meeting_type: 'client_review',
      context: 'Confirm next launch stage.',
      intake_prompt: 'What should we decide today?',
      scheduled_start_at: '2026-05-26T02:00:00.000Z',
      duration_minutes: 60,
      guest_emails: ['Client@Example.com ', 'client@example.com'],
      retention_days: 120
    }))

    expect(result.session).toMatchObject({ id: 'meeting-1', title: 'Updated planning' })
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('jsonb_set')
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('zone_type <> \'desk\'')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      null,
      'Updated planning',
      true,
      120,
      true,
      ['client@example.com'],
      true,
      JSON.stringify({
        meeting_type: 'client_review',
        context: 'Confirm next launch stage.',
        intake_prompt: 'What should we decide today?',
        scheduled_start_at: '2026-05-26T02:00:00.000Z',
        duration_minutes: 60
      }),
      true,
      '11111111-1111-4111-8111-111111111111',
      'meeting-1',
      'office-1'
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.updated',
      metadata: expect.objectContaining({
        title: 'Updated planning',
        zone_id: '11111111-1111-4111-8111-111111111111',
        meeting_type: 'client_review',
        intake_prompt: 'What should we decide today?',
        guest_count: 1,
        retention_days: 120
      })
    }))
  })

  it('allows clearing the meeting room', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'meeting-1', status: 'planned', zone_id: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({ id: 'meeting-1', zone_id: null })

    const result = await handler(fakeEvent({ zone_id: null }))

    expect(result.session).toMatchObject({ id: 'meeting-1', zone_id: null })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('office_zones')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      null,
      null,
      false,
      null,
      false,
      [],
      false,
      '{}',
      true,
      null,
      'meeting-1',
      'office-1'
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.updated',
      metadata: expect.objectContaining({ zone_id: null })
    }))
  })

  it('rejects clearing the room on a live meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'meeting-1', status: 'live', zone_id: '11111111-1111-4111-8111-111111111111' })

    await expect(handler(fakeEvent({ zone_id: null }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Live meetings require a room'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('expires accepted guest access when ending a meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        status: 'ended',
        title: 'Client review',
        lobby_request_id: '22222222-2222-4222-8222-222222222222'
      })
      .mockResolvedValueOnce({ expired_count: 2, badge_count: 2 })

    const result = await handler(fakeEvent({ status: 'ended' }))

    expect(result).toMatchObject({
      session: { id: 'meeting-1', status: 'ended' },
      guestAccessExpired: 2,
      guestBadgesExpired: 2
    })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('office_lobby_requests')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('office_guest_badges')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('matching_requests')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('meeting id')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('OR id = $4::uuid')
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('lobby_request_id IN (SELECT id FROM matching_requests)')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'office-1',
      'meeting-1',
      'user-1',
      '22222222-2222-4222-8222-222222222222'
    ])
    expect(mockCreateMeetingCloseoutArtifact).toHaveBeenCalledWith({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      status: 'ended',
      guestAccessExpired: 2,
      guestBadgesExpired: 2,
      createdBy: 'user-1'
    })
    expect(mockPrepareMeetingActionItemsForFollowUp).toHaveBeenCalledWith({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      status: 'ended',
      createdBy: 'user-1'
    })
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.ended',
      metadata: expect.objectContaining({
        guest_access_expired: 2,
        guest_badges_expired: 2
      })
    }))
  })

  it('returns not found for meetings outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ status: 'ended' }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting session not found'
    })
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
