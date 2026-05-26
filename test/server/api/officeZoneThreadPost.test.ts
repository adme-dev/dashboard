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
const mockEnsureOfficeZoneThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeZoneThreadChannel: (...args: unknown[]) => mockEnsureOfficeZoneThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/zones/[zoneId]/thread.post'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', zoneId: 'zone-1' } }
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/zones/:zoneId/thread', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeZoneThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeZoneThreadChannel.mockResolvedValue({
      id: 'channel-1',
      slug: 'office-zone-zone-1',
      type: 'office_zone',
      external_id: 'zone-1'
    })
  })

  it('returns the canonical office zone channel', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'zone-1',
        office_id: 'office-1',
        slug: 'meeting-room-a',
        name: 'Meeting Room A',
        zone_type: 'meeting',
        capacity: 12
      })

    const result = await handler(fakeEvent())

    expect(result).toMatchObject({
      id: 'channel-1',
      type: 'office_zone',
      external_id: 'zone-1'
    })
    expect(mockEnsureOfficeZoneThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      zoneId: 'zone-1',
      actorId: 'user-1'
    })
  })

  it('rejects desk zones before creating a room thread', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        id: 'zone-1',
        office_id: 'office-1',
        slug: 'paul',
        name: 'Paul',
        zone_type: 'desk',
        capacity: 1
      })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Desk threads use direct messages'
    })

    expect(mockEnsureOfficeZoneThreadChannel).not.toHaveBeenCalled()
  })
})
