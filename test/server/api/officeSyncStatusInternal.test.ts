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

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/_internal/sync-status.post'
)

const actorId = '22222222-2222-4222-8222-222222222222'

function fakeEvent(body: Record<string, unknown>, secret = 'secret') {
  return {
    context: { cloudflare: { env: { OFFICE_SYNC_SECRET: 'secret' } } },
    headers: { 'x-office-sync-secret': secret },
    body
  } satisfies TestEvent
}

describe('POST /api/office/_internal/sync-status', () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockExecute.mockResolvedValue(undefined)
  })

  it('mirrors available user office status to chat online status', async () => {
    const response = await handler(fakeEvent({
      actor_type: 'user',
      actor_id: actorId,
      status: 'available'
    }))

    expect(response).toEqual({ ok: true })
    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('INSERT INTO user_chat_status')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([actorId, 'online'])
  })

  it('mirrors busy client office status to chat dnd status', async () => {
    await handler(fakeEvent({
      actor_type: 'client',
      actor_id: actorId,
      status: 'busy'
    }))

    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('INSERT INTO client_chat_status')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([actorId, 'dnd'])
  })

  it('rejects invalid internal secrets', async () => {
    await expect(handler(fakeEvent({
      actor_type: 'user',
      actor_id: actorId,
      status: 'available'
    }, 'wrong'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'unauthorized'
    })

    expect(mockExecute).not.toHaveBeenCalled()
  })
})
