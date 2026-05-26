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
const mockEnsureOfficePresenceLocationsTable = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officePresenceLocations', () => ({
  ensureOfficePresenceLocationsTable: (...args: unknown[]) => mockEnsureOfficePresenceLocationsTable(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/presence.get'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId/presence', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockEnsureOfficePresenceLocationsTable.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'admin' })
    mockEnsureOfficePresenceLocationsTable.mockResolvedValue(undefined)
  })

  it('returns online count and grouped zone occupancy', async () => {
    mockQueryRows.mockResolvedValue([
      {
        office_id: 'office-1',
        actor_type: 'user',
        actor_id: 'user-1',
        handle: 'user:user-1',
        zone_id: 'zone-1',
        presence: 'online',
        last_seen_at: '2026-05-24T20:00:00.000Z',
        updated_at: '2026-05-24T20:00:00.000Z',
        is_online: true,
        display_name: 'Paul',
        avatar_url: '/avatar.png',
        zone_name: 'Lobby',
        zone_slug: 'lobby',
        zone_type: 'lobby'
      },
      {
        office_id: 'office-1',
        actor_type: 'user',
        actor_id: 'user-2',
        handle: 'user:user-2',
        zone_id: 'zone-1',
        presence: 'offline',
        last_seen_at: '2026-05-24T19:00:00.000Z',
        updated_at: '2026-05-24T19:00:00.000Z',
        is_online: false,
        display_name: 'Alex',
        avatar_url: null,
        zone_name: 'Lobby',
        zone_slug: 'lobby',
        zone_type: 'lobby'
      }
    ])

    const result = await handler(fakeEvent())

    expect(result.onlineCount).toBe(1)
    expect(result.zoneOccupancy).toEqual({ 'zone-1': ['user:user-1'] })
    expect(mockEnsureOfficePresenceLocationsTable).toHaveBeenCalled()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('office_presence_locations')
  })

  it('rejects non-members', async () => {
    mockQueryOne.mockResolvedValue(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
  })
})
