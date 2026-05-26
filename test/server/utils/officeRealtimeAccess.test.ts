import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: {
    params?: Record<string, string>
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

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

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const {
  requireOfficeRealtimeAccess,
  requireOfficeRealtimeZone
} = await import('~~/server/utils/officeRealtimeAccess')

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
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

describe('officeRealtimeAccess', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'member' })
  })

  it('returns scoped Realtime credentials for office members', async () => {
    const result = await requireOfficeRealtimeAccess(fakeEvent() as never)

    expect(result).toMatchObject({
      officeId: 'office-1',
      sessionId: 'session-1',
      appId: 'app-1',
      appSecret: 'secret-1',
      membership: { id: 'member-1', role: 'member' }
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM office_members'),
      ['office-1', 'user-1']
    )
  })

  it('rejects missing route params', async () => {
    await expect(requireOfficeRealtimeAccess(fakeEvent({
      context: {
        params: { sessionId: 'session-1' }
      }
    }) as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'officeId required'
    })

    await expect(requireOfficeRealtimeAccess(fakeEvent({
      context: {
        params: { officeId: 'office-1' }
      }
    }) as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'sessionId required'
    })
  })

  it('rejects non-members before returning credentials', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(requireOfficeRealtimeAccess(fakeEvent() as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
  })

  it('rejects missing Realtime credentials', async () => {
    await expect(requireOfficeRealtimeAccess(fakeEvent({
      context: {
        cloudflare: { env: {} }
      }
    }) as never)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Realtime media is not configured'
    })
  })

  it('validates non-desk Realtime zones within the office', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'zone-1' })

    await expect(requireOfficeRealtimeZone('office-1', 'zone-1')).resolves.toEqual({ id: 'zone-1' })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('zone_type <>'),
      ['zone-1', 'office-1']
    )
  })

  it('rejects unknown or desk-only Realtime zones', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(requireOfficeRealtimeZone('office-1', 'desk-1')).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting room not found'
    })
  })
})
