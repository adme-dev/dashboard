import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ recover: vi.fn() }))
vi.mock('~~/server/utils/banner/dissectionRecovery', () => ({ recoverDissectionDispatches: m.recover }))
const handler = (await import('../../../server/api/cron/banner-dissection-recovery.post')).default
const event = (secret?: string, env?: Record<string, unknown>) => ({
  context: env === undefined ? {} : { cloudflare: { env } }, node: { req: { headers: secret === undefined ? {} : { 'x-cron-secret': secret } } }
}) as never
beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('CRON_SECRET', '')
  vi.stubEnv('BANNER_DISSECTION_RECOVERY_ENABLED', '')
  m.recover.mockResolvedValue({ ran: true, expired: 0, leased: 0, acknowledged: 0, uncertain: 0 })
})
describe('mandatory cron authentication and default-off dissection recovery', () => {
  it.each(['development', 'test', 'production'])('rejects unset credentials in %s, even while disabled', async (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(m.recover).not.toHaveBeenCalled()
  })
  it('requires a nonempty matching secret before exposing disabled status', async () => {
    await expect(handler(event('', { CRON_SECRET: '' }))).rejects.toMatchObject({ statusCode: 401 })
    await expect(handler(event('wrong', { CRON_SECRET: 'correct' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(await handler(event('correct', { CRON_SECRET: 'correct' }))).toEqual({ ran: false, reason: 'disabled' })
  })
  it('prefers deployed bindings over local env for both auth and activation', async () => {
    vi.stubEnv('CRON_SECRET', 'local')
    vi.stubEnv('BANNER_DISSECTION_RECOVERY_ENABLED', 'true')
    await expect(handler(event('local', { CRON_SECRET: 'deployed' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(await handler(event('deployed', { CRON_SECRET: 'deployed', BANNER_DISSECTION_RECOVERY_ENABLED: 'false' }))).toEqual({ ran: false, reason: 'disabled' })
    expect(m.recover).not.toHaveBeenCalled()
  })
  it('accepts local fallback and runs only with explicit true activation', async () => {
    vi.stubEnv('CRON_SECRET', 'local')
    vi.stubEnv('BANNER_DISSECTION_RECOVERY_ENABLED', 'true')
    const request = event('local')
    expect(await handler(request)).toMatchObject({ ran: true })
    expect(m.recover).toHaveBeenCalledWith(request)
  })
  it('redacts database failure details', async () => {
    m.recover.mockRejectedValue(new Error('private database identity'))
    await expect(handler(event('secret', { CRON_SECRET: 'secret', BANNER_DISSECTION_RECOVERY_ENABLED: 'true' }))).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Dissection recovery unavailable' })
  })
})

it('never inherits process env auth or activation when a Cloudflare binding bag exists', async () => {
  vi.stubEnv('CRON_SECRET', 'local')
  vi.stubEnv('BANNER_DISSECTION_RECOVERY_ENABLED', 'true')
  await expect(handler(event('local', {}))).rejects.toMatchObject({ statusCode: 401 })
  expect(await handler(event('deployed', { CRON_SECRET: 'deployed' }))).toEqual({ ran: false, reason: 'disabled' })
  expect(m.recover).not.toHaveBeenCalled()
})
