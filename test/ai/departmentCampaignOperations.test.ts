/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous mock fixtures */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { departmentCampaignTools, executeDepartmentCampaignTool } from '~~/server/utils/ai/mcp/departmentCampaignTools'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), query: vi.fn(), reviewer: vi.fn(), requester: vi.fn(), get: vi.fn(), approve: vi.fn(), execute: vi.fn(), config: vi.fn(), inventoryHash: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/departmentCampaignInventory', () => ({ departmentPmaxBindingHash: mocks.inventoryHash }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: mocks.authority }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query, queryRowsFresh: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ requireIndependentMarketingReviewer: mocks.reviewer, assertMarketingCapabilityAtBoundary: mocks.requester }))
vi.mock('~~/server/utils/googlePmaxLaunchStore', () => ({ getGooglePmaxLaunch: mocks.get, approveGooglePmaxLaunch: mocks.approve }))
vi.mock('~~/server/utils/googlePmaxExecutionService', () => ({ executeGooglePmaxPausedCreate: mocks.execute, executeGooglePmaxActivation: mocks.execute }))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: mocks.config }))
const clientId = '11111111-1111-4111-8111-111111111111'
const launchId = '22222222-2222-4222-8222-222222222222'
const actor = '33333333-3333-4333-8333-333333333333'
const requester = '44444444-4444-4444-8444-444444444444'
const hash = 'a'.repeat(64)
const key = `mcp:${'b'.repeat(64)}`
const ctx: any = { userId: actor, source: 'mcp', event: { context: { cloudflare: { env: {} } } }, assistantScope: { clientAccessMode: 'all_active' } }
const launch: any = { id: launchId, tenantId: clientId, clientId, connectionId: launchId, briefId: launchId, createdBy: requester, configHash: hash, configVersion: 1, normalizedConfig: { clientId, connectionId: launchId, customerId: '1234567890' }, state: 'READY_FOR_APPROVAL', providerResources: {}, preflightResult: {} }
const exact = { clientId, launchId, expectedConfigHash: hash, expectedConfigVersion: 1, ack: true }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authority.mockImplementation(async c => c)
  mocks.config.mockReturnValue({ serverEnabled: true, suiteFlags: { googleAdsRead: true, googleAdsWrite: true, writes: true } })
  mocks.query.mockImplementation(async (sql: string) => sql.includes('xero_org_connection') ? { tenant_id: clientId } : sql.includes('social_connections') ? { id: launchId, client_id: clientId, account_id: '1234567890', status: 'active' } : { id: clientId })
  mocks.inventoryHash.mockResolvedValue('feed-hash')
  mocks.get.mockResolvedValue(structuredClone(launch))
  mocks.approve.mockResolvedValue({ ...launch, state: 'APPROVED' })
  mocks.requester.mockResolvedValue({ permissionGroups: ['MARKETING_MANAGEMENT'] })
})
describe('department paid launch boundary', () => {
  it('requires verified logical identity for mutations', async () => {
    expect((await executeDepartmentCampaignTool('marketing_approve_pmax_launch', { ...exact, reason: 'Reviewed exact campaign' }, ctx)).code).toBe('coordinator_required')
    expect(mocks.authority).not.toHaveBeenCalled()
  })
  it('rejects resource client mismatch before approval', async () => {
    mocks.get.mockResolvedValue({ ...launch, clientId: actor })
    expect((await executeDepartmentCampaignTool('marketing_approve_pmax_launch', { ...exact, reason: 'Reviewed exact campaign' }, ctx, key, hash)).ok).toBe(false)
    expect(mocks.approve).not.toHaveBeenCalled()
  })
  it('rejects stale exact hash', async () => {
    expect((await executeDepartmentCampaignTool('marketing_approve_pmax_launch', { ...exact, expectedConfigHash: 'c'.repeat(64), reason: 'Reviewed exact campaign' }, ctx, key, hash)).ok).toBe(false)
    expect(mocks.approve).not.toHaveBeenCalled()
  })
  it('rechecks independent reviewer and requester and emits safe approval projection', async () => {
    const result = await executeDepartmentCampaignTool('marketing_approve_pmax_launch', { ...exact, reason: 'Reviewed exact campaign' }, ctx, key, hash)
    expect(result.ok).toBe(true)
    expect(mocks.reviewer).toHaveBeenCalledWith(ctx.event, { requesterId: requester, reviewerId: actor, clientId })
    expect(mocks.requester).toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('normalizedConfig')
  })
  it('never dispatches an uncertain or obsolete create state', async () => {
    mocks.get.mockResolvedValue({ ...launch, state: 'RECOVERY_REQUIRED' })
    expect((await executeDepartmentCampaignTool('marketing_execute_pmax_launch', exact, ctx, key, hash)).ok).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('executes an exact approved launch only while source binding and both kill switches permit it', async () => {
    mocks.get.mockResolvedValue({ ...launch, state: 'APPROVED' })
    const prior = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => sql.includes('campaign_launch_approvals') ? { approved_by: actor, binding_hash: 'feed-hash' } : prior(sql, params))
    mocks.execute.mockResolvedValue({ launch: { ...launch, state: 'VERIFIED_PAUSED' } })
    const enabled = { ...ctx, event: { context: { cloudflare: { env: { GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true' } } } } }
    expect((await executeDepartmentCampaignTool('marketing_execute_pmax_launch', exact, enabled, key, hash)).ok).toBe(true)
    mocks.inventoryHash.mockResolvedValue('changed-feed')
    expect((await executeDepartmentCampaignTool('marketing_execute_pmax_launch', exact, enabled, key, hash)).code).toBe('binding_changed')
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
  it('honours the compact provider config and lets an explicit legacy false override it', async () => {
    mocks.get.mockResolvedValue({ ...launch, state: 'APPROVED' })
    const prior = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => sql.includes('campaign_launch_approvals') ? { approved_by: actor, binding_hash: 'feed-hash' } : prior(sql, params))
    mocks.execute.mockResolvedValue({ launch: { ...launch, state: 'VERIFIED_PAUSED' } })
    const compact = JSON.stringify({ pmaxProviderWrites: true })
    const withEnv = (env: Record<string, string>) => ({ ...ctx, event: { context: { cloudflare: { env } } } })
    expect((await executeDepartmentCampaignTool('marketing_execute_pmax_launch', exact, withEnv({ MARKETING_PROVIDER_CONFIG: compact }), key, hash)).ok).toBe(true)
    expect((await executeDepartmentCampaignTool('marketing_execute_pmax_launch', exact, withEnv({ MARKETING_PROVIDER_CONFIG: compact, GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'false' }), key, hash)).code).toBe('disabled')
    expect((await executeDepartmentCampaignTool('marketing_execute_pmax_launch', exact, withEnv({}), key, hash)).code).toBe('disabled')
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
  it('keeps generic mutating handlers closed', async () => {
    for (const tool of departmentCampaignTools.filter(t => t.mutates)) expect((await tool.handler({}, ctx)).code).toBe('coordinator_required')
  })
})
