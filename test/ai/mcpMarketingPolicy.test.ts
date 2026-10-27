import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  MARKETING_CAPABILITIES,
  MARKETING_PILOT_READ_TOOLS,
  MCP_STAFF_TOOL_POLICY,
  evaluateStaffToolAdmission,
  isMcpManagementStaff,
  parseMarketingStaffGrants,
  projectMcpToolsForStaff,
  type StaffToolPolicyEntry
} from '~~/server/utils/ai/mcp/marketingPolicy'
import type { McpProjectionContext } from '~~/server/utils/ai/mcp/project'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function staff(over: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: USER_A,
    userRole: 'media_buyer',
    permissionGroups: ['MEDIA_BUYING'],
    assistantReadOnly: false,
    mcpScopes: new Set(['mcp:read']),
    assistantScope: {
      departmentIds: [],
      clientAccessMode: 'assigned',
      assignedClientIds: [CLIENT_A],
      catalogReleaseIds: []
    },
    marketingCapabilities: [],
    source: 'mcp',
    event: {} as any,
    ...over
  }
}

const reviewedReporting: Record<string, StaffToolPolicyEntry> = {
  ...MCP_STAFF_TOOL_POLICY,
  get_campaign_breakdown: { capability: 'reporting', status: 'reviewed', clientScoped: true, legacyRoleSensitive: true }
}

const fakeTool = (name: string, over: Partial<AiTool<unknown>> = {}): AiTool<unknown> => ({
  name,
  description: `${name} description`,
  parameters: z.object({}) as z.ZodType<unknown>,
  handler: async () => ({ ok: true, data: {} }),
  ...over
})

describe('marketing staff grant configuration', () => {
  it('treats an unset or blank binding as no grants', () => {
    expect(parseMarketingStaffGrants(undefined)).toMatchObject({ status: 'unset' })
    expect(parseMarketingStaffGrants('   ').grants.size).toBe(0)
  })

  it('parses a valid UUID-to-capability map and normalizes ids', () => {
    const config = parseMarketingStaffGrants(JSON.stringify({
      [USER_A.toUpperCase()]: ['reporting', 'reporting', 'social_draft'],
      [USER_B]: []
    }))
    expect(config.status).toBe('valid')
    expect(config.grants.get(USER_A)).toEqual(['reporting', 'social_draft'])
    expect(config.grants.get(USER_B)).toEqual([])
  })

  it.each([
    ['malformed JSON', '{not json'],
    ['array root', JSON.stringify([USER_A])],
    ['non-UUID key', JSON.stringify({ 'paul@example.test': ['reporting'] })],
    ['non-array grant', JSON.stringify({ [USER_A]: 'reporting' })],
    ['unknown capability', JSON.stringify({ [USER_A]: ['reporting', 'finance'] })],
    ['permission-group smuggling', JSON.stringify({ [USER_A]: ['MANAGEMENT'] })]
  ])('fails closed for the entire configuration on %s', (_label, raw) => {
    const config = parseMarketingStaffGrants(raw)
    expect(config.status).toBe('invalid')
    expect(config.grants.size).toBe(0)
    // Diagnostics never echo the configured value.
    expect(JSON.stringify(config)).not.toContain('reporting')
  })

  it('fails closed for a non-string binding value', () => {
    expect(parseMarketingStaffGrants({ [USER_A]: ['reporting'] } as unknown)).toMatchObject({ status: 'invalid' })
  })

  it('only knows the four approved marketing capabilities', () => {
    expect([...MARKETING_CAPABILITIES].sort()).toEqual(['ads_plan', 'reporting', 'social_draft', 'tracking_plan'])
  })
})

describe('staff tool admission', () => {
  it('derives all-client management authority from fresh groups only, never from grants', () => {
    expect(isMcpManagementStaff(staff({ permissionGroups: ['MANAGEMENT'] }))).toBe(true)
    expect(isMcpManagementStaff(staff({ permissionGroups: ['ADMIN'] }))).toBe(true)
    expect(isMcpManagementStaff(staff({
      userRole: 'lead',
      permissionGroups: ['MEDIA_BUYING'],
      marketingCapabilities: ['reporting', 'social_draft', 'ads_plan', 'tracking_plan']
    }))).toBe(false)
    expect(isMcpManagementStaff(staff({ permissionGroups: undefined }))).toBe(false)
  })

  it('admits the six proven pilot reads and scoped overview with explicit reporting grant', () => {
    for (const name of [...MARKETING_PILOT_READ_TOOLS, 'get_client_overview']) {
      expect(MCP_STAFF_TOOL_POLICY[name]).toMatchObject({ capability: 'reporting', status: 'reviewed', legacyRoleSensitive: false })
      expect(evaluateStaffToolAdmission(name, staff({ marketingCapabilities: ['reporting'] })))
        .toMatchObject({ allowed: true })
    }
  })

  it('denies unreviewed direct paths such as lead summaries and profitability', () => {
    const granted = staff({ marketingCapabilities: ['reporting', 'social_draft', 'ads_plan', 'tracking_plan'] })
    for (const name of [
      'get_leads', 'get_client_profitability', 'get_capabilities',
      'propose_create_task', 'confirm_action', 'get_finance_snapshot', 'list_gtm_containers', 'not_a_tool'
    ]) {
      expect(evaluateStaffToolAdmission(name, granted)).toMatchObject({ allowed: false, code: 'not_reviewed' })
    }
  })

  it('requires the explicit capability grant for a reviewed marketing tool', () => {
    expect(evaluateStaffToolAdmission('get_campaign_breakdown', staff(), reviewedReporting))
      .toMatchObject({ allowed: false, code: 'capability_required' })
    expect(evaluateStaffToolAdmission(
      'get_campaign_breakdown',
      staff({ marketingCapabilities: ['social_draft'] }),
      reviewedReporting
    )).toMatchObject({ allowed: false, code: 'capability_required' })
    expect(evaluateStaffToolAdmission(
      'get_campaign_breakdown',
      staff({ marketingCapabilities: ['reporting'] }),
      reviewedReporting
    )).toMatchObject({ allowed: true })
  })

  it('denies client-scoped tools with zero current assignments or without a resolved scope', () => {
    const granted = { marketingCapabilities: ['reporting'] as ToolContext['marketingCapabilities'] }
    expect(evaluateStaffToolAdmission('get_campaign_breakdown', staff({
      ...granted,
      assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: [], catalogReleaseIds: [] }
    }), reviewedReporting)).toMatchObject({ allowed: false, code: 'no_client_assignments' })
    expect(evaluateStaffToolAdmission('get_campaign_breakdown', staff({ ...granted, assistantScope: undefined }), reviewedReporting))
      .toMatchObject({ allowed: false, code: 'no_client_assignments' })
    expect(evaluateStaffToolAdmission('get_campaign_breakdown', staff({
      ...granted,
      assistantScope: { departmentIds: [], clientAccessMode: 'all_active', assignedClientIds: [], catalogReleaseIds: [] }
    }), reviewedReporting)).toMatchObject({ allowed: false, code: 'no_client_assignments' })
  })

  it('denies role-sensitive handlers when a custom role narrows a broad legacy role', () => {
    const downgradedLead = staff({ userRole: 'lead', permissionGroups: ['MEDIA_BUYING'] })
    expect(evaluateStaffToolAdmission('get_tasks', downgradedLead)).toMatchObject({ allowed: false, code: 'role_policy_mismatch' })
    expect(evaluateStaffToolAdmission('get_tasks', staff())).toMatchObject({ allowed: true })
  })

  it('requires signed write scope and a writable policy for private writes', () => {
    expect(evaluateStaffToolAdmission('remember', staff())).toMatchObject({ allowed: false, code: 'insufficient_scope' })
    expect(evaluateStaffToolAdmission('remember', staff({ mcpScopes: new Set(['mcp:read', 'mcp:write']) })))
      .toMatchObject({ allowed: true })
    expect(evaluateStaffToolAdmission('remember', staff({
      mcpScopes: new Set(['mcp:read', 'mcp:write']),
      assistantReadOnly: true
    }))).toMatchObject({ allowed: false, code: 'read_only' })
  })
})

describe('single staff projection policy', () => {
  const tools = [
    fakeTool('get_tasks'),
    fakeTool('get_leads'),
    fakeTool('get_client_overview', { requiredPermission: 'CLIENTS' }),
    fakeTool('get_campaign_breakdown', { requiredPermission: 'MEDIA_BUYING' }),
    fakeTool('get_finance_snapshot', { requiredPermission: 'FINANCE' }),
    fakeTool('remember', {
      mutates: true,
      directMutation: { executionClass: 'local-transactional', execute: async () => ({ ok: true, data: {} }) }
    })
  ]
  const context: McpProjectionContext = {
    tools,
    role: 'media_buyer',
    scopes: ['mcp:read'],
    requireWriteScope: false,
    suiteFlags: {
      generation: false, writes: false, financial: false, video: false,
      videoGeneration: false, banners: false, feeds: false
    }
  }

  it('lists only reviewed policy tools for non-management staff, honoring signed scope', () => {
    expect(projectMcpToolsForStaff({ context, staff: staff() }).map(tool => tool.name)).toEqual(['get_tasks'])
    expect(projectMcpToolsForStaff({
      context,
      staff: staff({ mcpScopes: new Set(['mcp:read', 'mcp:write']), marketingCapabilities: ['reporting'] }),
      policy: reviewedReporting
    }).map(tool => tool.name).sort()).toEqual(['get_campaign_breakdown', 'get_client_overview', 'get_tasks', 'remember'])
  })

  it('keeps the management projection, narrowed by fresh groups, read-only policy and write scope', () => {
    const management = staff({
      userRole: 'lead',
      permissionGroups: ['MANAGEMENT', 'CLIENTS'],
      mcpScopes: new Set(['mcp:read']),
      assistantScope: { departmentIds: [], clientAccessMode: 'all_active', assignedClientIds: [], catalogReleaseIds: [] }
    })
    const names = projectMcpToolsForStaff({ context: { ...context, role: 'lead' }, staff: management }).map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining(['get_tasks', 'get_leads', 'get_client_overview']))
    // FINANCE/MEDIA_BUYING are absent from the fresh custom-role groups even though legacy `lead` had them.
    expect(names).not.toContain('get_finance_snapshot')
    expect(names).not.toContain('get_campaign_breakdown')
    // The legacy opt-out flag is false, yet read-only consent still hides private writes.
    expect(names).not.toContain('remember')

    const writable = projectMcpToolsForStaff({
      context: { ...context, role: 'lead' },
      staff: { ...management, mcpScopes: new Set(['mcp:read', 'mcp:write']) }
    }).map(tool => tool.name)
    expect(writable).toContain('remember')
    const readOnlyPolicy = projectMcpToolsForStaff({
      context: { ...context, role: 'lead' },
      staff: { ...management, mcpScopes: new Set(['mcp:read', 'mcp:write']), assistantReadOnly: true }
    }).map(tool => tool.name)
    expect(readOnlyPolicy).not.toContain('remember')
  })
})
