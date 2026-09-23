import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '~~/server/api/cron/page-studio-checkpoint-staging.post'

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), transactionOnce: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: mocks.transactionOnce, transaction: mocks.transaction }))
vi.mock('~~/server/utils/pageStudio/checkpointStagingDispatcher', () => ({ dispatchCheckpointStaging: mocks.dispatch }))

const counts = { claimed: 3, completed: 1, stopped: 0, rescheduled: 1, unsettled: 1, exhausted: 0 }
function event(secret: string | undefined = 'cron-secret', env: Record<string, unknown> = { CRON_SECRET: 'cron-secret' }) {
  return { node: { req: { headers: { 'x-cron-secret': secret } } }, context: { cloudflare: { env } } } as unknown as H3Event
}

describe('checkpoint staging cron boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'local-secret')
    mocks.dispatch.mockResolvedValue(counts)
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([undefined, '', 'wrong', 'x'.repeat(257)])('rejects missing, wrong or oversized credential %s before dispatch', async (secret) => {
    const request = event()
    request.node.req.headers['x-cron-secret'] = secret
    await expect(handler(request)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it.each([undefined, null, '', false, 'x'.repeat(257)])('does not fall back past an explicitly invalid deployed secret', async (secret) => {
    await expect(handler(event('local-secret', { CRON_SECRET: secret }))).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it('permits the local secret only when the binding is absent', async () => {
    expect(await handler(event('local-secret', {}))).toEqual({ ok: true, ...counts })
    vi.stubEnv('CRON_SECRET', '')
    await expect(handler(event('local-secret', {}))).rejects.toMatchObject({ statusCode: 401 })
  })
  it('uses only request-bound environment and the non-retrying transaction implementation', async () => {
    const env = { CRON_SECRET: 'cron-secret', PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: {} }
    const request = event('cron-secret', env)
    request.node.req.url = '/api/cron/page-studio-checkpoint-staging?environment=production&siteId=foreign'
    expect(await handler(request)).toEqual({ ok: true, ...counts })
    expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith(env, { transaction: mocks.transactionOnce })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('awaits settlement and masks database or binding failures without retry', async () => {
    let reject!: (error: Error) => void
    mocks.dispatch.mockImplementation(() => new Promise((_resolve, fail) => {
      reject = fail
    }))
    let settled = false
    const result = handler(event()).finally(() => {
      settled = true
    })
    const failure = expect(result).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Checkpoint staging temporarily unavailable' })
    await Promise.resolve()
    expect(settled).toBe(false)
    reject(new Error('private database and provider details'))
    await failure
    expect(mocks.dispatch).toHaveBeenCalledOnce()
  })
})
