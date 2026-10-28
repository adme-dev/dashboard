import { describe, expect, it } from 'vitest'
import { evaluateStaffToolAdmission } from '~~/server/utils/ai/mcp/marketingPolicy'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
const context = (changes: Partial<ToolContext> = {}): ToolContext => ({
  userId: '11111111-1111-4111-8111-111111111111', userRole: 'designer', permissionGroups: ['CREATIVE'],
  source: 'mcp', mcpScopes: ['mcp:read'], mcpStaffAuthority: 'fresh', event: {} as any,
  assistantScope: { clientAccessMode: 'assigned', assignedClientIds: ['22222222-2222-4222-8222-222222222222'], departmentIds: [], catalogReleaseIds: [] }, ...changes
})
describe('creative workspace MCP admission', () => {
  it('admits metadata reads for current creative staff without marketing grants or write consent', () => {
    for (const name of ['get_creative_workspace_capabilities', 'search_creative_workspace']) expect(evaluateStaffToolAdmission(name, context({ assistantReadOnly: true })).allowed).toBe(true)
  })
  it('marketing grants and a broad legacy role cannot replace the current creative permission', () => {
    for (const name of ['get_creative_workspace_capabilities', 'search_creative_workspace']) expect(evaluateStaffToolAdmission(name, context({ userRole: 'admin', permissionGroups: ['MEDIA_BUYING'], marketingCapabilities: ['reporting'] }))).toMatchObject({ allowed: false, code: 'permission_required' })
  })
  it('allows capability discovery but denies client search without assignments', () => {
    const ctx = context({ assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] } })
    expect(evaluateStaffToolAdmission('get_creative_workspace_capabilities', ctx).allowed).toBe(true)
    expect(evaluateStaffToolAdmission('search_creative_workspace', ctx)).toMatchObject({ allowed: false, code: 'no_client_assignments' })
  })
  it('does not unlock the older unreviewed broad asset read', () => {
    expect(evaluateStaffToolAdmission('get_creative_assets', context())).toMatchObject({ allowed: false, code: 'not_reviewed' })
  })
})
