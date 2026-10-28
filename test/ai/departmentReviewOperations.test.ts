/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../server/utils/ai/toolContext'

import { listGoogleAdsReviewPlans, reviewGoogleAdsPlan, executeReviewedGoogleAdsPlan } from '../../server/utils/googleAds/staffReview'
import { listGtmReviewProposals, reviewGtmChangeProposal, executeApprovedGtmProposal } from '../../server/utils/tracking/gtmProposals'

const ids = vi.hoisted(() => ({
  client: '11111111-1111-4111-8111-111111111111', other: '22222222-2222-4222-8222-222222222222',
  plan: '33333333-3333-4333-8333-333333333333', post: '44444444-4444-4444-8444-444444444444',
  revision: '55555555-5555-4555-8555-555555555555', hash: 'a'.repeat(64)
}))
const state = vi.hoisted(() => ({
  active: true, requesterRevoked: false, reviewerRevoked: false, readOnly: false,
  plan: {} as any, gtm: {} as any, post: {} as any, revision: {} as any,
  query: vi.fn(), rows: vi.fn(), transaction: vi.fn(), executeAds: vi.fn(), dispatch: vi.fn(),
  provider: vi.fn(), resolve: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/scope', () => ({ MCP_WRITE_SCOPE: 'mcp:write' }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: state.query, queryOne: state.query, queryRows: state.rows, queryRowsFresh: state.rows,
  transaction: state.transaction, execute: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: state.resolve }))
vi.mock('~~/server/utils/ai/marketing/googleAdsAccess', () => ({ assertGoogleAdsConnection: vi.fn() }))
vi.mock('~~/server/utils/googleAds/actionStore', () => ({ getGoogleAdsActionPlan: async () => state.plan }))
vi.mock('~~/server/utils/googleAds/searchRuntime', () => ({ executeSearchGoogleAdsControlAction: state.executeAds }))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => ({ suiteFlags: { googleAdsRead: true, googleAdsWrite: true } }) }))
vi.mock('~~/server/utils/ai/marketing/gtmAccess', () => ({
  assertGtmSite: async () => ({ id: 'site', client_id: ids.client }),
  assertGtmBindingForSite: async () => ({ id: 'binding', connection_id: 'connection', container_path: 'accounts/1/containers/2' }),
  assertGtmConnectionForClient: vi.fn()
}))
vi.mock('~~/server/utils/tracking/gtmOwnership', () => ({
  getGtmOwnership: async () => ({ evidence_hash: ids.hash }), gtmHash: () => ids.hash
}))
vi.mock('~~/server/utils/googleTagManagerStore', () => ({ resolveGtmAccessToken: state.provider, reserveGtmApiQuota: state.provider }))
vi.mock('~~/server/utils/googleTagManagerInstaller', () => ({ installXeroFlowViaGtm: state.provider, getGtmInstallationIdentity: state.provider, upsertGtmContainerBinding: state.provider }))
vi.mock('~~/server/utils/socialPublishing/dispatch', () => ({ claimAndPublishSocialPost: state.dispatch }))
vi.mock('~~/server/utils/socialPublishing/mediaAssets', () => ({ assertSocialMediaAssetsCurrent: state.provider }))

export function context(userId = 'reviewer'): ToolContext {
  return {
    event: {} as any, userId, userRole: 'member', source: 'mcp', mcpScopes: ['mcp:read', 'mcp:write'],
    mcpStaffAuthority: 'fresh', permissionGroups: ['MARKETING_MANAGEMENT'],
    marketingCapabilities: ['department_management', 'ads_plan', 'tracking_plan', 'social_draft'],
    assistantReadOnly: false,
    assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] }
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  state.active = true; state.requesterRevoked = false; state.reviewerRevoked = false; state.readOnly = false
  state.resolve.mockImplementation(async (_event, id) => ({ ...context(id),
    permissionGroups: state.reviewerRevoked && id !== 'requester' ? [] : ['MARKETING_MANAGEMENT'],
    marketingCapabilities: state.requesterRevoked && id === 'requester' ? [] : context().marketingCapabilities,
    assistantReadOnly: state.readOnly
  }))
  state.plan = { id: ids.plan, clientId: ids.client, actorId: 'requester', requestHash: ids.hash,
    reviewPolicy: 'delegated_marketing', reviewedBy: 'reviewer', status: 'approved', expiresAt: '2099-01-01T00:00:00Z' }
  state.gtm = { id: ids.plan, client_id: ids.client, requester_id: 'requester', site_id: 'site',
    binding_id: 'binding', connection_id: 'connection', ownership_evidence_id: 'evidence', action_type: 'workspace',
    desired_state: { containerPath: 'accounts/1/containers/2', ownershipHash: ids.hash, review: { changes: [] }, html: '<secret>' },
    request_hash: ids.hash, status: 'approved', reviewer_id: 'reviewer' }
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM agency_clients')) return state.active ? { id: ids.client } : null
    if (sql.includes('FROM google_ads_action_plans')) return { client_id: ids.client }
    if (sql.includes('FROM gtm_change_proposals')) return state.gtm
    if (sql.includes('FROM gtm_container_bindings')) return null
    return null
  })
  state.rows.mockImplementation(async (sql: string) => sql.includes('google_ads_action_plans') ? [{ id: ids.plan, client_id: ids.client }] : [state.gtm])
  state.executeAds.mockResolvedValue({ ok: true, status: 'verified' })
  state.transaction.mockImplementation(async fn => fn({ query: async () => ({ rows: [{ id: ids.plan }] }) }))
})

describe('department peer review domain gates', () => {
  it('admits dedicated marketing managers to the Google Ads review list without ADMIN', async () => {
    await expect(listGoogleAdsReviewPlans(context().event, 'reviewer')).resolves.toEqual([state.plan])
  })
  it('admits dedicated marketing managers to the safe GTM review list without ADMIN', async () => {
    const result = await listGtmReviewProposals(context())
    expect(result).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('<secret>')
  })
  it('hides revoked requester proposals from peer lists', async () => {
    state.requesterRevoked = true
    await expect(listGoogleAdsReviewPlans(context().event, 'reviewer')).resolves.toEqual([])
    await expect(listGtmReviewProposals(context())).resolves.toEqual([])
    expect(state.provider).not.toHaveBeenCalled()
  })
  it('executes the exact Ads review using delegated policy without general elevated groups', async () => {
    await executeReviewedGoogleAdsPlan(context().event, 'reviewer', { actionPlanId: ids.plan, expectedRequestHash: ids.hash })
    expect(state.executeAds).toHaveBeenCalledWith(state.plan, expect.objectContaining({ delegatedPlanning: true, permissionGroups: ['MARKETING_MANAGEMENT'] }), expect.anything())
  })
  it.each(['requester', 'reviewer', 'self', 'inactive', 'version', 'readonly'])('denies %s before Ads or GTM decisions or execution side effects', async (failure) => {
    if (failure === 'requester') state.requesterRevoked = true
    if (failure === 'reviewer') state.reviewerRevoked = true
    if (failure === 'inactive') state.active = false
    if (failure === 'readonly') state.readOnly = true
    const ctx = context(failure === 'self' ? 'requester' : 'reviewer')
    const hash = failure === 'version' ? 'b'.repeat(64) : ids.hash
    for (const call of [
      () => reviewGoogleAdsPlan(ctx.event, ctx.userId, { actionPlanId: ids.plan, expectedRequestHash: hash, decision: 'approved' }),
      () => executeReviewedGoogleAdsPlan(ctx.event, ctx.userId, { actionPlanId: ids.plan, expectedRequestHash: hash }),
      () => reviewGtmChangeProposal(ctx, { proposalId: ids.plan, expectedHash: hash, decision: 'approved' }),
      () => executeApprovedGtmProposal(ctx, { proposalId: ids.plan, expectedHash: hash })
    ]) await expect(call()).rejects.toMatchObject({ statusCode: failure === 'version' ? 409 : 403 })
    expect(state.transaction).not.toHaveBeenCalled()
    expect(state.executeAds).not.toHaveBeenCalled()
    expect(state.provider).not.toHaveBeenCalled()
    expect(state.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT)/.test(sql))).toBe(false)
  })
})

// The adapter must preserve signed consent even when called directly with a stale tool descriptor.
// DB/provider edges are mocked; department and independent review authority remain real.
describe('department review MCP adapters', () => {
  async function run(name: string, args: unknown, ctx = context()) {
    const { executeDepartmentReviewTool } = await import('../../server/utils/ai/mcp/departmentReviewTools')
    return executeDepartmentReviewTool(name, args, ctx, 'logical-key', 'session-digest')
  }
  it('exposes explicit read/write tools and closes generic write handlers', async () => {
    const { departmentReviewTools } = await import('../../server/utils/ai/mcp/departmentReviewTools')
    expect(departmentReviewTools).toHaveLength(12)
    expect(new Set(departmentReviewTools.map(t => t.name)).size).toBe(12)
    for (const tool of departmentReviewTools.filter(t => t.mutates)) {
      await expect(tool.handler({}, context())).resolves.toMatchObject({ ok: false })
    }
    expect(state.transaction).not.toHaveBeenCalled()
    expect(state.dispatch).not.toHaveBeenCalled()
  })
  it.each(['marketing_review_google_ads_plan', 'marketing_execute_google_ads_plan', 'marketing_review_gtm_proposal', 'marketing_execute_gtm_proposal', 'marketing_review_social_revision', 'marketing_execute_social_revision'])('denies missing signed write consent for %s', async (name) => {
    const args = name.includes('google_ads')
      ? { actionPlanId: ids.plan, expectedRequestHash: ids.hash }
      : name.includes('gtm')
        ? { proposalId: ids.plan, expectedHash: ids.hash }
        : { postId: ids.post, revisionId: ids.revision, expectedContentHash: ids.hash }
    if (name.includes('_review_')) Object.assign(args, { decision: 'approved' })
    await expect(run(name, args, { ...context(), mcpScopes: ['mcp:read'] })).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(state.query).not.toHaveBeenCalled()
    expect(state.transaction).not.toHaveBeenCalled()
    expect(state.executeAds).not.toHaveBeenCalled()
    expect(state.dispatch).not.toHaveBeenCalled()
  })
  it('does not dispatch arbitrary operations or widen a signed client restriction', async () => {
    await expect(run('confirm_action', {})).resolves.toMatchObject({ ok: false, code: 'not_found' })
    await expect(run('marketing_execute_google_ads_plan', { actionPlanId: ids.plan, expectedRequestHash: ids.hash }, { ...context(), clientScope: ids.other })).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(state.executeAds).not.toHaveBeenCalled()
  })
  it('reads safe peer status without provider execution', async () => {
    await expect(run('marketing_get_google_ads_review', { actionPlanId: ids.plan })).resolves.toMatchObject({ ok: true, data: { id: ids.plan } })
    const result = await run('marketing_get_gtm_review', { proposalId: ids.plan })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('<secret>')
    expect(state.provider).not.toHaveBeenCalled()
    expect(state.executeAds).not.toHaveBeenCalled()
  })
  it('reports a denied provider execution as failure rather than wrapping it in success', async () => {
    state.executeAds.mockResolvedValue({ ok: false, status: 'forbidden', message: 'provider detail must not leak' })
    const result = await run('marketing_execute_google_ads_plan', { actionPlanId: ids.plan, expectedRequestHash: ids.hash })
    expect(result).toMatchObject({ ok: false, code: 'execution_blocked', details: { status: 'forbidden' } })
    expect(JSON.stringify(result)).not.toContain('provider detail')
  })
  it('rejects a revoked department grant before any resource query', async () => {
    state.reviewerRevoked = true
    await expect(run('marketing_list_google_ads_reviews', {})).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(state.rows).not.toHaveBeenCalled()
  })
})

describe('department social exact revision boundary', () => {
  beforeEach(async () => {
    const { buildSocialPostSnapshot, socialSnapshotHash } = await import('../../server/utils/socialPublishing/revisions')
    state.post = { id: ids.post, client_id: ids.client, created_by: 'requester', content: 'Reviewed copy',
      media_urls: [], link_url: null, hashtags: [], first_comment: null, platforms: ['facebook'], account_ids: [],
      publish_targets: [], platform_overrides: {}, scheduled_at: null, timezone: 'Australia/Melbourne',
      status: 'draft', metadata: {}, campaign_id: null, review_policy: 'delegated_marketing', media_asset_refs: [],
      current_revision_id: ids.revision, approved_revision_id: null, approved_by: null,
      client_approval_revision_id: null, client_approval_status: null, approval_requested_by: 'requester' }
    const snapshot = buildSocialPostSnapshot(state.post, [])
    state.revision = { id: ids.revision, post_id: ids.post, client_id: ids.client, revision_number: 1,
      review_policy: 'delegated_marketing', requested_by: 'requester', reviewed_by: null, review_status: 'pending',
      content_hash: socialSnapshotHash(snapshot), snapshot, expires_at: '2099-01-01T00:00:00Z', dispatch_claimed_at: null }
    const original = state.query.getMockImplementation()!
    state.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM social_posts')) return state.post
      if (sql.includes('FROM social_post_revisions')) return state.revision
      return original(sql, params)
    })
    state.transaction.mockImplementation(async fn => fn({ query: async (sql: string) => {
      if (sql.includes('FROM social_posts')) return { rows: [state.post] }
      if (sql.includes('FROM social_post_revisions')) return { rows: [state.revision] }
      if (sql.includes('UPDATE social_post_revisions')) return { rows: [{ ...state.revision, review_status: 'approved', reviewed_by: 'reviewer' }] }
      if (sql.includes('UPDATE social_posts')) return { rows: [{ ...state.post, status: 'approved' }] }
      return { rows: [] }
    } }))
    state.dispatch.mockResolvedValue({ ok: true, status: 'accepted', postId: ids.post, revisionId: ids.revision })
  })
  async function run(name: string, args: any = {}, ctx = context()) {
    const { executeDepartmentReviewTool } = await import('../../server/utils/ai/mcp/departmentReviewTools')
    return executeDepartmentReviewTool(name, { postId: ids.post, ...args }, ctx, 'key', 'session')
  }
  it.each(['requester', 'reviewer', 'self', 'creator', 'inactive', 'revision', 'hash', 'readonly', 'scope'])('blocks %s before social approval or dispatch', async (failure) => {
    if (failure === 'requester') state.requesterRevoked = true
    if (failure === 'reviewer') state.reviewerRevoked = true
    if (failure === 'inactive') state.active = false
    if (failure === 'readonly') state.readOnly = true
    if (failure === 'creator') state.post.created_by = 'reviewer'
    const ctx = { ...context(failure === 'self' ? 'requester' : 'reviewer'), ...(failure === 'scope' ? { clientScope: ids.other } : {}) }
    const args = { revisionId: failure === 'revision' ? ids.other : ids.revision,
      expectedContentHash: failure === 'hash' ? ids.hash : state.revision.content_hash }
    const code = ['revision', 'hash'].includes(failure) ? 'conflict' : 'forbidden'
    await expect(run('marketing_review_social_revision', { ...args, decision: 'approved' }, ctx)).resolves.toMatchObject({ ok: false, code })
    state.post.status = 'approved'; state.post.approved_revision_id = ids.revision
    state.revision.review_status = 'approved'; state.revision.reviewed_by = 'reviewer'
    await expect(run('marketing_execute_social_revision', args, ctx)).resolves.toMatchObject({ ok: false, code })
    expect(state.transaction).not.toHaveBeenCalled()
    expect(state.dispatch).not.toHaveBeenCalled()
    expect(state.provider).not.toHaveBeenCalled()
  })
  it('rejects altered content via the actual locked revision service before media verification', async () => {
    state.post.content = 'Changed after submission'
    await expect(run('marketing_review_social_revision', { revisionId: ids.revision, expectedContentHash: state.revision.content_hash, decision: 'approved' })).resolves.toMatchObject({ ok: false, code: 'conflict' })
    expect(state.provider).not.toHaveBeenCalled()
    expect(state.dispatch).not.toHaveBeenCalled()
  })
  it('shows the reviewed effective copy and hash without raw storage metadata', async () => {
    state.revision.snapshot.media = [{ kind: 'upload', id: 'asset', mediaType: 'image', r2Key: 'private-path', sha256: 'bytes' }]
    const result = await run('marketing_get_social_review')
    expect(result).toMatchObject({ ok: true, data: { postId: ids.post, revision: { id: ids.revision, contentHash: state.revision.content_hash }, content: 'Reviewed copy' } })
    expect(JSON.stringify(result)).not.toContain('private-path')
  })
  it('approves an unchanged exact social revision through the existing transaction', async () => {
    await expect(run('marketing_review_social_revision', { revisionId: ids.revision, expectedContentHash: state.revision.content_hash, decision: 'approved' })).resolves.toMatchObject({ ok: true, data: { decision: 'approved', revisionId: ids.revision } })
    expect(state.transaction).toHaveBeenCalledTimes(1)
  })
  it('preserves accepted dispatch as accepted and refuses a blind replay', async () => {
    state.post.status = 'approved'; state.post.approved_revision_id = ids.revision; state.post.approved_by = 'reviewer'
    state.revision.review_status = 'approved'; state.revision.reviewed_by = 'reviewer'
    const args = { revisionId: ids.revision, expectedContentHash: state.revision.content_hash }
    await expect(run('marketing_execute_social_revision', args)).resolves.toMatchObject({ ok: true, data: { status: 'accepted' } })
    expect(state.dispatch).toHaveBeenCalledWith(expect.objectContaining({ revisionId: ids.revision, claimStatuses: ['approved'] }))
    state.revision.dispatch_claimed_at = '2026-10-28T00:00:00Z'
    await expect(run('marketing_execute_social_revision', args)).resolves.toMatchObject({ ok: false, code: 'conflict' })
    expect(state.dispatch).toHaveBeenCalledTimes(1)
  })
  it('projects safe per-target publication, first-comment and reconciliation evidence in list, get and execute', async () => {
    const target = {
      status: 'unknown', platform: 'facebook', accountId: 'account-1', platformAccountId: 'page-1',
      platformPostId: 'post-1', providerStatus: 'dispatch_interrupted',
      providerReceipt: { code: 'transport_unknown', logId: 'log-1' }, publicPostIds: ['post-1'],
      nextPollAt: '2026-10-28T01:00:00.000Z', url: 'https://secret.test?token=secret',
      error: 'raw provider error with access_token=secret',
      firstComment: { status: 'failed', platformPostId: 'comment-1', error: 'raw comment secret' },
      initialReceipt: { status: 'unknown', platformPostId: 'post-1', error: 'raw initial secret' }
    }
    state.post.status = 'unknown'
    state.post.platform_results = { 'facebook:account-1': target }
    state.revision.dispatch_outcome = 'unknown'
    state.rows.mockResolvedValue([{ id: ids.post }])
    const { executeDepartmentReviewTool } = await import('../../server/utils/ai/mcp/departmentReviewTools')
    const listed = await executeDepartmentReviewTool('marketing_list_social_reviews', {}, context(), 'key', 'session')
    const got = await run('marketing_get_social_review')
    for (const result of [listed, got]) {
      expect(result).toMatchObject({ ok: true })
      const view = result === listed ? (result as any).data.items[0] : (result as any).data
      expect(view.outcome).toMatchObject({
        currentStatus: 'unknown', initialOutcome: 'unknown', reconciliationRequired: true,
        targets: [{
          key: 'facebook:account-1', status: 'unknown', platformPostId: 'post-1',
          providerStatus: 'dispatch_interrupted', providerReceipt: { code: 'transport_unknown', logId: 'log-1' },
          firstComment: { status: 'failed', platformPostId: 'comment-1' },
          initialReceipt: { status: 'unknown', platformPostId: 'post-1' }
        }]
      })
      expect(JSON.stringify(result)).not.toMatch(/secret|access_token|raw provider|raw comment|raw initial/)
    }
    state.post.status = 'approved'; state.post.approved_revision_id = ids.revision; state.post.approved_by = 'reviewer'
    state.revision.review_status = 'approved'; state.revision.reviewed_by = 'reviewer'
    state.dispatch.mockResolvedValue({ ok: true, status: 'accepted', postId: ids.post, revisionId: ids.revision,
      platformResults: { 'facebook:account-1': { ...target, status: 'accepted' } } })
    const executed = await run('marketing_execute_social_revision', {
      revisionId: ids.revision,
      expectedContentHash: state.revision.content_hash
    })
    expect(executed).toMatchObject({ ok: true, data: {
      status: 'accepted',
      outcome: { currentStatus: 'accepted', reconciliationRequired: true,
        targets: [{ status: 'accepted', firstComment: { status: 'failed' } }] }
    } })
    expect(JSON.stringify(executed)).not.toMatch(/secret|access_token|raw provider|raw comment|raw initial/)
  })
})
