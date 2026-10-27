import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { A, B, fixture, context, resetHarness, expectNoSideEffects } from '../../ai/helpers/marketingReadHarness'
Object.assign(globalThis, { defineEventHandler: (fn: any) => fn, eventHandler: (fn: any) => fn, getQuery: (event: any) => event.query || {}, createError: (input: any) => Object.assign(new Error(input.statusMessage), input) })
const campaign = (await import('../../../server/api/agency/analytics/campaigns.get')).default
const pacing = (await import('../../../server/api/agency/social/spend/summary.get')).default
const social = (await import('../../../server/api/agency/social/reporting/overview.get')).default
beforeEach(() => { resetHarness(); fixture.context.permissionGroups = ['MEDIA_BUYING', 'CLIENTS', 'CREATIVE']; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T00:00:00Z')); fixture.now = '2026-10-27T00:00:00Z' })
afterEach(() => vi.useRealTimers())
const event = (query: any) => ({ context: {}, query } as any)
it.each([false, true])('ordinary_campaign_and_pacing_without_tenant_never_read_tokens_or_write finance=%s', async finance => {
  fixture.tenant = ''
  fixture.context = context({ permissionGroups: finance ? ['FINANCE', 'MEDIA_BUYING'] : ['MEDIA_BUYING'] })
  const a = await campaign(event({ startDate: '2026-10-01', endDate: '2026-10-27', clientId: A }))
  const b = await pacing(event({ month: 10, year: 2026, clientId: A }))
  expect(a.campaigns[0].clientId).toBe(A); expect(a.campaigns[0].budgetActionable).toBe(false)
  expect(b.projection).toBe(finance ? 'finance' : 'marketing')
  expectNoSideEffects()
})
it('stored_tenant_preserves_campaign_budget_keys', async () => {
  const result = await campaign(event({ startDate: '2026-10-01', endDate: '2026-10-27' }))
  expect(result.campaigns[0].budgetKey).toContain('tenant:stored-tenant')
  expectNoSideEffects()
})
it('marketing_pacing_skips_tenant_lookup', async () => {
  await pacing(event({ month: 10, year: 2026 }))
  expect(fixture.queryOneFresh.mock.calls.some(([sql]) => sql.includes('xero_org_connection'))).toBe(false)
  expectNoSideEffects()
})
it.each([[campaign, { startDate: '2026-10-01', endDate: '2026-10-27', clientId: B }], [pacing, { month: 10, year: 2026, clientId: B }], [social, { from: '2026-10-01', to: '2026-10-27', clientId: B }]])('browser_cannot_bypass_scope_by_calling_route_directly', async (handler, query) => {
  await expect((handler as any)(event(query))).rejects.toThrow('Client not found')
  expect(fixture.queryRowsFresh).not.toHaveBeenCalled()
  expect(fixture.queryOneFresh.mock.calls.some(([sql]) => sql.includes('xero_org_connection'))).toBe(false)
  expectNoSideEffects()
})
it('revoked_assignment_changes_next_route_call', async () => {
  const query = { from: '2026-10-01', to: '2026-10-27', clientId: A }
  expect((await social(event(query))).bestContent[0].content).toBe('A content')
  fixture.context = context({ permissionGroups: ['CREATIVE'], assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [] } })
  fixture.queryRowsFresh.mockClear()
  await expect(social(event(query))).rejects.toThrow('Client not found')
  expect(fixture.queryRowsFresh).not.toHaveBeenCalled()
})
it('denied_permission_never_resolves_tenant', async () => {
  fixture.context = context({ permissionGroups: [], marketingCapabilities: [] })
  await expect(pacing(event({ month: 10, year: 2026 }))).rejects.toThrow('Reporting permission required')
  expect(fixture.queryOneFresh.mock.calls.some(([sql]) => sql.includes('xero_org_connection'))).toBe(false)
})
