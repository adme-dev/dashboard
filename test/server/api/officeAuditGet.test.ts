import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
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
const mockEnsureOfficeAuditEventsTable = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  ensureOfficeAuditEventsTable: (...args: unknown[]) => mockEnsureOfficeAuditEventsTable(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/[officeId]/audit.get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/audit', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeAuditEventsTable.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'admin-1', role: 'member' })
    mockEnsureOfficeAuditEventsTable.mockResolvedValue(undefined)
  })

  it('returns the admin audit trail with actor details', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'audit-1',
        action: 'guest_badge.revoked',
        actor_name: 'Admin',
        actor_avatar_url: null,
        metadata: { guestEmail: 'guest@example.com' }
      }
    ])

    const result = await handler(fakeEvent())

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      id: 'audit-1',
      actor_name: 'Admin'
    })
    expect(mockEnsureOfficeAuditEventsTable).toHaveBeenCalledOnce()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_audit_events')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('team_members')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1'])
  })

  it('rejects non-admin office members', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Admin access required'
    })

    expect(mockEnsureOfficeAuditEventsTable).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('allows platform admins to read audit events with member office membership', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' })
    mockQueryRows.mockResolvedValueOnce([])

    const result = await handler(fakeEvent())

    expect(result.events).toEqual([])
    expect(mockEnsureOfficeAuditEventsTable).toHaveBeenCalledOnce()
  })

  it('rejects users who are not office admins', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Admin access required'
    })

    expect(mockEnsureOfficeAuditEventsTable).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
