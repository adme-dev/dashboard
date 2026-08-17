import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryOne = vi.fn()
const queryRows = vi.fn()
const getSpendAutoActionPolicy = vi.fn()

vi.mock('~~/server/utils/db', () => ({ queryOne, queryRows }))
vi.mock('~~/server/utils/spendAutoActionConfig', () => ({ getSpendAutoActionPolicy }))
vi.mock('~~/server/utils/spendAutoAction', () => ({ decideAutoActions: vi.fn(() => []) }))
vi.mock('~~/server/utils/spendAutoActionExecutor', () => ({ executeAutoActions: vi.fn() }))
vi.mock('~~/server/utils/campaignActionLog', () => ({ recordCampaignAction: vi.fn() }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn() }))
vi.mock('~~/server/utils/socialSpendPacingReview', () => ({
  PACING_REVIEW_SELECT_COLUMNS: 'ms.id',
  buildPacingReview: vi.fn(() => ({ items: [] }))
}))

describe('spend auto-action cron tenant resolution', () => {
  beforeEach(() => {
    vi.resetModules()
    queryOne.mockReset().mockResolvedValue(null)
    queryRows.mockReset().mockResolvedValue([])
    getSpendAutoActionPolicy.mockReset().mockResolvedValue({
      enabled: true,
      perSeverity: { critical: 'propose', warning: 'notify', info: 'off' }
    })
    process.env.CRON_SECRET = 'cron-secret'
  })

  it('loads the legacy default-tenant policy when Xero is not connected', async () => {
    const handler = (await import('~~/server/api/cron/spend-auto-action.post')).default

    const result = await handler({
      headers: { 'x-cron-secret': 'cron-secret' },
      context: {},
      node: { req: { headers: { 'x-cron-secret': 'cron-secret' } }, res: { setHeader: vi.fn() } }
    } as never)

    expect(getSpendAutoActionPolicy).toHaveBeenCalledWith('__default__')
    expect(result).toMatchObject({ ok: true, proposed: 0, notified: 0, skipped: 0 })
  })
})
