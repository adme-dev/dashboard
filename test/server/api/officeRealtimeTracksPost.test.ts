import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: {
    params?: Record<string, string>
    body?: unknown
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.context?.body ?? {}
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
const mockAddRealtimeTracks = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRealtime', () => ({
  addRealtimeTracks: (...args: unknown[]) => mockAddRealtimeTracks(...args)
}))

const { default: handler } = await import(
  '../../../../../server/api/office/[officeId]/realtime/[sessionId]/tracks.post'
)

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
      body: {
        zone_id: '575d4c24-9032-400b-984b-9c9525e621b5',
        sessionDescription: { type: 'offer', sdp: 'v=0' },
        tracks: [{ location: 'local', mid: '0', trackName: 'camera', kind: 'video' }]
      },
      cloudflare: {
        env: {
          REALTIME_APP_ID: 'app-1',
          REALTIME_APP_SECRET: 'secret-1'
        }
      },
      ...overrides.context
    }
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/realtime/:sessionId/tracks', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockAddRealtimeTracks.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({ id: '575d4c24-9032-400b-984b-9c9525e621b5' })
    mockAddRealtimeTracks.mockResolvedValue({
      sessionDescription: { type: 'answer', sdp: 'v=0 answer' },
      tracks: [{ mid: '0', status: 'active' }]
    })
  })

  it('proxies track negotiation with server-side Realtime credentials', async () => {
    const result = await handler(fakeEvent())

    expect(result).toEqual({
      sessionDescription: { type: 'answer', sdp: 'v=0 answer' },
      tracks: [{ mid: '0', status: 'active' }]
    })
    expect(mockAddRealtimeTracks).toHaveBeenCalledWith({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      sessionDescription: { type: 'offer', sdp: 'v=0' },
      tracks: [{ location: 'local', mid: '0', trackName: 'camera', kind: 'video' }],
      autoDiscover: undefined
    })
  })

  it('requires office membership', async () => {
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
    expect(mockAddRealtimeTracks).not.toHaveBeenCalled()
  })

  it('fails closed when Realtime credentials are missing', async () => {
    await expect(handler(fakeEvent({
      context: {
        cloudflare: { env: {} }
      }
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Realtime media is not configured'
    })
  })
})
