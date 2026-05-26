import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
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

const mockRequireOfficeAdmin = vi.fn()
const mockUpdateOfficeGuestBadgeStatus = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/officeRoom', () => ({
  requireOfficeAdmin: (...args: unknown[]) => mockRequireOfficeAdmin(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  updateOfficeGuestBadgeStatus: (...args: unknown[]) => mockUpdateOfficeGuestBadgeStatus(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/[officeId]/guest-badges/[badgeId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', badgeId: 'badge-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/guest-badges/:badgeId', () => {
  beforeEach(() => {
    mockRequireOfficeAdmin.mockReset()
    mockUpdateOfficeGuestBadgeStatus.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockUpdateOfficeGuestBadgeStatus.mockResolvedValue({
      id: 'badge-1',
      guest_email: 'guest@example.com',
      allowed_zone_id: 'zone-1',
      expires_at: '2026-05-25T01:00:00.000Z'
    })
  })

  it('revokes a guest badge and records an audit event', async () => {
    const response = await handler(fakeEvent({ action: 'revoke' }))

    expect(response.badge.id).toBe('badge-1')
    expect(mockRequireOfficeAdmin).toHaveBeenCalledWith(expect.anything(), 'office-1')
    expect(mockUpdateOfficeGuestBadgeStatus).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      badgeId: 'badge-1',
      status: 'revoked',
      actorId: 'admin-1'
    }))
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'guest_badge.revoked',
      targetType: 'office_guest_badge',
      targetId: 'badge-1'
    }))
  })

  it('reactivates a guest badge with a fresh expiry', async () => {
    await handler(fakeEvent({ action: 'reactivate' }))

    expect(mockUpdateOfficeGuestBadgeStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      expiresAt: expect.any(String)
    }))
  })

  it('rejects reactivation with an expiry in the past', async () => {
    await expect(handler(fakeEvent({
      action: 'reactivate',
      expires_at: '2020-01-01T00:00:00.000Z'
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Guest badge expiry must be in the future'
    })

    expect(mockUpdateOfficeGuestBadgeStatus).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('uses a specific not found message when reactivation cannot find an approved room', async () => {
    mockUpdateOfficeGuestBadgeStatus.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ action: 'reactivate' }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Guest badge not found or missing an approved room'
    })

    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
