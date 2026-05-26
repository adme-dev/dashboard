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
const mockHashPassword = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockGenerateOfficeRecordingShareToken = vi.fn()
const mockGetOfficeSettings = vi.fn()
const mockIsPublicRecordingAccess = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()
const mockEnsureOfficeRecordingThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args),
  generateOfficeRecordingShareToken: (...args: unknown[]) => mockGenerateOfficeRecordingShareToken(...args)
}))

vi.mock('~~/server/utils/officeSettings', () => ({
  getOfficeSettings: (...args: unknown[]) => mockGetOfficeSettings(...args),
  isPublicRecordingAccess: (...args: unknown[]) => mockIsPublicRecordingAccess(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeRecordingThreadChannel: (...args: unknown[]) => mockEnsureOfficeRecordingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/recordings.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/recordings', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockHashPassword.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()
    mockGenerateOfficeRecordingShareToken.mockReset()
    mockGetOfficeSettings.mockReset()
    mockIsPublicRecordingAccess.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockEnsureOfficeRecordingThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockHashPassword.mockResolvedValue('hashed-password')
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
    mockGenerateOfficeRecordingShareToken.mockReturnValue('share-token-1')
    mockGetOfficeSettings.mockResolvedValue({
      recording_enabled: true,
      public_recording_links_enabled: true,
      default_recording_retention_days: 180
    })
    mockIsPublicRecordingAccess.mockImplementation((access: string) => access === 'public' || access === 'password')
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
    mockEnsureOfficeRecordingThreadChannel.mockResolvedValue({ id: 'recording-thread-1' })
  })

  it('creates a recording attached to an office meeting session', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        meeting_session_id: '11111111-1111-4111-8111-111111111111',
        title: 'Client walkthrough',
        description: '',
        status: 'draft',
        access: 'workspace',
        retention_days: 180
      })

    const result = await handler(fakeEvent({
      meeting_session_id: '11111111-1111-4111-8111-111111111111',
      title: 'Client walkthrough',
      access: 'workspace'
    }))

    expect(result.recording.id).toBe('recording-1')
    expect(mockQueryOne).toHaveBeenCalledTimes(4)
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('office_meeting_sessions')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(mockQueryOne.mock.calls[2]?.[1][1]).toBe('11111111-1111-4111-8111-111111111111')
    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBeNull()
    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'recording.created',
      metadata: expect.objectContaining({
        meetingSessionId: '11111111-1111-4111-8111-111111111111'
      })
    }))
    expect(mockEnsureOfficeRecordingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      recordingId: 'recording-1',
      actorId: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'recording-thread-1',
      'user-1',
      [
        'Recording created: Client walkthrough',
        'Linked to a meeting session'
      ].join('\n\n'),
      expect.any(String)
    ])
    expect(JSON.parse(String(mockQueryOne.mock.calls[3]?.[1][3]))).toEqual({
      source: 'office_recording',
      event: 'recording_created',
      recording_id: 'recording-1',
      meeting_id: '11111111-1111-4111-8111-111111111111',
      access: 'workspace',
      status: 'draft'
    })
  })

  it('rejects recording attachment to a meeting outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      meeting_session_id: '11111111-1111-4111-8111-111111111111',
      title: 'Client walkthrough'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting session not found'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('requires a password for password-protected links', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })

    await expect(handler(fakeEvent({
      title: 'Client walkthrough',
      access: 'password'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Password links require a password'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('creates password-protected recording drafts with a password hash', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-password',
        office_id: 'office-1',
        meeting_session_id: null,
        title: 'Protected walkthrough',
        access: 'password',
        share_token: null,
        password_hash: 'hashed-password',
        retention_days: 180
      })

    await handler(fakeEvent({
      title: 'Protected walkthrough',
      access: 'password',
      password: 'correct horse battery'
    }))

    expect(mockHashPassword).toHaveBeenCalledWith('correct horse battery')
    expect(mockQueryOne.mock.calls[1]?.[1][13]).toBeNull()
    expect(mockQueryOne.mock.calls[1]?.[1][14]).toBe('hashed-password')
  })

  it('creates standalone recordings without a meeting lookup', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-standalone',
        office_id: 'office-1',
        meeting_session_id: null,
        title: 'Async walkthrough',
        description: '',
        status: 'draft',
        access: 'workspace',
        retention_days: 180
      })

    await handler(fakeEvent({
      title: 'Async walkthrough',
      access: 'workspace'
    }))

    expect(mockQueryOne).toHaveBeenCalledTimes(3)
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('INSERT INTO office_recordings')
    expect(mockQueryOne.mock.calls[1]?.[1][13]).toBeNull()
    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
  })

  it('does not create a share token until a public recording is ready', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-public',
        office_id: 'office-1',
        meeting_session_id: null,
        title: 'Public walkthrough',
        access: 'public',
        share_token: null,
        retention_days: 180
      })

    await handler(fakeEvent({
      title: 'Public walkthrough',
      access: 'public'
    }))

    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
    expect(mockQueryOne.mock.calls[1]?.[1][13]).toBeNull()
  })
})
