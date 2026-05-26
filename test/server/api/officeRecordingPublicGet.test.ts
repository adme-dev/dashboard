import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  query?: Record<string, string>
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  getHeader: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
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
const mockEnsureOfficeRecordingsTables = vi.fn()
const mockResolveOfficeRecordingAssetUrl = vi.fn()
const mockVerifyPassword = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

vi.mock('~~/server/utils/officeRecordingAssets', () => ({
  resolveOfficeRecordingAssetUrl: (...args: unknown[]) => mockResolveOfficeRecordingAssetUrl(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/public/office-recordings/[token]/index.get'
)

function fakeEvent(token = 'token-1', query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return {
    context: { params: { token } },
    query,
    headers
  } satisfies TestEvent
}

describe('GET /api/public/office-recordings/:token', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockEnsureOfficeRecordingsTables.mockReset()
    mockResolveOfficeRecordingAssetUrl.mockReset()
    mockVerifyPassword.mockReset()
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
    mockVerifyPassword.mockResolvedValue(true)
    mockResolveOfficeRecordingAssetUrl
      .mockResolvedValueOnce('https://cdn.example.com/recording.webm')
      .mockResolvedValueOnce('https://cdn.example.com/thumb.jpg')
  })

  it('returns ready shared recording metadata', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'recording-1',
      title: 'Client walkthrough',
      status: 'ready',
      access: 'public',
      storage_key: 'office-recordings/recording.webm',
      thumbnail_key: 'office-recordings/thumb.jpg',
      meeting_title: 'Client review',
      office_name: 'XeroFlow HQ'
    })

    const result = await handler(fakeEvent())

    expect(result.recording).toMatchObject({
      id: 'recording-1',
      title: 'Client walkthrough',
      meeting_title: 'Client review',
      office_name: 'XeroFlow HQ',
      media_url: 'https://cdn.example.com/recording.webm',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg'
    })
    expect('storage_key' in result.recording).toBe(false)
    expect('thumbnail_key' in result.recording).toBe(false)
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('r.status = \'ready\'')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('r.access IN (\'public\', \'password\')')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('r.storage_key IS NOT NULL')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('r.storage_key')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('oms.office_id = r.office_id')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual(['token-1'])
    expect(mockResolveOfficeRecordingAssetUrl).toHaveBeenCalledWith('office-recordings/recording.webm')
    expect(mockResolveOfficeRecordingAssetUrl).toHaveBeenCalledWith('office-recordings/thumb.jpg')
  })

  it('returns 404 for unavailable recordings', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Recording not found'
    })
  })

  it('returns password protected recording metadata after password verification', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'recording-1',
      title: 'Protected walkthrough',
      status: 'ready',
      access: 'password',
      password_hash: 'hashed-password',
      storage_key: 'office-recordings/recording.webm',
      thumbnail_key: null,
      meeting_title: 'Client review',
      office_name: 'XeroFlow HQ'
    })

    const result = await handler(fakeEvent('token-1', {}, { 'x-recording-password': 'correct horse battery' }))

    expect(mockVerifyPassword).toHaveBeenCalledWith('correct horse battery', 'hashed-password')
    expect(result.recording).toMatchObject({
      id: 'recording-1',
      access: 'password',
      media_url: 'https://cdn.example.com/recording.webm'
    })
    expect('password_hash' in result.recording).toBe(false)
  })

  it('rejects password protected recordings without a valid password', async () => {
    mockVerifyPassword.mockResolvedValueOnce(false)
    mockQueryOne.mockResolvedValueOnce({
      id: 'recording-1',
      title: 'Protected walkthrough',
      status: 'ready',
      access: 'password',
      password_hash: 'hashed-password',
      storage_key: 'office-recordings/recording.webm',
      thumbnail_key: null,
      meeting_title: 'Client review',
      office_name: 'XeroFlow HQ'
    })

    await expect(handler(fakeEvent('token-1', { password: 'wrong-password' }))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Recording password required'
    })

    expect(mockResolveOfficeRecordingAssetUrl).not.toHaveBeenCalled()
  })
})
