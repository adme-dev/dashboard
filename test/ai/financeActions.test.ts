import { describe, it, expect, vi } from 'vitest'
import { proposeExpenseApproval, proposeEomGenerate, proposeExpenseClassify, type FinanceDeps } from '~~/server/utils/ai/tools/financeActions'
import { makeExpenseApprovalExecutor, makeEomGenerateExecutor, makeExpenseClassifyExecutor } from '~~/server/utils/ai/executors/financeActions'
import { eomGenerateTool } from '~~/server/utils/ai/tools/financeActions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const fin = { userId: 'u1', userRole: 'finance', conversationId: 'c1', event: { headers: {} } as any } as ToolContext
const admin = { ...fin, userRole: 'owner' } as ToolContext
const nonFin = { ...fin, userRole: 'creative' } as ToolContext

const deps = (over: Partial<FinanceDeps> = {}): FinanceDeps => ({
  resolveExpense: async () => [{ id: 'e1', name: 'Officeworks', amount: 120, status: 'submitted' }],
  resolveDraftExpense: async () => [{ id: 'e2', name: 'Adobe', amount: 90, status: 'draft' }],
  resolveCategory: async () => [{ id: 'cat1', name: 'Software' }],
  resolveClient: async () => [{ id: 'cl1', name: 'Acme' }],
  propose: async () => 'prop-1',
  ...over,
})

describe('propose_expense_approval', () => {
  it('FINANCE role stages an approval proposal', async () => {
    const res: any = await proposeExpenseApproval({ expense: 'Officeworks', action: 'approve' } as any, fin, deps())
    expect(res.ok).toBe(true)
    expect(res.data.resolved).toMatchObject({ expenseId: 'e1', action: 'approve' })
  })
  it('blocks non-finance roles', async () => {
    const res: any = await proposeExpenseApproval({ expense: 'x', action: 'approve' } as any, nonFin, deps())
    expect(res.ok).toBe(false)
  })
  it('requires a reason to reject', async () => {
    const res: any = await proposeExpenseApproval({ expense: 'Officeworks', action: 'reject' } as any, fin, deps())
    expect(res.ok).toBe(false)
  })
  it('passes the caller id so own expenses are excluded from resolution', async () => {
    const resolveExpense = vi.fn(async () => [{ id: 'e1', name: 'X', status: 'submitted' }])
    await proposeExpenseApproval({ expense: 'X', action: 'approve' } as any, fin, deps({ resolveExpense }))
    expect(resolveExpense).toHaveBeenCalledWith('X', 'u1')
  })
})

describe('propose_eom_generate (rich_confirm)', () => {
  it('is rich_confirm + ADMIN-gated', () => {
    expect(eomGenerateTool.riskTier).toBe('rich_confirm')
    expect(eomGenerateTool.requiredPermission).toBe('ADMIN')
  })
  it('admin stages a run proposal', async () => {
    const res: any = await proposeEomGenerate({ month: 6, year: 2026 }, admin, deps())
    expect(res.data.resolved).toEqual({ month: 6, year: 2026 })
  })
  it('blocks non-admin', async () => {
    const res: any = await proposeEomGenerate({ month: 6, year: 2026 }, fin, deps())
    expect(res.ok).toBe(false)
  })
})

describe('propose_expense_classify (bookkeeper)', () => {
  it('classifies a draft expense with a category + client', async () => {
    const res: any = await proposeExpenseClassify({ expense: 'Adobe', categoryName: 'Software', clientName: 'Acme' } as any, fin, deps())
    expect(res.data.resolved).toMatchObject({ expenseId: 'e2', categoryId: 'cat1', clientId: 'cl1' })
  })
  it('requires at least a category or client', async () => {
    const res: any = await proposeExpenseClassify({ expense: 'Adobe' } as any, fin, deps())
    expect(res.ok).toBe(false)
  })
})

describe('finance executors', () => {
  it('expense approval POSTs the approve endpoint', async () => {
    const post = vi.fn(async () => ({ expense: { id: 'e1', status: 'approved' } }))
    await makeExpenseApprovalExecutor(post).execute({ expenseId: 'e1', label: 'X', action: 'approve' }, fin)
    expect(post).toHaveBeenCalledWith('/api/agency/expenses/e1/approve', { action: 'approve', reason: undefined }, fin)
  })
  it('EOM generate POSTs and throws without a run id', async () => {
    const post = vi.fn(async () => ({ id: 'run9', invoice_count: 12 }))
    const r = await makeEomGenerateExecutor(post).execute({ month: 6, year: 2026 }, admin)
    expect(r.resultRef).toBe('run9')
    expect(r.summary).toContain('12 invoices')
    await expect(makeEomGenerateExecutor(async () => ({})).execute({ month: 6, year: 2026 }, admin)).rejects.toThrow()
  })
  it('expense classify PUTs only the provided fields', async () => {
    const put = vi.fn(async () => ({ expense: { id: 'e2' } }))
    await makeExpenseClassifyExecutor(put).execute({ expenseId: 'e2', label: 'Adobe', categoryId: 'cat1', categoryName: 'Software' }, fin)
    expect(put).toHaveBeenCalledWith('/api/agency/expenses/e2', { categoryId: 'cat1' }, fin)
  })
})
