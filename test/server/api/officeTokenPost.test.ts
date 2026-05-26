import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: {
    params?: Record<string, string>
    cloudflare?: { env?: Record<string, unknown> }
  }
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
const mockQueryRows = vi.fn()
const mockToActorHandle = vi.fn()
const mockSignOfficeJwt = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeRoom', () => ({
  toActorHandle: (...args: unknown[]) => mockToActorHandle(...args)
}))

vi.mock('~~/server/utils/officeJwt', () => ({
  signOfficeJwt: (...args: unknown[]) => mockSignOfficeJwt(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/token.post'
)

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1' },
      cloudflare: {
        env: {
          OFFICE_SYNC_SECRET: 'secret',
          OFFICE_WORKER_URL: 'wss://office-worker.example.com'
        }
      },
      ...overrides.context
    }
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/token', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockToActorHandle.mockReset()
    mockSignOfficeJwt.mockReset()

    mockRequireAuth.mockResolvedValue({
      id: 'user-1',
      name: 'Paul',
      email: 'paul@example.com',
      avatar_url: 'https://example.com/avatar.png'
    })
    mockToActorHandle.mockReturnValue('user:user-1')
    mockSignOfficeJwt.mockResolvedValue('signed-token')
  })

  it('mints staff office tokens with zone capacity claims', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T05:00:00.000Z'))
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
    mockQueryRows.mockResolvedValueOnce([
      { id: 'zone-1', capacity: 12 },
      { id: 'zone-2', capacity: '4' },
      { id: 'zone-bad', capacity: 0 }
    ])

    const result = await handler(fakeEvent())

    expect(result).toEqual({
      token: 'signed-token',
      workerUrl: 'wss://office-worker.example.com',
      exp: 1779685500
    })
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('FROM office_zones'),
      ['office-1']
    )
    expect(mockSignOfficeJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'user:user-1',
        name: 'Paul',
        avatarUrl: 'https://example.com/avatar.png',
        role: 'admin',
        isGuest: false,
        officeId: 'office-1',
        zoneCapacities: {
          'zone-1': 12,
          'zone-2': 4
        },
        exp: 1779685500
      }),
      'secret'
    )
  })

  it('rejects non-members before reading zone capacities', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockSignOfficeJwt).not.toHaveBeenCalled()
  })

  it('requires the office sync secret', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' })

    await expect(handler(fakeEvent({
      context: {
        params: { officeId: 'office-1' },
        cloudflare: { env: { OFFICE_WORKER_URL: 'wss://office-worker.example.com' } }
      }
    }))).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'OFFICE_SYNC_SECRET not configured'
    })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockSignOfficeJwt).not.toHaveBeenCalled()
  })
})
