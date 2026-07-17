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

const mockRepairPending = vi.fn()
const mockRepairDueDeliveries = vi.fn()

vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: {
    repairPending: (...args: unknown[]) => mockRepairPending(...args),
    repairDueDeliveries: (...args: unknown[]) => mockRepairDueDeliveries(...args)
  }
}))

const { default: handler } = await import(
  '../../../../server/api/cron/measurement-outbox-repair.post'
)

describe('measurement outbox repair endpoint', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    mockRepairPending.mockResolvedValue({
      status: 'processed',
      claimed: 2,
      published: 2,
      retryable: 0,
      unconfirmed: 0
    })
    mockRepairDueDeliveries.mockResolvedValue({
      status: 'processed',
      due: 1,
      queued: 1,
      failed: 0
    })
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalSecret
  })

  it('rejects a missing or incorrect cron secret', async () => {
    await expect(handler({ headers: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockRepairPending).not.toHaveBeenCalled()
    expect(mockRepairDueDeliveries).not.toHaveBeenCalled()
  })

  it('repairs a bounded batch for an authenticated cron request', async () => {
    const event = { headers: { 'x-cron-secret': 'test-cron-secret' } }

    const result = await handler(event as never)

    expect(mockRepairPending).toHaveBeenCalledWith(event, 100)
    expect(mockRepairDueDeliveries).toHaveBeenCalledWith(event, 100)
    expect(result).toEqual({
      ran: true,
      outbox: {
        status: 'processed',
        claimed: 2,
        published: 2,
        retryable: 0,
        unconfirmed: 0
      },
      deliveries: {
        status: 'processed',
        due: 1,
        queued: 1,
        failed: 0
      }
    })
  })
})
