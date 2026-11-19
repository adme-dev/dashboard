/* eslint-disable @typescript-eslint/no-explicit-any -- Mock transport and database fixture shapes are intentionally partial. */
import { beforeEach, expect, it, vi } from 'vitest'
import { executeDepartmentBudgetProposal } from '~~/server/utils/ai/marketing/departmentBudgetReview'

const m = vi.hoisted(() => ({ query: vi.fn(), apply: vi.fn(), authority: vi.fn(), capability: vi.fn(), review: vi.fn(), invalidate: vi.fn(), tenant: vi.fn(), committed: false }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async (fn: any) => {
  const result = await fn({ query: m.query })
  m.committed = true
  return result
} }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: m.authority }))
vi.mock('~~/server/utils/ai/marketing/departmentBudgetOperations', () => ({ setDepartmentBudgetAllocations: m.apply }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({ resolveMarketingReadScope: async () => ({}), requireScopedClient: async () => undefined }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ assertMarketingCapabilityAtBoundary: m.capability, requireIndependentMarketingReviewer: m.review }))
vi.mock('~~/server/utils/socialSpendCache', () => ({ invalidateSpendPeriodCaches: m.invalidate }))
vi.mock('~~/server/utils/tokenStore', () => ({ getOrgTenant: m.tenant }))
const clientId = '11111111-1111-4111-8111-111111111111', proposalId = '22222222-2222-4222-8222-222222222222'
const requester = '33333333-3333-4333-8333-333333333333', peer = '44444444-4444-4444-8444-444444444444'
const revision = 'a'.repeat(64), key = `mcp:${'b'.repeat(64)}`, digest = 'c'.repeat(64)
const ctx = { userId: peer, event: {}, source: 'mcp' } as any
let row: any
beforeEach(() => {
  vi.clearAllMocks()

  m.committed = false

  m.tenant.mockResolvedValue({ tenantId: 'org-tenant' })

  m.invalidate.mockResolvedValue(undefined)

  row = { id: proposalId, user_id: requester, status: 'proposed', expires_at: '2099-01-01', resolved_payload: { clientId, revision, input: { clientId, changes: [{ spendId: proposalId, expectedBudget: 10, budget: 20, rolling: false }], acknowledgement: 'UPDATE_RECORDED_BUDGETS', note: 'Monthly budget' }, review: null }, result_payload: null }

  m.authority.mockImplementation(async (context: unknown) => context)

  m.capability.mockResolvedValue({ permissionGroups: ['MARKETING_MANAGEMENT'] })

  // Governance tier gate (medium): the fresh reviewer must hold manager authority.
  m.review.mockResolvedValue({ id: peer, role: 'account_manager', groups: ['MARKETING_MANAGEMENT'] })

  m.apply.mockResolvedValue({ ok: true, data: { updated: 1 } })

  m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT') && sql.includes('ai_pending_actions') ? [row] : [], rowCount: 1 }))
})
const args = () => ({ clientId, proposalId, expectedRevision: revision, ack: true })
it('refuses execution before independent approval and never reaches allocation mutation', async () => {
  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.apply).not.toHaveBeenCalled()
})
it('rejects self-review and changed revisions before storing an approval', async () => {
  expect(await executeDepartmentBudgetProposal('marketing_review_budget_allocations', { ...args(), decision: 'approve', reason: 'Approved monthly budget' }, { ...ctx, userId: requester }, key, digest)).toMatchObject({ ok: false })

  expect(await executeDepartmentBudgetProposal('marketing_review_budget_allocations', { ...args(), expectedRevision: 'd'.repeat(64), decision: 'approve', reason: 'Approved monthly budget' }, ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.query.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql))).toBe(false)
})
it('requires both proposer and independent reviewer current authority and applies within the same transaction', async () => {
  row.resolved_payload.review = { id: peer, decision: 'approve', revision, reason: 'Approved' }

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: true })

  expect(m.capability).toHaveBeenCalledWith(ctx.event, requester, clientId, 'department_management')

  expect(m.review).toHaveBeenCalledWith(ctx.event, { requesterId: requester, clientId, reviewerId: peer })

  expect(m.apply).toHaveBeenCalledWith(row.resolved_payload.input, ctx, key, digest, expect.objectContaining({ query: m.query }))

  expect(m.query.mock.calls.some(([sql]) => sql.includes('status = \'executed\''))).toBe(true)
})
it('does not execute revoked, expired or rejected proposals', async () => {
  row.resolved_payload.review = { id: peer, decision: 'approve', revision }

  m.capability.mockRejectedValueOnce(new Error('revoked'))

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: false })

  row.expires_at = '2000-01-01'

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: false })

  row.expires_at = '2099-01-01'

  row.resolved_payload.review.decision = 'reject'

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.apply).not.toHaveBeenCalled()
})
it('returns a durable completed result without changing budgets a second time', async () => {
  row.status = 'executed'

  row.result_payload = { clientId, updated: 1 }

  row.resolved_payload.review = { id: peer, decision: 'approve', revision }

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: true, data: { replayed: true, updated: 1 } })

  expect(m.apply).not.toHaveBeenCalled()
})
it('invalidates affected reporting caches only after commit and preserves a successful receipt if cache eviction fails', async () => {
  row.resolved_payload.review = { id: peer, decision: 'approve', revision }

  m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM ai_pending_actions') ? [row] : sql.includes('FROM media_spend') ? [{ period: '2026-10', platform: 'google_ads' }] : [], rowCount: 1 }))

  let committedAtInvalidation = false

  m.invalidate.mockImplementation(async () => {
    committedAtInvalidation = m.committed
    throw new Error('KV unavailable')
  })

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: true, data: { updated: 1 } })

  expect(committedAtInvalidation).toBe(true)

  expect(m.invalidate).toHaveBeenCalledWith(ctx.event, { clientId, period: '2026-10', platform: 'google_ads', tenantId: 'org-tenant' })
})
it('stores new proposals with the configurable business-day-aware expiry (default 72 h, not 24 h)', async () => {
  m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM media_spend') ? [{ id: proposalId, budget_allocated: 10 }] : sql.includes('INSERT INTO ai_pending_actions') ? [row] : [], rowCount: 1 }))

  const before = Date.now()

  expect(await executeDepartmentBudgetProposal('marketing_propose_budget_allocations', row.resolved_payload.input, ctx, key, digest)).toMatchObject({ ok: true })

  const insert = m.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_pending_actions'))!

  expect(insert[0]).not.toContain('24 hours')

  expect(Date.parse(insert[1][3]) - before).toBeGreaterThanOrEqual(72 * 3_600_000 - 5_000)
})
it('medium-tier gate: a reviewer without manager authority cannot approve or authorise execution', async () => {
  m.review.mockResolvedValue({ id: peer, role: 'media_buyer', groups: ['MEDIA_BUYING'] })

  expect(await executeDepartmentBudgetProposal('marketing_review_budget_allocations', { ...args(), decision: 'approve', reason: 'Approved monthly budget' }, ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.query.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql))).toBe(false)

  row.resolved_payload.review = { id: peer, decision: 'approve', revision, reason: 'Approved' }

  expect(await executeDepartmentBudgetProposal('marketing_set_budget_allocations', args(), ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.apply).not.toHaveBeenCalled()
})
