import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { cloudflare?: { env?: Record<string, unknown> } }
  headers?: Record<string, string>
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, key) => event.headers?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockQueryOne = vi.fn()
const mockEnsureOfficeGuestBadgesTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  ensureOfficeGuestBadgesTable: (...args: unknown[]) => mockEnsureOfficeGuestBadgesTable(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/_internal/guest-badge-status.post'
)

const officeId = '11111111-1111-4111-8111-111111111111'
const badgeId = '22222222-2222-4222-8222-222222222222'
const zoneId = '33333333-3333-4333-8333-333333333333'

function fakeEvent(body: Record<string, unknown>, secret = 'secret') {
  return {
    context: { cloudflare: { env: { OFFICE_SYNC_SECRET: 'secret' } } },
    headers: { 'x-office-sync-secret': secret },
    body
  } satisfies TestEvent
}

describe('POST /api/office/_internal/guest-badge-status', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockEnsureOfficeGuestBadgesTable.mockReset()
  })

  it('confirms active unexpired badges for the token room', async () => {
    mockQueryOne.mockResolvedValue({
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      allowed_zone_id: zoneId
    })

    const response = await handler(fakeEvent({
      office_id: officeId,
      badge_id: badgeId,
      allowed_zone_id: zoneId
    }))

    expect(response).toEqual({ active: true })
    expect(mockEnsureOfficeGuestBadgesTable).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('office_guest_badges'), [officeId, badgeId])
  })

  it('rejects revoked badges', async () => {
    mockQueryOne.mockResolvedValue({
      status: 'revoked',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      allowed_zone_id: zoneId
    })

    await expect(handler(fakeEvent({
      office_id: officeId,
      badge_id: badgeId,
      allowed_zone_id: zoneId
    }))).resolves.toMatchObject({
      active: false,
      reason: 'guest badge is not active'
    })
  })

  it('rejects badges when the token has no room restriction', async () => {
    mockQueryOne.mockResolvedValue({
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      allowed_zone_id: zoneId
    })

    await expect(handler(fakeEvent({
      office_id: officeId,
      badge_id: badgeId,
      allowed_zone_id: null
    }))).resolves.toMatchObject({
      active: false,
      reason: 'guest badge room does not match token'
    })
  })

  it('rejects badges without a room restriction', async () => {
    mockQueryOne.mockResolvedValue({
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      allowed_zone_id: null
    })

    await expect(handler(fakeEvent({
      office_id: officeId,
      badge_id: badgeId,
      allowed_zone_id: zoneId
    }))).resolves.toMatchObject({
      active: false,
      reason: 'guest badge room does not match token'
    })
  })

  it('rejects invalid internal secrets', async () => {
    await expect(handler(fakeEvent({
      office_id: officeId,
      badge_id: badgeId,
      allowed_zone_id: zoneId
    }, 'wrong'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'unauthorized'
    })
  })
})
