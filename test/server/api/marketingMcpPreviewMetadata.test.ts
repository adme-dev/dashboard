import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const f = vi.hoisted(() => ({ groups: ['CREATIVE'], readOnly: false, clients: ['22222222-2222-4222-8222-222222222222'], owner: false, unavailable: false }))
vi.mock('h3', async original => ({ ...await original<any>(), defineEventHandler: (handler: any) => handler }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: '11111111-1111-4111-8111-111111111111', role: 'admin' }) }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: async () => ({}), isActiveGodModeAuthority: () => f.owner }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(() => { throw new Error('Unexpected cached DB access') }),
  queryRows: vi.fn(() => { throw new Error('Unexpected cached DB access') }),
  execute: vi.fn(() => { throw new Error('Unexpected DB mutation') }),
  transaction: vi.fn(() => { throw new Error('Unexpected transaction') }),
  queryOneFresh: async (sql: string) => {
    if (f.unavailable) throw new Error('storage unavailable')
    if (sql.includes('team_members')) return { role: 'creative', custom_role_id: 'fixture-role' }
    return { permission_groups: f.groups, is_read_only: f.readOnly }
  },
  queryRowsFresh: async () => f.clients.map(client_id => ({ client_id }))
}))
vi.mock('~~/server/utils/ai/tools', () => ({ registry: [{ name: 'get_campaign_breakdown', description: 'Stored campaigns', parameters: z.object({}), handler: async () => ({ ok: true }) }] }))
vi.mock('~~/server/utils/ai/mcp/registry', () => ({
  projectGodModeTools: () => [{ name: 'owner_tool', description: 'Owner catalog' }],
  projectRegisteredMcpTools: () => [],
  projectStaffOnlyMcpTools: () => [{ name: 'create_social_post_draft', description: 'Local draft', inputSchema: {} }]
}))
const { default: handler } = await import('../../../../server/api/agency/ai/mcp/my-tools.get')
const event = () => ({ context: { cloudflare: { env: { MCP_SERVER_ENABLED: 'true', MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ '11111111-1111-4111-8111-111111111111': ['reporting', 'social_draft'] }) } } } }) as any

beforeEach(() => { f.groups = ['CREATIVE']; f.readOnly = false; f.clients = ['22222222-2222-4222-8222-222222222222']; f.owner = false; f.unavailable = false })
describe('fresh connector preview metadata', () => {
  it('reports effective groups and count without identity or client details, with shared projected tools', async () => {
    const result = await handler(event())
    expect(result).toMatchObject({ role: 'creative', access: { permissionGroups: ['CREATIVE'], readOnly: false, clientScope: { mode: 'assigned', assignedClientCount: 1 } }, preview: { projection: 'staff', assumedScopes: ['mcp:read', 'mcp:write'] }, tools: [{ name: 'get_campaign_breakdown', requiresWriteScope: false }, { name: 'create_social_post_draft', requiresWriteScope: true }] })
    expect(JSON.stringify(result)).not.toContain(f.clients[0])
    expect(JSON.stringify(result)).not.toContain('11111111-1111-4111-8111-111111111111')
  })
  it('updates policy and assignment metadata on the next preview and removes unavailable writes/client tools', async () => {
    await handler(event())
    f.readOnly = true; f.groups = []; f.clients = []
    const result = await handler(event())
    expect(result).toMatchObject({ access: { permissionGroups: [], readOnly: true, clientScope: { mode: 'assigned', assignedClientCount: 0 } }, tools: [] })
  })
  it('does not mislabel management all-active scope as zero assigned clients', async () => {
    f.groups = ['MANAGEMENT']
    expect(await handler(event())).toMatchObject({ preview: { projection: 'management' }, access: { clientScope: { mode: 'all_active', assignedClientCount: null } } })
  })
  it('preserves separate owner preview without staff metadata', async () => {
    f.owner = true; f.unavailable = true
    const result = await handler(event())
    expect(result).toMatchObject({ authority: 'god_mode', preview: { projection: 'owner' }, tools: [{ name: 'owner_tool' }] })
    expect(result).not.toHaveProperty('access')
  })
  it('fails closed when fresh authority cannot be read', async () => {
    f.unavailable = true
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })
  })
})
