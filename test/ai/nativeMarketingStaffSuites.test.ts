import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolContext } from '../../server/utils/ai/toolContext'

// Native chat must reach the same staff suites the MCP exposes (Google Ads, GTM, social drafts), and
// dispatch each through the MCP's own scoped executor. Only the services below the adapter are mocked.
const fresh = {
  userId: 'actor', userRole: 'staff', source: 'chat', event: {}, conversationId: 'conversation-1',
  permissionGroups: ['MARKETING_MANAGEMENT'], mcpStaffAuthority: 'fresh',
  marketingCapabilities: ['reporting', 'ads_plan', 'tracking_plan', 'social_draft', 'department_management'],
  assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] }
} as unknown as ToolContext
const ctx = { userId: 'actor', userRole: 'staff', source: 'chat', event: {}, conversationId: 'conversation-1' } as ToolContext

const flags = { googleAdsRead: true, googleAdsWrite: true, writes: true, banners: true, feeds: true }
const mocks = vi.hoisted(() => ({
  config: { serverEnabled: true, suiteFlags: {} as Record<string, boolean> },
  admitted: vi.fn((_name: string): { allowed: boolean } => ({ allowed: true })),
  executeTask4: vi.fn(async () => ({ ok: true, data: { status: 'planned' } })),
  executeSocial: vi.fn(async () => ({ ok: true, data: { status: 'draft' } })),
  executeDepartment: vi.fn(async () => ({ ok: true, data: {} })),
  prepare: vi.fn(async () => ({ ok: true, data: { proposalId: 'click-card' } })),
  execute: vi.fn(async () => undefined)
}))

vi.mock('~~/server/utils/db', async importOriginal => ({ ...await importOriginal<typeof import('~~/server/utils/db')>(), execute: mocks.execute }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/nativeAuthority', () => ({
  resolveNativeMarketingContext: vi.fn(async () => fresh),
  isNativeMarketingContext: () => true
}))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => mocks.config }))
vi.mock('~~/server/utils/ai/mcp/marketingPolicy', () => ({ evaluateStaffToolAdmission: mocks.admitted }))
vi.mock('~~/server/utils/ai/mcp/departmentTools', () => ({ toolsFor: () => [], executeDepartmentTool: mocks.executeDepartment }))
vi.mock('~~/server/utils/ai/marketing/nativeConfirmationPolicy', () => ({ nativeConfirmationAllowed: vi.fn(async () => true) }))
vi.mock('~~/server/utils/ai/marketing/nativePendingActions', () => ({ prepareNativeMarketingAction: mocks.prepare }))
vi.mock('~~/server/utils/ai/mcp/marketingTask4Tools', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/ai/mcp/marketingTask4Tools')>(),
  executeTask4StaffTool: mocks.executeTask4
}))
vi.mock('~~/server/utils/ai/mcp/socialTools', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/ai/mcp/socialTools')>(),
  executeSocialMcpTool: mocks.executeSocial
}))

const { buildNativeMarketingTools, executeConfirmedNativeMarketingAction } = await import('../../server/utils/ai/marketing/nativeTools')
const { sha256 } = await import('../../server/utils/ai/marketing/departmentExecutionLedger')
const { ADS_STAFF_READ_NAMES, ADS_STAFF_PLAN_NAMES, GTM_STAFF_NAMES } = await import('../../server/utils/ai/mcp/marketingTask4Names')
const { SOCIAL_MCP_TOOL_NAMES } = await import('../../server/utils/ai/mcp/socialToolNames')

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
function envelopeFor(operation: string, args: unknown) {
  const digest = sha256({ actor: 'actor', messageId: 'message-1', tool: operation, args })
  return { version: 1 as const, actorId: 'actor', messageId: 'message-1', operation, args, executionKey: `chat:${digest}`, digest, riskTier: 'confirm' as const, nativeMarketing: true as const }
}

describe('native chat marketing staff suites (MCP parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.config = { serverEnabled: true, suiteFlags: { ...flags } }
    mocks.admitted.mockReturnValue({ allowed: true })
  })

  it('exposes every Google Ads, GTM and social staff tool the MCP projects', async () => {
    const names = new Set((await buildNativeMarketingTools(ctx, 'message-1')).map(tool => tool.name))
    for (const name of [...ADS_STAFF_READ_NAMES, ...ADS_STAFF_PLAN_NAMES, ...GTM_STAFF_NAMES, ...SOCIAL_MCP_TOOL_NAMES]) {
      expect(names, name).toContain(name)
    }
  })

  it('honours the Google Ads suite flags exactly as the MCP does', async () => {
    mocks.config = { serverEnabled: true, suiteFlags: { ...flags, googleAdsRead: false, googleAdsWrite: false } }
    const names = (await buildNativeMarketingTools(ctx, 'message-1')).map(tool => tool.name)
    expect(names.filter(name => name.startsWith('google_ads_'))).toEqual([])
    expect(names).toContain('list_gtm_site_inventory')
  })

  it('drops tools the actor is not admitted to (grant/role checked per tool)', async () => {
    mocks.admitted.mockImplementation((name: string) => ({ allowed: !name.startsWith('google_ads_') }))
    const names = (await buildNativeMarketingTools(ctx, 'message-1')).map(tool => tool.name)
    expect(names.some(name => name.startsWith('google_ads_'))).toBe(false)
    expect(names).toContain('create_social_post_draft')
  })

  it('runs Ads/GTM reads through the scoped staff executor with a chat-bound key', async () => {
    const tool = (await buildNativeMarketingTools(ctx, 'message-1')).find(t => t.name === 'list_client_gtm_connections')!
    expect(tool.mutates).toBe(false)
    await tool.handler({}, ctx)
    expect(mocks.executeTask4).toHaveBeenCalledWith('list_client_gtm_connections', {}, fresh, expect.stringMatching(/^chat:[0-9a-f]{64}$/))
    expect(mocks.executeDepartment).not.toHaveBeenCalled()
  })

  it('a Google Ads plan only prepares a click-confirm card; the click runs the scoped planner once', async () => {
    const args = { clientId: UUID_A, connectionId: UUID_B, idempotencyKey: 'model-key', entityType: 'keyword', resourceName: 'customers/1/adGroupCriteria/2~3' }
    const tool = (await buildNativeMarketingTools(ctx, 'message-1')).find(t => t.name === 'google_ads_plan_pause')!
    expect(tool.mutates).toBe(true)
    expect(await tool.handler(args, ctx)).toMatchObject({ ok: true, data: { proposalId: 'click-card' } })
    expect(mocks.prepare).toHaveBeenCalledWith(fresh, 'message-1', 'google_ads_plan_pause', expect.objectContaining({ requestedMode: 'proposal' }), 'confirm')
    expect(mocks.executeTask4).not.toHaveBeenCalled()

    const parsed = { ...args, requestedMode: 'proposal' }
    const envelope = envelopeFor('google_ads_plan_pause', parsed)
    expect(await executeConfirmedNativeMarketingAction(envelope, ctx)).toMatchObject({ ok: true })
    expect(mocks.executeTask4).toHaveBeenCalledTimes(1)
    expect(mocks.executeTask4).toHaveBeenCalledWith('google_ads_plan_pause', parsed, fresh, envelope.executionKey)
  })

  it('staff cannot request automatic Google Ads mode from chat', async () => {
    const tool = (await buildNativeMarketingTools(ctx, 'message-1')).find(t => t.name === 'google_ads_plan_pause')!
    const result = await tool.handler({ clientId: UUID_A, connectionId: UUID_B, idempotencyKey: 'k', entityType: 'campaign', resourceName: 'customers/1/campaigns/2', requestedMode: 'automatic' }, ctx)
    expect(result).toMatchObject({ ok: false, code: 'bad_args' })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('a confirmed social draft uses the shared social ledger with a well-formed key bound to this message', async () => {
    const args = { postId: UUID_A }
    const envelope = envelopeFor('submit_social_post_for_review', args)
    expect(await executeConfirmedNativeMarketingAction(envelope, ctx)).toMatchObject({ ok: true })
    expect(mocks.executeSocial).toHaveBeenCalledWith({
      toolName: 'submit_social_post_for_review', args, ctx: fresh, userId: 'actor',
      idempotencyKey: `mcp:${envelope.digest}`, sessionDigest: envelope.digest
    })
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_action_audit'),
      expect.arrayContaining(['submit_social_post_for_review', 'confirm', 'proposed']))
  })

  it('a revoked grant at click time never dispatches', async () => {
    mocks.admitted.mockReturnValue({ allowed: false })
    const envelope = envelopeFor('submit_social_post_for_review', { postId: UUID_A })
    expect(await executeConfirmedNativeMarketingAction(envelope, ctx)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(mocks.executeSocial).not.toHaveBeenCalled()
  })

  it('nothing is exposed while the MCP server switch is off', async () => {
    mocks.config = { serverEnabled: false, suiteFlags: { ...flags } }
    expect(await buildNativeMarketingTools(ctx, 'message-1')).toEqual([])
  })
})
