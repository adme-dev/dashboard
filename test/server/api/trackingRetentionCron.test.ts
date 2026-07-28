import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getHeader: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getHeader = (event, name) => event.headers?.[name]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const execute = vi.fn()
const reconcileConfirmedBrowserLeadEvents = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute,
  db: { query: vi.fn() }
}))
vi.mock('~~/server/utils/leads/browserConfirmation', () => ({
  reconcileConfirmedBrowserLeadEvents
}))

const { default: handler } = await import('../../../server/api/cron/tracking-retention.post')

describe('tracking retention cron', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    execute.mockResolvedValueOnce(6).mockResolvedValueOnce(2)
    reconcileConfirmedBrowserLeadEvents.mockResolvedValue(3)
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalSecret
  })

  it('repairs eligible accepted leads as part of an authenticated daily sweep', async () => {
    await expect(handler({ headers: { 'x-cron-secret': 'test-cron-secret' } } as never))
      .resolves.toEqual({ ok: true, deleted: 6, deletedIntents: 2, repairedConfirmations: 3 })
    expect(reconcileConfirmedBrowserLeadEvents).toHaveBeenCalledOnce()
  })
})
