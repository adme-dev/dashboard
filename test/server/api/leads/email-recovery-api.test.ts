import { beforeEach, describe, expect, it, vi } from 'vitest'

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getHeader: (event: { authorization?: string }, name: string) => string | undefined
}
globals.defineEventHandler = handler => handler
globals.getHeader = event => event.authorization

const mocks = vi.hoisted(() => ({
  recover: vi.fn(),
  runtime: vi.fn(),
  health: vi.fn()
}))

vi.mock('~~/server/utils/leads/emailHealth', () => ({
  processEmailIngestionHealthAlerts: mocks.health
}))

vi.mock('~~/server/utils/leads/emailRecovery', () => ({
  recoverEmailIngestions: mocks.recover,
  resolveEmailRecoveryRuntime: mocks.runtime
}))

const { default: handler } = await import(
  '../../../../server/api/leads/_internal/recover-email-ingestions.post'
)

describe('POST /api/leads/_internal/recover-email-ingestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CRON_TOKEN = 'fixed-length-internal-cron-token'
    mocks.runtime.mockReturnValue({ bucket: {}, encryptionSecret: 'secret' })
    mocks.health.mockResolvedValue({ endpoints: 1, active: 0, notified: 0 })
    mocks.recover.mockResolvedValue({
      recovered: 2,
      rescheduled: 1,
      quarantined: 1,
      cleaned: 1,
      failed: 0
    })
  })

  it('runs recovery with cron authentication and returns content-free counts', async () => {
    const event = {
      authorization: 'Bearer fixed-length-internal-cron-token',
      context: {}
    }

    await expect(handler(event as never)).resolves.toEqual({
      ok: true,
      recovered: 2,
      rescheduled: 1,
      quarantined: 1,
      cleaned: 1,
      failed: 0
    })

    expect(mocks.recover).toHaveBeenCalledWith(event, expect.anything())
    expect(mocks.health).toHaveBeenCalledOnce()
  })

  it('rejects a wrong token without invoking recovery', async () => {
    await expect(handler({
      authorization: 'Bearer wrong',
      context: {}
    } as never)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'unauthorized'
    })

    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.health).not.toHaveBeenCalled()
  })
})
