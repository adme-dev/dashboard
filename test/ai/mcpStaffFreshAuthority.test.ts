import { beforeEach, describe, expect, it, vi } from 'vitest'

// The DEFAULT storage used by resolveMcpStaffContext must be the uncached Hyperdrive binding
// (queryOneFresh/queryRowsFresh). The ordinary queryOne/queryRows primitives go through the cached
// binding, so a deactivation or custom-role edit could survive past the next request.
const db = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  queryOneFresh: vi.fn(),
  queryRowsFresh: vi.fn()
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  queryOneFresh: db.queryOneFresh,
  queryRowsFresh: db.queryRowsFresh,
  execute: vi.fn()
}))

const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOM_ROLE = '22222222-2222-4222-8222-222222222222'
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const event = { context: { cloudflare: { env: {} } } } as any

// Cached primitives always answer with a stale, broad, active identity. Any read through them would
// make the revocation assertions below fail.
const staleIdentity = { role: 'lead', custom_role_id: null, name: 'Stale', email: 'stale@example.test' }

describe('MCP staff authority default storage freshness', () => {
  let current: { active: boolean, groups: string[] }

  beforeEach(() => {
    vi.clearAllMocks()
    current = { active: true, groups: ['CREATIVE'] }
    db.queryOne.mockResolvedValue(staleIdentity)
    db.queryRows.mockResolvedValue([{ client_id: CLIENT_A }])
    db.queryOneFresh.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM team_members')) {
        return current.active
          ? { role: 'creative', custom_role_id: CUSTOM_ROLE, name: 'Staff', email: 'staff@example.test' }
          : null
      }
      if (sql.includes('FROM custom_roles')) return { is_read_only: false, permission_groups: current.groups }
      return null
    })
    db.queryRowsFresh.mockResolvedValue([{ client_id: CLIENT_A }])
  })

  it('reads identity, role policy and assignments only through the fresh primitives', async () => {
    const ctx = await resolveMcpStaffContext(event, USER_ID, ['mcp:read'])
    expect(ctx.permissionGroups).toEqual(['CREATIVE'])
    expect(ctx.assistantScope?.assignedClientIds).toEqual([CLIENT_A])
    expect(db.queryOneFresh).toHaveBeenCalled()
    expect(db.queryRowsFresh).toHaveBeenCalled()
    expect(db.queryOne).not.toHaveBeenCalled()
    expect(db.queryRows).not.toHaveBeenCalled()
  })

  it('marks the context as fresh MCP staff authority', async () => {
    const ctx = await resolveMcpStaffContext(event, USER_ID, ['mcp:read'])
    expect(ctx.mcpStaffAuthority).toBe('fresh')
  })

  it('applies deactivation on the very next request', async () => {
    await expect(resolveMcpStaffContext(event, USER_ID, ['mcp:read'])).resolves.toMatchObject({ userId: USER_ID })
    current.active = false
    await expect(resolveMcpStaffContext(event, USER_ID, ['mcp:read'])).rejects.toMatchObject({ statusCode: 403 })
  })

  it('applies a custom-role group revocation on the very next request', async () => {
    current.groups = ['MANAGEMENT', 'CREATIVE']
    const before = await resolveMcpStaffContext(event, USER_ID, ['mcp:read'])
    expect(before.permissionGroups).toEqual(['MANAGEMENT', 'CREATIVE'])
    expect(before.assistantScope?.clientAccessMode).toBe('all_active')
    current.groups = ['MANAGEMENT']
    const after = await resolveMcpStaffContext(event, USER_ID, ['mcp:read'])
    expect(after.permissionGroups).toEqual(['MANAGEMENT'])
  })
})
