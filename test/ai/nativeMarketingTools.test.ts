import type { McpSuiteFlags } from '../../server/utils/ai/mcp/project'
import type { PermissionGroup } from '../../server/utils/permissions'
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { composeEffectiveAssistantTools, resolveCatalogRuntimePolicy } from '../../server/utils/ai/governance/catalogComposition'
import { buildNativeMarketingTools, executeConfirmedNativeMarketingAction } from '../../server/utils/ai/marketing/nativeTools'
import { sha256 } from '../../server/utils/ai/marketing/departmentExecutionLedger'
import type { ToolContext } from '../../server/utils/ai/toolContext'

vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ execute: vi.fn(), queryRows: vi.fn(), queryOneFresh: vi.fn(), queryRowsFresh: vi.fn() }))
const ctx = { userId: 'actor', userRole: 'staff', source: 'chat', event: {} } as ToolContext
const tool = { name: 'marketing_propose_inventory_feed_change', parameters: z.object({ clientId: z.string() }), description: 'Existing review-bound operation', requiredPermission: 'MARKETING_MANAGEMENT' as const, mutates: true, returnsUntrusted: true, handler: vi.fn() }
const fresh = { ...ctx, permissionGroups: ['MARKETING_MANAGEMENT'], marketingCapabilities: ['department_management'], mcpStaffAuthority: 'fresh', assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] } } as ToolContext
function deps() {
  return { propose: vi.fn().mockResolvedValue({ ok: true, data: { proposalId: 'outer-click-card', resolved: { nativeMarketing: true } } }), authorizeConfirmation: vi.fn().mockResolvedValue(true), resolve: vi.fn().mockResolvedValue(fresh), admitted: vi.fn().mockReturnValue(true), tools: [tool], run: vi.fn().mockResolvedValue({ ok: true, data: { requiresIndependentReview: true } }), flags: {} as McpSuiteFlags, audit: vi.fn() }
}
describe('native reviewed marketing adapter', () => {
  it('preserves schemas and only proposes a native click card; model ack never dispatches', async () => {
    const d = deps()
    const tools = await buildNativeMarketingTools(ctx, 'message-1', d)
    expect(tools[0].parameters).toBe(tool.parameters)
    expect(tools[0].mutates).toBe(true)
    expect(await tools[0].handler({ clientId: 'client-a' }, ctx)).toMatchObject({ ok: true, data: { proposalId: 'outer-click-card' } })
    expect(d.propose).toHaveBeenCalledWith(fresh, 'message-1', tool.name, { clientId: 'client-a' }, 'confirm')
    expect(d.run).not.toHaveBeenCalled()
  })
  it('confirmed dispatch reruns current governance and preserves the retained domain identity', async () => {
    const d = deps()
    const args = { clientId: 'client-a' }
    const digest = sha256({ actor: ctx.userId, messageId: 'message-1', tool: tool.name, args })
    const envelope = { version: 1 as const, actorId: ctx.userId, messageId: 'message-1', operation: tool.name, args, executionKey: `chat:${digest}`, digest, riskTier: 'confirm' as const, nativeMarketing: true as const }
    await executeConfirmedNativeMarketingAction(envelope, ctx, d)
    expect(d.run).toHaveBeenCalledWith(tool.name, args, fresh, envelope.executionKey, digest)
    d.authorizeConfirmation.mockResolvedValue(false)
    expect(await executeConfirmedNativeMarketingAction(envelope, ctx, d)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(d.run).toHaveBeenCalledTimes(1)
  })
  it('zero grant and revoked grant never invoke the shared coordinator', async () => {
    const d = deps()
    d.admitted.mockReturnValue(false)
    expect(await buildNativeMarketingTools(ctx, 'message-1', d)).toEqual([])
    d.admitted.mockReturnValue(true)
    const tools = await buildNativeMarketingTools(ctx, 'message-1', d)
    d.admitted.mockReturnValue(false)
    expect((await tools[0].handler({ clientId: 'other' }, ctx)).ok).toBe(false)
    expect(d.run).not.toHaveBeenCalled()
  })
  it('obeys enforced release, persona, disabled and read-only composition before SDK exposure', async () => {
    const tools = await buildNativeMarketingTools(ctx, 'message-1', deps())
    const common = { rbacFilteredTools: tools, catalogRows: [], grantedPermissionGroups: ['MARKETING_MANAGEMENT'] as PermissionGroup[] }
    expect(composeEffectiveAssistantTools({ ...common, runtimePolicy: resolveCatalogRuntimePolicy('enforced') }).tools).toEqual([])
    expect(composeEffectiveAssistantTools({ ...common, readOnly: true }).tools).toEqual([])
    expect(composeEffectiveAssistantTools({ ...common, disabledTools: [tool.name] }).tools).toEqual([])
    expect(composeEffectiveAssistantTools({ ...common, personaToolAllowlist: ['get_tasks'] }).tools).toEqual([])
  })
  it('requires persisted message identity for writes and adds no finance tools', async () => {
    const d = deps()
    const tools = await buildNativeMarketingTools(ctx, undefined, d)
    expect(tools).toEqual([])
    expect(d.run).not.toHaveBeenCalled()
  })
})
