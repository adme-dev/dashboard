/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, expect, it, vi } from 'vitest'
import { requireClientTrackingAccess, requireTrackingAudienceScope, accessibleClientIds } from '../../../server/utils/client-access'
import { resolveInvoiceAccess } from '../../../server/utils/clientScoping'

const fixture = vi.hoisted(() => ({ granted: true, active: true, sql: [] as string[], role: 'member', clientIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] }))
const USER = '11111111-1111-4111-8111-111111111111'
const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: async () => ({ id: USER, role: fixture.role, permissionGroups: ['MARKETING_MANAGEMENT'] }),
  requireRole: async () => { if (fixture.role === 'member') throw Object.assign(new Error('Forbidden'), { statusCode: 403 }) }
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: async () => null,
  query: async () => [],
  queryRows: async () => [],
  queryOneFresh: async (sql: string, params: unknown[]) => {
    fixture.sql.push(sql)
    if (sql.includes('FROM team_members')) {
      expect(params).toEqual([USER])
      expect(sql).toContain('tm.is_active = TRUE')
      expect(sql).toContain('permission_group = \'MARKETING_MANAGEMENT\'')
      expect(sql).toContain('tm.custom_role_id IS NULL')
      return fixture.granted ? { allowed: true } : null
    }
    expect(sql).toContain('is_active = TRUE')
    return fixture.active ? { id: CLIENT } : null
  },
  queryRowsFresh: async (sql: string) => {
    fixture.sql.push(sql)
    expect(sql).toContain('FROM agency_clients')
    expect(sql).toContain('is_active = TRUE')
    return fixture.active ? fixture.clientIds.map(client_id => ({ client_id })) : []
  }
}))
vi.mock('~~/server/utils/kv', () => ({ kvGet: async () => null, kvPut: vi.fn(), kvDelete: vi.fn() }))
const event = {} as any
beforeEach(() => { fixture.granted = true; fixture.active = true; fixture.sql = []; fixture.role = 'member'; fixture.clientIds = [CLIENT] })
it('allows dedicated browser marketing access to active clients without legacy roles or assignments', async () => {
  await expect(requireClientTrackingAccess(event, CLIENT)).resolves.toMatchObject({ id: USER, role: 'member' })
  await expect(requireTrackingAudienceScope(event)).resolves.toMatchObject({ clientIds: [CLIENT], accessibleClientIds: [CLIENT] })
  expect(fixture.sql.some(sql => sql.includes('client_team_assignments'))).toBe(false)
})
it('rejects inactive clients and immediately revoked groups despite stale browser permissions', async () => {
  fixture.active = false
  await expect(requireClientTrackingAccess(event, CLIENT)).rejects.toMatchObject({ statusCode: 403 })
  await expect(requireTrackingAudienceScope(event, CLIENT)).rejects.toMatchObject({ statusCode: 403 })
  fixture.active = true; fixture.granted = false
  await expect(requireClientTrackingAccess(event, CLIENT)).rejects.toMatchObject({ statusCode: 403 })
  await expect(requireTrackingAudienceScope(event)).rejects.toMatchObject({ statusCode: 403 })
  await expect(accessibleClientIds({ id: USER, role: 'member' })).resolves.toEqual([])
})
it('never converts the dedicated group into invoice authority', async () => {
  await expect(resolveInvoiceAccess(event, { id: USER, role: 'member', permissionGroups: ['MARKETING_MANAGEMENT'] } as any)).rejects.toMatchObject({ statusCode: 403 })
})

it('includes newly active clients beyond the ordinary assignment cap without support rows', async () => {
  fixture.clientIds = Array.from({ length: 101 }, (_, index) => `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`)
  const initial = await accessibleClientIds({ id: USER, role: 'member' })
  expect(initial).toHaveLength(101)
  fixture.clientIds.push(CLIENT)
  const next = await accessibleClientIds({ id: USER, role: 'member' })
  expect(next).toHaveLength(102)
  expect(next).toContain(CLIENT)
  expect(fixture.sql.some(sql => sql.includes('client_team_assignments'))).toBe(false)
})
