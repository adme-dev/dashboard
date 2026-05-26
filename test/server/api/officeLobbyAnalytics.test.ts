import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  setHeader: (event: TestEvent, key: string, value: string) => void
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getQuery = event => event.query ?? {}
testGlobal.setHeader = (event, key, value) => {
  event.context ??= {}
  event.context.params ??= {}
  event.context.params[`header:${key}`] = value
}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockQueryRows = vi.fn()
const mockRequireOfficeAdmin = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockEnsureOfficeGuestBadgesTable = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeRoom', () => ({
  requireOfficeAdmin: (...args: unknown[]) => mockRequireOfficeAdmin(...args)
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  ensureOfficeGuestBadgesTable: (...args: unknown[]) => mockEnsureOfficeGuestBadgesTable(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/lobbies/analytics.get'
)

function fakeEvent(query: Record<string, string> = {}) {
  return {
    context: { params: { officeId: 'office-1' } },
    query
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/lobbies/analytics', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockRequireOfficeAdmin.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockReset()
    mockEnsureOfficeGuestBadgesTable.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockQueryRows.mockResolvedValue([
      {
        lobby_id: 'lobby-1',
        handle: 'sales',
        name: 'Sales',
        total_requests: 4,
        pending_requests: 1,
        accepted_requests: 2,
        declined_requests: 1,
        expired_requests: 0,
        scheduled_requests: 1,
        guest_badges: 2,
        requests_today: 3,
        daily_cap: 5,
        acceptance_rate: 50,
        last_request_at: '2026-05-25T00:00:00.000Z'
      }
    ])
  })

  it('returns admin-only lobby analytics grouped by lobby handle', async () => {
    const response = await handler(fakeEvent())

    expect(response.analytics[0]).toMatchObject({
      lobby_id: 'lobby-1',
      handle: 'sales',
      total_requests: 4,
      pending_requests: 1,
      accepted_requests: 2,
      declined_requests: 1,
      scheduled_requests: 1,
      guest_badges: 2,
      requests_today: 3,
      daily_cap: 5,
      acceptance_rate: 50
    })
    expect(mockRequireOfficeAdmin).toHaveBeenCalledWith(expect.anything(), 'office-1')
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeGuestBadgesTable).toHaveBeenCalledOnce()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COUNT(*) FILTER')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('acceptance_rate')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('requests_today')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('daily_cap')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1'])
  })

  it('exports lobby analytics as csv', async () => {
    const response = await handler(fakeEvent({ format: 'csv' }))

    expect(response).toContain('"Handle","Name","Total requests"')
    expect(response).toContain('"sales","Sales","4","1","2","1","0","1","2","3","5","50%","2026-05-25T00:00:00.000Z"')
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'lobby.analytics_exported',
      targetType: 'office_lobby',
      targetId: null,
      metadata: { format: 'csv', rows: 1 }
    }))
  })
})
