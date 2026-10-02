import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn(), audit: vi.fn(), workflow: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'owner' }) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.query }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/guards', () => ({ requireSocialPostClientAccess: mocks.access }))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: mocks.audit }))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({ startSocialPublishingWorkflow: mocks.workflow }))
vi.mock('~~/server/utils/socialNewsFeedback', () => ({ recordSocialNewsFeedback: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => 'post-1')
const { default: handler } = await import('../../../server/api/agency/social/publishing/posts/[id]/approve.post')
const approve = handler as unknown as (event: unknown) => Promise<unknown>
describe('social approval state integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue({ id: 'post-1', status: 'approved' })
  })
  it.each(['publishing', 'published', 'partially_published', 'cancelled', 'failed', 'scheduled', 'approved'])('rejects approval for %s without changing state', async (status) => {
    mocks.access.mockResolvedValue({ client_id: 'client-1', status, metadata: {} })
    await expect(approve({})).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('approves a draft with an atomic draft-only update', async () => {
    mocks.access.mockResolvedValue({ client_id: 'client-1', status: 'draft', metadata: {} })
    await expect(approve({})).resolves.toEqual({ ok: true })
    expect(mocks.query.mock.calls[0][0]).toContain('AND status = \'draft\'')
  })
  it('rejects a state change between read and update', async () => {
    mocks.access.mockResolvedValue({ client_id: 'client-1', status: 'draft', metadata: {} })
    mocks.query.mockResolvedValue(null)
    await expect(approve({})).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
