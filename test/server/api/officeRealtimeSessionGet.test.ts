import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signTestOfficeMediaGrant } from '../../utils/officeMediaGrant'

const zoneId = '575d4c24-9032-400b-984b-9c9525e621b5'
const stateGrant = await signTestOfficeMediaGrant({
  purpose: 'office-media',
  officeId: 'office-1',
  zoneId,
  handle: 'user:user-1',
  sessionId: 'session-1',
  isGuest: false,
  guestBadgeId: null,
  scopes: ['state'],
  exp: Math.floor(Date.now() / 1000) + 60
})
const publishOnlyGrant = await signTestOfficeMediaGrant({
  purpose: 'office-media',
  officeId: 'office-1',
  zoneId,
  handle: 'user:user-1',
  sessionId: 'session-1',
  isGuest: false,
  guestBadgeId: null,
  scopes: ['publish'],
  exp: Math.floor(Date.now() / 1000) + 60
})

type TestEvent = {
  context?: {
    params?: Record<string, string>
    query?: Record<string, string>
    headers?: Record<string, string>
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getHeader: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getHeader = (event, key) => event.context?.headers?.[key.toLowerCase()]
testGlobal.getQuery = event => event.context?.query ?? {}
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
const mockGetRealtimeSessionState = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRealtime', () => ({
  getRealtimeSessionState: (...args: unknown[]) => mockGetRealtimeSessionState(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/[officeId]/realtime/[sessionId]/index.get'
)

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
      query: { zone_id: zoneId },
      headers: { authorization: `Bearer ${stateGrant}` },
      cloudflare: {
        env: {
          OFFICE_SYNC_SECRET: 'office-secret',
          REALTIME_APP_ID: 'app-1',
          REALTIME_APP_SECRET: 'secret-1'
        }
      },
      ...overrides.context
    }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/realtime/:sessionId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockGetRealtimeSessionState.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'member' })
    mockGetRealtimeSessionState.mockResolvedValue({
      tracks: [
        { mid: '0', status: 'active' },
        { mid: '1', status: 'waiting' }
      ]
    })
  })

  it('proxies Realtime session state with server-side credentials', async () => {
    const result = await handler(fakeEvent())

    expect(result).toEqual({
      tracks: [
        { mid: '0', status: 'active' },
        { mid: '1', status: 'waiting' }
      ]
    })
    expect(mockGetRealtimeSessionState).toHaveBeenCalledWith({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1'
    })
  })

  it('requires office membership', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
    expect(mockGetRealtimeSessionState).not.toHaveBeenCalled()
  })

  it('rejects a grant without the state scope', async () => {
    await expect(handler(fakeEvent({
      context: {
        headers: { authorization: `Bearer ${publishOnlyGrant}` }
      }
    }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Office media grant scope mismatch'
    })
    expect(mockGetRealtimeSessionState).not.toHaveBeenCalled()
  })

  it('fails closed when Realtime credentials are missing', async () => {
    await expect(handler(fakeEvent({
      context: {
        cloudflare: {
          env: {
            OFFICE_SYNC_SECRET: 'office-secret'
          }
        }
      }
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Realtime media is not configured'
    })
  })
})
