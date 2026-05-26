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
const mockEnsureOfficeGuestBadgesTable = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  ensureOfficeGuestBadgesTable: (...args: unknown[]) => mockEnsureOfficeGuestBadgesTable(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/[officeId]/guest-badges.get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/guest-badges', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficeGuestBadgesTable.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'admin-1', role: 'member' })
    mockEnsureOfficeGuestBadgesTable.mockResolvedValue(undefined)
  })

  it('expires overdue active badges before returning the admin list', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: 'badge-expired' })
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'badge-1',
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        status: 'expired',
        zone_name: 'Meeting Room',
        zone_slug: 'meeting-room'
      }
    ])

    const result = await handler(fakeEvent())

    expect(result.badges).toHaveLength(1)
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('UPDATE office_guest_badges')
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('expires_at <= now()')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual(['office-1'])
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('FROM office_guest_badges')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['office-1'])
  })

  it('rejects non-admin office members', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Admin access required'
    })

    expect(mockEnsureOfficeGuestBadgesTable).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('allows platform admins to list guest badges with member office membership', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce(null)
    mockQueryRows.mockResolvedValueOnce([])

    const result = await handler(fakeEvent())

    expect(result.badges).toEqual([])
    expect(mockEnsureOfficeGuestBadgesTable).toHaveBeenCalledOnce()
  })
})
