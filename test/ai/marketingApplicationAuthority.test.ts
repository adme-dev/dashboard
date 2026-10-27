import { beforeEach, expect, it } from 'vitest'
import { A, B, USER, fixture, resetHarness, expectNoSideEffects } from './helpers/marketingReadHarness'
import { resolveMarketingReadScope, resolveBrowserMarketingReadScope } from '../../server/utils/ai/marketing/readScope'
import { adBreakdownTool } from '../../server/utils/ai/tools/adBreakdown'
import { adCreativeTextTool } from '../../server/utils/ai/tools/adCreativeText'
import { searchTermsTool } from '../../server/utils/ai/tools/searchTerms'
import { clientOverviewTool } from '../../server/utils/ai/tools/clients'
import { leadsTool } from '../../server/utils/ai/tools/leads'
import { campaignBreakdownTool } from '../../server/utils/ai/tools/campaignBreakdown'
import { adspendTool } from '../../server/utils/ai/tools/adspend'
import { socialTool } from '../../server/utils/ai/tools/social'
import { SYSTEM_ROLE_PERMISSIONS } from '../../server/utils/permissions'

Object.assign(globalThis, { defineEventHandler: (fn: any) => fn, eventHandler: (fn: any) => fn, getQuery: (event: any) => event.query || {}, createError: (input: any) => Object.assign(new Error(input.statusMessage), input) })
const pacing = (await import('../../server/api/agency/social/spend/summary.get')).default
const social = (await import('../../server/api/agency/social/reporting/overview.get')).default
let role: string, assignments: string[], active: boolean, customGroups: string[] | null
const event = (query = {}) => ({ context: { user: { id: USER }, cloudflare: { env: { MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ [USER]: ['reporting'] }) } } }, query } as any)
const chat = (extra = {}) => ({ userId: USER, userRole: role, conversationId: 'chat-1', event: event(), ...extra } as any)
beforeEach(() => {
  resetHarness()
  fixture.realAuthority = true
  role = 'media_buyer'
  assignments = [A]
  active = true
  customGroups = null
  const one = fixture.queryOneFresh.getMockImplementation()!
  const rows = fixture.queryRowsFresh.getMockImplementation()!
  fixture.queryOneFresh.mockImplementation((sql, params) => {
    if (sql.includes('FROM team_members')) {
      expect(sql).toContain('is_active = TRUE')
      expect(params).toEqual([USER])
      return active ? { role, custom_role_id: customGroups ? 'custom-role' : null } : null
    }
    if (sql.includes('FROM custom_roles')) return customGroups ? { permission_groups: customGroups, is_read_only: true } : null
    return one(sql, params)
  })
  fixture.queryRowsFresh.mockImplementation((sql, params) => {
    if (sql.includes('FROM client_team_assignments')) {
      expect(sql).toContain('client.is_active = TRUE')
      expect(sql).toContain('LIMIT 101')
      expect(params).toEqual([USER])
      return assignments.map(client_id => ({ client_id }))
    }
    return rows(sql, params)
  })
})
it.each(['media_buyer', 'account_manager'])('real %s chat default adapters read without MCP enrollment', async (value) => {
  role = value
  const ctx = chat()
  ctx.event.context.cloudflare.env.MCP_MARKETING_STAFF_GRANTS = ''
  expect((await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({}), ctx)).ok).toBe(true)
  expect((await adspendTool.handler(adspendTool.parameters.parse({}), ctx)).ok).toBe(true)
  expectNoSideEffects()
})
it.each(['media_buyer', 'account_manager', 'finance'])('browser pacing uses real %s mapping and scoped projection', async (value) => {
  role = value
  const result = await pacing(event({ month: 10, year: 2026 }))
  expect(result.projection).toBe(value === 'finance' ? 'finance' : 'marketing')
  expect(result.items).toHaveLength(1)
  expect(JSON.stringify(result)).not.toContain(B)
  expectNoSideEffects()
})
it.each(['creative', 'producer', 'account_manager'])('browser and chat social preserve %s audience', async (value) => {
  role = value
  expect((await social(event({ clientId: A, from: '2026-10-01', to: '2026-10-27' }))).bestContent[0].content).toBe('A content')
  expect((await socialTool.handler(socialTool.parameters.parse({ clientName: 'Client A' }), chat())).ok).toBe(true)
})
it('fresh revocation overrides stale chat permission and assignment hints', async () => {
  const ctx = chat({ permissionGroups: SYSTEM_ROLE_PERMISSIONS.media_buyer, assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [A] } })
  expect((await resolveMarketingReadScope(ctx)).clientIds).toEqual([A])
  assignments = []
  expect((await resolveMarketingReadScope(ctx)).clientIds).toEqual([])
  customGroups = []
  expect((await campaignBreakdownTool.handler(campaignBreakdownTool.parameters.parse({}), ctx)).ok).toBe(false)
  active = false
  await expect(resolveMarketingReadScope(ctx)).rejects.toMatchObject({ statusCode: 403 })
})
it('zero assignments, personal scope and dealer restriction never broaden authority', async () => {
  assignments = []
  expect((await resolveBrowserMarketingReadScope(event())).clientIds).toEqual([])
  assignments = [A]
  expect((await resolveMarketingReadScope(chat({ clientScope: B }))).clientIds).toEqual([])
  expect((await resolveMarketingReadScope(chat({ assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [B] } }))).clientIds).toEqual([])
  expect((await resolveMarketingReadScope(chat({ permissionGroups: [] }))).permissionGroups).toEqual([])
})
it('application ignores MCP grants and caller freshness markers', async () => {
  role = 'member'
  const scope = await resolveMarketingReadScope(chat({ mcpStaffAuthority: 'fresh', permissionGroups: ['FINANCE'], marketingCapabilities: ['reporting'], assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] } }))
  expect(scope.reportingGranted).toBe(false)
  expect(scope.financialReadAllowed).toBe(false)
  expect(scope.clientIds).toEqual([A])
  expect((await adspendTool.handler(adspendTool.parameters.parse({}), chat())).ok).toBe(false)
})
it('application rejects actor mismatch and MCP still requires fresh ingress authority', async () => {
  await expect(resolveMarketingReadScope(chat({ userId: B }))).rejects.toMatchObject({ statusCode: 403 })
  await expect(resolveMarketingReadScope(chat({ source: 'mcp' }))).rejects.toMatchObject({ statusCode: 403 })
})
it.each([{ to: 'invalid' }, { from: 'invalid' }, { from: '2026-10-27', to: '2026-10-01' }])('invalid social dates return 400: %j', async (query) => {
  role = 'creative'
  await expect(social(event({ clientId: A, ...query }))).rejects.toMatchObject({ statusCode: 400 })
})

it.each(([
  [adBreakdownTool, { campaignId: 'same' }],
  [adCreativeTextTool, { platform: 'meta', clientId: A }],
  [searchTermsTool, { campaignId: 'same' }],
  [clientOverviewTool, { clientName: 'Client A' }],
  [leadsTool, { clientName: 'Client A', summary: true }]
] as const).map(([tool, args]) => ({ tool, args, name: tool.name })))('real account-manager chat supports $name with fresh authority', async ({ tool, args }) => {
  role = 'account_manager'
  const result = await tool.handler(tool.parameters.parse(args) as never, chat())
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
  expect(JSON.stringify(result)).not.toMatch(/Forbidden B|9000/)
  expectNoSideEffects()
})
it('unbounded application assignment reads fail closed at the existing safety limit', async () => {
  assignments = Array.from({ length: 101 }, () => A)
  await expect(resolveMarketingReadScope(chat())).rejects.toMatchObject({ statusCode: 503 })
})
it('management scope retains the active-client predicate without MCP enrollment', async () => {
  role = 'lead'
  const scope = await resolveBrowserMarketingReadScope(event())
  expect(scope).toMatchObject({ clientIds: null, activeClientsOnly: true, ownerVerified: false, reportingGranted: false })
  expect(fixture.queryRowsFresh.mock.calls.some(([sql]) => sql.includes('FROM client_team_assignments'))).toBe(false)
})
it('zero-assignment browser pacing returns no rows, not all-client totals', async () => {
  assignments = []
  const result = await pacing(event({ month: 10, year: 2026 }))
  expect(result.items).toEqual([])
  expect(result.totals.spend).toBe(0)
})
