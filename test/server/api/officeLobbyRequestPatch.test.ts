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
const mockRequireOfficeAdmin = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockExpireStaleOfficeLobbyRequests = vi.fn()
const mockMarkOfficeLobbyNotificationsRead = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockCreateMeetingPlaceholderArtifacts = vi.fn()
const mockCreateMeetingGuestIntakeArtifact = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()
const mockUpsertOfficeGuestBadge = vi.fn()
const mockRevokeOfficeGuestBadgeForRequest = vi.fn()
const mockEnsureOfficeMeetingThreadChannel = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRoom', () => ({
  requireOfficeAdmin: (...args: unknown[]) => mockRequireOfficeAdmin(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args),
  expireStaleOfficeLobbyRequests: (...args: unknown[]) => mockExpireStaleOfficeLobbyRequests(...args),
  markOfficeLobbyNotificationsRead: (...args: unknown[]) => mockMarkOfficeLobbyNotificationsRead(...args),
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS: 2
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  createMeetingPlaceholderArtifacts: (...args: unknown[]) => mockCreateMeetingPlaceholderArtifacts(...args),
  createMeetingGuestIntakeArtifact: (...args: unknown[]) => mockCreateMeetingGuestIntakeArtifact(...args),
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  upsertOfficeGuestBadge: (...args: unknown[]) => mockUpsertOfficeGuestBadge(...args),
  revokeOfficeGuestBadgeForRequest: (...args: unknown[]) => mockRevokeOfficeGuestBadgeForRequest(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeMeetingThreadChannel: (...args: unknown[]) => mockEnsureOfficeMeetingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../../server/api/office/[officeId]/lobby-requests/[requestId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', requestId: 'request-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/lobby-requests/:requestId', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockRequireOfficeAdmin.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockReset()
    mockExpireStaleOfficeLobbyRequests.mockReset()
    mockMarkOfficeLobbyNotificationsRead.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockCreateMeetingPlaceholderArtifacts.mockReset()
    mockCreateMeetingGuestIntakeArtifact.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockUpsertOfficeGuestBadge.mockReset()
    mockRevokeOfficeGuestBadgeForRequest.mockReset()
    mockEnsureOfficeMeetingThreadChannel.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockUpsertOfficeGuestBadge.mockResolvedValue({ id: 'badge-1' })
    mockEnsureOfficeMeetingThreadChannel.mockResolvedValue({ id: 'thread-1' })
  })

  it('expires stale requests before applying a host action', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ zone_id: 'zone-1', message: null })
      .mockResolvedValueOnce({
        id: 'request-1',
        office_id: 'office-1',
        notification_ids: ['notification-1'],
        zone_id: 'zone-1',
        zone_name: 'Lobby',
        zone_slug: 'lobby',
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        message: [
          'Can we review blockers?',
          'Intake:',
          'What should we review first?: Launch blockers'
        ].join('\n')
      })
      .mockResolvedValueOnce({ id: 'meeting-1' })

    const response = await handler(fakeEvent({ status: 'accepted' }))

    expect(response.request.id).toBe('request-1')
    expect(response.meetingSessionId).toBe('meeting-1')
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockExpireStaleOfficeLobbyRequests).toHaveBeenCalledWith('office-1', 'request-1')
    expect(mockQueryOne).toHaveBeenCalledAfter(mockExpireStaleOfficeLobbyRequests)
    expect(mockMarkOfficeLobbyNotificationsRead).toHaveBeenCalledWith(['notification-1'])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'lobby_request.accepted',
      targetType: 'office_lobby_request',
      targetId: 'request-1'
    }))
    expect(mockUpsertOfficeGuestBadge).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      allowedZoneId: 'zone-1',
      createdBy: 'admin-1'
    }))
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(mockQueryOne.mock.calls[2][0]).toContain('INSERT INTO office_meeting_sessions')
    expect(mockCreateMeetingPlaceholderArtifacts).toHaveBeenCalledWith({
      meetingSessionId: 'meeting-1',
      title: 'Guest in Lobby',
      notesContent: 'Guest: guest@example.com',
      summaryContent: 'Waiting for Guest\'s guest session to produce a meeting summary.',
      actionItemsContent: 'Action items for Guest\'s guest session will appear after notes are captured.',
      metadata: {
        status: 'placeholder',
        source: 'lobby_request',
        guest_emails: ['guest@example.com'],
        participant_handles: ['user:admin-1', 'client:request-1']
      },
      createdBy: 'admin-1'
    })
    expect(mockCreateMeetingGuestIntakeArtifact).toHaveBeenCalledWith({
      meetingSessionId: 'meeting-1',
      title: 'Guest in Lobby',
      lobbyRequestId: 'request-1',
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      note: 'Can we review blockers?',
      intakeAnswers: [
        {
          label: 'What should we review first?',
          value: 'Launch blockers'
        }
      ],
      createdBy: 'admin-1'
    })
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.created',
      targetType: 'office_meeting_session',
      targetId: 'meeting-1',
      metadata: expect.objectContaining({
        source: 'lobby_request',
        lobby_request_id: 'request-1',
        guest_email: 'guest@example.com',
        guest_count: 1,
        zone_id: 'zone-1'
      })
    }))
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.guest_intake_captured',
      targetType: 'office_meeting_session',
      targetId: 'meeting-1',
      metadata: expect.objectContaining({
        source: 'lobby_request_accepted',
        lobby_request_id: 'request-1',
        guest_email: 'guest@example.com',
        guest_name: 'Guest',
        intake_count: 1,
        has_guest_note: true
      })
    }))
    expect(mockEnsureOfficeMeetingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'admin-1'
    })
    const threadCall = mockQueryOne.mock.calls.at(-1)
    expect(threadCall?.[0]).toContain('INSERT INTO chat_messages')
    expect(threadCall?.[1]).toEqual([
      'thread-1',
      'admin-1',
      [
        'Guest admitted: Guest',
        'guest@example.com',
        'Room: Lobby'
      ].join('\n'),
      expect.any(String)
    ])
    expect(JSON.parse(String((threadCall?.[1] as unknown[])?.[3]))).toEqual({
      source: 'office_lobby_request',
      event: 'guest_accepted',
      meeting_id: 'meeting-1',
      lobby_request_id: 'request-1',
      guest_email: 'guest@example.com',
      guest_name: 'Guest',
      zone_id: 'zone-1',
      accepted_at: expect.any(String)
    })
  })

  it('creates planned scheduled meeting sessions for scheduled lobby requests', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ zone_id: 'zone-1', message: null })
      .mockResolvedValueOnce({
        id: 'request-1',
        office_id: 'office-1',
        notification_ids: [],
        zone_id: 'zone-1',
        lobby_id: 'lobby-1',
        zone_name: 'Sales Room',
        zone_slug: 'sales',
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        scheduled_start_at: '2026-05-25T01:00:00.000Z'
      })
      .mockResolvedValueOnce({ id: 'meeting-1' })

    const response = await handler(fakeEvent({ status: 'accepted' }))

    expect(response.meetingSessionId).toBe('meeting-1')

    expect(mockQueryOne.mock.calls[2][1]).toEqual([
      'office-1',
      'zone-1',
      'request-1',
      'lobby-1',
      'scheduled',
      'planned',
      'Guest in Sales Room',
      ['user:admin-1', 'client:request-1'],
      ['guest@example.com'],
      JSON.stringify({ ai_notes: false, recording: false, transcript: false }),
      '2026-05-25T01:00:00.000Z',
      'admin-1'
    ])
    expect(mockCreateMeetingPlaceholderArtifacts).toHaveBeenCalledWith({
      meetingSessionId: 'meeting-1',
      title: 'Guest in Sales Room',
      notesContent: 'Guest: guest@example.com',
      summaryContent: 'Waiting for Guest\'s guest session to produce a meeting summary.',
      actionItemsContent: 'Action items for Guest\'s guest session will appear after notes are captured.',
      metadata: {
        status: 'placeholder',
        source: 'lobby_request',
        guest_emails: ['guest@example.com'],
        participant_handles: ['user:admin-1', 'client:request-1']
      },
      createdBy: 'admin-1'
    })
  })

  it('attaches accepted guests to the invited planned meeting when the request includes a meeting id', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        zone_id: 'zone-1',
        message: 'Joining Client Review\nMeeting ID: 11111111-1111-4111-8111-111111111111'
      })
      .mockResolvedValueOnce({
        id: 'request-1',
        office_id: 'office-1',
        notification_ids: [],
        zone_id: 'zone-1',
        lobby_id: null,
        zone_name: 'Meeting Room A',
        zone_slug: 'meeting-room-a',
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        scheduled_start_at: '2026-05-25T01:00:00.000Z',
        message: [
          'Joining Client Review',
          'Intake:',
          'What should we review first?: Creative status',
          'Meeting ID: 11111111-1111-4111-8111-111111111111'
        ].join('\n')
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        zone_id: 'zone-1'
      })

    const response = await handler(fakeEvent({ status: 'accepted' }))

    expect(mockQueryOne.mock.calls[2][0]).toContain('UPDATE office_meeting_sessions')
    expect(response.meetingSessionId).toBe('11111111-1111-4111-8111-111111111111')
    expect(mockQueryOne.mock.calls[2][1]).toEqual([
      ['guest@example.com'],
      ['user:admin-1', 'client:request-1'],
      'zone-1',
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(mockQueryOne.mock.calls[2][0]).not.toContain('INSERT INTO office_meeting_sessions')
    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockCreateMeetingGuestIntakeArtifact).toHaveBeenCalledWith({
      meetingSessionId: '11111111-1111-4111-8111-111111111111',
      title: 'Client Review',
      lobbyRequestId: 'request-1',
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      note: '',
      intakeAnswers: [
        {
          label: 'What should we review first?',
          value: 'Creative status'
        }
      ],
      createdBy: 'admin-1'
    })
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.updated',
      targetType: 'office_meeting_session',
      targetId: '11111111-1111-4111-8111-111111111111',
      metadata: expect.objectContaining({
        source: 'lobby_request_accepted',
        lobby_request_id: 'request-1',
        guest_email: 'guest@example.com',
        guest_count: 1,
        zone_id: 'zone-1'
      })
    }))
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.guest_intake_captured',
      targetType: 'office_meeting_session',
      targetId: '11111111-1111-4111-8111-111111111111',
      metadata: expect.objectContaining({
        source: 'lobby_request_accepted',
        lobby_request_id: 'request-1',
        guest_email: 'guest@example.com',
        guest_name: 'Guest',
        intake_count: 1,
        has_guest_note: false
      })
    }))
  })

  it('issues invited guest badges for the attached meeting room when the request has no room', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        zone_id: null,
        message: 'Joining Client Review\nMeeting ID: 11111111-1111-4111-8111-111111111111'
      })
      .mockResolvedValueOnce({ zone_id: 'meeting-zone-1' })
      .mockResolvedValueOnce({
        id: 'request-1',
        office_id: 'office-1',
        notification_ids: [],
        zone_id: null,
        lobby_id: null,
        zone_name: null,
        zone_slug: null,
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        scheduled_start_at: '2026-05-25T01:00:00.000Z',
        message: 'Joining Client Review\nMeeting ID: 11111111-1111-4111-8111-111111111111'
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        zone_id: 'meeting-zone-1'
      })
      .mockResolvedValueOnce({
        id: 'request-1',
        zone_name: 'Meeting Room D',
        zone_slug: 'meeting-room-d'
      })

    const response = await handler(fakeEvent({ status: 'accepted' }))

    expect(response.meetingSessionId).toBe('11111111-1111-4111-8111-111111111111')
    expect(response.request).toMatchObject({
      zone_id: 'meeting-zone-1',
      zone_name: 'Meeting Room D',
      zone_slug: 'meeting-room-d'
    })
    expect(mockQueryOne.mock.calls[3][1]).toEqual([
      ['guest@example.com'],
      ['user:admin-1', 'client:request-1'],
      null,
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(mockQueryOne.mock.calls[4][0]).toContain('UPDATE office_lobby_requests')
    expect(mockQueryOne.mock.calls[4][0]).toContain('zone_name')
    expect(mockQueryOne.mock.calls[4][0]).toContain('zone_slug')
    expect(mockQueryOne.mock.calls[4][1]).toEqual(['meeting-zone-1', 'request-1', 'office-1'])
    expect(mockUpsertOfficeGuestBadge).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      allowedZoneId: 'meeting-zone-1',
      createdBy: 'admin-1'
    }))
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.updated',
      targetId: '11111111-1111-4111-8111-111111111111',
      metadata: expect.objectContaining({
        zone_id: 'meeting-zone-1'
      })
    }))
  })

  it('rejects accepted guest requests without a resolved room', async () => {
    mockQueryOne.mockResolvedValueOnce({
      zone_id: null,
      message: 'Waiting for host'
    })

    await expect(handler(fakeEvent({ status: 'accepted' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Accepted guest requests require an approved room'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockMarkOfficeLobbyNotificationsRead).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
    expect(mockUpsertOfficeGuestBadge).not.toHaveBeenCalled()
  })

  it('ends lobby-derived meeting sessions when accepted guest access is expired', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'request-1',
        office_id: 'office-1',
        notification_ids: [],
        zone_id: 'zone-1',
        zone_name: 'Meeting Room',
        zone_slug: 'meeting-room',
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        scheduled_start_at: null
      })
      .mockResolvedValueOnce({ id: 'meeting-1' })

    const response = await handler(fakeEvent({ status: 'expired' }))

    expect(response.request.id).toBe('request-1')
    expect(mockRevokeOfficeGuestBadgeForRequest).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      revokedBy: 'admin-1',
      status: 'expired'
    }))
    expect(mockQueryOne.mock.calls[1][0]).toContain('UPDATE office_meeting_sessions')
    expect(mockQueryOne.mock.calls[1][0]).toContain('lobby_request_id = $2')
    expect(mockQueryOne.mock.calls[1][1]).toEqual(['office-1', 'request-1'])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'meeting.ended',
      targetType: 'office_meeting_session',
      targetId: 'meeting-1',
      metadata: expect.objectContaining({
        source: 'lobby_request_expired',
        lobby_request_id: 'request-1',
        guest_email: 'guest@example.com'
      })
    }))
  })
})
