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

const mockExecute = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockVerifyPassword = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/public/office-recordings/[token]/view.post'
)

function fakeEvent(body: Record<string, unknown> = {}) {
  return {
    context: { params: { token: 'token-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/public/office-recordings/:token/view', () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()
    mockVerifyPassword.mockReset()
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
    mockVerifyPassword.mockResolvedValue(true)
  })

  it('records a view for ready shared recordings', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 600, access: 'public', password_hash: null })
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      viewerEmail: 'Client@Example.com',
      percentWatched: 42,
      watchedSeconds: 120
    }))

    expect(result).toEqual({ ok: true })
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('status = \'ready\'')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('access IN (\'public\', \'password\')')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('storage_key IS NOT NULL')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['recording-1', 'client@example.com', null, 42, 120])
    expect(mockExecute.mock.calls[1]?.[1]).toEqual(['recording-1'])
  })

  it('records progress without incrementing the public view count', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 600, access: 'public', password_hash: null })
      .mockResolvedValueOnce(null)
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      viewerEmail: 'client@example.com',
      percentWatched: 75,
      watchedSeconds: 420,
      countView: false
    }))

    expect(result).toEqual({ ok: true })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['recording-1', 'client@example.com', null, 75, 420])
  })

  it('updates existing identified progress rows instead of inserting duplicates', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 600, access: 'public', password_hash: null })
      .mockResolvedValueOnce({ id: 'view-1' })
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      viewerEmail: 'Client@Example.com',
      percentWatched: 80,
      watchedSeconds: 500,
      countView: false
    }))

    expect(result).toEqual({ ok: true })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('lower(viewer_email)')
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('viewer_key')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual(['recording-1', 'client@example.com', null])
    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('UPDATE office_recording_views')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['view-1', 80, 500])
  })

  it('dedupes anonymous progress rows by viewer id', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 600, access: 'public', password_hash: null })
      .mockResolvedValueOnce({ id: 'view-anon-1' })
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      viewerId: 'viewer-123456',
      percentWatched: 60,
      watchedSeconds: 360,
      countView: false
    }))

    expect(result).toEqual({ ok: true })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual(['recording-1', null, 'viewer-123456'])
    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('UPDATE office_recording_views')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['view-anon-1', 60, 360])
  })

  it('stores anonymous viewer id when there is no email', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 600, access: 'public', password_hash: null })
      .mockResolvedValueOnce(null)
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      viewerId: 'viewer-123456',
      percentWatched: 20,
      watchedSeconds: 120,
      countView: false
    }))

    expect(result).toEqual({ ok: true })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['recording-1', null, 'viewer-123456', 20, 120])
  })

  it('clamps malformed progress into valid analytics ranges', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 300, access: 'public', password_hash: null })
      .mockResolvedValueOnce(null)
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      viewerEmail: 'client@example.com',
      percentWatched: 130,
      watchedSeconds: 999,
      countView: false
    }))

    expect(result).toEqual({ ok: true })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['recording-1', 'client@example.com', null, 100, 300])
  })

  it('does not record views for unavailable recordings', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Recording not found'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('records progress for password protected recordings after verification', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'recording-1', duration_seconds: 600, access: 'password', password_hash: 'hashed-password' })
      .mockResolvedValueOnce(null)
    mockExecute.mockResolvedValue(undefined)

    const result = await handler(fakeEvent({
      password: 'correct horse battery',
      viewerEmail: 'client@example.com',
      percentWatched: 50,
      watchedSeconds: 300,
      countView: false
    }))

    expect(result).toEqual({ ok: true })
    expect(mockVerifyPassword).toHaveBeenCalledWith('correct horse battery', 'hashed-password')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['recording-1', 'client@example.com', null, 50, 300])
  })

  it('rejects password protected view progress without a valid password', async () => {
    mockVerifyPassword.mockResolvedValueOnce(false)
    mockQueryOne.mockResolvedValueOnce({
      id: 'recording-1',
      duration_seconds: 600,
      access: 'password',
      password_hash: 'hashed-password'
    })

    await expect(handler(fakeEvent({
      password: 'wrong-password',
      percentWatched: 50,
      watchedSeconds: 300
    }))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Recording password required'
    })

    expect(mockExecute).not.toHaveBeenCalled()
  })
})
