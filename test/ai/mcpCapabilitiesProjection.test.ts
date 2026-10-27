import { z } from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { PermissionGroup } from '~~/server/utils/permissions'

// get_capabilities for ordinary management MCP staff must report exactly the tools/list projection:
// the same binding-first runtime config and the same fresh-group projection (projectMcpToolsForStaff).
const { inspectCapabilityCatalog } = await import('~~/server/utils/ai/tools/capabilities')
const { projectMcpToolsForStaff } = await import('~~/server/utils/ai/mcp/marketingPolicy')
const { resolveMcpRuntimeConfig } = await import('~~/server/utils/ai/mcp/runtimeConfig')
const { registry } = await import('~~/server/utils/ai/tools')

const USER_ID = '11111111-1111-4111-8111-111111111111'

function managementCtx(groups: PermissionGroup[], bindings: Record<string, string>, scopes = ['mcp:read', 'mcp:write']): ToolContext {
  return {
    userId: USER_ID,
    userRole: 'lead',
    permissionGroups: groups,
    assistantReadOnly: false,
    mcpScopes: new Set(scopes),
    assistantScope: { departmentIds: [], clientAccessMode: 'all_active', assignedClientIds: [], catalogReleaseIds: [] },
    mcpStaffAuthority: 'fresh',
    source: 'mcp',
    event: { context: { cloudflare: { env: bindings } } } as any
  }
}

function toolsListNames(ctx: ToolContext): string[] {
  return projectMcpToolsForStaff({
    context: {
      tools: registry as any,
      role: 'owner',
      scopes: [],
      requireWriteScope: false,
      suiteFlags: resolveMcpRuntimeConfig(ctx.event).suiteFlags
    },
    staff: ctx
  }).map(tool => tool.name).sort()
}

describe('get_capabilities parity for management MCP staff', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses binding-first suite flags (not process env) and the fresh-group projection', async () => {
    vi.stubEnv('MCP_BANNER_TOOLS_ENABLED', 'false')
    vi.stubEnv('MCP_WRITE_TOOLS_ENABLED', 'false')
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'false')
    const ctx = managementCtx(['MANAGEMENT', 'CREATIVE'], {
      MCP_BANNER_TOOLS_ENABLED: 'true',
      MCP_WRITE_TOOLS_ENABLED: 'true',
      GOOGLE_ADS_MCP_READ_ENABLED: 'true'
    })
    const inspection = await inspectCapabilityCatalog(ctx)
    const reported = inspection.tools.map(tool => tool.name).sort()
    expect(reported).toEqual(toolsListNames(ctx))
    expect(reported).toContain('list_banner_projects')
    expect(reported).toContain('propose_create_task')
    // MEDIA_BUYING is not a current group, so the Google Ads suite is absent despite its flag.
    expect(reported.some(name => name.startsWith('google_ads_'))).toBe(false)
    // FINANCE-gated catalog reads follow fresh groups, not the broad legacy `lead` role.
    expect(reported).not.toContain('get_finance_snapshot')
  })

  it('never reports write-class tools without the signed mcp:write scope', async () => {
    const ctx = managementCtx(['MANAGEMENT', 'CREATIVE'], { MCP_BANNER_TOOLS_ENABLED: 'true', MCP_WRITE_TOOLS_ENABLED: 'true' }, ['mcp:read'])
    const inspection = await inspectCapabilityCatalog(ctx)
    const reported = inspection.tools.map(tool => tool.name).sort()
    expect(reported).toEqual(toolsListNames(ctx))
    expect(reported).not.toContain('confirm_action')
    expect(reported.some(name => name.startsWith('propose_'))).toBe(false)
  })
  it.each(['MANAGEMENT', 'ADMIN'] as const)('keeps %s granted staff suites in read and write catalog parity with validated local mutation modes', async (group) => {
    for (const capability of ['social_draft', 'ads_plan', 'tracking_plan'] as const) {
      for (const write of [false, true]) {
        const ctx = managementCtx([group, 'CREATIVE', 'MEDIA_BUYING'], { MCP_WRITE_TOOLS_ENABLED: 'true', GOOGLE_ADS_MCP_READ_ENABLED: 'true', GOOGLE_ADS_MCP_WRITE_ENABLED: 'true' }, write ? ['mcp:read', 'mcp:write'] : ['mcp:read'])
        ctx.marketingCapabilities = [capability]
        const { getCapabilities } = await import('~~/server/utils/ai/tools/capabilities')
        await inspectCapabilityCatalog(ctx)
        const result = await getCapabilities({}, ctx, { inspect: inspectCapabilityCatalog, retryDelay: async () => {} })
        expect(result.ok).toBe(true)
        const data = (result as any).data
        expect(data.degraded).toBeUndefined()
        expect(data.tools.map((tool: any) => tool.name).sort()).toEqual(toolsListNames(ctx))
        const { resolveStaffOnlyMcpExecutions } = await import('~~/server/utils/ai/mcp/registry')
        const executions = resolveStaffOnlyMcpExecutions({ tools: registry, role: ctx.userRole, scopes: [...ctx.mcpScopes!], suiteFlags: resolveMcpRuntimeConfig(ctx.event).suiteFlags })
        const mutations = new Set(executions.filter(execution => execution.tool.mutates).map(execution => execution.name))
        const advertisedMutations = data.tools.filter((tool: any) => mutations.has(tool.name))
        if (write) {
          expect(advertisedMutations.length).toBeGreaterThan(0)
          expect(advertisedMutations.every((tool: any) => tool.mode === 'local_mutation')).toBe(true)
          expect(data.governance.local_mutation).toContain('independent review')
        } else expect(advertisedMutations).toEqual([])
        ctx.assistantReadOnly = true
        const readonly = await inspectCapabilityCatalog(ctx)
        expect(readonly.tools.map(tool => tool.name).sort()).toEqual(toolsListNames(ctx))
        expect(readonly.tools.some(tool => mutations.has(tool.name))).toBe(false)
      }
    }
  })

  it('keeps staff-only local handlers out of owner God mode', async () => {
    const { resolveGodModeMcpExecutions } = await import('~~/server/utils/ai/mcp/registry')
    const names = resolveGodModeMcpExecutions({ tools: registry, role: 'owner', scopes: [] }).map(tool => tool.name)
    expect(names).not.toContain('create_social_post_draft')
    expect(names).not.toContain('submit_social_post_for_review')
    expect(names).not.toContain('record_gtm_tracking_ownership')
  })

  it('rejects missing, duplicate, mismatched-schema and remote staff execution descriptors', async () => {
    const { projectStaffOnlyMcpTools } = await import('~~/server/utils/ai/mcp/registry')
    const { toMcpInputSchema } = await import('~~/server/utils/ai/mcp/project')
    const parameters = z.object({ clientId: z.string().uuid() })
    const descriptor = { name: 'fixture_staff_read', canonicalName: 'fixture_staff_read', kind: 'supplemental' as const,
      tool: { name: 'fixture_staff_read', description: 'Fixture read', parameters, handler: async () => ({ ok: true as const, data: {} }) } }
    const suite = (rows: any[]) => [{ key: 'fixture', project: () => [{ name: descriptor.name, description: 'Fixture read', inputSchema: toMcpInputSchema(parameters) }], executions: () => rows }]
    const ctx = { tools: registry, role: 'lead', scopes: ['mcp:read'], suiteFlags: resolveMcpRuntimeConfig().suiteFlags }
    expect(() => projectStaffOnlyMcpTools(ctx, suite([]))).toThrow('exactly one')
    expect(() => projectStaffOnlyMcpTools(ctx, suite([descriptor, descriptor]))).toThrow('exactly one')
    expect(() => projectStaffOnlyMcpTools(ctx, suite([{ ...descriptor, tool: { ...descriptor.tool, parameters: z.object({ other: z.string() }) } }]))).toThrow('schema conflicts')
    expect(() => projectStaffOnlyMcpTools(ctx, suite([{ ...descriptor, executionClass: 'external-provider' }]))).toThrow('only execute locally')
  })
})
