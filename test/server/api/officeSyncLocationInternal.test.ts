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

const mockExecute = vi.fn()
const mockEnsureOfficePresenceLocationsTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/officePresenceLocations', () => ({
  ensureOfficePresenceLocationsTable: (...args: unknown[]) => mockEnsureOfficePresenceLocationsTable(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/_internal/sync-location.post'
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

describe('POST /api/office/_internal/sync-location', () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockEnsureOfficePresenceLocationsTable.mockReset()
    mockExecute.mockResolvedValue(undefined)
    mockEnsureOfficePresenceLocationsTable.mockResolvedValue(undefined)
  })

  it('persists online actor location updates from the office worker', async () => {
    const response = await handler(fakeEvent({
      office_id: officeId,
      actor_type: 'user',
      actor_id: actorId,
      zone_id: zoneId,
      presence: 'online'
    }))

    expect(response).toEqual({ ok: true })
    expect(mockEnsureOfficePresenceLocationsTable).toHaveBeenCalledOnce()
    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('INSERT INTO office_presence_locations')
    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('ON CONFLICT (office_id, actor_type, actor_id) DO UPDATE')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([
      officeId,
      'user',
      actorId,
      `user:${actorId}`,
      zoneId,
      'online'
    ])
  })

  it('persists offline updates with a cleared zone', async () => {
    await handler(fakeEvent({
      office_id: officeId,
      actor_type: 'client',
      actor_id: actorId,
      zone_id: null,
      presence: 'offline'
    }))

    expect(mockExecute.mock.calls[0]?.[1]).toEqual([
      officeId,
      'client',
      actorId,
      `client:${actorId}`,
      null,
      'offline'
    ])
  })

  it('rejects invalid internal secrets', async () => {
    await expect(handler(fakeEvent({
      office_id: officeId,
      actor_type: 'user',
      actor_id: actorId,
      zone_id: zoneId,
      presence: 'online'
    }, 'wrong'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'unauthorized'
    })

    expect(mockEnsureOfficePresenceLocationsTable).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
