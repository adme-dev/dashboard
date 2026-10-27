import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { A, B, fixture, context, resetHarness, expectNoSideEffects } from './helpers/marketingReadHarness'
import { campaignBreakdownTool } from '../../server/utils/ai/tools/campaignBreakdown'
import { adBreakdownTool } from '../../server/utils/ai/tools/adBreakdown'
import { adCreativeTextTool } from '../../server/utils/ai/tools/adCreativeText'
import { searchTermsTool } from '../../server/utils/ai/tools/searchTerms'
import { adspendTool } from '../../server/utils/ai/tools/adspend'
import { socialTool } from '../../server/utils/ai/tools/social'
export const cases = [
  [campaignBreakdownTool, { clientName: 'Client A', startDate: '2026-10-01', endDate: '2026-10-27' }, 'A campaign'],
  [adBreakdownTool, { clientName: 'Client A', startDate: '2026-10-01', endDate: '2026-10-27' }, 'A ad'],
  [adCreativeTextTool, { clientId: A, platform: 'meta' }, 'A headline'],
  [searchTermsTool, { campaignId: 'same', clientName: 'Client A', startDate: '2026-10-01', endDate: '2026-10-27' }, 'A term'],
  [adspendTool, { clientName: 'Client A' }, 'Client A'],
  [socialTool, { clientName: 'Client A' }, 'A content'],
] as const
beforeEach(() => { resetHarness(); vi.useFakeTimers(); vi.setSystemTime(new Date(fixture.now)) })
afterEach(() => vi.useRealTimers())
it.each(cases)('actual registered $0.name default adapter reads A and never B', async (tool, args, expected) => {
  const result = await tool.handler(tool.parameters.parse(args) as never, fixture.context)
  expect(result.ok).toBe(true)
  const json = JSON.stringify(result)
  expect(json).toContain(expected); expect(json).not.toContain(B); expect(json).not.toContain('Forbidden B')
  expectNoSideEffects()
})
it('revoked_assignment_changes_next_route_and_tool_call', async () => {
  const args = socialTool.parameters.parse({ clientName: 'Client A' })
  expect((await socialTool.handler(args, fixture.context)).ok).toBe(true)
  fixture.context = context({ assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [] } })
  fixture.queryRowsFresh.mockClear()
  const result = await socialTool.handler(args, fixture.context)
  expect(result.ok).toBe(false)
  expect(JSON.stringify(result)).not.toContain('A content')
  expectNoSideEffects()
})
it('same_client_two_accounts_one_lead_marks_campaign_attribution_ambiguous', async () => {
  fixture.ambiguous = true
  const result: any = await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({}), fixture.context)
  expect(result.data.campaigns[0]).toMatchObject({ leadCount: null, costPerLead: null, accountLeadAttribution: { status: 'ambiguous' } })
  expect(result.data.leadAttribution.totalSubmissions).toBe(1)
})
it.each(['current', 'prior'])('missing %s snapshot window halts without a zero baseline', async window => {
  fixture.missing = window === 'current'; fixture.priorMissing = window === 'prior'
  const result: any = await adBreakdownTool.handler(adBreakdownTool.parameters.parse({ campaignId: 'same', startDate: '2026-10-01', endDate: '2026-10-27', comparePrevious: true }), fixture.context)
  expect(result.data).toMatchObject({ halted: true, affectedWindow: window, ads: [], haltReason: 'missing_campaign_snapshots' })
  expectNoSideEffects()
})
it('truncated_mixed_snapshot_selection_halts_and_retains_truncation', async () => {
  fixture.targets = 21; fixture.partialCurrent = true
  const result: any = await adBreakdownTool.handler(adBreakdownTool.parameters.parse({ campaignId: 'same' }), fixture.context)
  expect(result.data).toMatchObject({ halted: true, truncatedAtSource: true, ads: [], snapshotCoverage: { current: { selectedTargetCount: 20, missingTargetCount: 1 } } })
})
it('ambiguous_account_attribution_suppresses_cpl_and_fatigue', async () => {
  fixture.ambiguous = true
  const result: any = await adBreakdownTool.handler(adBreakdownTool.parameters.parse({ campaignId: 'same' }), fixture.context)
  expect(result.data.ads[0]).toMatchObject({ leadCount: null, costPerLead: null, fatigueSignals: [], accountLeadAttribution: { status: 'ambiguous' } })
})
it.each(['current', 'prior'])('truncated_mixed_snapshot_selection_halts_and_retains_truncation %s', async window => {
  fixture.targets = 21; fixture.partialCurrent = window === 'current'; fixture.partialPrior = window === 'prior'
  const result: any = await adBreakdownTool.handler(adBreakdownTool.parameters.parse({ campaignId: 'same', startDate: '2026-10-01', endDate: '2026-10-27', comparePrevious: true }), fixture.context)
  expect(result.data).toMatchObject({ halted: true, affectedWindow: window, truncatedAtSource: true, ads: [] })
  expect(result.data.snapshotCoverage[window]).toMatchObject({ selectedTargetCount: 20, missingTargetCount: 1, truncatedAtSource: true })
  expectNoSideEffects()
})
it('complete_snapshot_selection_preserves_success_truncation', async () => {
  fixture.targets = 21
  const result: any = await adBreakdownTool.handler(adBreakdownTool.parameters.parse({ campaignId: 'same', startDate: '2026-10-01', endDate: '2026-10-27' }), fixture.context)
  expect(result.data).toMatchObject({ halted: false, truncatedAtSource: true, snapshotCoverage: { current: { selectedTargetCount: 20, missingTargetCount: 0, truncatedAtSource: true } } })
  expect(result.data.ads).toHaveLength(20)
})
it('owner_refresh_still_runs_with_authorized_ids', async () => {
  fixture.owner = true
  fixture.context = context({ userRole: 'owner', clientScope: A, assistantReadOnly: false })
  const result: any = await adBreakdownTool.handler(adBreakdownTool.parameters.parse({ campaignId: 'same', refresh: true }), fixture.context)
  expect(result.ok).toBe(true)
  expect(fixture.sync).toHaveBeenCalledWith('new-month-0', expect.any(String), expect.any(String))
  expect(fixture.tokenRead).not.toHaveBeenCalled()
})
it('prior_window_only_contains_requested_client_and_b_only_prior_data_does_not_set_available', async () => {
  fixture.priorMissing = true
  const result: any = await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({ clientName: 'Client A', startDate: '2026-10-01', endDate: '2026-10-27', comparePrevious: true }), fixture.context)
  expect(result.data.comparisonStatus).toBe('no_baseline')
  const periodQueries = fixture.queryRowsFresh.mock.calls.filter(([sql]) => sql.includes('FROM campaigns c'))
  expect(periodQueries).toHaveLength(2)
  for (const [sql, params] of periodQueries) { expect(sql).toMatch(/ms.client_id = \$\d/); expect(params).toContain(A) }
})
it('same_name_same_campaign_across_accounts_keeps_separate_comparisons', async () => {
  fixture.accounts = 2
  const result: any = await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({ startDate: '2026-10-01', endDate: '2026-10-27', comparePrevious: true }), fixture.context)
  expect(result.data.campaigns.map((row: any) => row.comparison.spendDelta).sort((a: number, b: number) => a - b)).toEqual([90, 180])
})

it.each([A, B])('client overview reveals parent only when the parent itself is authorized: %s', async parentId => {
  fixture.parentClientId = parentId
  const { clientOverviewTool } = await import('../../server/utils/ai/tools/clients')
  const result: any = await clientOverviewTool.handler(clientOverviewTool.parameters.parse({ clientName: 'Client A' }), fixture.context)
  expect(result.ok).toBe(true)
  expect(result.data.parentClient).toEqual(parentId === A ? { id: A, name: 'Client A' } : null)
  expect(JSON.stringify(result)).not.toContain(B)
  const [sql, params] = fixture.queryRowsFresh.mock.calls.find(([sql]) => sql.includes('FROM agency_clients c'))!
  expect(sql).toMatch(/parent.id = c.parent_client_id AND parent.id = ANY\(\$3::uuid\[\]\)/)
  expect(params[2]).toEqual([A])
})
it('forbidden targets precede A in fixtures but never consume the 20-target cap', async () => {
  fixture.targets = 21
  const { selectScopedAdTargets } = await import('../../server/utils/ai/marketing/adReads')
  const { resolveMarketingReadScope } = await import('../../server/utils/ai/marketing/readScope')
  const result = await selectScopedAdTargets(await resolveMarketingReadScope(fixture.context), { campaignId: 'same' } as any)
  expect(result.targets).toHaveLength(20)
  expect(result.targets.every(target => target.clientId === A)).toBe(true)
  expect(result.targets[0].mediaSpendId).toBe('new-month-0')
  expect(result.truncatedAtSource).toBe(true)
})
it('campaign lifetime and lead results ignore B with colliding provider and account ids', async () => {
  const result: any = await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({ startDate: '2026-10-01', endDate: '2026-10-27' }), fixture.context)
  expect(result.data.campaigns[0]).toMatchObject({ spend: 7, leadCount: 1, firstServedDate: '2026-10-01', accountLeadAttribution: { status: 'available' } })
  expect(result.data.leadAttribution.totalSubmissions).toBe(1)
  expect(JSON.stringify(result)).not.toMatch(/9000|1999-01-01|Forbidden B/)
})
