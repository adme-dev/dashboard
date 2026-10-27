import { beforeEach, describe, expect, it, vi } from 'vitest'

// Browser endpoints for delegated (staff/MCP) posts. The authority helper and revision services are
// spies here; their real SQL behaviour is exercised in socialPublishingRevisionDispatch.test.ts.
const mocks = vi.hoisted(() => ({
  user: { id: 'reviewer', role: 'admin' } as { id: string, role: string },
  existing: null as any,
  queryOne: vi.fn(),
  transaction: vi.fn(),
  reviewer: vi.fn(),
  capability: vi.fn(),
  review: vi.fn(),
  submit: vi.fn(),
  workflow: vi.fn(),
  dispatch: vi.fn(),
  audit: vi.fn(),
  resolveMedia: vi.fn()
}))

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => 'post-1')
vi.stubGlobal('readBody', async (event: any) => event.body ?? {})
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => mocks.user }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryOneFresh: mocks.queryOne,
  queryRows: vi.fn(async () => []),
  queryRowsFresh: vi.fn(async () => []),
  execute: vi.fn(async () => 1),
  transaction: mocks.transaction
}))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn(), createBulkNotifications: vi.fn() }))
vi.mock('~~/server/utils/socialNewsFeedback', () => ({ recordSocialNewsFeedback: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: mocks.audit }))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({ startSocialPublishingWorkflow: mocks.workflow }))
vi.mock('~~/server/utils/socialPublishing/dispatch', () => ({ claimAndPublishSocialPost: mocks.dispatch }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: vi.fn(async () => mocks.user) }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({
  requireIndependentMarketingReviewer: mocks.reviewer,
  assertMarketingCapabilityAtBoundary: mocks.capability
}))
vi.mock('~~/server/utils/socialPublishing/revisions', async () => {
  const actual = await vi.importActual<typeof import('~~/server/utils/socialPublishing/revisions')>('~~/server/utils/socialPublishing/revisions')
  return { ...actual, reviewSocialPostRevision: mocks.review, submitSocialPostForReview: mocks.submit }
})
vi.mock('~~/server/utils/socialPublishing/mediaAssets', async () => {
  const actual = await vi.importActual<typeof import('~~/server/utils/socialPublishing/mediaAssets')>('~~/server/utils/socialPublishing/mediaAssets')
  return { ...actual, resolveSocialMediaAssets: mocks.resolveMedia }
})
vi.mock('~~/server/utils/socialPublishing/guards', async () => {
  const actual = await vi.importActual<typeof import('~~/server/utils/socialPublishing/guards')>('~~/server/utils/socialPublishing/guards')
  return { ...actual, requireSocialPostClientAccess: async () => mocks.existing }
})

const approve = (await import('../../../server/api/agency/social/publishing/posts/[id]/approve.post')).default as any
const reject = (await import('../../../server/api/agency/social/publishing/posts/[id]/reject.post')).default as any
const publish = (await import('../../../server/api/agency/social/publishing/posts/[id]/publish.post')).default as any
const schedule = (await import('../../../server/api/agency/social/publishing/posts/[id]/schedule.post')).default as any
const patch = (await import('../../../server/api/agency/social/publishing/posts/[id]/index.patch')).default as any
const requestApproval = (await import('../../../server/api/agency/social/publishing/posts/[id]/request-approval.post')).default as any

const REVISION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const forbidden = () => Object.assign(new Error('Only an owner or admin can review delegated marketing work'), { statusCode: 403 })

describe('delegated social review endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'reviewer', role: 'admin' }
    mocks.existing = {
      id: 'post-1', client_id: 'client-1', created_by: 'staff', status: 'draft', review_policy: 'delegated_marketing',
      platforms: ['facebook'], account_ids: ['acct-1'], current_revision_id: REVISION, approved_revision_id: null,
      metadata: { source: 'mcp_marketing_draft' }
    }
    mocks.queryOne.mockImplementation(async (sql: string) => sql.includes('FROM social_post_revisions') ? { requested_by: 'staff' } : null)
    mocks.transaction.mockImplementation(async (cb: any) => await cb({ query: vi.fn() }))
    mocks.reviewer.mockResolvedValue({ id: 'reviewer', role: 'admin', name: null })
    mocks.review.mockResolvedValue({
      post: { id: 'post-1', client_id: 'client-1', status: 'scheduled', scheduled_at: '2030-01-01T10:00:00.000Z', content: 'c', approval_requested_by: 'staff', metadata: {} },
      revision: { id: REVISION },
      policy: 'delegated_marketing'
    })
  })

  it('requires the exact revisionId and an independent reviewer before any decision', async () => {
    await expect(approve({ body: {} })).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.transaction).not.toHaveBeenCalled()

    mocks.reviewer.mockRejectedValueOnce(forbidden())
    await expect(approve({ body: { revisionId: REVISION } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.review).not.toHaveBeenCalled()

    await expect(approve({ body: { revisionId: REVISION } })).resolves.toEqual({ ok: true, revisionId: REVISION })
    // Both the revision requester and the draft creator are checked against the reviewer.
    expect(mocks.reviewer.mock.calls.map(call => call[1].requesterId)).toEqual(['staff', 'staff', 'staff'])
    expect(mocks.review).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      postId: 'post-1', revisionId: REVISION, decision: 'approved', reviewerId: 'reviewer'
    }))
    expect(mocks.workflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ revisionId: REVISION, trigger: 'schedule' }))
  })

  it('applies the same independent-reviewer rule to rejection', async () => {
    await expect(reject({ body: { reason: 'Fix copy' } })).rejects.toMatchObject({ statusCode: 400 })
    mocks.reviewer.mockRejectedValueOnce(forbidden())
    await expect(reject({ body: { reason: 'Fix copy', revisionId: REVISION } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.review).not.toHaveBeenCalled()
    mocks.review.mockResolvedValueOnce({ post: { id: 'post-1', content: 'c', approval_requested_by: 'staff', metadata: {} }, revision: { id: REVISION }, policy: 'delegated_marketing' })
    await expect(reject({ body: { reason: 'Fix copy', revisionId: REVISION } })).resolves.toEqual({ ok: true })
    expect(mocks.review).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ decision: 'rejected', reason: 'Fix copy' }))
  })

  it('never lets a staff member trigger dispatch of a delegated post, and dispatches only the approved revision', async () => {
    mocks.existing = { ...mocks.existing, status: 'approved', approved_revision_id: REVISION }
    mocks.queryOne.mockImplementation(async (sql: string) => sql.includes('FROM social_post_revisions')
      ? { requested_by: 'staff' }
      : { ...mocks.existing })
    mocks.user = { id: 'staff', role: 'creative' }
    mocks.reviewer.mockRejectedValueOnce(Object.assign(new Error('Requesters cannot review their own delegated submission'), { statusCode: 403 }))
    await expect(publish({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.dispatch).not.toHaveBeenCalled()

    mocks.user = { id: 'reviewer', role: 'admin' }
    mocks.dispatch.mockResolvedValueOnce({ ok: true, status: 'published', platformResults: {} })
    await expect(publish({})).resolves.toMatchObject({ status: 'published' })
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ revisionId: REVISION, claimStatuses: ['approved'], event: expect.anything() }))
  })

  it('refuses to move an approved delegated schedule or change its timezone', async () => {
    mocks.existing = { ...mocks.existing, status: 'scheduled', scheduled_at: '2030-01-01T10:00:00.000Z', approved_revision_id: REVISION }
    await expect(schedule({ body: { scheduledAt: '2030-01-02T10:00:00.000Z' } })).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.workflow).not.toHaveBeenCalled()
    mocks.queryOne.mockResolvedValueOnce({ id: 'post-1', status: 'scheduled' })
    await schedule({ body: { scheduledAt: '2030-01-01T10:00:00.000Z', timezone: 'Australia/Perth' } })
    const [, params] = mocks.queryOne.mock.calls.at(-1)!
    expect(params[2]).toBeNull()
    expect(mocks.workflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ revisionId: REVISION }))
  })

  it('keeps review policy and provenance server-controlled in generic browser edits', async () => {
    for (const field of ['reviewPolicy', 'review_policy', 'approvedRevisionId', 'currentRevisionId', 'clientApprovalRevisionId', 'media_asset_refs']) {
      await expect(patch({ body: { [field]: 'legacy' } })).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(patch({ body: { mediaUrls: ['https://cdn.example/a.jpg'] } })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch({ body: { platformOverrides: { facebook: { mediaUrls: ['https://cdn.example/a.jpg'] } } } })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch({ body: { platforms: ['facebook', 'instagram'], accountIds: ['acct-1', 'acct-2'] } })).rejects.toMatchObject({ statusCode: 400 })

    const txQuery = vi.fn(async () => ({rows:[{...mocks.existing,publish_targets:[]}]}))
    mocks.transaction.mockImplementationOnce(async cb => cb({query:txQuery}))
    await patch({ body: { scheduledAt: '2030-02-01T10:00:00.000Z', metadata: { source: 'manual' }, platforms: ['facebook'], accountIds: ['acct-1'], mediaUrls: null } })
    const [sql, params] = (txQuery.mock.calls as unknown as Array<[string,unknown[]]>).find(([sql])=>sql.includes('UPDATE social_posts'))!
    expect(sql).toContain("UPDATE social_post_revisions SET review_status = 'superseded'")
    expect(sql).toContain('approved_revision_id = NULL')
    expect(sql).toContain("status = 'draft'")
    expect(sql).not.toMatch(/metadata = \$/)
    expect(sql).not.toMatch(/platforms = \$/)
    expect(JSON.stringify(params)).not.toContain('manual')
  })

  it('requires the submitter\'s fresh social_draft grant for a delegated submission', async () => {
    mocks.user = { id: 'browser-user', role: 'creative' }
    mocks.capability.mockRejectedValueOnce(Object.assign(new Error('MARKETING_CAPABILITY_REQUIRED'), { statusCode: 403 }))
    await expect(requestApproval({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.submit).not.toHaveBeenCalled()

    mocks.submit.mockResolvedValueOnce({ revision: { id: REVISION, snapshot: { content: 'c' } }, post: { id: 'post-1', client_id: 'client-1', metadata: {} } })
    await expect(requestApproval({})).resolves.toEqual({ ok: true, revisionId: REVISION })
    expect(mocks.capability).toHaveBeenLastCalledWith(expect.anything(), 'browser-user', 'client-1', 'social_draft')
    expect(mocks.submit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ requesterId: 'browser-user', clientIds: ['client-1'] }))
  })

  it('keeps legacy approval on its existing single statement, now revision-bound', async () => {
    mocks.existing = { ...mocks.existing, review_policy: 'legacy', current_revision_id: null }
    mocks.queryOne.mockResolvedValueOnce({ id: 'post-1', status: 'approved', approval_requested_by: null, scheduled_at: null, approved_revision_id: null })
    await expect(approve({})).resolves.toEqual({ ok: true })
    const [sql, params] = mocks.queryOne.mock.calls[0]!
    expect(sql).toContain("review_policy IS DISTINCT FROM 'delegated_marketing'")
    expect(sql).toContain("UPDATE social_post_revisions r")
    expect(params).toEqual(['post-1', 'reviewer', 'client-1', null])
    expect(mocks.reviewer).not.toHaveBeenCalled()
  })
})
