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

const mockRequireOfficeAdmin = vi.fn()
const mockEnsureOfficeGuestBadgesTable = vi.fn()
const mockEnsureOfficeGuestThreadChannel = vi.fn()

vi.mock('~~/server/utils/officeRoom', () => ({
  requireOfficeAdmin: (...args: unknown[]) => mockRequireOfficeAdmin(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  ensureOfficeGuestBadgesTable: (...args: unknown[]) => mockEnsureOfficeGuestBadgesTable(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeGuestThreadChannel: (...args: unknown[]) => mockEnsureOfficeGuestThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/guest-badges/[badgeId]/thread.post'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', badgeId: 'badge-1' } }
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/guest-badges/:badgeId/thread', () => {
  beforeEach(() => {
    mockRequireOfficeAdmin.mockReset()
    mockEnsureOfficeGuestBadgesTable.mockReset()
    mockEnsureOfficeGuestThreadChannel.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockEnsureOfficeGuestBadgesTable.mockResolvedValue(undefined)
  })

  it('returns the canonical office guest channel', async () => {
    mockEnsureOfficeGuestThreadChannel.mockResolvedValue({
      id: 'channel-1',
      slug: 'office-guest-badge-1',
      type: 'office_guest',
      external_id: 'badge-1'
    })

    const result = await handler(fakeEvent())

    expect(result).toMatchObject({
      id: 'channel-1',
      type: 'office_guest',
      external_id: 'badge-1'
    })
    expect(mockEnsureOfficeGuestBadgesTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeGuestThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      badgeId: 'badge-1',
      actorId: 'admin-1'
    })
  })

  it('returns 404 when the badge does not exist', async () => {
    mockEnsureOfficeGuestThreadChannel.mockResolvedValue(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Guest badge not found'
    })
  })
})
