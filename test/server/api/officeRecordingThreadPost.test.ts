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

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockEnsureOfficeRecordingThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeRecordingThreadChannel: (...args: unknown[]) => mockEnsureOfficeRecordingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/recordings/[recordingId]/thread.post'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', recordingId: 'recording-1' } }
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/recordings/:recordingId/thread', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()
    mockEnsureOfficeRecordingThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
  })

  it('returns the canonical office recording channel', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
    mockEnsureOfficeRecordingThreadChannel.mockResolvedValue({
      id: 'channel-1',
      slug: 'office-recording-recording-1',
      type: 'office_recording',
      external_id: 'recording-1'
    })

    const result = await handler(fakeEvent())

    expect(result).toMatchObject({
      id: 'channel-1',
      type: 'office_recording',
      external_id: 'recording-1'
    })
    expect(mockEnsureOfficeRecordingsTables).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeRecordingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      recordingId: 'recording-1',
      actorId: 'user-1'
    })
  })

  it('rejects non-members before creating a thread', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })

    expect(mockEnsureOfficeRecordingsTables).not.toHaveBeenCalled()
    expect(mockEnsureOfficeRecordingThreadChannel).not.toHaveBeenCalled()
  })
})
