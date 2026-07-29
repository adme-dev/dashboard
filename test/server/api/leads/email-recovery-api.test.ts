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
  processEmailIngestionHealthAlerts: mocks.health,
  resolveEmailHealthRuntimeConfig: (event: {
    context?: { cloudflare?: { env?: Record<string, string> } }
  }) => ({
    notificationAllowlist: event.context?.cloudflare?.env?.EMAIL_INGESTION_NOTIFY_ALLOWLIST ?? null,
    signatureFailureThreshold: Number(
      event.context?.cloudflare?.env?.EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD
    ) || null
  })
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
    mocks.health.mockResolvedValue({
      status: 'succeeded',
      endpoints: 1,
      failedEndpoints: 0,
      active: 0,
      notified: 0
    })
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
      context: {
        cloudflare: {
          env: {
            INTERNAL_CRON_TOKEN: 'fixed-length-internal-cron-token',
            EMAIL_INGESTION_NOTIFY_ALLOWLIST: 'runtime@example.test',
            EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD: '4'
          }
        }
      }
    }
    delete process.env.INTERNAL_CRON_TOKEN

    await expect(handler(event as never)).resolves.toEqual({
      ok: true,
      recovery: {
        ok: true,
        recovered: 2,
        rescheduled: 1,
        quarantined: 1,
        cleaned: 1,
        failed: 0
      },
      health: {
        ok: true,
        status: 'succeeded',
        endpoints: 1,
        failedEndpoints: 0,
        active: 0,
        notified: 0
      },
      recovered: 2,
      rescheduled: 1,
      quarantined: 1,
      cleaned: 1,
      failed: 0
    })

    expect(mocks.recover).toHaveBeenCalledWith(event, expect.anything())
    expect(mocks.health).toHaveBeenCalledWith(event, expect.objectContaining({
      notificationAllowlist: 'runtime@example.test',
      signatureFailureThreshold: 4
    }))
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

  it('reports a whole health-scan failure without undoing successful recovery', async () => {
    mocks.health.mockRejectedValueOnce(new Error('alert query unavailable'))

    await expect(handler({
      authorization: 'Bearer fixed-length-internal-cron-token',
      context: {}
    } as never)).resolves.toEqual({
      ok: false,
      recovery: {
        ok: true,
        recovered: 2,
        rescheduled: 1,
        quarantined: 1,
        cleaned: 1,
        failed: 0
      },
      health: {
        ok: false,
        status: 'failed',
        endpoints: 0,
        failedEndpoints: 0,
        active: 0,
        notified: 0,
        errorClass: 'email_health_scan_failed'
      },
      recovered: 2,
      rescheduled: 1,
      quarantined: 1,
      cleaned: 1,
      failed: 0
    })
  })
})
