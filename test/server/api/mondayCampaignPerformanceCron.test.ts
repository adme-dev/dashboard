import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createDependencies = vi.fn()
const reconcile = vi.fn()

vi.mock('~~/server/utils/mondayCampaignPerformanceStore', () => ({
  createMondayCampaignPerformanceDependencies: createDependencies
}))
vi.mock('~~/server/utils/mondayCampaignPerformanceReconciler', () => ({
  reconcileMondayCampaignPerformance: reconcile
}))

describe('Monday campaign performance cron', () => {
  beforeEach(() => {
    vi.resetModules()
    createDependencies.mockReset().mockResolvedValue({ loadState: vi.fn() })
    reconcile.mockReset().mockResolvedValue({
      mode: 'apply', total: 18, matched: 4, pending: 14, ambiguous: 0,
      writtenBack: 0, writeBackSkipped: 4, writeBackFailed: 0,
      persisted: 4, unmappedMondayItemIds: []
    })
    process.env.CRON_SECRET = 'cron-secret'
  })

  it('applies the idempotent cutover reconciliation through the configured Monday connection', async () => {
    const handler = (await import('~~/server/api/cron/monday-campaign-performance.post')).default
    const result = await handler({
      headers: { 'x-cron-secret': 'cron-secret' },
      context: {},
      node: { req: { headers: { 'x-cron-secret': 'cron-secret' } }, res: { setHeader: vi.fn() } }
    } as never)

    expect(createDependencies).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledWith({ apply: true, writeBackMonday: false }, expect.any(Object))
    expect(result).toMatchObject({ ok: true, matched: 4 })
  })

  it('is registered independently of the pacing route in the hourly worker', async () => {
    const { ROUTES } = await import('../../../workers/pages-cron/src/index')
    expect(ROUTES['0 * * * *']).toContain('/api/cron/monday-campaign-performance')
    expect(ROUTES['0 * * * *']).toContain('/api/cron/spend-auto-action')
    expect(ROUTES['0 * * * *']).toContain('/api/cron/ops-autopilot-pacing')
  })

  it('fails closed when the newly scheduled pacing route has no configured cron secret', () => {
    const route = readFileSync('server/api/cron/ops-autopilot-pacing.post.ts', 'utf8')
    expect(route).toContain('!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET')
  })
})
