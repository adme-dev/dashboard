import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = { headers?: Record<string, string> }
const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number }
}
testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.createError = opts => Object.assign(new Error(opts.statusMessage), opts)

const mockRun = vi.fn()
const mockReconcile = vi.fn()
vi.mock('~~/server/utils/send/cleanup', () => ({ runSendCleanup: (...args: unknown[]) => mockRun(...args) }))
vi.mock('~~/server/utils/send/reconciliation', () => ({
  runSendReconciliation: (...args: unknown[]) => mockReconcile(...args)
}))
const { default: handler } = await import('../../../../server/api/cron/send-cleanup.post')

describe('POST /api/cron/send-cleanup', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'secret')
    mockRun.mockReset()
    mockRun.mockResolvedValue({ claimed: 0, deletedTransfers: 0, deletedFiles: 0, failedTransfers: 0 })
    mockReconcile.mockReset()
    mockReconcile.mockResolvedValue({ orphanObjects: 0, missingObjects: 0 })
  })

  it('fails closed when the secret is absent or wrong', async () => {
    await expect(handler({ headers: {} })).rejects.toMatchObject({ statusCode: 401 })
    await expect(handler({ headers: { 'x-cron-secret': 'wrong' } })).rejects.toMatchObject({ statusCode: 401 })
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockReconcile).not.toHaveBeenCalled()
  })

  it('runs cleanup followed by report-only reconciliation for an authenticated scheduler', async () => {
    await expect(handler({ headers: { 'x-cron-secret': 'secret' } })).resolves.toMatchObject({
      ok: true,
      cleanup: { claimed: 0 },
      reconciliation: { orphanObjects: 0 }
    })
    expect(mockRun).toHaveBeenCalledOnce()
    expect(mockReconcile).toHaveBeenCalledOnce()
    expect(mockRun.mock.invocationCallOrder[0]).toBeLessThan(mockReconcile.mock.invocationCallOrder[0]!)
  })
})
