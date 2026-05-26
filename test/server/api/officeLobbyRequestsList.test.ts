import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getQuery = event => event.query ?? {}
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
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockExpireStaleOfficeLobbyRequests = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args),
  expireStaleOfficeLobbyRequests: (...args: unknown[]) => mockExpireStaleOfficeLobbyRequests(...args),
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS: 2,
  OFFICE_LOBBY_PENDING_EXPIRES_SQL: 'COALESCE(scheduled_start_at, created_at) + interval \'30 minutes\'',
  OFFICE_LOBBY_PENDING_WINDOW_MINUTES: 30
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/lobby-requests.get'
)

function fakeEvent(query: Record<string, string> = {}) {
  return {
    context: { params: { officeId: 'office-1' } },
    query
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/lobby-requests', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockReset()
    mockExpireStaleOfficeLobbyRequests.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'admin' })
    mockQueryRows.mockResolvedValue([])
  })

  it('selects accepted expiry metadata for host history', async () => {
    await handler(fakeEvent({ status: 'accepted' }))

    const listSql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(listSql).toContain('accepted_expires_at')
    expect(listSql).toContain('2 hours')
    expect(listSql).toContain('scheduled_start_at')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1', 'accepted'])
    expect(mockExpireStaleOfficeLobbyRequests).toHaveBeenCalledWith('office-1')
  })

  it('falls back to pending for unsupported status filters', async () => {
    await handler(fakeEvent({ status: 'not-real' }))

    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1', 'pending'])
  })
})
