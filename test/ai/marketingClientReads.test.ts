import { beforeEach, expect, it, vi } from 'vitest'
import { clientOverviewTool } from '../../server/utils/ai/tools/clients'
import { leadsTool } from '../../server/utils/ai/tools/leads'

const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('~~/server/utils/ai/internalFetch', () => ({ aiInternalFetch: vi.fn(() => {
  throw Error('HTTP forbidden')
}) }))

const ctx: any = { userId: 'staff', userRole: 'admin', source: 'mcp', mcpStaffAuthority: 'fresh', permissionGroups: ['CLIENTS'], marketingCapabilities: ['reporting'], assistantScope: { clientAccessMode: 'assigned', assignedClientIds: ['a'] }, event: {} }
beforeEach(() => {
  vi.clearAllMocks()
  db.queryRowsFresh.mockResolvedValue([])
  db.queryOneFresh.mockResolvedValue(null)
})
it('overview_hides_unassigned_parent_and_never_queries_profitability', async () => {
  db.queryRowsFresh.mockResolvedValue([{ id: 'a', name: 'A', is_active: true, aliases: [] }])
  db.queryOneFresh.mockImplementation(async (sql: string) => sql.includes('COUNT') ? { total: 2 } : { id: 'a', name: 'A', is_active: true })
  const result: any = await clientOverviewTool.handler(clientOverviewTool.parameters.parse({ clientName: 'A' }), ctx)
  expect(result.ok).toBe(true)
  expect(result.data).not.toHaveProperty('marginSnapshot')
  expect(result.data).not.toHaveProperty('billingType')
  expect(JSON.stringify(db.queryOneFresh.mock.calls)).not.toMatch(/projects|time_entries|project_expenses/)
  expect(db.queryRows).not.toHaveBeenCalled()
  expect(db.queryRowsFresh.mock.calls[0][0]).toMatch(/WHERE.*ANY[\s\S]*AND \(/)
})
it('ordinary_lead_list_denied_before_internal_fetch', async () => {
  const result: any = await leadsTool.handler(leadsTool.parameters.parse({ clientName: 'A' }), ctx)
  expect(result.code).toBe('LEAD_LIST_NOT_AVAILABLE')
  expect(db.queryRows).not.toHaveBeenCalled()
})
it('lead_summary_ignores_other_client_test_and_deleted_rows', async () => {
  db.queryRowsFresh.mockImplementation(async (sql: string) => sql.includes('agency_client_aliases') ? [{ id: 'a', name: 'A' }] : [{ status: 'new', source: 'meta', count: 1 }])
  db.queryOneFresh.mockResolvedValue({ id: 'a' })
  const result: any = await leadsTool.handler(leadsTool.parameters.parse({ clientName: 'A', summary: true, status: 'new' }), ctx)
  expect(result.data.total).toBe(1)
  const [sql, params] = db.queryRowsFresh.mock.calls.at(-1)!
  expect(sql).toMatch(/l.client_id = ANY/)
  expect(sql).toContain('l.is_test = false')
  expect(sql).toContain('l.deleted_at IS NULL')
  expect(params).toContain('new')
})
it('overview_filters_alias_matches_before_limit_26', async () => {
  db.queryRowsFresh.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({ id: `a-${i}`, name: `A ${i}` })))
  const result: any = await clientOverviewTool.handler(clientOverviewTool.parameters.parse({ clientName: '%_A' }), ctx)
  expect(result.data.disambiguation).toHaveLength(25)
  expect(result.data.truncatedAtSource).toBe(true)
  const [sql, params] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toMatch(/WHERE c.id = ANY[\s\S]*AND \(c.name ILIKE[\s\S]*ORDER BY[\s\S]*LIMIT/)
  expect(params[0]).toBe('%\\%\\_A%')
  expect(params.at(-1)).toBe(26)
})
it('finance_overview_requires_independent_finance_group', async () => {
  db.queryRowsFresh.mockResolvedValue([{ id: 'a', name: 'A', is_active: true, billing_type: 'retainer' }])
  db.queryOneFresh.mockImplementation(async (sql: string) => sql.includes('FROM projects p') ? { total_revenue: 100, gross_profit: 40, project_count: 1 } : { id: 'a', total: 1 })
  const result: any = await clientOverviewTool.handler(clientOverviewTool.parameters.parse({ clientName: 'A' }), { ...ctx, permissionGroups: ['CLIENTS', 'FINANCE'] })
  expect(result.data.marginSnapshot).toEqual({ totalRevenue: 100, grossProfit: 40, grossMargin: 40 })
  const [sql, params] = db.queryOneFresh.mock.calls.find(([sql]) => sql.includes('FROM projects p'))!
  expect(sql).toContain('p.client_id = ANY')
  expect(params).toContainEqual(['a'])
})
