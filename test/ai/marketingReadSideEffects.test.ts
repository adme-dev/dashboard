import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { A, fixture, context, resetHarness, expectNoSideEffects } from './helpers/marketingReadHarness'
import { campaignBreakdownTool } from '../../server/utils/ai/tools/campaignBreakdown'
import { adBreakdownTool } from '../../server/utils/ai/tools/adBreakdown'
import { adCreativeTextTool } from '../../server/utils/ai/tools/adCreativeText'
import { searchTermsTool } from '../../server/utils/ai/tools/searchTerms'
import { adspendTool } from '../../server/utils/ai/tools/adspend'

const tools = [
  [campaignBreakdownTool, {}], [adBreakdownTool, { campaignId: 'same' }],
  [adCreativeTextTool, { clientId: A, platform: 'meta' }], [searchTermsTool, { campaignId: 'same' }], [adspendTool, {}]
] as const
beforeEach(() => {
  resetHarness()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
  fixture.now = '2026-10-27T00:00:00Z'
})
afterEach(() => vi.useRealTimers())
const cases = tools.flatMap(([tool, args]) => ['fresh', 'stale', 'missing'].flatMap(state => [true, false].flatMap(readOnly => [true, false].map(write => ({ tool, args, state, readOnly, write })))))
it.each(cases)('ordinary_reads_never_refresh_or_persist $tool.name $state readOnly=$readOnly write=$write', async ({ tool, args, state, readOnly, write }) => {
  fixture.context = context({ assistantReadOnly: readOnly, mcpScopes: new Set(write ? ['agency:read', 'agency:write'] : ['agency:read']) })
  fixture.now = state === 'stale' ? '2026-10-20T00:00:00Z' : '2026-10-27T00:00:00Z'
  fixture.missing = state === 'missing'
  const result: any = await tool.handler(tool.parameters.parse(args) as never, fixture.context)
  expectNoSideEffects()
  if (result.ok && result.data.refresh) expect(result.data.refresh.attempted).toBe(false)
  if (result.ok && result.data.sync) expect(result.data.sync.attempted).toBe(0)
  if (result.ok && result.data.diagnosticRefresh) expect(result.data.diagnosticRefresh.attempted).toBe(0)
})
it.each(tools.filter(([tool]) => tool !== adCreativeTextTool && tool !== adspendTool))('ordinary explicit refresh $0.name fails before target access', async (tool, args) => {
  const result = await tool.handler(tool.parameters.parse({ ...args, refresh: true }) as never, context({ assistantReadOnly: false, mcpScopes: new Set(['agency:read', 'agency:write']) }))
  expect(result).toMatchObject({ ok: false, code: 'MARKETING_REFRESH_REQUIRES_REVIEW' })
  expect(fixture.queryRowsFresh).not.toHaveBeenCalled()
  expect(fixture.queryOneFresh).not.toHaveBeenCalled()
  expectNoSideEffects()
})
it('global_job_drop_does_not_change_scoped_halt', async () => {
  fixture.queryRows.mockRejectedValue(Error('global drop'))
  const result: any = await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({}), fixture.context)
  expect(result.data.halted).toBe(false)
  expect(result.data.coverageDeltaStatus).toBe('unavailable_for_client_scope')
  expectNoSideEffects()
})
