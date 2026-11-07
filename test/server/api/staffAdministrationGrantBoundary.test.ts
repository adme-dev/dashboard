import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), grant: vi.fn(), db: vi.fn(), effect: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireRole: m.auth, logActivity: m.effect, invalidateAllSessions: m.effect, invalidateUserMagicLinks: m.effect, generateMagicLink: m.effect }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertPermissionGrant: m.grant, assertFinancePermission: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.db, queryRows: m.db, execute: m.db, transaction: m.db }))
vi.mock('~~/server/utils/roleResolver', () => ({ invalidateUserPermissionCache: m.effect }))
vi.mock('~~/server/utils/email', () => ({ sendMagicLinkEmail: m.effect }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://fixture.invalid' }))
vi.mock('h3', async importOriginal => ({ ...(await importOriginal<Record<string, unknown>>()), readBody: async (e: { body: unknown }) => e.body }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('eventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async (e: { body: unknown }) => e.body)
vi.stubGlobal('getRouterParam', () => 'target-user')
const routes = [
  ['team-create', (await import('~~/server/api/agency/team-members/index.post')).default],
  ['team-update', (await import('~~/server/api/agency/team-members/[id].put')).default],
  ['team-delete', (await import('~~/server/api/agency/team-members/[id].delete')).default],
  ['auth-role', (await import('~~/server/api/auth/users/[id]/role.patch')).default],
  ['auth-status', (await import('~~/server/api/auth/users/[id]/status.patch')).default],
  ['admin-role-create', (await import('~~/server/api/admin/roles/index.post')).default],
  ['admin-role-update', (await import('~~/server/api/admin/roles/[id].put')).default],
  ['admin-role-delete', (await import('~~/server/api/admin/roles/[id].delete')).default],
  ['admin-user-invite', (await import('~~/server/api/admin/users/invite.post')).default],
  ['admin-user-update', (await import('~~/server/api/admin/users/[id].patch')).default],
  ['admin-user-delete', (await import('~~/server/api/admin/users/[id].delete')).default],
  ['dev-super-admin', (await import('~~/server/api/admin/create-super-admin.post')).default],
  ['foreign-profile', (await import('~~/server/api/auth/users/[id].put')).default]
] as const
const e = () => ({ body: { name: 'Staff', email: 'staff@example.com', emails: ['staff@example.com'], userRole: 'member', isActive: true }, context: {} }) as never
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ id: 'legacy-owner', role: 'owner', permissionGroups: ['ADMIN', 'FINANCE'] })
  m.grant.mockRejectedValue(Object.assign(new Error('No explicit grant'), { statusCode: 403 }))
  m.db.mockResolvedValue(null)
})
describe('staff administration requires a fresh explicit ADMIN write grant', () => {
  it.each(routes)('%s denies a legacy owner even with forged cached ADMIN before DB or effects', async (_name, handler) => {
    await expect(handler(e())).rejects.toMatchObject({ statusCode: 403 })
    expect(m.grant).toHaveBeenCalledWith(expect.anything(), 'legacy-owner', 'ADMIN', true)
    expect(m.db).not.toHaveBeenCalled()
    expect(m.effect).not.toHaveBeenCalled()
  })
  it.each(routes)('%s propagates authority DB failure before staff mutations', async (_name, handler) => {
    m.grant.mockRejectedValue(Object.assign(new Error('Unavailable'), { statusCode: 503 }))
    await expect(handler(e())).rejects.toMatchObject({ statusCode: 503 })
    expect(m.db).not.toHaveBeenCalled()
    expect(m.effect).not.toHaveBeenCalled()
  })
  it('keeps the allowlisted own-profile path separate from staff administration', async () => {
    m.auth.mockResolvedValue({ id: 'target-user', role: 'member' })
    m.db.mockResolvedValue({ id: 'target-user', name: 'Updated profile' })
    const handler = routes.find(([name]) => name === 'foreign-profile')![1]
    await expect(handler({ body: { name: 'Updated profile' }, context: {} } as never)).resolves.toMatchObject({ name: 'Updated profile' })
    expect(m.grant).not.toHaveBeenCalled()
  })
})

it('retains an explicitly authorized administrator staff create operation', async () => {
  m.grant.mockResolvedValue(undefined)
  m.db.mockImplementation(async (sql: string) => sql.includes('WHERE email =') ? null : { id: 'created', name: 'Staff', email: 'staff@example.com', target_utilization: 120, is_active: true })
  const handler = routes.find(([name]) => name === 'team-create')![1]
  expect(await handler(e())).toMatchObject({ member: { id: 'created', name: 'Staff' } })
  expect(m.grant).toHaveBeenCalledWith(expect.anything(), 'legacy-owner', 'ADMIN', true)
})
