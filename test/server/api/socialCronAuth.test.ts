import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rows: vi.fn(), one: vi.fn(), due: vi.fn() }))
vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: (event: { headers: Record<string, string> }, name: string) => event.headers[name],
  createError: (error: object) => Object.assign(new Error('Unauthorized'), error)
}))
vi.mock('~~/server/utils/db', () => ({ queryRows: db.rows, queryRowsFresh: db.rows, queryOneFresh: db.one, execute: vi.fn() }))
vi.mock('~~/server/utils/socialNewsAutopost', () => ({ dueNewsAutopostClients: db.due, checkNewsAutopost: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/dispatch', () => ({ claimAndPublishSocialPost: vi.fn() }))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({ startSocialPublishingWorkflow: vi.fn() }))
vi.mock('~~/server/utils/social-providers/registry', () => ({ getProvider: vi.fn() }))
vi.mock('~~/server/utils/socialReporting/store', () => ({ upsertPostMetric: vi.fn(), upsertAccountMetric: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing', () => ({ publishedTargetsForAccount: vi.fn() }))
const handlers = [
  ['dispatch', (await import('../../../server/api/cron/publish-social-posts.post')).default],
  ['metrics', (await import('../../../server/api/cron/sync-social-metrics.post')).default],
  ['replenishment', (await import('../../../server/api/cron/replenish-social-news.post')).default]
] as const
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', '')
  db.rows.mockResolvedValue([])
  db.one.mockResolvedValue(null)
  db.due.mockResolvedValue([])
})
afterEach(() => vi.unstubAllEnvs())
for (const [name, handler] of handlers) {
  const invoke = (secret?: string, binding?: unknown) => (handler as (event: unknown) => Promise<unknown>)({
    headers: secret === undefined ? {} : { 'x-cron-secret': secret },
    context: { cloudflare: { env: binding === undefined ? {} : { CRON_SECRET: binding } } }
  })
  describe(`${name} cron authorization`, () => {
    it('accepts the deployed Cloudflare binding without a process secret', async () => {
      await expect(invoke('binding-secret', 'binding-secret')).resolves.toBeDefined()
    })
    it('accepts a configured local fallback', async () => {
      vi.stubEnv('CRON_SECRET', 'local-secret')
      await expect(invoke('local-secret')).resolves.toBeDefined()
    })
    it.each([undefined, ''])('rejects missing configuration and an empty header (%s)', async (secret) => {
      await expect(invoke(secret)).rejects.toMatchObject({ statusCode: 401 })
      expect(db.rows).not.toHaveBeenCalled()
      expect(db.due).not.toHaveBeenCalled()
    })
    it.each(['', 123, 'binding-secret'])('never bypasses a configured binding with a local secret (%s)', async (binding) => {
      vi.stubEnv('CRON_SECRET', 'local-secret')
      await expect(invoke('local-secret', binding)).rejects.toMatchObject({ statusCode: 401 })
      expect(db.rows).not.toHaveBeenCalled()
      expect(db.due).not.toHaveBeenCalled()
    })
  })
}
