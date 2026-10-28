import { describe, expect, it } from 'vitest'
import {
  evaluateStaffToolAdmission, hasMcpAllClientAuthority, isMcpManagementStaff,
  parseMarketingStaffGrants, type StaffToolPolicyEntry
} from '~~/server/utils/ai/mcp/marketingPolicy'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const departmentPolicy: Record<string, StaffToolPolicyEntry> = {
  get_marketing_portfolio: {
    capability: 'department_management', status: 'reviewed', clientScoped: true, legacyRoleSensitive: false
  }
}
function manager(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId, userRole: 'media_buyer', event: {} as ToolContext['event'], source: 'mcp',
    permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING'],
    mcpStaffAuthority: 'fresh', assistantReadOnly: false,
    marketingCapabilities: ['department_management', 'reporting'], mcpScopes: ['mcp:read', 'mcp:write'],
    assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] },
    ...overrides
  }
}

describe('dedicated marketing management MCP policy', () => {
  it('accepts the explicit grant without interpreting it as a permission group', () => {
    const config = parseMarketingStaffGrants(JSON.stringify({ [userId]: ['department_management'] }))
    expect(config.status).toBe('valid')
    expect(config.grants.get(userId)).toEqual(['department_management'])
    expect(hasMcpAllClientAuthority(['MEDIA_BUYING'])).toBe(false)
  })
  it('gives marketing portfolio authority without the general management catalog', () => {
    expect(hasMcpAllClientAuthority(['MARKETING_MANAGEMENT'])).toBe(true)
    expect(isMcpManagementStaff(manager())).toBe(false)
    expect(evaluateStaffToolAdmission('get_finance_snapshot', manager())).toMatchObject({ allowed: false })
    expect(evaluateStaffToolAdmission('confirm_action', manager())).toMatchObject({ allowed: false })
  })
  it('admits reviewed department and reporting reads for a fresh active portfolio', () => {
    expect(evaluateStaffToolAdmission('get_marketing_portfolio', manager(), departmentPolicy)).toMatchObject({ allowed: true })
    expect(evaluateStaffToolAdmission('get_campaign_breakdown', manager())).toMatchObject({ allowed: true })
  })
  it('requires both a fresh dedicated group and the separate department grant', () => {
    for (const denied of [
      manager({ marketingCapabilities: ['reporting'] }),
      manager({ permissionGroups: ['MEDIA_BUYING'] }),
      manager({ permissionGroups: ['ADMIN'] }),
      manager({ mcpStaffAuthority: undefined })
    ]) {
      expect(evaluateStaffToolAdmission('get_marketing_portfolio', denied, departmentPolicy)).toMatchObject({ allowed: false })
    }
  })
  it('requires explicit Page Studio grants for discovery and calls', () => {
    for (const [name, group] of [['marketing_get_website', 'PAGE_STUDIO_VIEW'], ['marketing_save_website_draft', 'PAGE_STUDIO_EDIT'], ['marketing_review_website_version', 'PAGE_STUDIO_APPROVE']] as const) {
      expect(evaluateStaffToolAdmission(name, manager())).toMatchObject({ allowed: false })
      expect(evaluateStaffToolAdmission(name, manager({ permissionGroups: ['MARKETING_MANAGEMENT', group] }))).toMatchObject({ allowed: true })
      expect(evaluateStaffToolAdmission(name, manager({ permissionGroups: ['MARKETING_MANAGEMENT', 'ADMIN'] }))).toMatchObject({ allowed: false })
    }
  })
  it('admits actual department reads and gates actual budget and review writes by consent', () => {
    for (const name of ['get_department_client_inventory', 'marketing_list_budget_allocations', 'marketing_list_google_ads_reviews']) {
      expect(evaluateStaffToolAdmission(name, manager())).toMatchObject({ allowed: true })
      expect(evaluateStaffToolAdmission(name, manager({ marketingCapabilities: ['reporting'] }))).toMatchObject({ allowed: false })
    }
    for (const name of ['marketing_set_budget_allocations', 'marketing_execute_google_ads_plan', 'marketing_review_social_revision']) {
      expect(evaluateStaffToolAdmission(name, manager())).toMatchObject({ allowed: true })
      expect(evaluateStaffToolAdmission(name, manager({ mcpScopes: ['mcp:read'] }))).toMatchObject({ allowed: false, code: 'insufficient_scope' })
      expect(evaluateStaffToolAdmission(name, manager({ assistantReadOnly: true }))).toMatchObject({ allowed: false, code: 'read_only' })
    }
  })
})
