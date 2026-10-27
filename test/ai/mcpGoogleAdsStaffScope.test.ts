import { describe, it, expect, vi } from 'vitest'
import {
  dispatchGoogleAdsConfirm,
  executeGoogleAdsTool
} from '../../server/utils/ai/mcp/googleAdsTools'
import { executeGoogleAdsSearchPlanningTool } from '../../server/utils/ai/mcp/googleAdsSearchTools'
import {
  projectMcpToolsForStaff,
  evaluateStaffToolAdmission
} from '../../server/utils/ai/mcp/marketingPolicy'
import { executeTask4StaffTool } from '../../server/utils/ai/mcp/marketingTask4Tools'
import { isWriteScopeToolName } from '../../server/utils/ai/mcp/scope'
const flags = { read: true, write: true, automation: true, destructive: true }
const uid = '33333333-3333-4333-8333-333333333333'
const ctx = (role = 'admin') => ({
  userId: uid,
  userRole: role,
  event: {} as any,
  source: 'mcp' as const,
  permissionGroups: ['ADMIN', 'MANAGEMENT', 'MEDIA_BUYING'] as any,
  mcpStaffAuthority: 'fresh' as const,
  mcpScopes: ['mcp:read', 'mcp:write'],
  marketingCapabilities: ['ads_plan', 'tracking_plan'] as any,
  assistantScope: {
    clientAccessMode: 'all_active' as const,
    assignedClientIds: [],
    departmentIds: [],
    catalogReleaseIds: []
  }
})
describe('ordinary advertising independent-review boundary', () => {
  it.each(['admin', 'lead', 'project_manager'])(
    'denies retained %s MCP proposal without calling approval or provider',
    async (role) => {
      const deps = {
        loadPlan: vi.fn(),
        approvePlan: vi.fn(),
        executeConfirmed: vi.fn()
      }
      const result = await dispatchGoogleAdsConfirm(
        {
          tool_name: 'google_ads_action',
          resolved_payload: {
            actionPlanId: '11111111-1111-4111-8111-111111111111'
          }
        },
        '22222222-2222-4222-8222-222222222222',
        true,
        ctx(role),
        flags,
        deps
      )
      expect(result).toMatchObject({ ok: false, code: 'forbidden' })
      expect(deps.loadPlan).not.toHaveBeenCalled()
      expect(deps.approvePlan).not.toHaveBeenCalled()
      expect(deps.executeConfirmed).not.toHaveBeenCalled()
    }
  )
  it.each([
    'propose_google_ads_action',
    'google_ads_run_pause_policy',
    'google_ads_run_search_term_policy'
  ])('denies ordinary %s before any effect', async (name) => {
    const deps = new Proxy({} as any, {
      get: () => {
        throw new Error('Dependency must not be reached')
      }
    })
    expect(
      await executeGoogleAdsTool(name, {}, ctx(), flags, deps)
    ).toMatchObject({ ok: false, code: 'forbidden' })
  })
  it('rejects automatic and destructive planning before runtime', async () => {
    const plan = vi.fn()
    expect(
      await executeGoogleAdsSearchPlanningTool(
        'google_ads_plan_pause',
        {
          clientId: '11111111-1111-4111-8111-111111111111',
          connectionId: '22222222-2222-4222-8222-222222222222',
          entityType: 'campaign',
          resourceName: 'customers/123/campaigns/1',
          idempotencyKey: 'x',
          requestedMode: 'automatic'
        },
        ctx(),
        flags,
        true,
        { plan }
      )
    ).toMatchObject({ ok: false, code: 'forbidden' })
    expect(plan).not.toHaveBeenCalled()
  })
  it('projects scoped planning, never ordinary automatic or destructive tools', () => {
    const manifests = projectMcpToolsForStaff({
      context: {
        tools: [],
        role: 'admin',
        scopes: ['mcp:read', 'mcp:write'],
        suiteFlags: {
          googleAdsRead: true,
          googleAdsWrite: true,
          googleAdsAutomation: true,
          googleAdsDestructive: true
        }
      },
      staff: ctx()
    })
    const names = manifests.map((m) => m.name)
    expect(names).toContain('google_ads_plan_update_budget')
    expect(names).toContain('propose_gtm_workspace_change')
    expect(names).not.toContain('propose_google_ads_action')
    expect(names).not.toContain('google_ads_run_pause_policy')
    expect(names).not.toContain('google_ads_plan_remove')
    expect(
      (
        manifests.find((m) => m.name === 'google_ads_plan_pause')!
          .inputSchema as any
      ).properties.requestedMode.enum
    ).toEqual(['proposal'])
  })
  it('rejects disabled connection inventory at invocation before accessing credentials or SQL', async () => {
    const context = ctx()
    context.event = {
      context: { cloudflare: { env: { GOOGLE_ADS_MCP_READ_ENABLED: 'false' } } }
    } as any
    expect(
      await executeTask4StaffTool(
        'google_ads_list_connections',
        { clientId: uid },
        context,
        'disabled'
      )
    ).toMatchObject({ ok: false, code: 'disabled' })
  })
  it('does not grant re-verification writes to reporting-only staff', () => {
    expect(
      evaluateStaffToolAdmission('google_ads_reverify_resource', {
        ...ctx(),
        marketingCapabilities: ['reporting']
      })
    ).toMatchObject({ allowed: false, code: 'capability_required' })
  })
  it('requires signed write scope even with MANAGEMENT and accepts reporting-only reads', () => {
    expect(
      evaluateStaffToolAdmission('propose_gtm_publish', {
        ...ctx(),
        mcpScopes: ['mcp:read']
      })
    ).toMatchObject({ allowed: false, code: 'insufficient_scope' })
    expect(
      evaluateStaffToolAdmission('google_ads_list_connections', {
        ...ctx(),
        marketingCapabilities: ['reporting']
      })
    ).toMatchObject({ allowed: true })
    expect(isWriteScopeToolName('record_gtm_tracking_ownership')).toBe(true)
  })
})
