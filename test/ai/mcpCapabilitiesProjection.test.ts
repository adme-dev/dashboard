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
})
