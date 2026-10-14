import { describe, expect, it, vi } from 'vitest'
import { requirePortalDomainAuthority } from '../../../workers/page-studio-management/src/portalDomainAuthority'

const input = { actorId: '30000000-0000-4000-8000-000000000001', clientId: '40000000-0000-4000-8000-000000000001', siteId: '50000000-0000-4000-8000-000000000001' }
const row = { tenantId: 'tenant', clientId: input.clientId, customDomainLimit: 0, canManage: true }
function database(value: typeof row | null = row) {
  return { query: vi.fn().mockResolvedValue({ rows: value ? [value] : [] }) }
}
describe('customer domain visibility and mutation authority', () => {
  it('allows zero-capacity customers to inspect setup with an explicit plan blocker', async () => {
    const db = database()
    await expect(requirePortalDomainAuthority(db, input, false)).resolves.toMatchObject({ canManage: false, managementBlocker: 'plan' })
    expect(db.query.mock.calls[0]![0]).not.toContain('AND entitlement.custom_domain_limit > 0')
  })
  it('still denies zero-capacity attachment', async () => {
    await expect(requirePortalDomainAuthority(database(), input, true)).rejects.toMatchObject({ code: 'DOMAIN_ACCESS_DENIED', statusCode: 403 })
  })
  it('retains read-only role restrictions even when the plan permits domains', async () => {
    const db = database({ ...row, customDomainLimit: 2, canManage: false })
    await expect(requirePortalDomainAuthority(db, input, false)).resolves.toMatchObject({ canManage: false, managementBlocker: 'role' })
    await expect(requirePortalDomainAuthority(db, input, true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('permits authorized managers within an eligible plan', async () => {
    await expect(requirePortalDomainAuthority(database({ ...row, customDomainLimit: 2 }), input, true)).resolves.toMatchObject({ canManage: true, managementBlocker: undefined })
  })
  it.each([null, { ...row, clientId: '40000000-0000-4000-8000-000000000002' }])('rejects inaccessible or cross-client rows', async (value) => {
    await expect(requirePortalDomainAuthority(database(value), input, false)).rejects.toMatchObject({ statusCode: 403 })
  })
})
