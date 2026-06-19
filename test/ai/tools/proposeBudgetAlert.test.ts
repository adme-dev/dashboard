import { describe, it, expect, vi } from 'vitest'
import {
  proposeBudgetAlert, proposalToBudgetAlertBody, budgetAlertTool,
  type BudgetAlertDeps,
} from '~~/server/utils/ai/tools/proposeBudgetAlert'
import { registry } from '~~/server/utils/ai/tools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = (role = 'admin') => ({ userId: 'u1', userRole: role, conversationId: 'c1', event: { headers: {} } as any }) as ToolContext

const deps = (over: Partial<BudgetAlertDeps> = {}): BudgetAlertDeps => ({
  findClients: vi.fn().mockResolvedValue([{ id: 'cl1', name: 'Acme' }]),
  propose: vi.fn().mockResolvedValue('prop-1'),
  ...over,
})

const data = (r: any) => { expect(r.ok).toBe(true); return (r as any).data }

describe('proposeBudgetAlert', () => {
  it('PROPOSES a client-scoped alert (defaults type/severity) — never creates it directly', async () => {
    const d = deps()
    const out = data(await proposeBudgetAlert({ clientName: 'Acme', title: 'Watch Acme spend', thresholdValue: 90 }, ctx(), d))
    expect(out.proposalId).toBe('prop-1')
    expect(out.resolved).toMatchObject({
      clientId: 'cl1', clientName: 'Acme', title: 'Watch Acme spend',
      alertType: 'budget_threshold', severity: 'warning', thresholdValue: 90,
    })
    expect(d.propose).toHaveBeenCalledTimes(1)
  })

  it('disambiguates when several clients match (no proposal)', async () => {
    const d = deps({ findClients: vi.fn().mockResolvedValue([{ id: 'a', name: 'Acme AU' }, { id: 'b', name: 'Acme NZ' }]) })
    const out = data(await proposeBudgetAlert({ clientName: 'Acme', title: 't' }, ctx(), d))
    expect(out.disambiguation?.field).toBe('clientName')
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('fails when no client matches and when there is no title', async () => {
    expect((await proposeBudgetAlert({ clientName: 'Nope', title: 't' }, ctx(), deps({ findClients: vi.fn().mockResolvedValue([]) }))).ok).toBe(false)
    expect((await proposeBudgetAlert({ clientName: 'Acme', title: '  ' }, ctx(), deps())).ok).toBe(false)
  })

  it('rejects a non-admin role (matches the owner/admin endpoint) before proposing', async () => {
    const d = deps()
    expect((await proposeBudgetAlert({ clientName: 'Acme', title: 't' }, ctx('media_buyer'), d)).ok).toBe(false)
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('is an ADMIN-gated mutating (propose-only) tool', () => {
    expect(budgetAlertTool.mutates).toBe(true)
    expect(budgetAlertTool.requiredPermission).toBe('ADMIN')
    expect(registry.find(t => t.name === 'propose_budget_alert')).toBeDefined()
  })
})

describe('proposalToBudgetAlertBody', () => {
  it('maps a resolved proposal to the budget-alerts endpoint body', () => {
    const body = proposalToBudgetAlertBody({
      clientId: 'cl1', alertType: 'budget_threshold', severity: 'critical',
      title: 'Acme over budget', message: 'review', thresholdValue: 100,
    })
    expect(body).toMatchObject({
      clientId: 'cl1', alertType: 'budget_threshold', severity: 'critical',
      title: 'Acme over budget', message: 'review', thresholdValue: 100,
    })
  })
})
