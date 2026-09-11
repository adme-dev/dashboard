import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAgencyPageStudioSites, listPortalPageStudioSites } from '~~/server/utils/pageStudio/sites'

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRows, transaction: vi.fn() }))

const row = {
  id: '11111111-1111-4111-8111-111111111111', tenant_id: 'tenant-a', client_id: 'client-a',
  entitlement_id: 'entitlement-a', name: 'Trips', route: 'trips', starter_version: 'limousine-v1',
  status: 'draft', created_at: '', updated_at: '', total_count: '1',
  booking_entitlement_status: 'trial', booking_entitlement_effective: true,
  booking_plan_metadata: { allowedModules: ['bookings'] }, booking_membership_allowed: true
}
const portal = () => listPortalPageStudioSites({ clientId: 'client-a', userId: 'viewer-a', limit: 25, offset: 0 })
beforeEach(() => queryRows.mockReset())
describe('site booking navigation eligibility', () => {
  it('makes an entitled website discoverable to its assigned viewer', async () => {
    queryRows.mockResolvedValue([row])
    expect((await portal()).items[0]).toMatchObject({ id: row.id, bookingEnabled: true })
    const [sql, params] = queryRows.mock.calls[0]!
    expect(sql).toContain('entitlement.id = site.entitlement_id')
    expect(sql).toContain('entitlement.tenant_id = site.tenant_id')
    expect(sql).toContain('entitlement.client_id = site.client_id')
    expect(sql).toContain('entitlement.effective_from <= NOW()')
    expect(sql).toContain('entitlement.effective_until > NOW()')
    expect(sql).toContain('membership.role IN (\'viewer\', \'editor\')')
    expect(params).toEqual(['client-a', 'viewer-a', 25, 0])
  })
  it.each([
    { status: 'archived' }, { status: 'paused' },
    { booking_entitlement_status: 'suspended' }, { booking_entitlement_status: null },
    { booking_entitlement_effective: false }, { booking_entitlement_effective: null },
    { booking_plan_metadata: null }, { booking_plan_metadata: { allowedModules: [] } },
    { booking_plan_metadata: { allowedModules: ['bookings', 1] } },
    { booking_membership_allowed: false }
  ])('hides booking navigation when access is unavailable: %j', async (overrides) => {
    queryRows.mockResolvedValue([{ ...row, ...overrides }])
    expect((await portal()).items[0]?.bookingEnabled).toBe(false)
  })
  it('also exposes the entitlement on agency site cards', async () => {
    queryRows.mockResolvedValue([{ ...row, status: 'active', booking_entitlement_status: 'active' }])
    const result = await listAgencyPageStudioSites({ tenantId: 'tenant-a', limit: 25, offset: 0 })
    expect(result.items[0]?.bookingEnabled).toBe(true)
    expect(queryRows.mock.calls[0]?.[0]).toContain('entitlement.client_id = site.client_id')
  })
})
