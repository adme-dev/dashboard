import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { projectDepartmentMcpSuite, resolveDepartmentMcpExecutions, executeDepartmentTool } from '~~/server/utils/ai/mcp/departmentTools'
import { DEPARTMENT_TOOL_NAMES, isDepartmentWriteTool } from '~~/server/utils/ai/mcp/departmentToolNames'
import type { McpProjectionContext } from '~~/server/utils/ai/mcp/project'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), run: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: mocks.authority }))

const flags = { generation: false, writes: true, financial: false, video: false, videoGeneration: false, banners: false, feeds: true, googleAdsRead: true, googleAdsWrite: true }
const context: McpProjectionContext = { tools: [], role: 'media_buyer', scopes: ['mcp:read', 'mcp:write'], requireWriteScope: true, suiteFlags: flags }
const staff = {
  userId: '11111111-1111-4111-8111-111111111111', userRole: 'media_buyer', event: {}, source: 'mcp',
  permissionGroups: ['MARKETING_MANAGEMENT'], marketingCapabilities: ['department_management'], mcpStaffAuthority: 'fresh',
  mcpScopes: ['mcp:read', 'mcp:write'], assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] }
} as ToolContext
describe('department suite projection and execution', () => {
  it('exposes only named tools with matching schemas and write classes', () => {
    const manifests = projectDepartmentMcpSuite(context)
    const descriptors = resolveDepartmentMcpExecutions(context)
    expect(manifests.length).toBeGreaterThanOrEqual(16)
    expect(new Set(manifests.map(t => t.name)).size).toBe(manifests.length)
    expect(descriptors.map(t => t.name)).toEqual(manifests.map(t => t.name))
    for (const descriptor of descriptors) {
      expect(DEPARTMENT_TOOL_NAMES).toContain(descriptor.name)
      expect(Boolean(descriptor.tool.mutates)).toBe(isDepartmentWriteTool(descriptor.name))
      expect(descriptor.executeSupplemental).toBeUndefined()
      expect(descriptor.executionClass).toBeUndefined()
      expect(z.fromJSONSchema(manifests.find(m => m.name === descriptor.name)!.inputSchema as never)).toBeDefined()
    }
  })
  it('includes email and community operations with write-scope parity', () => {
    const names = projectDepartmentMcpSuite(context).map(t => t.name)
    for (const name of ['marketing_list_email_campaigns', 'marketing_review_email_campaign_send', 'marketing_execute_email_campaign_send', 'marketing_get_inbox_conversation', 'marketing_send_inbox_reply']) expect(names).toContain(name)
    const reads = projectDepartmentMcpSuite({ ...context, suiteFlags: { ...flags, writes: false } }).map(t => t.name)
    expect(reads).toContain('marketing_list_email_campaigns')
    expect(reads).toContain('marketing_get_inbox_conversation')
    expect(reads).not.toContain('marketing_execute_email_campaign_send')
    expect(reads).not.toContain('marketing_send_inbox_reply')
  })
  it('gates creative production by the banner suite and retains separately scoped website operations', () => {
    const names = projectDepartmentMcpSuite({ ...context, suiteFlags: { ...flags, banners: true } }).map(t => t.name)
    for (const name of ['marketing_get_banner_project', 'marketing_create_banner_project', 'marketing_export_banner_render', 'marketing_get_website', 'marketing_save_website_draft', 'marketing_review_website_version']) expect(names).toContain(name)
    const disabled = projectDepartmentMcpSuite(context).map(t => t.name)
    expect(disabled).not.toContain('marketing_get_banner_project')
    expect(disabled).not.toContain('marketing_export_banner_render')
    expect(disabled).toContain('marketing_get_website')
    const readOnly = projectDepartmentMcpSuite({ ...context, suiteFlags: { ...flags, writes: false, banners: true } }).map(t => t.name)
    expect(readOnly).toContain('marketing_get_banner_project')
    expect(readOnly).not.toContain('marketing_save_website_draft')
  })
  it('exposes lead follow-up and reviewed routing with mutation gating', () => {
    const names = projectDepartmentMcpSuite(context).map(t => t.name)
    for (const name of ['marketing_get_lead_followup', 'marketing_list_lead_routing_rules', 'marketing_get_lead_routing_change', 'marketing_assign_lead_followup', 'marketing_propose_lead_routing_change', 'marketing_review_lead_routing_change', 'marketing_execute_lead_routing_change']) expect(names).toContain(name)
    const reads = projectDepartmentMcpSuite({ ...context, suiteFlags: { ...flags, writes: false } }).map(t => t.name)
    expect(reads).toContain('marketing_get_lead_followup')
    expect(reads).not.toContain('marketing_execute_lead_routing_change')
  })
  it('removes feed tools and all mutations when their feature switches are off', () => {
    const names = projectDepartmentMcpSuite({ ...context, suiteFlags: { ...flags, writes: false, feeds: false } }).map(t => t.name)
    expect(names).toContain('get_department_daily_brief')
    expect(names).not.toContain('marketing_get_inventory_feed_health')
    expect(names.some(isDepartmentWriteTool)).toBe(false)
  })
  it('rejects revoked permission, stale projection and invalid arguments before dispatch', async () => {
    const deps = { tools: [{ name: 'marketing_set_budget_allocations', description: 'Test allocation', parameters: z.strictObject({ value: z.number() }), mutates: true, handler: mocks.run }], run: mocks.run, flags }
    mocks.authority.mockResolvedValue(staff)
    mocks.run.mockResolvedValue({ ok: true, data: {} })
    const call = (args: unknown, actor = staff, overrides = {}) => executeDepartmentTool('marketing_set_budget_allocations', args, actor, `mcp:${'a'.repeat(64)}`, 'b'.repeat(64), { ...deps, ...overrides })
    expect(await call({ value: 1 }, { ...staff, mcpScopes: ['mcp:read'] })).toMatchObject({ ok: false })
    expect(await call({ value: 1 }, staff, { flags: { ...flags, writes: false } })).toMatchObject({ ok: false })
    expect(await call({ value: 'bad' })).toMatchObject({ ok: false, code: 'bad_args' })
    mocks.authority.mockRejectedValueOnce(new Error('revoked'))
    expect(await call({ value: 1 })).toMatchObject({ ok: false })
    expect(mocks.run).not.toHaveBeenCalled()
    expect(await call({ value: 1 })).toMatchObject({ ok: true })
    expect(mocks.run).toHaveBeenCalledTimes(1)
  })
})
