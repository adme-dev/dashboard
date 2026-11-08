import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNativeMarketingTools, discoverNativeMarketingTools } from '../../server/utils/ai/marketing/nativeTools'
import { isDepartmentTool } from '../../server/utils/ai/mcp/departmentToolNames'
import type { ToolContext } from '../../server/utils/ai/toolContext'

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })) }))
vi.mock('~~/server/utils/db', async original => ({
  ...(await original<typeof import('~~/server/utils/db')>()), queryOneFresh: db.queryOne, queryRowsFresh: db.queryRows, execute: vi.fn().mockResolvedValue(undefined)
}))
function context(grants: string[] = ['department_management'], enabled = true): ToolContext {
  return { userId: actor, userRole: 'media_buyer', source: 'chat', event: { context: { cloudflare: { env: {
    MCP_SERVER_ENABLED: String(enabled), MCP_FEED_TOOLS_ENABLED: 'true', MCP_WRITE_TOOLS_ENABLED: 'true',
    GOOGLE_ADS_MCP_READ_ENABLED: 'true', GOOGLE_ADS_MCP_WRITE_ENABLED: 'true', MCP_BANNER_TOOLS_ENABLED: 'true',
    MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ [actor]: grants })
  } } } } as ToolContext['event'] }
}
beforeEach(() => {
  db.queryOne.mockImplementation(async (sql: string) => sql.includes('FROM team_members')
    ? { role: 'media_buyer', custom_role_id: null, name: 'Staff' }
    : { is_read_only: false, permission_groups: ['MARKETING_MANAGEMENT'] })
  db.queryRows.mockResolvedValue([])
})
describe('actual native catalog with fresh ordinary staff DB authority', () => {
  it('discovers only the reviewed department surface, including feed/catalog/budget/campaign schemas', async () => {
    const tools = await buildNativeMarketingTools(context(), 'persisted-message')
    const names = tools.map(tool => tool.name)
    expect(names).toContain('marketing_get_inventory_feed_health')
    expect(names).toContain('marketing_find_client_catalogs')
    expect(names).toContain('marketing_propose_budget_allocations')
    expect(names).toContain('marketing_prepare_meta_ad_launch')
    expect(names.every(isDepartmentTool)).toBe(true)
    expect(tools.every(tool => tool.requiredPermission !== 'FINANCE')).toBe(true)
    expect(names).not.toContain('get_finance_snapshot')
    const preview = await discoverNativeMarketingTools(context())
    expect(preview.map(tool => tool.name)).toEqual(names)
    expect(await preview[0].handler({}, context())).toMatchObject({ ok: false, code: 'discovery_only' })
  })
  it('native client narrowing and exact execution acknowledgement remain enforced downstream', async () => {
    const ctx = context()
    ctx.clientScope = actor
    const tools = await buildNativeMarketingTools(ctx, 'persisted-message')
    const health = tools.find(tool => tool.name === 'marketing_get_inventory_feed_health')!
    expect(await health.handler({ clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, ctx)).toMatchObject({ ok: false, code: 'not_found' })
    const execute = tools.find(tool => tool.name === 'marketing_execute_inventory_feed_change')!
    expect(await execute.handler({ clientId: actor, proposalId: actor, expectedRevision: 'a'.repeat(64) }, ctx)).toMatchObject({ ok: false, code: 'bad_args' })
  })
  it('zero grants and global disabled state expose no department operations', async () => {
    expect(await buildNativeMarketingTools(context([]), 'persisted-message')).toEqual([])
    expect(await buildNativeMarketingTools(context(['department_management'], false), 'persisted-message')).toEqual([])
  })
  it('a revoked grant prevents a previously discovered read from reaching its handler', async () => {
    const ctx = context()
    const tools = await buildNativeMarketingTools(ctx, 'persisted-message')
  ;(ctx.event.context.cloudflare as { env: Record<string, string> }).env.MCP_MARKETING_STAFF_GRANTS = '{}'
    const tool = tools.find(tool => tool.name === 'marketing_get_inventory_feed_health')!
    expect(await tool.handler({ clientId: actor }, ctx)).toMatchObject({ ok: false, code: 'forbidden' })
  })
})
