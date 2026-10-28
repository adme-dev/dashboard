/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  revoked: false, active: true, self: false, roleOnly: false, legacyRole: false, legacyPost: false,
  query: vi.fn(), rows: vi.fn(), review: vi.fn(), dispatch: vi.fn(), tx: vi.fn(), legacy: vi.fn()
}))
const CLIENT = '11111111-1111-4111-8111-111111111111'
const POST = '44444444-4444-4444-8444-444444444444'
const REVISION = '55555555-5555-4555-8555-555555555555'
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => POST)
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('readBody', async () => ({ revisionId: REVISION }))
vi.mock('~~/server/utils/ai/mcp/scope', () => ({ MCP_WRITE_SCOPE: 'mcp:write' }))
vi.mock('~~/server/utils/auth', () => ({
  requireRole: async () => {
    if (state.legacyRole) return { id: 'reviewer', role: 'creative', permissionGroups: ['MARKETING_MANAGEMENT', 'CREATIVE'] }
    throw Object.assign(new Error('legacy role denied'), { statusCode: 403 })
  },
  requireAuth: async () => ({ id: 'reviewer', role: 'member', permissionGroups: ['MARKETING_MANAGEMENT'] })
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: async (_e: unknown, userId: string) => ({
  event: {}, userId, userRole: 'member', mcpStaffAuthority: 'fresh', assistantReadOnly: false,
  permissionGroups: state.revoked ? [] : state.roleOnly ? ['MANAGEMENT'] : ['MARKETING_MANAGEMENT'],
  marketingCapabilities: ['social_draft'],
  assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] }
}) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: state.query, queryOneFresh: state.query,
  queryRowsFresh: state.rows, queryRows: state.rows, transaction: state.tx }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: state.legacy, requireSocialClientScope: state.legacy }))
vi.mock('~~/server/utils/socialPublishing/guards', () => ({ requireSocialPostClientAccess: state.legacy }))
vi.mock('~~/server/utils/socialPublishing/revisions', () => ({ reviewSocialPostRevision: state.review, objectValue: (value: unknown) => value ?? {}, toIsoOrNull: (value: unknown) => value ?? null }))
vi.mock('~~/server/utils/socialPublishing/dispatch', () => ({ claimAndPublishSocialPost: state.dispatch }))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: vi.fn() }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn() }))
vi.mock('~~/server/utils/socialNewsFeedback', () => ({ recordSocialNewsFeedback: vi.fn() }))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({ startSocialPublishingWorkflow: vi.fn() }))
const approve = (await import('../../server/api/agency/social/publishing/posts/[id]/approve.post')).default as any
const reject = (await import('../../server/api/agency/social/publishing/posts/[id]/reject.post')).default as any
const publish = (await import('../../server/api/agency/social/publishing/posts/[id]/publish.post')).default as any
const badge = (await import('../../server/api/agency/social/publishing/approvals/badge.get')).default as any
const approvals = (await import('../../server/api/agency/social/publishing/approvals/index.get')).default as any
beforeEach(() => {
  vi.clearAllMocks(); state.revoked = false; state.active = true; state.self = false; state.roleOnly = false; state.legacyRole = false; state.legacyPost = false
  state.legacy.mockRejectedValue(Object.assign(new Error('legacy client denied'), { statusCode: 403 }))
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM agency_clients')) return state.active ? { id: CLIENT } : null
    if (sql.includes('FROM social_posts')) return { id: POST, client_id: CLIENT, created_by: state.self ? 'reviewer' : 'requester', review_policy: state.legacyPost ? 'legacy' : 'delegated_marketing', status: 'approved', current_revision_id: REVISION, approved_revision_id: REVISION }
    if (sql.includes('FROM social_post_revisions')) return { id: REVISION, post_id: POST, client_id: CLIENT, requested_by: 'requester', review_policy: 'delegated_marketing' }
    return null
  })
  state.review.mockResolvedValue({ revision: { id: REVISION }, post: { id: POST, client_id: CLIENT, status: 'approved' } })
  state.dispatch.mockResolvedValue({ status: 'accepted' })
  state.tx.mockImplementation(async fn => fn({ query: vi.fn() }))
  state.rows.mockResolvedValue([])
})
describe('department browser review parity', () => {
  it('permits dedicated marketing approval and rejection without MANAGEMENT', async () => {
    await expect(approve({})).resolves.toMatchObject({ ok: true, revisionId: REVISION })
    await expect(reject({})).resolves.toEqual({ ok: true })
    expect(state.review).toHaveBeenCalledTimes(2)
  })
  it('permits exact delegated execution without CREATIVE or ADMIN', async () => {
    await expect(publish({})).resolves.toMatchObject({ status: 'accepted' })
    expect(state.dispatch).toHaveBeenCalledWith(expect.objectContaining({ revisionId: REVISION }))
  })
  it('preserves an independently granted legacy role path when the user also has the department group', async () => {
    state.legacyRole = true; state.legacyPost = true
    state.legacy.mockResolvedValue({ id: 'reviewer' })
    await expect(publish({})).resolves.toMatchObject({ status: 'accepted' })
    expect(state.dispatch).toHaveBeenCalledWith(expect.objectContaining({ revisionId: null }))
  })
  it('lists only active peer delegated revisions for the department path', async () => {
    await expect(approvals({})).resolves.toEqual([])
    const sql = state.rows.mock.calls[0]?.[0]
    expect(sql).toContain('is_active=TRUE')
    expect(sql).toContain('p.review_policy=\'delegated_marketing\'')
    expect(sql).toContain('requested_by')
  })
  it('scopes the department approval badge to active peer delegated posts', async () => {
    await expect(badge({})).resolves.toEqual({ count: 0 })
    expect(state.query.mock.calls[0][0]).toContain('is_active=TRUE')
    expect(state.query.mock.calls[0][0]).toContain('review_policy=\'delegated_marketing\'')
  })
  it.each(['revoked', 'inactive', 'self', 'general-management'])('blocks %s without social mutations', async (failure) => {
    state.revoked = failure === 'revoked'; state.active = failure !== 'inactive'; state.self = failure === 'self'; state.roleOnly = failure === 'general-management'
    for (const handler of [approve, reject, publish]) await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(state.tx).not.toHaveBeenCalled()
    expect(state.dispatch).not.toHaveBeenCalled()
  })
})
