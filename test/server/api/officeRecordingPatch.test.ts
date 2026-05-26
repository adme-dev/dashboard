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
const mockAttachReadyRecordingArtifact = vi.fn()
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockGenerateOfficeRecordingShareToken = vi.fn()
const mockGetOfficeSettings = vi.fn()
const mockIsPublicRecordingAccess = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRecordingArtifacts', () => ({
  attachReadyRecordingArtifact: (...args: unknown[]) => mockAttachReadyRecordingArtifact(...args)
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

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/recordings/[recordingId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', recordingId: 'recording-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/recordings/:recordingId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockHashPassword.mockReset()
    mockQueryOne.mockReset()
    mockAttachReadyRecordingArtifact.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()
    mockGenerateOfficeRecordingShareToken.mockReset()
    mockGetOfficeSettings.mockReset()
    mockIsPublicRecordingAccess.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockHashPassword.mockResolvedValue('hashed-password')
    mockAttachReadyRecordingArtifact.mockResolvedValue(undefined)
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
    mockGenerateOfficeRecordingShareToken.mockReturnValue('new-share-token')
    mockGetOfficeSettings.mockResolvedValue({
      recording_enabled: true,
      public_recording_links_enabled: true
    })
    mockIsPublicRecordingAccess.mockImplementation((access: string) => access === 'public' || access === 'password')
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
  })

  it('promotes a draft recording to a public ready recording', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'workspace',
        storage_key: 'office-recordings/recording.webm',
        share_token: null,
        meeting_session_id: 'meeting-1'
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        title: 'Client walkthrough',
        description: '',
        status: 'ready',
        access: 'public',
        storage_key: 'office-recordings/recording.webm',
        share_token: 'new-share-token',
        meeting_session_id: 'meeting-1',
        summary: 'Client walkthrough summary',
        duration_seconds: 120,
        retention_days: 180
      })

    const result = await handler(fakeEvent({
      status: 'ready',
      access: 'public',
      summary: 'Client walkthrough summary'
    }))

    expect(result.recording).toMatchObject({ id: 'recording-1', status: 'ready', access: 'public' })
    expect(mockGenerateOfficeRecordingShareToken).toHaveBeenCalled()
    expect(mockQueryOne.mock.calls[2]?.[1][4]).toBe('ready')
    expect(mockQueryOne.mock.calls[2]?.[1][5]).toBe('public')
    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBe('new-share-token')
    expect(mockAttachReadyRecordingArtifact).toHaveBeenCalledWith(expect.objectContaining({
      id: 'recording-1',
      status: 'ready',
      access: 'public',
      share_token: 'new-share-token'
    }), 'user-1')
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'recording.updated',
      metadata: expect.objectContaining({ status: 'ready', access: 'public', publicLink: true })
    }))
  })

  it('removes the share token when access is changed to private', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'ready',
        access: 'public',
        share_token: 'old-token'
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'ready',
        access: 'private',
        share_token: null,
        retention_days: 180
      })

    await handler(fakeEvent({ access: 'private' }))

    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBeNull()
    expect(mockQueryOne.mock.calls[2]?.[1][14]).toBe(true)
    expect(mockQueryOne.mock.calls[2]?.[1][15]).toBeNull()
  })

  it('removes the share token when access is changed to workspace', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'ready',
        access: 'public',
        share_token: 'old-token'
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'ready',
        access: 'workspace',
        share_token: null,
        retention_days: 180
      })

    await handler(fakeEvent({ access: 'workspace' }))

    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBeNull()
    expect(mockQueryOne.mock.calls[2]?.[1][14]).toBe(true)
    expect(mockQueryOne.mock.calls[2]?.[1][15]).toBeNull()
  })

  it('promotes a ready recording to a password-protected link', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'ready',
        access: 'workspace',
        storage_key: 'office-recordings/recording.webm',
        share_token: null,
        password_hash: null
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'ready',
        access: 'password',
        share_token: 'new-share-token',
        password_hash: 'hashed-password',
        retention_days: 180
      })

    await handler(fakeEvent({
      access: 'password',
      password: 'correct horse battery'
    }))

    expect(mockHashPassword).toHaveBeenCalledWith('correct horse battery')
    expect(mockGenerateOfficeRecordingShareToken).toHaveBeenCalled()
    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBe('new-share-token')
    expect(mockQueryOne.mock.calls[2]?.[1][14]).toBe(true)
    expect(mockQueryOne.mock.calls[2]?.[1][15]).toBe('hashed-password')
  })

  it('rejects password links without an existing hash or submitted password', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'ready',
        access: 'workspace',
        storage_key: 'office-recordings/recording.webm',
        share_token: null,
        password_hash: null
      })

    await expect(handler(fakeEvent({ access: 'password' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Password links require a password'
    })

    expect(mockHashPassword).not.toHaveBeenCalled()
    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
  })

  it('does not create a share token when a public recording is not ready', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'workspace',
        share_token: null
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'draft',
        access: 'public',
        share_token: null,
        retention_days: 180
      })

    await handler(fakeEvent({ access: 'public' }))

    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBeNull()
  })

  it('rejects a public ready recording without attached media', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'workspace',
        storage_key: null,
        share_token: null
      })

    await expect(handler(fakeEvent({
      status: 'ready',
      access: 'public'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Attach recording media before enabling a public link'
    })

    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('audits archived recordings separately', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'ready',
        access: 'workspace',
        share_token: 'share-token'
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'archived',
        access: 'workspace',
        share_token: null,
        retention_days: 180
      })

    await handler(fakeEvent({ status: 'archived' }))

    expect(mockQueryOne.mock.calls[2]?.[1][13]).toBeNull()
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'recording.archived'
    }))
  })

  it('rejects public links when disabled for the office', async () => {
    mockGetOfficeSettings.mockResolvedValueOnce({
      recording_enabled: true,
      public_recording_links_enabled: false
    })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'workspace',
        share_token: null
      })

    await expect(handler(fakeEvent({ access: 'public' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Public recording links are disabled for this office'
    })
  })
})
