/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ finance: vi.fn(), queryOneFresh: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn() }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: m.finance }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'self', role: 'owner', permissionGroups: ['FINANCE'] })) }))
vi.mock('~~/server/utils/db', () => m)
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => 'expense')
vi.stubGlobal('getQuery', (event: any) => event.query ?? {})
vi.stubGlobal('readBody', async (event: any) => event.body ?? {})
const list = (await import('../../../server/api/agency/expenses/index.get')).default
const create = (await import('../../../server/api/agency/expenses/index.post')).default
const detail = (await import('../../../server/api/agency/expenses/[id].get')).default
const update = (await import('../../../server/api/agency/expenses/[id].put')).default
const approve = (await import('../../../server/api/agency/expenses/[id]/approve.post')).default
const reimburse = (await import('../../../server/api/agency/expenses/[id]/reimburse.post')).default
const forbidden = () => Object.assign(new Error('No grant'), { statusCode: 403 })
const unavailable = () => Object.assign(new Error('Database unavailable'), { statusCode: 503 })
const own = { id: 'expense', user_id: 'self', status: 'draft', amount: 10 }
const expenseBody = { categoryId: 'cat', amount: 10, description: 'Own expense', expenseDate: '2026-11-07' }
beforeEach(() => {
  vi.clearAllMocks()
  m.finance.mockRejectedValue(forbidden())
  m.queryOneFresh.mockImplementation(async (sql: string) => sql.includes('SELECT TRUE AS allowed') ? { allowed: true } : own)
  m.queryOne.mockResolvedValue(own)
  m.queryRows.mockResolvedValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('expense ownership and Finance boundary', () => {
  it('forces own scope on both expense rows and summary despite a foreign-user filter', async () => {
    await list({ query: { userId: 'foreign' } } as any)
    const rows = m.queryRows.mock.calls.find(([sql]) => sql.includes('FROM expenses e'))!
    const summary = m.queryOne.mock.calls.find(([sql]) => sql.includes('FROM expenses e'))!
    expect(rows[0]).toContain('e.user_id = $1')
    expect(rows[1]).toContain('self')
    expect(rows[1]).not.toContain('foreign')
    expect(summary[0]).toContain('e.user_id = $1')
    expect(summary[1]).toEqual(['self'])
  })
  it('allows fresh Finance all-staff list scope', async () => {
    m.finance.mockResolvedValue(undefined)
    await list({ query: {} } as any)
    const rows = m.queryRows.mock.calls.find(([sql]) => sql.includes('FROM expenses e'))!
    expect(rows[0]).not.toContain('e.user_id = $1')
  })
  it('blocks foreign expense details before receipts or reports', async () => {
    m.queryOneFresh.mockResolvedValue({ ...own, user_id: 'other' })
    m.queryOne.mockResolvedValue({ ...own, user_id: 'other' })
    await expect(detail({} as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.queryRows).not.toHaveBeenCalled()
  })
  it('allows own expense details and fresh-Finance foreign details', async () => {
    await expect(detail({} as any)).resolves.toHaveProperty('expense.id', 'expense')
    m.finance.mockResolvedValue(undefined)
    m.queryOneFresh.mockResolvedValue({ ...own, user_id: 'other' })
    m.queryOne.mockResolvedValue({ ...own, user_id: 'other' })
    await expect(detail({} as any)).resolves.toHaveProperty('expense.id', 'expense')
  })
  it('blocks a foreign draft edit without writable Finance', async () => {
    m.queryOneFresh.mockImplementation(async (sql: string) => sql.includes('SELECT TRUE AS allowed') ? { allowed: true } : { ...own, user_id: 'other' })
    m.queryOne.mockResolvedValue({ ...own, user_id: 'other' })
    await expect(update({ body: { notes: 'Tamper' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.queryOne.mock.calls.some(([sql]) => sql.includes('UPDATE expenses'))).toBe(false)
  })
  it('uses own/editable-status predicates and detects a concurrent status change', async () => {
    m.queryOne.mockImplementation(async (sql: string) => sql.includes('UPDATE expenses') ? null : own)
    await expect(update({ body: { notes: 'Own note' } } as any)).rejects.toMatchObject({ statusCode: 409 })
    const [sql, params] = m.queryOne.mock.calls.find(([sql]) => sql.includes('UPDATE expenses'))!
    expect(sql).toContain('status IN (\'draft\', \'rejected\')')
    expect(sql).toContain('user_id')
    expect(params).toContain('self')
  })
  it.each([create, update])('denies own writes for fresh read-only policy', async (handler) => {
    m.queryOneFresh.mockImplementation(async (sql: string) => sql.includes('SELECT TRUE AS allowed') ? null : own)
    await expect(handler({ body: expenseBody } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.queryOne.mock.calls.some(([sql]) => /INSERT INTO expenses|UPDATE expenses/.test(sql))).toBe(false)
  })
  it('keeps ordinary own submissions pending even with a forged hasReceipt flag', async () => {
    m.queryOne.mockImplementation(async (sql: string) => sql.includes('expense_categories')
      ? { id: 'cat', requires_receipt: true, requires_approval_above: 100 }
      : { ...own, status: 'pending_approval' })
    await create({ body: { ...expenseBody, submit: true, hasReceipt: true } } as any)
    const [, params] = m.queryOne.mock.calls.find(([sql]) => sql.includes('INSERT INTO expenses'))!
    expect(params[14]).toBe('pending_approval')
    expect(params[0]).toBe('self')
  })
  it.each([list, detail, create, update, approve, reimburse])('propagates permission-store 503 before data queries', async (handler) => {
    m.finance.mockRejectedValue(unavailable())
    await expect(handler({ body: { ...expenseBody, action: 'approve' } } as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(m.queryOne).not.toHaveBeenCalled()
    expect(m.queryRows).not.toHaveBeenCalled()
  })
  it.each([approve, reimburse])('denies approval/reimbursement before accessing records without writable Finance', async (handler) => {
    await expect(handler({ body: { action: 'approve' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'self', true)
    expect(m.queryOne).not.toHaveBeenCalled()
  })
  it.each([approve, reimburse])('retains state predicates on Finance state transitions', async (handler) => {
    m.finance.mockResolvedValue(undefined)
    m.queryOne.mockImplementation(async (sql: string) => sql.includes('UPDATE expenses') ? null : { ...own, user_id: 'other', status: handler === approve ? 'submitted' : 'approved', reimbursable: true, reimbursed: false })
    await expect(handler({ body: { action: 'approve' } } as any)).rejects.toMatchObject({ statusCode: 409 })
    const [sql] = m.queryOne.mock.calls.find(([sql]) => sql.includes('UPDATE expenses'))!
    expect(sql).toContain(handler === approve ? 'status IN (\'submitted\', \'pending_approval\')' : 'status = \'approved\'')
    expect(sql).toContain(handler === approve ? 'user_id <> ' : 'reimbursed = FALSE')
  })
})
