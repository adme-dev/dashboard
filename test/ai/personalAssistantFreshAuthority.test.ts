import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'

const actorId = '50000000-0000-4000-8000-000000000001'
const state = vi.hoisted(() => ({
  role: 'admin', customRoleId: null as string | null, roleId: 'role' as string | null,
  groups: ['CLIENTS', 'MARKETING_MANAGEMENT'], readOnly: false, active: true,
  cachedOne: vi.fn(), cachedRows: vi.fn(), freshOne: vi.fn(), freshRows: vi.fn()
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => state.cachedOne(...args),
  queryRows: (...args: unknown[]) => state.cachedRows(...args),
  queryOneFresh: (...args: unknown[]) => state.freshOne(...args),
  queryRowsFresh: (...args: unknown[]) => state.freshRows(...args)
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(state, { role: 'admin', customRoleId: null, roleId: 'role', groups: ['CLIENTS', 'MARKETING_MANAGEMENT'], readOnly: false, active: true })
  const identity = (sql: string) => {
    if (sql.includes('FROM team_members actor')) return state.active ? { id: actorId, role: state.role, custom_role_id: state.customRoleId } : null
    if (sql.includes('FROM custom_roles custom_role')) return { is_read_only: false, permission_groups: ['FINANCE'] }
    return null
  }
  state.cachedOne.mockImplementation(identity)
  state.cachedRows.mockResolvedValue([])
  state.freshOne.mockImplementation(identity)
  state.freshRows.mockImplementation(async (sql: string) => sql.includes('FROM team_members tm') && state.active
    ? [{
        role: state.role, custom_role_id: state.customRoleId, role_id: state.roleId,
        is_read_only: state.readOnly, permission_groups: state.groups
      }]
    : [])
})
const resolve = () => resolvePersonalAssistantContext({ userId: actorId })

describe('native assistant context uses current explicit database role authority', () => {
  it('uses system-role grants rather than static admin Finance and Management defaults', async () => {
    const context = await resolve()
    expect(context.permissionGroups).toEqual(['CLIENTS', 'MARKETING_MANAGEMENT'])
    expect(context.permissionGroups).not.toContain('FINANCE')
    expect(context.permissionGroups).not.toContain('MANAGEMENT')
    expect(context.clientScope.mode).toBe('all_active')
  })
  it('revokes company-wide client scope on the very next resolution', async () => {
    expect((await resolve()).clientScope.mode).toBe('all_active')
    state.groups = ['CLIENTS']
    const context = await resolve()
    expect(context.permissionGroups).toEqual(['CLIENTS'])
    expect(context.clientScope.mode).toBe('assigned')
  })
  it('uses fresh custom-role grants instead of stale cached Finance grants', async () => {
    state.customRoleId = '60000000-0000-4000-8000-000000000001'
    state.groups = ['CREATIVE']
    const context = await resolve()
    expect(context.permissionGroups).toEqual(['CREATIVE'])
    expect(context.clientScope.mode).toBe('assigned')
  })
  it('honours current system-role read-only settings', async () => {
    state.readOnly = true
    expect((await resolve()).isReadOnly).toBe(true)
  })
  it('never restores viewer writes even if the database role is writable', async () => {
    state.role = 'viewer'
    expect((await resolve()).isReadOnly).toBe(true)
  })
  it('fails closed when the assigned role is missing', async () => {
    state.roleId = null
    state.groups = []
    const context = await resolve()
    expect(context.permissionGroups).toEqual([])
    expect(context.isReadOnly).toBe(true)
  })
  it('does not read identity, grants or scope through the cached Hyperdrive path', async () => {
    await resolve()
    expect(state.cachedOne).not.toHaveBeenCalled()
    expect(state.cachedRows).not.toHaveBeenCalled()
  })
  it('rejects offboarded staff before loading their scope', async () => {
    state.active = false
    await expect(resolve()).rejects.toMatchObject({ code: 'assistant_identity_inactive' })
    expect(state.freshRows).not.toHaveBeenCalled()
  })
  it('rejects a role reassignment between identity and authority reads', async () => {
    state.freshRows.mockImplementation(async () => [{
      role: 'viewer', custom_role_id: null, role_id: 'viewer-role',
      is_read_only: true, permission_groups: []
    }])
    await expect(resolve()).rejects.toMatchObject({ code: 'assistant_authority_changed' })
  })
  it('denies admission on a fresh authority read failure', async () => {
    state.freshRows.mockRejectedValue(new Error('database unavailable'))
    await expect(resolve()).rejects.toMatchObject({ statusCode: 503 })
  })
})
