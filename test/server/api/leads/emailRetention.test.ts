import { beforeEach, describe, expect, it, vi } from 'vitest'

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getHeader: (event: { authorization?: string }, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error
}
globals.defineEventHandler = handler => handler
globals.getHeader = event => event.authorization
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

const mocks = vi.hoisted(() => ({
  purge: vi.fn()
}))

vi.mock('~~/server/utils/leads/emailHealth', () => ({
  purgeEmailIngestionRetention: mocks.purge
}))

const { default: handler } = await import(
  '../../../../server/api/leads/_internal/purge-ingestion-errors.post'
)

describe('POST /api/leads/_internal/purge-ingestion-errors retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CRON_TOKEN = 'fixed-length-internal-cron-token'
    mocks.purge.mockResolvedValue({
      ingestionErrors: 4,
      expiredNonces: 5,
      stagedObjects: 2,
      failed: 0
    })
  })

  it('runs bounded nonce, error, metadata, and residual-object cleanup', async () => {
    const event = {
      authorization: 'Bearer fixed-length-internal-cron-token',
      context: {
        cloudflare: {
          env: { INTERNAL_CRON_TOKEN: 'fixed-length-internal-cron-token' }
        }
      }
    }
    delete process.env.INTERNAL_CRON_TOKEN
    await expect(handler(event as never)).resolves.toEqual({
      ok: true,
      ingestionErrors: 4,
      expiredNonces: 5,
      stagedObjects: 2,
      failed: 0
    })
    expect(mocks.purge).toHaveBeenCalledWith(event, { limit: 100 })
  })

  it('rejects unauthenticated calls before cleanup', async () => {
    await expect(handler({ authorization: 'Bearer wrong' } as never))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.purge).not.toHaveBeenCalled()
  })
})
