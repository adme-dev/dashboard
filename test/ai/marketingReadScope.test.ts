import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ ...db, queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: vi.fn(async () => ({ active: false })), isActiveGodModeAuthority: (a: any) => a.active }))
import { resolveMarketingReadScope, clientScopeSql, requireMarketingReadPermission, resolveStoredReportingTenant } from '../../server/utils/ai/marketing/readScope'
export const staff = (overrides: any = {}): any => ({ userId: 'staff', userRole: 'admin', permissionGroups: [], source: 'mcp', mcpStaffAuthority: 'fresh', marketingCapabilities: ['reporting'], assistantScope: { clientAccessMode: 'assigned', assignedClientIds: ['a'] }, event: {}, ...overrides })
beforeEach(() => vi.clearAllMocks())
describe('trusted reporting scope', () => {
  it('rejects_missing_scope_and_never_uses_cached_assignment_helpers', async () => {
    await expect(resolveMarketingReadScope(staff({ assistantScope: undefined }))).rejects.toThrow()
    expect(db.queryOneFresh).not.toHaveBeenCalled()
  })
  it('empty_resolved_groups_do_not_inherit_admin_base_role', async () => {
    const scope = await resolveMarketingReadScope(staff({ marketingCapabilities: [] }))
    expect(() => requireMarketingReadPermission(scope, 'campaigns')).toThrow()
    expect(scope.financialReadAllowed).toBe(false)
  })
  it('zero_assignments_never_becomes_all_clients', async () => {
    const scope = await resolveMarketingReadScope(staff({ assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [] } }))
    expect(clientScopeSql(scope, 'ms.client_id', [])).toBe('FALSE')
    expect(await resolveStoredReportingTenant(scope, 'campaigns')).toBeNull()
    expect(db.queryOneFresh).not.toHaveBeenCalled()
  })
  it('intersects_dealer_scope_for_owner_and_staff', async () => {
    expect((await resolveMarketingReadScope(staff({ clientScope: 'b' }))).clientIds).toEqual([])
    expect((await resolveMarketingReadScope(staff({ clientScope: 'a' }))).clientIds).toEqual(['a'])
  })
  it('assignment_without_permission_or_grant_cannot_read', async () => {
    const scope = await resolveMarketingReadScope(staff({ marketingCapabilities: [] }))
    await expect(resolveStoredReportingTenant(scope, 'campaigns')).rejects.toThrow()
    expect(db.queryOneFresh).not.toHaveBeenCalled()
  })
  it('tenant_is_stored_identity_only', async () => {
    db.queryOneFresh.mockResolvedValue({ tenant_id: 'tenant' })
    expect(await resolveStoredReportingTenant(await resolveMarketingReadScope(staff()), 'campaigns')).toBe('tenant')
    expect(db.queryOneFresh.mock.calls[0][0]).toContain("tenant_id <> '__default__'")
    expect(db.queryOneFresh.mock.calls[0][0]).not.toMatch(/token|secret/)
  })
})
it('all_active_requires_management_and_applies_active_client_predicate', async () => {
  await expect(resolveMarketingReadScope(staff({ assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] } }))).rejects.toThrow()
  const scope = await resolveMarketingReadScope(staff({ permissionGroups: ['MANAGEMENT'], assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] } }))
  expect(clientScopeSql(scope, 'ms.client_id', [])).toContain('authorized_client.is_active = true')
  expect(scope.ownerRefreshAllowed).toBe(false)
})
it('finance_is_independent_and_never_enables_owner_refresh', async () => {
  const scope = await resolveMarketingReadScope(staff({ permissionGroups: ['FINANCE'], assistantReadOnly: false, mcpScopes: ['agency:read', 'agency:write'] }))
  expect(scope.financialReadAllowed).toBe(true); expect(scope.ownerRefreshAllowed).toBe(false)
})
