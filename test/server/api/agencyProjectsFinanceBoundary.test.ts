/* eslint-disable @stylistic/max-statements-per-line */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), finance: vi.fn(), grant: vi.fn(), invoice: vi.fn(), one: vi.fn(), rows: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: m.finance, assertPermissionGrant: m.grant }))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: m.invoice }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.one, queryRows: m.rows }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getQuery', (event: { query?: unknown }) => event.query ?? {})
vi.stubGlobal('readBody', (event: { body?: unknown }) => event.body ?? {})
vi.stubGlobal('getRouterParam', () => 'project-1')
const list = (await import('~~/server/api/agency/projects/index.get')).default
const summary = (await import('~~/server/api/agency/projects/summary.get')).default
const detail = (await import('~~/server/api/agency/projects/[id].get')).default
const create = (await import('~~/server/api/agency/projects/index.post')).default
const update = (await import('~~/server/api/agency/projects/[id].put')).default
const e = () => ({ context: {} }) as never
const forbidden = () => Object.assign(new Error('Finance required'), { statusCode: 403 })
const record = { id: 'project-1', name: 'Operations', description: 'Staff project', client_id: 'client', client_name: 'Client', client: 'Client',
  start_date: '2026-11-01', end_date: '2026-12-01', status: 'active', hours_worked: 12, billable_hours: 10,
  project_manager_id: 'manager', project_manager_name: 'Manager', budget_amount: 10000, budget_type: 'fixed',
  labor_cost: 2000, expense_cost: 100, media_cost: 50, total_cost: 2150, gross_profit: 7850, gross_margin: 78.5, effective_rate: 833,
  remaining_budget: 7850, client_billing_type: 'retainer', hourly_rate: 200, hours: 3, amount: 100, total_amount: 1000,
  budget: 10000, spent: 2100, margin: 79, final_margin: 79, budget_used: 21, completed_date: '2026-12-01' }
const financialSql = /budget_amount|hourly_rate|project_expenses|media_spend|\binvoices\b|labor_cost|expense_cost|gross_profit|\bmargin\b|effective_rate/i
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ id: 'staff', role: 'owner', permissionGroups: ['FINANCE'] })
  m.finance.mockRejectedValue(forbidden())
  m.grant.mockRejectedValue(forbidden())
  m.invoice.mockRejectedValue(forbidden())
  m.one.mockImplementation(async (sql: string) => sql.includes('COUNT(') ? { active: 1, total: 1, completed: 0 } : sql.includes('SUM(p.budget_amount)') ? { total_budget: 10000, total_spent: 2100, total_profit: 7900, avg_margin: 79 } : record)
  m.rows.mockResolvedValue([record])
})
describe('project operational and financial read separation', () => {
  it('keeps project list operational fields and hours without querying or returning financials', async () => {
    const result = await list(e())
    expect(result).toEqual([expect.objectContaining({ id: 'project-1', hoursWorked: 12, status: 'active', startDate: '2026-11-01' })])
    for (const key of ['budgetAmount', 'budgetType', 'laborCost', 'expenseCost', 'mediaCost', 'totalCost', 'grossProfit', 'grossMargin', 'effectiveRate']) expect(result[0]).not.toHaveProperty(key)
    for (const [sql] of m.rows.mock.calls) expect(sql).not.toMatch(financialSql)
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'staff')
  })
  it('keeps operational summary counts and metadata but omits financial summaries and cost-derived risk', async () => {
    const result = await summary(e())
    expect(result).toMatchObject({ active: 1, total: 1, topProjects: [{ id: 'project-1', name: 'Operations' }], recentlyCompleted: [{ id: 'project-1', completedDate: '2026-12-01' }] })
    for (const key of ['totalBudget', 'totalSpent', 'totalProfit', 'avgMargin', 'atRisk']) expect(result).not.toHaveProperty(key)
    for (const key of ['budget', 'spent', 'margin']) expect(result.topProjects[0]).not.toHaveProperty(key)
    expect(result.recentlyCompleted[0]).not.toHaveProperty('finalMargin')
    for (const [sql] of [...m.one.mock.calls, ...m.rows.mock.calls]) expect(sql).not.toMatch(financialSql)
  })
  it('keeps project detail, time hours, tasks and source brief without billing or expense/invoice data', async () => {
    const result = await detail(e())
    expect(result).toMatchObject({ project: { id: 'project-1', hoursWorked: 12, status: 'active' }, timeEntries: [{ hours: 3 }], taskStats: { total: 1 } })
    for (const key of ['budgetAmount', 'budgetType', 'clientBillingType', 'laborCost', 'expenseCost', 'mediaCost', 'totalCost', 'remainingBudget', 'grossMargin']) expect(result.project).not.toHaveProperty(key)
    expect(result.timeEntries[0]).not.toHaveProperty('hourlyRate')
    expect(result).not.toHaveProperty('expenses')
    expect(result).not.toHaveProperty('invoices')
    for (const [sql] of [...m.one.mock.calls, ...m.rows.mock.calls]) expect(sql).not.toMatch(financialSql)
  })
  it('preserves all current financial projections for a freshly granted user', async () => {
    m.finance.mockResolvedValue(undefined)
    m.invoice.mockResolvedValue({ user: { id: 'staff' }, clientIds: 'all' })
    expect((await list(e()))[0]).toMatchObject({ budgetAmount: 10000, laborCost: 2000, grossMargin: 78.5 })
    expect(await summary(e())).toMatchObject({ totalBudget: 10000, atRisk: [{ id: 'project-1' }], topProjects: [{ budget: 10000, margin: 79 }] })
    expect(await detail(e())).toMatchObject({ project: { clientBillingType: 'retainer', budgetAmount: 10000 }, timeEntries: [{ hourlyRate: 200 }], expenses: [{ amount: 100 }], invoices: [{ totalAmount: 1000 }] })
  })
  it.each([['list', list], ['summary', summary], ['detail', detail]] as const)('%s propagates permission database failure before any data query', async (_name, handler) => {
    m.finance.mockRejectedValue(Object.assign(new Error('Authority unavailable'), { statusCode: 503 }))
    await expect(handler(e())).rejects.toMatchObject({ statusCode: 503 })
    expect(m.rows).not.toHaveBeenCalled()
    expect(m.one).not.toHaveBeenCalled()
  })
  it('rechecks finance authority on each request after revocation', async () => {
    m.finance.mockResolvedValueOnce(undefined).mockRejectedValueOnce(forbidden())
    expect((await list(e()))[0]).toHaveProperty('budgetAmount')
    expect((await list(e()))[0]).not.toHaveProperty('budgetAmount')
    expect(m.finance).toHaveBeenCalledTimes(2)
  })
})

const createBody = { name: 'Project', clientId: 'client', budgetAmount: 10000, budgetType: 'fixed', startDate: '2026-11-01' }
const mutationEvent = (body: Record<string, unknown>) => ({ body, context: {} }) as never
describe('project billing write separation', () => {
  it.each([['create', create, createBody], ['update', update, { budgetAmount: 12000 }], ['update-type', update, { budgetType: 'hourly' }]] as const)('%s rejects billing writes before a database mutation', async (_name, handler, body) => {
    await expect(handler(mutationEvent(body))).rejects.toMatchObject({ statusCode: 403 })
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'staff', true)
    expect(m.one).not.toHaveBeenCalled()
  })
  it('allows metadata-only updates while omitting billing from response and database RETURNING', async () => {
    const result = await update(mutationEvent({ name: 'Operational rename', status: 'active' }))
    expect(result).toMatchObject({ success: true, project: { id: 'project-1', status: 'active' } })
    expect(result.project).not.toHaveProperty('budgetAmount')
    expect(result.project).not.toHaveProperty('budgetType')
    const sql = m.one.mock.calls.find(([q]) => q.includes('UPDATE projects'))![0]
    expect(sql).not.toContain('RETURNING *')
    expect(sql).not.toMatch(financialSql)
  })
  it('preserves the full billing write response for freshly authorized finance users', async () => {
    m.finance.mockResolvedValue(undefined)
    expect(await create(mutationEvent(createBody))).toMatchObject({ success: true, project: { budgetAmount: 10000, budgetType: 'fixed' } })
    expect(await update(mutationEvent({ budgetAmount: 10000 }))).toMatchObject({ success: true, project: { budgetAmount: 10000, budgetType: 'fixed' } })
  })
  it('preserves positive-budget creation validation', async () => {
    m.finance.mockResolvedValue(undefined)
    await expect(create(mutationEvent({ ...createBody, budgetAmount: 0 }))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Budget amount must be greater than 0' })
    expect(m.one).not.toHaveBeenCalled()
  })
})

describe('documented client project planning and billing access', () => {
  beforeEach(() => { m.grant.mockResolvedValue(undefined) })
  it('preserves planning budgets and campaign spend for CLIENTS without exposing internal rates or company profit', async () => {
    const projects = await list(e())
    expect(projects[0]).toMatchObject({ budgetAmount: 10000, budgetType: 'fixed', mediaCost: 50, hoursWorked: 12 })
    expect(projects[0]).not.toHaveProperty('laborCost')
    expect(projects[0]).not.toHaveProperty('grossMargin')
    const result = await detail(e())
    expect(result.project).toMatchObject({ budgetAmount: 10000, budgetType: 'fixed', mediaCost: 50, hoursWorked: 12 })
    expect(result.timeEntries[0]).not.toHaveProperty('hourlyRate')
    expect(result).not.toHaveProperty('expenses')
  })
  it('keeps companywide financial totals and cost-derived risk absent from a CLIENTS summary', async () => {
    const result = await summary(e())
    expect(result).not.toHaveProperty('totalProfit')
    expect(result).not.toHaveProperty('totalSpent')
    expect(result).not.toHaveProperty('totalBudget')
    expect(result).not.toHaveProperty('atRisk')
  })
  it('preserves CLIENTS project creation and planning budget updates through explicit write grants', async () => {
    expect(await create(mutationEvent(createBody))).toMatchObject({ success: true, project: { budgetAmount: 10000 } })
    expect(m.grant).toHaveBeenCalledWith(expect.anything(), 'staff', 'CLIENTS', true)
    expect(await update(mutationEvent({ budgetAmount: 10000 }))).toMatchObject({ success: true, project: { budgetAmount: 10000 } })
  })
  it('includes nested invoices only for the freshly permitted assigned client', async () => {
    m.invoice.mockResolvedValue({ user: { id: 'staff' }, clientIds: ['client'] })
    expect(await detail(e())).toMatchObject({ invoices: [{ totalAmount: 1000 }] })
    m.invoice.mockResolvedValue({ user: { id: 'staff' }, clientIds: ['foreign-client'] })
    m.rows.mockClear()
    expect(await detail(e())).not.toHaveProperty('invoices')
    expect(m.rows.mock.calls.some(([sql]) => /FROM invoices/.test(sql))).toBe(false)
  })
  it('propagates invoice authority lookup failure instead of returning a stale billing grant', async () => {
    m.invoice.mockRejectedValue(Object.assign(new Error('Authority unavailable'), { statusCode: 503 }))
    await expect(detail(e())).rejects.toMatchObject({ statusCode: 503 })
    expect(m.rows.mock.calls.some(([sql]) => /FROM invoices/.test(sql))).toBe(false)
  })
})

it('keeps invoice-only project dropdowns scoped to freshly assigned clients without granting planning budgets', async () => {
  m.invoice.mockResolvedValue({ user: { id: 'staff' }, clientIds: ['client'] })
  expect((await list(e()))[0]).not.toHaveProperty('budgetAmount')
  expect(m.rows).toHaveBeenCalledWith(expect.stringContaining('p.client_id=ANY($1::uuid[])'), [['client']])
})
