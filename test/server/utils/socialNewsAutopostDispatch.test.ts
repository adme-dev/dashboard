import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn(), query: vi.fn(), source: vi.fn(), publish: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne, queryRows: mocks.queryRows, execute: mocks.execute, transaction: (fn: (db: { query: typeof mocks.query }) => unknown) => fn({ query: mocks.query }) }))
vi.mock('~~/server/utils/socialNewsAutopostSource', () => ({ verifyAutomaticNewsSource: mocks.source }))
vi.mock('~~/server/utils/socialPublishing', () => ({ publishPost: mocks.publish }))
const { claimAndPublishSocialPost } = await import('../../../server/utils/socialPublishing/dispatch')
const claimed = { id: 'post', client_id: 'client', account_ids: ['account'], metadata: { newsAutopostAutomatic: true, newsAutopostRuleId: 'rule' } }
let mode = 'automatic'
let finalStatus = 'publishing'
beforeEach(() => {
  vi.clearAllMocks()
  mode = 'automatic'
  finalStatus = 'publishing'
  mocks.queryOne.mockResolvedValue(claimed)
  mocks.source.mockResolvedValue('retry')
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT mode,account_id')) return { rows: [{ mode, account_id: 'account' }] }
    if (sql.startsWith('UPDATE social_posts')) finalStatus = String(params[1])
    return { rows: [] }
  })
})
const input = { postId: 'post', source: 'cron' as const, claimStatuses: ['scheduled'], log: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }
describe('source failure and concurrent pause', () => {
  it('keeps temporary source failures scheduled without a Facebook attempt', async () => {
    await claimAndPublishSocialPost(input)
    expect(finalStatus).toBe('scheduled')
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock')
    expect(mocks.query.mock.calls[1][0]).toContain('FOR UPDATE')
  })
  it('does not resurrect a post paused during the source request', async () => {
    mocks.source.mockImplementation(async () => {
      mode = 'paused'
      return 'retry'
    })
    await claimAndPublishSocialPost(input)
    expect(finalStatus).toBe('cancelled')
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('cancels a confirmed withdrawn story', async () => {
    mocks.source.mockResolvedValue('withdrawn')
    await claimAndPublishSocialPost(input)
    expect(finalStatus).toBe('cancelled')
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})
