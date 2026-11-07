/* eslint-disable @stylistic/max-statements-per-line */
import { createEvent } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ db: vi.fn(), provider: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.db, queryRows: m.db }))
vi.mock('~~/server/utils/socialSpendPacingReview', () => ({ buildPacingReview: m.provider, PACING_REVIEW_SELECT_COLUMNS: 'id' }))
vi.mock('~~/server/utils/spendAutoActionConfig', () => ({ getSpendAutoActionPolicy: m.provider }))
vi.mock('~~/server/utils/spendAutoAction', () => ({ decideAutoActions: m.provider }))
vi.mock('~~/server/utils/spendAutoActionExecutor', () => ({ executeAutoActions: m.provider }))
vi.mock('~~/server/utils/campaignActionLog', () => ({ recordCampaignAction: m.provider }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: m.provider }))
vi.mock('~~/server/utils/budgetSlackConfig', () => ({ getBudgetSlackConfig: m.provider }))
vi.mock('~~/server/utils/anomalyDetection/slackBudget', () => ({ buildDigestBlocks: m.provider, postSlack: m.provider, validateWebhook: m.provider }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://localhost' }))
vi.mock('~~/server/utils/automation/pacingWatchdog', () => ({ runPacingWatchdog: m.provider }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
const jobs = [
  ['spend-auto-action', (await import('~~/server/api/cron/spend-auto-action.post')).default],
  ['budget-slack-digest', (await import('~~/server/api/cron/budget-slack-digest.post')).default],
  ['ops-autopilot-pacing', (await import('~~/server/api/cron/ops-autopilot-pacing.post')).default]
] as const
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', ''); m.db.mockResolvedValue(null) })
afterEach(() => { vi.unstubAllEnvs() })
describe('shared org marketing cron authentication', () => {
  it.each(jobs)('%s rejects missing configuration before DB or provider work', async (name, handler) => {
    const e = createEvent({ method: 'POST', url: `/api/cron/${name}`, headers: { host: 'localhost' } } as never, {} as never)
    await expect(handler(e)).rejects.toMatchObject({ statusCode: 503 })
    expect(m.db).not.toHaveBeenCalled()
    expect(m.provider).not.toHaveBeenCalled()
  })
  it.each(jobs)('%s rejects invalid request-bound authentication before DB or provider work', async (name, handler) => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CRON_SECRET', 'process-secret')
    const e = createEvent({ method: 'POST', url: `/api/cron/${name}`, headers: { 'host': 'localhost', 'x-cron-secret': 'process-secret' } } as never, {} as never)
    e.context.cloudflare = { env: { CRON_SECRET: 'binding-secret' } } as never
    await expect(handler(e)).rejects.toMatchObject({ statusCode: 401 })
    expect(m.db).not.toHaveBeenCalled()
    expect(m.provider).not.toHaveBeenCalled()
  })
})
