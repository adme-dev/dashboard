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
const mockSendOfficeMeetingInviteEmail = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockEnsureOfficeMeetingThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  sendOfficeMeetingInviteEmail: (...args: unknown[]) => mockSendOfficeMeetingInviteEmail(...args)
}))

// getAppUrl moved to its own module; the handler imports it from there. Mock it to a
// stable app domain so the invite-domain check and canonical URL building are deterministic.
vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.example.com'
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeMeetingThreadChannel: (...args: unknown[]) => mockEnsureOfficeMeetingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/invite.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/meetings/:meetingId/invite', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockSendOfficeMeetingInviteEmail.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockEnsureOfficeMeetingThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockSendOfficeMeetingInviteEmail.mockResolvedValue(undefined)
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingThreadChannel.mockResolvedValue({ id: 'channel-1' })
  })

  it('sends meeting lobby invites to meeting guests', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: 'zone-1',
        guest_emails: ['Client@Example.com ', 'client@example.com', 'lead@example.com'],
        consent: {
          setup: {
            scheduled_start_at: '2026-05-26T02:00:00.000Z',
            duration_minutes: 45,
            intake_prompt: 'What should we review first?'
          }
        },
        zone_name: 'Meeting Room A',
        zone_slug: 'meeting-room-a'
      })
      .mockResolvedValueOnce({ id: 'meeting-1' })

    const result = await handler(fakeEvent({
      invite_url: '/l/client-review?meeting=meeting-1',
      note: 'Bring launch questions.'
    }))

    expect(result).toMatchObject({ invited: 2 })
    expect(typeof result.invitedAt).toBe('string')
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(mockSendOfficeMeetingInviteEmail).toHaveBeenCalledTimes(2)
    expect(mockSendOfficeMeetingInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'client@example.com',
      meetingTitle: 'Client Review',
      inviteUrl: 'https://app.example.com/l/client-review?meeting=meeting-1',
      roomName: 'Meeting Room A',
      note: 'Bring launch questions.'
    }), expect.any(Object))
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'user-1',
      action: 'meeting.invites_sent',
      targetType: 'office_meeting_session',
      targetId: 'meeting-1',
      metadata: {
        guest_count: 2,
        invite_url: 'https://app.example.com/l/client-review?meeting=meeting-1',
        intake_prompt: 'What should we review first?',
        sent_at: result.invitedAt
      }
    }))
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('invite_delivery')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'meeting-1',
      'office-1',
      JSON.stringify({
        status: 'sent',
        sent_at: result.invitedAt,
        recipients: ['client@example.com', 'lead@example.com'],
        guest_count: 2,
        invite_url: 'https://app.example.com/l/client-review?meeting=meeting-1',
        intake_prompt: 'What should we review first?',
        sent_by: 'user-1'
      })
    ])
    expect(mockEnsureOfficeMeetingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'channel-1',
      'user-1',
      [
        'Sent guest invites: Client Review',
        '2 guests invited',
        'client@example.com, lead@example.com',
        'https://app.example.com/l/client-review?meeting=meeting-1'
      ].join('\n'),
      JSON.stringify({
        source: 'office_meeting_invites',
        meeting_id: 'meeting-1',
        guest_count: 2,
        invite_url: 'https://app.example.com/l/client-review?meeting=meeting-1',
        sent_at: result.invitedAt
      })
    ])
  })

  it('rejects recipients outside the meeting guest list', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: 'zone-1',
        guest_emails: ['client@example.com'],
        consent: {},
        zone_name: null,
        zone_slug: null
      })

    await expect(handler(fakeEvent({
      invite_url: 'https://app.example.com/l/client-review?meeting=meeting-1',
      recipients: ['other@example.com']
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Recipients must belong to this meeting guest list'
    })
    expect(mockSendOfficeMeetingInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects invite URLs that do not point to this meeting', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: 'zone-1',
        guest_emails: ['client@example.com'],
        consent: {},
        zone_name: null,
        zone_slug: null
      })

    await expect(handler(fakeEvent({
      invite_url: 'https://app.example.com/l/client-review?meeting=other-meeting'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invite URL must point to this meeting'
    })

    expect(mockSendOfficeMeetingInviteEmail).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
    expect(mockEnsureOfficeLobbiesTable).not.toHaveBeenCalled()
  })

  it('rejects invite URLs without a meeting parameter', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: 'zone-1',
        guest_emails: ['client@example.com'],
        consent: {},
        zone_name: null,
        zone_slug: null
      })

    await expect(handler(fakeEvent({
      invite_url: '/l/client-review'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invite URL must point to this meeting'
    })

    expect(mockSendOfficeMeetingInviteEmail).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects invite URLs on another domain', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: 'zone-1',
        guest_emails: ['client@example.com'],
        consent: {},
        zone_name: null,
        zone_slug: null
      })

    await expect(handler(fakeEvent({
      invite_url: 'https://evil.example.com/l/client-review?meeting=meeting-1'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invite URL must use this app domain'
    })

    expect(mockSendOfficeMeetingInviteEmail).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects meetings without guest emails', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Internal Planning',
        zone_id: 'zone-1',
        guest_emails: [],
        consent: {},
        zone_name: null,
        zone_slug: null
      })

    await expect(handler(fakeEvent({
      invite_url: '/l/planning?meeting=meeting-1'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Meeting has no guest emails to invite'
    })
    expect(mockSendOfficeMeetingInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects external invites before a room is assigned', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: null,
        guest_emails: ['client@example.com'],
        consent: {},
        zone_name: null,
        zone_slug: null
      })

    await expect(handler(fakeEvent({
      invite_url: '/l/client-review?meeting=meeting-1'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Assign a room before sending guest invites'
    })
    expect(mockSendOfficeMeetingInviteEmail).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('generates a canonical lobby invite when the client omits invite_url', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'meeting-1',
        title: 'Client Review',
        zone_id: 'zone-1',
        guest_emails: ['client@example.com'],
        consent: {
          setup: {
            scheduled_start_at: '2026-05-26T02:00:00.000Z',
            duration_minutes: 45,
            intake_prompt: 'What should we review first?'
          }
        },
        zone_name: 'Meeting Room A',
        zone_slug: 'meeting-room-a'
      })
      .mockResolvedValueOnce({ handle: 'client-review' })
      .mockResolvedValueOnce({ id: 'meeting-1' })

    const result = await handler(fakeEvent({
      recipients: ['client@example.com']
    }))

    const inviteUrl = 'https://app.example.com/l/client-review?room=meeting-room-a&meeting=meeting-1&title=Client+Review&start=2026-05-26T02%3A00%3A00.000Z&duration=45'

    expect(result).toMatchObject({ invited: 1 })
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalled()
    expect(mockSendOfficeMeetingInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'client@example.com',
      inviteUrl
    }), expect.any(Object))
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual(['office-1', 'zone-1'])
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'meeting-1',
      'office-1',
      JSON.stringify({
        status: 'sent',
        sent_at: result.invitedAt,
        recipients: ['client@example.com'],
        guest_count: 1,
        invite_url: inviteUrl,
        intake_prompt: 'What should we review first?',
        sent_by: 'user-1'
      })
    ])
  })
})
