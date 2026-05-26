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

const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/_internal/audit.post'
)

const officeId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
const zoneId = '33333333-3333-4333-8333-333333333333'

function fakeEvent(body: Record<string, unknown>, secret = 'secret') {
  return {
    context: { cloudflare: { env: { OFFICE_SYNC_SECRET: 'secret' } } },
    headers: { 'x-office-sync-secret': secret },
    body
  } satisfies TestEvent
}

describe('POST /api/office/_internal/audit', () => {
  beforeEach(() => {
    mockLogOfficeAuditEvent.mockReset()
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
  })

  it('logs internal office worker audit events', async () => {
    const response = await handler(fakeEvent({
      office_id: officeId,
      actor_id: actorId,
      action: 'room.participant_evicted',
      target_type: 'office_zone',
      target_id: zoneId,
      metadata: {
        evicted_handle: 'user:44444444-4444-4444-8444-444444444444',
        evicted_name: 'Guest User'
      }
    }))

    expect(response).toEqual({ ok: true })
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith({
      officeId,
      actorId,
      action: 'room.participant_evicted',
      targetType: 'office_zone',
      targetId: zoneId,
      metadata: {
        evicted_handle: 'user:44444444-4444-4444-8444-444444444444',
        evicted_name: 'Guest User'
      }
    })
  })

  it('rejects invalid internal secrets', async () => {
    await expect(handler(fakeEvent({
      office_id: officeId,
      action: 'room.participant_evicted',
      target_type: 'office_zone'
    }, 'wrong'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'unauthorized'
    })

    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
