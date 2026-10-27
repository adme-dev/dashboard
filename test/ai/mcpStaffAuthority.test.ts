import { beforeEach, describe, expect, it, vi } from 'vitest'

const cached = vi.hoisted(() => ({
  resolveUserPermissions: vi.fn(),
  getAssignedClientIds: vi.fn(),
  kvGet: vi.fn()
}))
// Authorization must never consult the five-minute KV caches or the fail-open static fallback.
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: cached.resolveUserPermissions }))
vi.mock('~~/server/utils/clientScoping', () => ({ getAssignedClientIds: cached.getAssignedClientIds }))
vi.mock('~~/server/utils/kv', () => ({ kvGet: cached.kvGet, kvPut: vi.fn(), kvDelete: vi.fn() }))

const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')
const { resolveMcpRuntimeConfig } = await import('~~/server/utils/ai/mcp/runtimeConfig')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOM_ROLE = '22222222-2222-4222-8222-222222222222'
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CLIENT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

interface Fixture {
  identity?: Record<string, unknown> | null
  customRole?: Record<string, unknown> | null
  systemRole?: Record<string, unknown> | null
  assignments?: Array<{ client_id: string }>
  fail?: 'identity' | 'role' | 'assignments'
}

function fakeDb(fixture: Fixture) {
  const sql: string[] = []
  return {
    sql,
    db: {
      queryOne: vi.fn(async (text: string) => {
        sql.push(text)
        if (text.includes('FROM team_members')) {
          if (fixture.fail === 'identity') throw new Error('db down')
          return fixture.identity === undefined
            ? { role: 'media_buyer', custom_role_id: null, name: 'Staff', email: 'staff@example.test' }
            : fixture.identity
        }
        if (text.includes('FROM custom_roles')) {
          if (fixture.fail === 'role') throw new Error('db down')
          return text.includes('cr.id = $1') ? (fixture.customRole ?? null) : (fixture.systemRole ?? null)
        }
        throw new Error(`unexpected query ${text}`)
      }),
      queryRows: vi.fn(async (text: string) => {
        sql.push(text)
        if (fixture.fail === 'assignments') throw new Error('db down')
        return fixture.assignments ?? [{ client_id: CLIENT_A }]
      })
    }
  }
}

function runtime(grants?: unknown) {
  return resolveMcpRuntimeConfig({
    context: { cloudflare: { env: grants === undefined ? {} : { MCP_MARKETING_STAFF_GRANTS: grants } } }
  } as any)
}

const event = { context: {} } as any

describe('resolveMcpStaffContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves a custom role freshly from the database, bypassing cached resolvers', async () => {
    const { db, sql } = fakeDb({
      identity: { role: 'lead', custom_role_id: CUSTOM_ROLE, name: 'Lead', email: 'lead@example.test' },
      customRole: { is_read_only: false, permission_groups: ['MEDIA_BUYING', 'NOT_A_GROUP'] }
    })
    const ctx = await resolveMcpStaffContext(event, USER_ID, ['mcp:read'], { db, runtimeConfig: runtime() })

    expect(ctx).toMatchObject({
      userId: USER_ID,
      userRole: 'lead',
      userName: 'Lead',
      permissionGroups: ['MEDIA_BUYING'],
      assistantReadOnly: false,
      source: 'mcp',
      assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [CLIENT_A] },
      marketingCapabilities: []
    })
    expect([...(ctx.mcpScopes as Set<string>)]).toEqual(['mcp:read'])
    expect(sql.some(text => text.includes('cr.id = $1'))).toBe(true)
    expect(cached.resolveUserPermissions).not.toHaveBeenCalled()
    expect(cached.getAssignedClientIds).not.toHaveBeenCalled()
    expect(cached.kvGet).not.toHaveBeenCalled()
  })

  it('fails closed to no groups and read-only when the custom role no longer exists', async () => {
    const { db } = fakeDb({
      identity: { role: 'admin', custom_role_id: CUSTOM_ROLE, name: null, email: null },
      customRole: null
    })
    const ctx = await resolveMcpStaffContext(event, USER_ID, ['mcp:read', 'mcp:write'], { db, runtimeConfig: runtime() })
    expect(ctx.permissionGroups).toEqual([])
    expect(ctx.assistantReadOnly).toBe(true)
    expect(ctx.assistantScope?.clientAccessMode).toBe('assigned')
  })

  it('applies a read-only custom policy', async () => {
    const { db } = fakeDb({
      identity: { role: 'media_buyer', custom_role_id: CUSTOM_ROLE, name: null, email: null },
      customRole: { is_read_only: true, permission_groups: ['MEDIA_BUYING'] }
    })
    const ctx = await resolveMcpStaffContext(event, USER_ID, ['mcp:read', 'mcp:write'], { db, runtimeConfig: runtime() })
    expect(ctx.assistantReadOnly).toBe(true)
  })

  it('uses the current database system-role policy, else the static system default', async () => {
    const edited = fakeDb({ systemRole: { is_read_only: false, permission_groups: [] } })
    const narrowed = await resolveMcpStaffContext(event, USER_ID, [], { db: edited.db, runtimeConfig: runtime() })
    expect(narrowed.permissionGroups).toEqual([])

    const absent = fakeDb({ systemRole: null })
    const fallback = await resolveMcpStaffContext(event, USER_ID, [], { db: absent.db, runtimeConfig: runtime() })
    expect(fallback.permissionGroups).toEqual(['MEDIA_BUYING'])

    const unknown = fakeDb({ identity: { role: 'not_a_role', custom_role_id: null, name: null, email: null }, systemRole: null })
    expect((await resolveMcpStaffContext(event, USER_ID, [], { db: unknown.db, runtimeConfig: runtime() })).permissionGroups).toEqual([])
  })

  it('treats viewer and guest as read-only regardless of the role row', async () => {
    const { db } = fakeDb({
      identity: { role: 'viewer', custom_role_id: null, name: null, email: null },
      systemRole: { is_read_only: false, permission_groups: [] }
    })
    expect((await resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime() })).assistantReadOnly).toBe(true)
  })

  it('rejects inactive, unknown and malformed actors before any further authority lookup', async () => {
    const inactive = fakeDb({ identity: null })
    await expect(resolveMcpStaffContext(event, USER_ID, [], { db: inactive.db, runtimeConfig: runtime() }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(inactive.sql).toHaveLength(1)
    expect(inactive.sql[0]).toContain('is_active = TRUE')

    const malformed = fakeDb({})
    await expect(resolveMcpStaffContext(event, 'not-a-uuid', [], { db: malformed.db, runtimeConfig: runtime() }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(malformed.sql).toHaveLength(0)
  })

  it('fails closed with 503 when authority storage is unavailable or malformed', async () => {
    for (const fail of ['identity', 'role', 'assignments'] as const) {
      const { db } = fakeDb({ fail })
      await expect(resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime() }))
        .rejects.toMatchObject({ statusCode: 503 })
    }
    const { db } = fakeDb({ systemRole: { is_read_only: false, permission_groups: 'MANAGEMENT' } })
    await expect(resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime() }))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('returns assigned scope with zero assignments rather than widening to all clients', async () => {
    const { db } = fakeDb({ assignments: [] })
    const ctx = await resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime() })
    expect(ctx.assistantScope).toEqual({
      departmentIds: [],
      clientAccessMode: 'assigned',
      assignedClientIds: [],
      catalogReleaseIds: []
    })
  })

  it('fails closed rather than truncating an unbounded assignment list', async () => {
    const assignments = Array.from({ length: 101 }, (_, index) => ({
      client_id: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`
    }))
    const { db } = fakeDb({ assignments })
    await expect(resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime() }))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('retains explicit all-client scope for MANAGEMENT/ADMIN groups without loading assignments', async () => {
    const { db, sql } = fakeDb({
      identity: { role: 'lead', custom_role_id: null, name: null, email: null },
      systemRole: null,
      assignments: [{ client_id: CLIENT_B }]
    })
    const ctx = await resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime() })
    expect(ctx.assistantScope).toMatchObject({ clientAccessMode: 'all_active', assignedClientIds: [] })
    expect(sql.some(text => text.includes('client_team_assignments'))).toBe(false)
  })

  it('applies individually revocable grants that never create permission groups', async () => {
    const grants = JSON.stringify({ [USER_ID]: ['reporting', 'social_draft', 'ads_plan', 'tracking_plan'] })
    const { db } = fakeDb({})
    const ctx = await resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime(grants) })
    expect(ctx.marketingCapabilities).toEqual(['reporting', 'social_draft', 'ads_plan', 'tracking_plan'])
    expect(ctx.permissionGroups).toEqual(['MEDIA_BUYING'])
    expect(ctx.assistantScope?.clientAccessMode).toBe('assigned')

    const revoked = await resolveMcpStaffContext(event, USER_ID, [], { db, runtimeConfig: runtime('{}') })
    expect(revoked.marketingCapabilities).toEqual([])
  })

  it('grants nothing to anyone when the grant configuration is invalid', async () => {
    const { db } = fakeDb({})
    const ctx = await resolveMcpStaffContext(event, USER_ID, [], {
      db,
      runtimeConfig: runtime(JSON.stringify({ [USER_ID]: ['reporting', 'god_mode'] }))
    })
    expect(ctx.marketingCapabilities).toEqual([])
  })
})
