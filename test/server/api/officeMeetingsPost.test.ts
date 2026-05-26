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
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()
const mockCreateMeetingPlaceholderArtifacts = vi.fn()
const mockMeetingArtifactTemplate = vi.fn()
const mockGetOfficeSettings = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args)
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  createMeetingPlaceholderArtifacts: (...args: unknown[]) => mockCreateMeetingPlaceholderArtifacts(...args),
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args),
  meetingArtifactTemplate: (...args: unknown[]) => mockMeetingArtifactTemplate(...args)
}))

vi.mock('~~/server/utils/officeSettings', () => ({
  getOfficeSettings: (...args: unknown[]) => mockGetOfficeSettings(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/meetings', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockCreateMeetingPlaceholderArtifacts.mockReset()
    mockMeetingArtifactTemplate.mockReset()
    mockGetOfficeSettings.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficeLobbyRequestsTable.mockResolvedValue(undefined)
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
    mockMeetingArtifactTemplate.mockReturnValue({
      summaryContent: 'Typed summary template',
      actionItemsContent: 'Typed action template'
    })
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
    mockGetOfficeSettings.mockResolvedValue({
      ai_notes_enabled: true,
      recording_enabled: true,
      default_meeting_retention_days: 90
    })
  })

  it('creates a session with setup metadata and placeholder artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        office_id: 'office-1',
        title: 'Client review'
      })

    const result = await handler(fakeEvent({
      title: 'Client review',
      zone_id: '11111111-1111-4111-8111-111111111111',
      meeting_type: 'client_review',
      context: 'Review Q2 media performance.',
      intake_prompt: 'What should we cover first?',
      scheduled_start_at: '2026-05-26T01:30:00.000Z',
      duration_minutes: 45,
      guest_emails: ['Client@Example.com ', 'client@example.com'],
      consent: { ai_notes: true, recording: false, transcript: true }
    }))

    expect(result.session.id).toBe('meeting-1')
    expect(mockQueryOne).toHaveBeenCalledTimes(3)

    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('zone_type <> \'desk\'')
    const insertSessionCall = mockQueryOne.mock.calls[2]
    expect(insertSessionCall[1][8]).toEqual(['client@example.com'])
    expect(JSON.parse(insertSessionCall[1][9] as string)).toMatchObject({
      ai_notes: true,
      recording: false,
      transcript: true,
      setup: {
        meeting_type: 'client_review',
        context: 'Review Q2 media performance.',
        intake_prompt: 'What should we cover first?',
        scheduled_start_at: '2026-05-26T01:30:00.000Z',
        duration_minutes: 45
      }
    })

    expect(mockCreateMeetingPlaceholderArtifacts).toHaveBeenCalledWith({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      notesContent: 'Review Q2 media performance.',
      summaryContent: 'Typed summary template',
      actionItemsContent: 'Typed action template',
      metadata: {
        status: 'placeholder',
        meeting_type: 'client_review',
        guest_emails: ['client@example.com'],
        participant_handles: []
      },
      createdBy: 'user-1'
    })
    expect(mockMeetingArtifactTemplate).toHaveBeenCalledWith('client_review')
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'user-1',
      action: 'meeting.created',
      targetType: 'office_meeting_session',
      targetId: 'meeting-1',
      metadata: expect.objectContaining({
        title: 'Client review',
        meeting_type: 'client_review',
        intake_prompt: 'What should we cover first?',
        scheduled_start_at: '2026-05-26T01:30:00.000Z',
        duration_minutes: 45,
        guest_count: 1
      })
    }))
  })

  it('stamps started_at when creating a live meeting without a client timestamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T04:15:00.000Z'))

    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({
        id: 'meeting-live',
        office_id: 'office-1',
        status: 'live',
        title: 'Live room'
      })

    await handler(fakeEvent({
      title: 'Live room',
      zone_id: '11111111-1111-4111-8111-111111111111',
      status: 'live'
    }))

    const insertSessionCall = mockQueryOne.mock.calls[2]
    expect(insertSessionCall[1][11]).toBe('2026-05-25T04:15:00.000Z')
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        status: 'live',
        started_at: '2026-05-25T04:15:00.000Z'
      })
    }))
  })

  it('persists scheduled meetings with scheduled source metadata', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'meeting-scheduled', office_id: 'office-1', title: 'Scheduled review' })

    await handler(fakeEvent({
      title: 'Scheduled review',
      source: 'scheduled',
      scheduled_start_at: '2026-05-27T00:00:00.000Z',
      duration_minutes: 60,
      create_placeholders: false
    }))

    const insertSessionCall = mockQueryOne.mock.calls[1]
    expect(insertSessionCall[1][4]).toBe('scheduled')
    expect(JSON.parse(insertSessionCall[1][9] as string)).toMatchObject({
      setup: {
        scheduled_start_at: '2026-05-27T00:00:00.000Z',
        duration_minutes: 60
      }
    })
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.created',
      metadata: expect.objectContaining({
        source: 'scheduled',
        scheduled_start_at: '2026-05-27T00:00:00.000Z',
        duration_minutes: 60
      })
    }))
  })

  it('validates lobby request and lobby ownership before linking a meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'request-1' })
      .mockResolvedValueOnce({ id: 'lobby-1' })
      .mockResolvedValueOnce({ id: 'meeting-1', office_id: 'office-1', title: 'Scheduled lobby review' })

    await handler(fakeEvent({
      title: 'Scheduled lobby review',
      source: 'scheduled',
      lobby_request_id: '11111111-1111-4111-8111-111111111111',
      lobby_id: '22222222-2222-4222-8222-222222222222',
      create_placeholders: false
    }))

    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('FROM office_lobby_requests')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('FROM office_lobbies')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      '22222222-2222-4222-8222-222222222222',
      'office-1'
    ])
    expect(mockQueryOne.mock.calls[3]?.[1][2]).toBe('11111111-1111-4111-8111-111111111111')
    expect(mockQueryOne.mock.calls[3]?.[1][3]).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('rejects lobby requests outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      title: 'Bad lobby request',
      lobby_request_id: '11111111-1111-4111-8111-111111111111'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Lobby request not found'
    })

    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects lobbies outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      title: 'Bad lobby',
      lobby_id: '22222222-2222-4222-8222-222222222222'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Lobby not found'
    })

    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('does not create placeholders when disabled by the caller', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'meeting-1', office_id: 'office-1', title: 'Drop-in' })

    await handler(fakeEvent({
      title: 'Drop-in',
      create_placeholders: false
    }))

    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.created',
      metadata: expect.objectContaining({ create_placeholders: false })
    }))
  })

  it('rejects a room outside the office or a desk zone', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      title: 'Bad room',
      zone_id: '11111111-1111-4111-8111-111111111111'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting room not found'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects live meetings without a room', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })

    await expect(handler(fakeEvent({
      title: 'Live room',
      status: 'live'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Live meetings require a room'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects invalid meeting duration', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })

    await expect(handler(fakeEvent({
      title: 'Too short',
      duration_minutes: 5
    }))).rejects.toThrow()

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockCreateMeetingPlaceholderArtifacts).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
