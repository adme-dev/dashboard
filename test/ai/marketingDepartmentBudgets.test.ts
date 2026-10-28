/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { setDepartmentBudgetAllocations } from '~~/server/utils/ai/marketing/departmentBudgetOperations'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), scoped: vi.fn(), scope: vi.fn(), query: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: mocks.authority }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({ resolveMarketingReadScope: mocks.scope, requireScopedClient: mocks.scoped }))
vi.mock('~~/server/utils/db', () => ({ transaction: mocks.transaction, queryRowsFresh: vi.fn() }))

const clientId = '11111111-1111-4111-8111-111111111111'
const spendId = '22222222-2222-4222-8222-222222222222'
const ctx = { userId: '33333333-3333-4333-8333-333333333333', event: {}, source: 'mcp' } as ToolContext
const input = () => ({ clientId, changes: [{ spendId, expectedBudget: 100, budget: 200, rolling: false }], acknowledgement: 'UPDATE_RECORDED_BUDGETS' as const, note: 'Monthly allocation' })
const key = `mcp:${'a'.repeat(64)}`, digest = 'b'.repeat(64)
describe('department recorded budget allocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authority.mockResolvedValue(ctx)
    mocks.scope.mockResolvedValue({})
    mocks.scoped.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(fn => fn({ query: mocks.query }))
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [{ state: 'in_progress' }], rowCount: 1 }
      if (sql.includes('FROM media_spend')) return { rows: [{ id: spendId, client_id: clientId, budget_allocated: '100.00', budget_rolling: false }], rowCount: 1 }
      return { rows: [], rowCount: 1 }
    })
  })
  it('updates exact active-client records with budget audit and durable completion in one transaction', async () => {
    const result = await setDepartmentBudgetAllocations(input(), ctx, key, digest)
    expect(result).toMatchObject({ ok: true, data: { updated: 1, providerChanged: false } })
    expect(mocks.authority).toHaveBeenCalledWith(ctx, true)
    expect(mocks.scoped).toHaveBeenCalledWith({}, clientId)
    const sql = mocks.query.mock.calls.map(c => c[0] as string)
    expect(sql.some(s => s.includes('FOR UPDATE') && s.includes('is_active'))).toBe(true)
    expect(sql.some(s => s.includes('INSERT INTO budget_audit_log'))).toBe(true)
    expect(sql.some(s => s.includes('state = \'succeeded\''))).toBe(true)
    expect(sql.join(' ')).not.toContain('commission_rate')
  })
  it('rejects the entire selection if any record is missing or outside the active client', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM media_spend') ? [] : [{ state: 'in_progress' }], rowCount: 1 }))
    expect(await setDepartmentBudgetAllocations(input(), ctx, key, digest)).toMatchObject({ ok: false })
    expect(mocks.query.mock.calls.some(c => /UPDATE media_spend/.test(c[0]))).toBe(false)
  })
  it('rejects a stale expected allocation before any budget or audit mutation', async () => {
    const args = input(); args.changes[0]!.expectedBudget = 99
    expect(await setDepartmentBudgetAllocations(args, ctx, key, digest)).toMatchObject({ ok: false, code: 'conflict' })
    expect(mocks.query.mock.calls.some(c => /UPDATE media_spend|INSERT INTO budget_audit_log/.test(c[0]))).toBe(false)
  })
  it('rejects revoked authority and malformed identity without storage mutation', async () => {
    mocks.authority.mockRejectedValueOnce(new Error('revoked'))
    expect(await setDepartmentBudgetAllocations(input(), ctx, key, digest)).toMatchObject({ ok: false })
    expect(await setDepartmentBudgetAllocations(input(), ctx, 'untrusted', digest)).toMatchObject({ ok: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('requires acknowledgement, bounded unique record IDs and rejects commission or arbitrary fields', async () => {
    for (const args of [{ ...input(), acknowledgement: 'yes' }, { ...input(), commissionRate: 50 }, { ...input(), changes: [input().changes[0], input().changes[0]] }]) {
      expect(await setDepartmentBudgetAllocations(args, ctx, key, digest)).toMatchObject({ ok: false })
    }
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('never repeats an already applied request and rejects changed arguments on a reused key', async () => {
    let savedReference = ''
    mocks.query.mockImplementation(async (sql: string, _values: unknown[]) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT state')) return { rows: [{ state: 'succeeded', route_or_tool: 'marketing_set_budget_allocations', result_reference: savedReference }], rowCount: 1 }
      return { rows: [], rowCount: 1 }
    })
    // A foreign or changed exact-payload digest must not be accepted as a successful replay.
    savedReference = 'department-budget:foreign'
    expect(await setDepartmentBudgetAllocations(input(), ctx, key, digest)).toMatchObject({ ok: false, code: 'conflict' })
    expect(mocks.query.mock.calls.some(c => /UPDATE media_spend/.test(c[0]))).toBe(false)
  })
})
