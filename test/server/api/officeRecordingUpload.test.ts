import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  multipart?: Array<{ name?: string, filename?: string, type?: string, data: Buffer }>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readMultipartFormData: (event: TestEvent) => Promise<TestEvent['multipart']>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readMultipartFormData = async event => event.multipart ?? []
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
const mockAttachReadyRecordingArtifact = vi.fn()
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockGenerateOfficeRecordingShareToken = vi.fn()
const mockGetOfficeSettings = vi.fn()
const mockIsPublicRecordingAccess = vi.fn()
const mockUploadFile = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
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

vi.mock('~~/server/utils/storage', () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/recordings/[recordingId]/upload.post'
)

function fakeEvent(multipart: TestEvent['multipart'] = [
  { name: 'file', filename: 'capture.webm', type: 'video/webm', data: Buffer.from('webm') },
  { name: 'durationSeconds', data: Buffer.from('42') }
]) {
  return {
    context: { params: { officeId: 'office-1', recordingId: 'recording-1' } },
    multipart
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/recordings/:recordingId/upload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T08:00:00.000Z'))
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockAttachReadyRecordingArtifact.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()
    mockGenerateOfficeRecordingShareToken.mockReset()
    mockGetOfficeSettings.mockReset()
    mockIsPublicRecordingAccess.mockReset()
    mockUploadFile.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockAttachReadyRecordingArtifact.mockResolvedValue(undefined)
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
    mockGenerateOfficeRecordingShareToken.mockReturnValue('share-token-1')
    mockGetOfficeSettings.mockResolvedValue({
      recording_enabled: true,
      public_recording_links_enabled: true
    })
    mockIsPublicRecordingAccess.mockImplementation((access: string) => access === 'public' || access === 'password')
    mockUploadFile.mockResolvedValue({ key: 'key', url: '/api/_uploads/key', size: 4 })
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
  })

  it('uploads media and marks the recording ready', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'workspace',
        share_token: null,
        meeting_session_id: null
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'ready',
        access: 'workspace',
        share_token: null,
        storage_key: 'office-recordings/office-1/recording-1/1779696000000-capture.webm',
        duration_seconds: 42,
        meeting_session_id: null
      })

    const result = await handler(fakeEvent())

    expect(result.recording).toMatchObject({ id: 'recording-1', status: 'ready', duration_seconds: 42 })
    expect(mockUploadFile).toHaveBeenCalledWith(
      Buffer.from('webm'),
      'office-recordings/office-1/recording-1/1779696000000-capture.webm',
      'video/webm',
      expect.objectContaining({ officeId: 'office-1', recordingId: 'recording-1', uploadedBy: 'user-1' })
    )
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'recording-1',
      'office-1',
      'office-recordings/office-1/recording-1/1779696000000-capture.webm',
      42,
      null
    ])
    expect(mockGenerateOfficeRecordingShareToken).not.toHaveBeenCalled()
    expect(mockAttachReadyRecordingArtifact).toHaveBeenCalledWith(expect.objectContaining({
      id: 'recording-1',
      status: 'ready'
    }), 'user-1')
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'recording.media_attached',
      metadata: expect.objectContaining({ durationSeconds: 42, publicLink: false })
    }))
  })

  it('creates a share token when attaching media to a public recording', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'public',
        share_token: null,
        meeting_session_id: null
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'ready',
        access: 'public',
        share_token: 'share-token-1',
        duration_seconds: 42,
        meeting_session_id: null
      })

    await handler(fakeEvent())

    expect(mockGenerateOfficeRecordingShareToken).toHaveBeenCalledOnce()
    expect(mockQueryOne.mock.calls[2]?.[1][4]).toBe('share-token-1')
  })

  it('creates a share token when attaching media to a password-protected recording', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'password',
        share_token: null,
        meeting_session_id: null
      })
      .mockResolvedValueOnce({
        id: 'recording-1',
        status: 'ready',
        access: 'password',
        share_token: 'share-token-1',
        duration_seconds: 42,
        meeting_session_id: null
      })

    await handler(fakeEvent())

    expect(mockGenerateOfficeRecordingShareToken).toHaveBeenCalledOnce()
    expect(mockQueryOne.mock.calls[2]?.[1][4]).toBe('share-token-1')
  })

  it('rejects unsupported media types', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        status: 'draft',
        access: 'workspace',
        share_token: null,
        meeting_session_id: null
      })

    await expect(handler(fakeEvent([
      { name: 'file', filename: 'capture.txt', type: 'text/plain', data: Buffer.from('no') }
    ]))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Recording media must be WebM, MP4, or QuickTime video'
    })
    expect(mockUploadFile).not.toHaveBeenCalled()
  })
})
