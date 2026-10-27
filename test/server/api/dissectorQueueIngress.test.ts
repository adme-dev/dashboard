import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ body: vi.fn(), process: vi.fn(), start: vi.fn(), finish: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), readBody: m.body }))
vi.mock('~~/server/utils/queueConsumer', () => ({ processJob: m.process }))
vi.mock('~~/server/utils/jobExecutionLedger', () => ({ startJobExecution: m.start, finishJobExecution: m.finish }))
const handler = (await import('../../../server/api/internal/process-job.post')).default
const event = (supplied: string, env?: Record<string, unknown>) => ({
  context: env === undefined ? {} : { cloudflare: { env } },
  node: { req: { headers: { 'x-cron-secret': supplied } } }
}) as never
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', '')
  m.body.mockResolvedValue({ type: 'dissect.analyze', payload: { jobId: 'job', attemptId: 'attempt' }, enqueuedAt: new Date().toISOString() })
  m.start.mockResolvedValue({ executionId: 'execution' })
})
afterEach(() => vi.unstubAllEnvs())

describe('Hosted queue HTTP ingress authentication', () => {
  it('authenticates using only the request secret and passes the same binding capabilities', async () => {
    const request = event('request-secret', { CRON_SECRET: 'request-secret', MEDIA_BUCKET: { get: vi.fn() } })
    expect(await handler(request)).toMatchObject({ ok: true, type: 'dissect.analyze' })
    expect(m.process).toHaveBeenCalledWith(expect.objectContaining({ payload: { jobId: 'job', attemptId: 'attempt' } }), request)
    expect(process.env.CRON_SECRET).toBe('')
  })
  it('uses capabilities promoted by the actual cfEnv middleware from the Nitro platform context', async () => {
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    const middleware = (await import('../../../server/middleware/cfEnv')).default
    const env = { CRON_SECRET: 'platform-secret', AI: { run: vi.fn() } }
    const request = { context: { _platform: { cloudflare: { env } } }, node: { req: { headers: { 'x-cron-secret': 'platform-secret' } } } }
    await middleware(request as never)
    expect(await handler(request as never)).toMatchObject({ ok: true })
    expect(m.process.mock.calls[0][1].context.cloudflare.env).toBe(env)
    expect(process.env.CRON_SECRET).toBe('')
    vi.unstubAllGlobals()
  })
  it.each([{}, { CRON_SECRET: '' }, { CRON_SECRET: 'other-secret' }, { CRON_SECRET: 123 }])('rejects absent, empty, wrong or invalid hosted secrets without reading the job: %j', async (env) => {
    vi.stubEnv('CRON_SECRET', 'stale-secret')
    await expect(handler(event('stale-secret', env))).rejects.toMatchObject({ statusCode: 401 })
    expect(m.body).not.toHaveBeenCalled()
    expect(m.start).not.toHaveBeenCalled()
  })
  it('preserves process fallback only outside Cloudflare', async () => {
    vi.stubEnv('CRON_SECRET', 'local-secret')
    expect(await handler(event('local-secret'))).toMatchObject({ ok: true })
  })
  it('preserves non-Dissector dispatch and records thrown execution failures for queue retry', async () => {
    m.body.mockResolvedValue({ type: 'board.notify', payload: {}, enqueuedAt: new Date().toISOString() })
    const failure = new Error('fixture failure')
    m.process.mockRejectedValue(failure)
    await expect(handler(event('request-secret', { CRON_SECRET: 'request-secret' }))).rejects.toBe(failure)
    expect(m.finish).toHaveBeenCalledWith({ executionId: 'execution' }, 'failed', expect.any(Number), failure)
  })
})
