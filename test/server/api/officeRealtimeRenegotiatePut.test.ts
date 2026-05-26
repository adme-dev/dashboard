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
const mockRenegotiateRealtimeSession = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRealtime', () => ({
  renegotiateRealtimeSession: (...args: unknown[]) => mockRenegotiateRealtimeSession(...args)
}))

const { default: handler } = await import(
  '../../../../../server/api/office/[officeId]/realtime/[sessionId]/renegotiate.put'
)

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
      body: {
        zone_id: '575d4c24-9032-400b-984b-9c9525e621b5',
        sessionDescription: { type: 'answer', sdp: 'v=0 answer' }
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

describe('PUT /api/office/:officeId/realtime/:sessionId/renegotiate', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockRenegotiateRealtimeSession.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'member' })
    mockRenegotiateRealtimeSession.mockResolvedValue({})
  })

  it('proxies renegotiation with server-side Realtime credentials', async () => {
    await expect(handler(fakeEvent())).resolves.toEqual({})

    expect(mockRenegotiateRealtimeSession).toHaveBeenCalledWith({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      sessionDescription: { type: 'answer', sdp: 'v=0 answer' }
    })
  })

  it('requires office membership', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
    expect(mockRenegotiateRealtimeSession).not.toHaveBeenCalled()
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
