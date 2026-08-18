import { describe, it, expect, vi } from 'vitest'
import { getBudgetHealth, type BudgetHealthDeps, type BudgetHealthData } from '~~/server/utils/ai/tools/budgetHealth'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'media_buyer', conversationId: 'c1', event: {} as any } as ToolContext

const sample: BudgetHealthData = {
  period: '2026-06',
  summary: { totalBudget: 1000, totalSpent: 600, overallUtilization: 60, clientCount: 2, overBudgetCount: 0, atRiskCount: 1 },
  clients: [
    { clientName: 'Acme', platform: 'meta', budget: 600, spend: 500, percentConsumed: 83, pacingRatio: 1.2, healthStatus: 'at_risk' },
    { clientName: 'Globex', platform: 'google', budget: 400, spend: 100, percentConsumed: 25, pacingRatio: 0.5, healthStatus: 'underspend' },
  ],
}

const deps = (over: Partial<BudgetHealthDeps> = {}): BudgetHealthDeps => ({
  health: vi.fn().mockResolvedValue(sample),
  ...over,
})

const data = (r: any) => { expect(r.ok).toBe(true); return (r as any).data }

describe('getBudgetHealth', () => {
  it('returns the period summary and per-client rows capped with a more count', async () => {
    const r = await getBudgetHealth({}, ctx, deps())
    const d = data(r)
    expect(d.period).toBe('2026-06')
    expect(d.summary.overallUtilization).toBe(60)
    expect(d.clients).toHaveLength(2)
    expect(d.more).toBe(0)
    expect(d.total).toBe(2)
    expect(d.nextCursor).toBeNull()
    expect(d.dataStatus).toBe('populated')
  })

  it('excludes no-budget and unattributed spend from utilization', async () => {
    const health: BudgetHealthData = {
      period: '2026-08',
      summary: {},
      clients: [
        { clientName: 'Budgeted', platform: 'meta', budget: 1000, spend: 500, percentConsumed: 50, pacingRatio: 1, healthStatus: 'healthy', budgetLevel: 'campaign', unattributed: false },
        { clientName: 'No Budget', platform: 'meta', budget: 0, spend: 400, percentConsumed: 0, pacingRatio: 0, healthStatus: 'no_budget', budgetLevel: 'campaign', unattributed: false },
        { clientName: 'Google account 123', platform: 'google_ads', budget: 0, spend: 300, percentConsumed: 0, pacingRatio: 0, healthStatus: 'no_budget', budgetLevel: 'campaign', unattributed: true },
      ],
    }
    const d = data(await getBudgetHealth({}, ctx, deps({ health: vi.fn().mockResolvedValue(health) })))
    expect(d.summary).toMatchObject({
      totalBudget: 1000,
      totalSpent: 500,
      trackedSpend: 900,
      unattributedSpend: 300,
      overallUtilization: 50,
      excludedFromPacingCount: 1,
    })
    expect(d.clients.find((c: any) => c.clientName === 'No Budget')).toMatchObject({
      budget: null,
      percentConsumed: null,
      pacingRatio: null,
      healthStatus: 'no_budget_set',
    })
    expect(d.clients.some((c: any) => c.clientName === 'Google account 123')).toBe(false)
    expect(d.unattributed).toEqual([expect.objectContaining({ spend: 300, unattributed: true })])
    expect(d.dataStatus).toBe('partial')
  })

  it('filters by clientName (case-insensitive contains)', async () => {
    const r = await getBudgetHealth({ clientName: 'glob' }, ctx, deps())
    const d = data(r)
    expect(d.clients).toHaveLength(1)
    expect(d.clients[0].clientName).toBe('Globex')
  })

  it('filters by health status', async () => {
    const r = await getBudgetHealth({ status: 'at_risk' }, ctx, deps())
    const d = data(r)
    expect(d.clients).toHaveLength(1)
    expect(d.clients[0].healthStatus).toBe('at_risk')
  })

  it('fails gracefully when the data source throws', async () => {
    const r = await getBudgetHealth({}, ctx, deps({ health: vi.fn().mockRejectedValue(new Error('down')) }))
    expect(r.ok).toBe(false)
  })
})
