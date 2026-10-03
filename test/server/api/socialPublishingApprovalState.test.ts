import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn(), audit: vi.fn(), workflow: vi.fn(), write: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'owner' }), requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.query, queryRows: vi.fn().mockResolvedValue([]) }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn(), createBulkNotifications: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/guards', () => ({ requireSocialPostClientAccess: mocks.access }))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: mocks.audit }))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({ startSocialPublishingWorkflow: mocks.workflow }))
vi.mock('~~/server/utils/socialNewsFeedback', () => ({ recordSocialNewsFeedback: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => 'post-1')
vi.stubGlobal('readBody', (event: { body?: unknown }) => event.body || { reviewVersion: 'a'.repeat(64), reason: 'Changes needed' })
const { default: handler } = await import('../../../server/api/agency/social/publishing/posts/[id]/approve.post')
const { default: reject } = await import('../../../server/api/agency/social/publishing/posts/[id]/reject.post')
const { default: request } = await import('../../../server/api/agency/social/publishing/posts/[id]/request-approval.post')
const approve = handler as unknown as (event: unknown) => Promise<unknown>
describe('social approval state integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.write.mockResolvedValue({ id: 'owner' })
    mocks.query.mockResolvedValue({ id: 'post-1', status: 'approved' })
  })
  it.each(['publishing', 'published', 'partially_published', 'cancelled', 'failed', 'scheduled', 'approved'])('rejects approval for %s without changing state', async (status) => {
    mocks.access.mockResolvedValue({ client_id: 'client-1', status, metadata: {} })
    await expect(approve({})).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('approves a draft with an atomic draft-only update', async () => {
    mocks.access.mockResolvedValue({ client_id: 'client-1', status: 'draft', metadata: {}, review_version: 'a'.repeat(64) })
    await expect(approve({})).resolves.toEqual({ ok: true })
    expect(mocks.query.mock.calls[0][0]).toContain('AND status = \'draft\'')
  })
  it('rejects a state change between read and update', async () => {
    mocks.access.mockResolvedValue({ client_id: 'client-1', status: 'draft', metadata: {}, review_version: 'a'.repeat(64) })
    mocks.query.mockResolvedValue(null)
    await expect(approve({})).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})

for (const [name, action] of [['reject', reject], ['request approval', request]] as const) {
  describe(name + ' terminal protection', () => {
    it.each(['published', 'publishing', 'partially_published', 'cancelled'])('refuses %s', async (status) => {
      mocks.query.mockClear()
      mocks.access.mockResolvedValue({ client_id: 'client', status, review_version: 'a'.repeat(64) })
      await expect(action({} as never)).rejects.toMatchObject({ statusCode: 409 })
      expect(mocks.query).not.toHaveBeenCalled()
    })
  })
}
it('rejects a stale staff preview', async () => {
  mocks.query.mockClear()
  mocks.access.mockResolvedValue({ client_id: 'client', status: 'draft', review_version: 'b'.repeat(64) })
  await expect(approve({})).rejects.toMatchObject({ statusCode: 409 })
  expect(mocks.query).not.toHaveBeenCalled()
})
it('blocks read-only staff before approval', async () => {
  mocks.write.mockRejectedValueOnce(Object.assign(new Error('Read only'), { statusCode: 403 }))
  await expect(approve({})).rejects.toMatchObject({ statusCode: 403 })
})
