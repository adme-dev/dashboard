/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
import { expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ role: 'owner' }) }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: async () => [],
  queryRowsFresh: async (sql: string) => {
    if (sql.includes('FROM custom_roles')) return [{ id: 'role', permission_groups: ['MARKETING_MANAGEMENT'] }]
    if (sql.includes('FROM team_members tm')) return [{ id: 'staff', email: 'staff@example.test', is_active: true, custom_role_id: 'role', role: 'member' }]
    if (sql.includes('FROM team_members')) return [{ id: 'staff' }]
    return []
  }
}))
Object.assign(globalThis, { defineEventHandler: (fn: unknown) => fn, eventHandler: (fn: unknown) => fn, getRouterParam: () => 'role' })
const roles = (await import('../../../server/api/admin/roles/index.get')).default
const users = (await import('../../../server/api/admin/users/index.get')).default
const members = (await import('../../../server/api/admin/roles/[id]/members.get')).default
it('reads role membership policy from fresh storage for canonical enrollment readback', async () => {
  const result = await roles({} as any)
  expect(result.roles).toEqual([expect.objectContaining({ id: 'role', permissionGroups: ['MARKETING_MANAGEMENT'] })])
})
it('reads current custom role identity on the admin user listing', async () => {
  const result = await users({} as any)
  expect(result.users).toEqual([expect.objectContaining({ id: 'staff', role: 'member', customRoleId: 'role' })])
})
it('reads current active role members without the cached database binding', async () => {
  const result = await members({} as any)
  expect(result.members).toEqual([expect.objectContaining({ id: 'staff' })])
})
