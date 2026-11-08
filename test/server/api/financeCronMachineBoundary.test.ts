/* eslint-disable @stylistic/max-statements-per-line */
import { createEvent, type H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import advisorOutcomes from '~~/server/api/cron/advisor-outcomes.post'
import advisorRecommendations from '~~/server/api/cron/advisor-recommendations.post'
import anomalyDetection from '~~/server/api/cron/anomaly-detection.post'
import customerSync from '~~/server/api/cron/xero-customer-sync.post'
import invoiceSync from '~~/server/api/cron/xero-invoice-lines-sync.post'
import { fetchSharedData } from '~~/server/utils/anomalyDetection/sharedData'
import { requireFinanceCronJob } from '~~/server/utils/financeMachineAccess'

const m = vi.hoisted(() => ({ db: vi.fn(), rows: vi.fn(), xero: vi.fn(), token: vi.fn(), provider: vi.fn(), fetch: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.db, queryRows: m.rows, execute: vi.fn() }))
vi.mock('~~/server/utils/tokenStore', () => ({ getActiveOrgToken: m.token }))
vi.mock('~~/server/utils/advisorGenerators', () => ({ measureRecommendation: m.provider,
  runCollectionsGenerator: m.provider, runAdPacingGenerator: m.provider, runProjectBurnGenerator: m.provider,
  runRetainerCapGenerator: m.provider, runConcentrationGenerator: m.provider, runLeadsVolumeGenerator: m.provider,
  runAgiPerFteGenerator: m.provider, runVendorHygieneGenerator: m.provider }))
vi.mock('~~/server/utils/xeroCronAuth', () => ({ resolveCronXeroAuth: m.xero }))
vi.mock('~~/server/utils/anomalyDetection/runForTenant', () => ({ runDetectionForTenant: m.provider }))
vi.mock('~~/server/utils/xeroCustomerSync', () => ({ fullCustomerSync: m.provider }))
vi.mock('~~/server/utils/xeroInvoiceLinesSync', () => ({ syncInvoiceLines: m.provider, syncAccounts: m.provider }))
const jobs = [
  ['advisor-outcomes', advisorOutcomes], ['advisor-recommendations', advisorRecommendations], ['anomaly-detection', anomalyDetection],
  ['xero-customer-sync', customerSync], ['xero-invoice-lines-sync', invoiceSync]
] as const
function event(path: string, headers: Record<string, string> = {}, bindings: Record<string, unknown> = {}): H3Event {
  const e = createEvent({ method: 'POST', url: path, headers: { host: 'localhost', ...headers } } as never, {} as never)
  e.context.cloudflare = { env: bindings } as never
  return e
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', '')
  vi.stubEnv('CRON_INTERNAL_SECRET', '')
  m.db.mockResolvedValue(null)
  m.xero.mockResolvedValue(null)
  m.rows.mockResolvedValue([])
  m.fetch.mockResolvedValue({})
  vi.stubGlobal('$fetch', m.fetch)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('actual accounting cron handlers', () => {
  it.each(jobs)('%s rejects unconfigured authentication before DB or provider work', async (name, handler) => {
    await expect(handler(event(`/api/cron/${name}`))).rejects.toMatchObject({ statusCode: 503 })
    expect(m.db).not.toHaveBeenCalled()
    expect(m.xero).not.toHaveBeenCalled()
    expect(m.provider).not.toHaveBeenCalled()
  })
  it.each(jobs)('%s admits exact request-bound authentication before accessing its current org', async (name, handler) => {
    expect(await handler(event(`/api/cron/${name}`, { 'x-cron-secret': 'binding-secret' }, { CRON_SECRET: 'binding-secret' }))).toMatchObject({ ok: true, skipped: 'no Xero connection' })
  })
})
describe('actual anomaly fanout', () => {
  it('adds configured internal read credentials only to a verified cron event', async () => {
    const e = event('/api/cron/anomaly-detection', { 'x-cron-secret': 'job' }, { CRON_SECRET: 'job', CRON_INTERNAL_SECRET: 'internal' })
    requireFinanceCronJob(e)
    await fetchSharedData(e)
    expect(m.fetch).toHaveBeenCalledTimes(6)
    for (const [, opts] of m.fetch.mock.calls) expect(opts.headers.get('x-internal-cron-secret')).toBe('internal')
  })
  it('preserves ordinary staff headers without synthesizing finance credentials for a forged owner', async () => {
    const e = event('/api/cron/anomaly-detection', { cookie: 'staff-session' }, { CRON_INTERNAL_SECRET: 'internal' })
    e.context.user = { id: 'cron', role: 'owner' }
    await fetchSharedData(e)
    for (const [, opts] of m.fetch.mock.calls) {
      expect(opts.headers.get('cookie')).toBe('staff-session')
      expect(opts.headers.get('x-internal-cron-secret')).toBeNull()
    }
  })
  it('fails closed before fetching or querying data when verified fanout credentials are missing', async () => {
    const e = event('/api/cron/anomaly-detection', { 'x-cron-secret': 'job' }, { CRON_SECRET: 'job', CRON_INTERNAL_SECRET: '' })
    requireFinanceCronJob(e)
    await expect(fetchSharedData(e)).rejects.toMatchObject({ statusCode: 503 })
    expect(m.fetch).not.toHaveBeenCalled()
    expect(m.rows).not.toHaveBeenCalled()
  })
})
