/* eslint-disable @stylistic/max-statements-per-line, @typescript-eslint/no-explicit-any -- compact fixture tables for heterogeneous mock provider/DB rows */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDepartmentCampaignTool } from '~~/server/utils/ai/mcp/departmentCampaignTools'

const m = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), provider: { getCampaigns: vi.fn(), getAdSets: vi.fn(), getPages: vi.fn(), uploadAdImage: vi.fn(), createAdCreative: vi.fn(), createAd: vi.fn(), getAdLaunchBinding: vi.fn() }, authority: vi.fn(), reviewer: vi.fn(), requester: vi.fn(), fetch: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.query, transactionWithoutRetry: m.transaction }))
vi.mock('~~/server/utils/metaClient', () => m.provider)
vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({ assertPublicSiteOrigin: vi.fn().mockResolvedValue('https://assets.example') }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: m.authority }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: m.requester }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ requireIndependentMarketingReviewer: m.reviewer, assertMarketingCapabilityAtBoundary: m.requester }))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => ({ serverEnabled: true, suiteFlags: { banners: true, writes: true } }) }))
const ids = { client: '11111111-1111-4111-8111-111111111111', author: '22222222-2222-4222-8222-222222222222', peer: '33333333-3333-4333-8333-333333333333', proposal: '44444444-4444-4444-8444-444444444444' }
const args = { clientId: ids.client, publishedId: ids.author, exportId: ids.peer, connectionId: ids.client, campaignId: '123456', adSetId: '234567', pageId: '345678', primaryTexts: ['Copy'], headlines: ['Headline'], descriptions: [], callToAction: 'LEARN_MORE', linkUrl: 'https://dealer.example', adName: 'Launch', status: 'PAUSED' }
const ctx: any = { userId: ids.author, source: 'mcp', assistantScope: { clientAccessMode: 'all_active' }, permissionGroups: ['MARKETING_MANAGEMENT'], event: { context: { cloudflare: { env: { META_AD_PUBLISH_ENABLED: 'true', R2_PUBLIC_URL: 'https://assets.example' } } } } }
const key = `mcp:${'a'.repeat(64)}`, digest = 'b'.repeat(64)
let row: any
async function call(name: string, input: unknown, actor = ids.author) { return executeDepartmentCampaignTool(name, input, { ...ctx, userId: actor }, key, digest) }
beforeEach(() => {
  vi.clearAllMocks(); row = undefined
  m.authority.mockImplementation(async c => c); m.requester.mockResolvedValue(ctx)
  m.reviewer.mockImplementation(async (_e, i) => { if (i.requesterId === i.reviewerId) throw new Error('self review') })
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('social_accounts')) return { id: ids.peer }
    if (sql.includes('agency_clients')) return { id: ids.client }
    if (sql.includes('social_connections')) return { id: ids.client, account_id: '123456789', access_token: 'secret-token', scopes: ['ads_management'], token_expires_at: null }
    if (sql.includes('banner_published')) return { project_id: ids.client, url: `https://assets.example/banner-images/${ids.client}/a.png`, r2_key: `banner-images/${ids.client}/a.png`, format_key: 'mrec', version: 1 }
    if (sql.includes('ai_pending_actions')) return row
    throw new Error('Unexpected query')
  })
  m.transaction.mockImplementation(async run => run({ query: async (sql: string, p: any[]) => {
    if (sql.startsWith('SELECT')) return { rows: [] }
    if (sql.includes('INSERT INTO ai_pending_actions')) { row = { id: ids.proposal, user_id: ids.author, status: 'proposed', expires_at: new Date(Date.now() + 3600000).toISOString(), resolved_payload: JSON.parse(p[2]), result_payload: null }; return { rows: [row] } }
    if (sql.includes('UPDATE ai_pending_actions')) { if (sql.includes('SET status')) row.status = 'executed'; else row.result_payload = JSON.parse(p[1]); return { rows: [{ id: ids.proposal }] } }
    return { rows: [{ id: ids.peer }] }
  } }))
  m.provider.getCampaigns.mockResolvedValue([{ id: '123456', status: 'PAUSED' }]); m.provider.getAdSets.mockResolvedValue([{ id: '234567', status: 'PAUSED' }]); m.provider.getPages.mockResolvedValue([{ id: '345678' }])
  m.provider.uploadAdImage.mockResolvedValue({ hash: 'image-hash', url: 'https://private.example' }); m.provider.createAdCreative.mockResolvedValue({ id: '456789' }); m.provider.createAd.mockResolvedValue({ id: '567890' }); m.provider.getAdLaunchBinding.mockResolvedValue({ id: '567890', accountId: '123456789', campaignId: '123456', adSetId: '234567', creativeId: '456789', status: 'PAUSED' })
  m.fetch.mockImplementation(async () => new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } })); vi.stubGlobal('fetch', m.fetch)
})
describe('paid Meta reviewed dispatch', () => {
  it('prepares, independently reviews, retains partial creative IDs and never repeats ambiguous ad creation', async () => {
    const proposal = await call('marketing_prepare_meta_ad_launch', args)
    expect(proposal.ok).toBe(true)
    const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row.resolved_payload.revision, ack: true }
    expect((await call('marketing_approve_meta_ad_launch', exact)).ok).toBe(false)
    expect((await call('marketing_approve_meta_ad_launch', exact, ids.peer)).ok).toBe(true)
    m.provider.createAd.mockRejectedValue(new Error('lost acknowledgement secret-token'))
    const result = await call('marketing_execute_meta_ad_launch', exact)
    expect(result.code).toBe('reconciliation_required')
    expect(row.status).toBe('executed'); expect(row.result_payload.creativeId).toBe('456789')
    expect((await call('marketing_execute_meta_ad_launch', exact)).code).toBe('reconciliation_required')
    expect(m.provider.createAd).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })
  it('does not let the approving reviewer execute the requester proposal', async () => {
    await call('marketing_prepare_meta_ad_launch', args)
    const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row.resolved_payload.revision, ack: true }
    await call('marketing_approve_meta_ad_launch', exact, ids.peer)
    expect((await call('marketing_execute_meta_ad_launch', exact, ids.peer)).code).toBe('forbidden')
    expect(row.status).toBe('proposed')
    expect(m.provider.uploadAdImage).not.toHaveBeenCalled()
  })
  it('keeps paid creation behind the publish kill switch in compact and legacy forms', async () => {
    await call('marketing_prepare_meta_ad_launch', args)
    const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row.resolved_payload.revision, ack: true }
    await call('marketing_approve_meta_ad_launch', exact, ids.peer)
    const env = ctx.event.context.cloudflare.env
    ctx.event.context.cloudflare.env = { R2_PUBLIC_URL: 'https://assets.example', MARKETING_PROVIDER_CONFIG: JSON.stringify({ metaAdPublish: true }), META_AD_PUBLISH_ENABLED: 'false' }
    try {
      expect((await call('marketing_execute_meta_ad_launch', exact)).code).toBe('disabled')
      expect(row.status).toBe('proposed')
      ctx.event.context.cloudflare.env = { R2_PUBLIC_URL: 'https://assets.example', MARKETING_PROVIDER_CONFIG: JSON.stringify({ metaAdPublish: true }) }
      expect((await call('marketing_execute_meta_ad_launch', exact)).ok).toBe(true)
    } finally {
      ctx.event.context.cloudflare.env = env
    }
    expect(m.provider.createAd).toHaveBeenCalledTimes(1)
  })
  it('rejects changed image bytes after review before any Meta write', async () => {
    await call('marketing_prepare_meta_ad_launch', args)
    const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row.resolved_payload.revision, ack: true }
    await call('marketing_approve_meta_ad_launch', exact, ids.peer)
    m.fetch.mockImplementation(async () => new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]), { headers: { 'content-type': 'image/png' } }))
    expect((await call('marketing_execute_meta_ad_launch', exact)).code).toBe('revision_conflict')
    expect(m.provider.uploadAdImage).not.toHaveBeenCalled()
  })
  it('retains the created ad ID and holds a non-paused readback', async () => {
    await call('marketing_prepare_meta_ad_launch', args)
    const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row.resolved_payload.revision, ack: true }
    await call('marketing_approve_meta_ad_launch', exact, ids.peer)
    m.provider.getAdLaunchBinding.mockResolvedValue({ id: '567890', status: 'ACTIVE' })
    expect((await call('marketing_execute_meta_ad_launch', exact)).code).toBe('reconciliation_required')
    expect(row.result_payload.adId).toBe('567890'); expect(row.result_payload.complete).toBe(false)
  })
  it('rejects an unowned campaign before exporting image bytes', async () => {
    m.provider.getCampaigns.mockResolvedValue([{ id: 'foreign' }])
    expect((await call('marketing_prepare_meta_ad_launch', args)).ok).toBe(false)
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.provider.uploadAdImage).not.toHaveBeenCalled()
  })
})
