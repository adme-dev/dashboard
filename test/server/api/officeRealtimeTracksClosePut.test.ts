import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signTestOfficeMediaGrant } from '../../utils/officeMediaGrant'

const zoneId = '575d4c24-9032-400b-984b-9c9525e621b5'
const closeGrant = await signTestOfficeMediaGrant({
  purpose: 'office-media',
  officeId: 'office-1',
  zoneId,
  handle: 'user:user-1',
  sessionId: 'session-1',
  isGuest: false,
  guestBadgeId: null,
  scopes: ['close'],
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
    body?: unknown
    headers?: Record<string, string>
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getHeader: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getHeader = (event, key) => event.context?.headers?.[key.toLowerCase()]
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
const mockCloseRealtimeTracks = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRealtime', () => ({
  closeRealtimeTracks: (...args: unknown[]) => mockCloseRealtimeTracks(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/[officeId]/realtime/[sessionId]/tracks/close.put'
)

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
      body: {
        zone_id: zoneId,
        tracks: [{ mid: '0' }],
        force: true
      },
      headers: { authorization: `Bearer ${closeGrant}` },
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

describe('PUT /api/office/:officeId/realtime/:sessionId/tracks/close', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockCloseRealtimeTracks.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'member' })
    mockCloseRealtimeTracks.mockResolvedValue({ tracks: [{ mid: '0', status: 'inactive' }] })
  })

  it('proxies track close with server-side Realtime credentials', async () => {
    const result = await handler(fakeEvent())

    expect(result).toEqual({ tracks: [{ mid: '0', status: 'inactive' }] })
    expect(mockCloseRealtimeTracks).toHaveBeenCalledWith({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      tracks: [{ mid: '0' }],
      sessionDescription: undefined,
      force: true
    })
  })

  it('requires office membership', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
    expect(mockCloseRealtimeTracks).not.toHaveBeenCalled()
  })

  it('rejects a grant without the close scope', async () => {
    await expect(handler(fakeEvent({
      context: {
        headers: { authorization: `Bearer ${publishOnlyGrant}` }
      }
    }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Office media grant scope mismatch'
    })
    expect(mockCloseRealtimeTracks).not.toHaveBeenCalled()
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
