import { describe, it, expect, vi } from 'vitest'
import { proposeExpenseApproval, proposeEomGenerate, proposeExpenseClassify, type FinanceDeps } from '~~/server/utils/ai/tools/financeActions'
import { proposeBudgetChange, type ProposeBudgetChangeDeps } from '~~/server/utils/ai/tools/proposeBudgetChange'
import { proposeBudgetAlert, type BudgetAlertDeps } from '~~/server/utils/ai/tools/proposeBudgetAlert'
import { executeWriteConfirm, type ConfirmDeps, type ClaimedProposal } from '~~/server/utils/ai/mcp/writeTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// The MCP controller builds this ctx for every call: source='mcp', NO conversationId.
// Regression guard for the CRITICAL where financial propose handlers hard-rejected over MCP because their
// `if (!ctx.conversationId)` guard wasn't MCP-aware (only propose_quote/crmActions had been patched).
const mcp = { userId: 'u1', userRole: 'owner', source: 'mcp', event: { headers: {} } as any } as ToolContext
// A ctx with neither a conversation nor the mcp source must still be rejected (the guard must stay closed).
const orphan = { userId: 'u1', userRole: 'owner', event: { headers: {} } as any } as ToolContext

const finDeps = (over: Partial<FinanceDeps> = {}): FinanceDeps => ({
  resolveExpense: async () => [{ id: 'e1', name: 'Officeworks', amount: 120, status: 'submitted' }],
  resolveDraftExpense: async () => [{ id: 'e2', name: 'Adobe', amount: 90, status: 'draft' }],
  resolveCategory: async () => [{ id: 'cat1', name: 'Software' }],
  resolveClient: async () => [{ id: 'cl1', name: 'Acme' }],
  propose: async () => 'prop-1',
  ...over,
})

const bcDeps = (over: Partial<ProposeBudgetChangeDeps> = {}): ProposeBudgetChangeDeps => ({
  resolveCampaign: async () => [{ mediaSpendId: 'ms1', campaignName: 'Camp', platform: 'meta', currentDailyBudget: 100, issueType: null }],
  sanityCheck: async () => ({ sane: true, concern: '' }) as any,
  propose: async () => 'prop-bc',
  ...over,
})

const baDeps = (over: Partial<BudgetAlertDeps> = {}): BudgetAlertDeps => ({
  findClients: async () => [{ id: 'cl1', name: 'Acme' }],
  propose: async () => 'prop-ba',
  ...over,
})

describe('financial propose handlers over MCP (source=mcp, no conversationId)', () => {
  it('propose_expense_approval stages a proposal over MCP', async () => {
    const res: any = await proposeExpenseApproval({ expense: 'Officeworks', action: 'approve' } as any, mcp, finDeps())
    expect(res.ok).toBe(true)
    expect(res.data.proposalId).toBe('prop-1')
  })

  it('propose_eom_generate stages a proposal over MCP', async () => {
    const res: any = await proposeEomGenerate({ month: 6, year: 2026 }, mcp, finDeps())
    expect(res.ok).toBe(true)
    expect(res.data.proposalId).toBe('prop-1')
  })

  it('propose_expense_classify stages a proposal over MCP', async () => {
    const res: any = await proposeExpenseClassify({ expense: 'Adobe', categoryName: 'Software' } as any, mcp, finDeps())
    expect(res.ok).toBe(true)
    expect(res.data.proposalId).toBe('prop-1')
  })

  it('propose_budget_change stages a proposal over MCP', async () => {
    const res: any = await proposeBudgetChange({ campaignName: 'Camp', newDailyBudget: 150 } as any, mcp, bcDeps())
    expect(res.ok).toBe(true)
    expect(res.data.proposalId).toBe('prop-bc')
  })

  it('propose_budget_alert stages a proposal over MCP', async () => {
    const res: any = await proposeBudgetAlert({ clientName: 'Acme', title: 'Overrun' } as any, mcp, baDeps())
    expect(res.ok).toBe(true)
    expect(res.data.proposalId).toBe('prop-ba')
  })

  it('still REJECTS when there is neither a conversation nor the mcp source (guard stays closed)', async () => {
    const approval: any = await proposeExpenseApproval({ expense: 'Officeworks', action: 'approve' } as any, orphan, finDeps())
    expect(approval.ok).toBe(false)
    const bc: any = await proposeBudgetChange({ campaignName: 'Camp', newDailyBudget: 150 } as any, orphan, bcDeps())
    expect(bc.ok).toBe(false)
    const ba: any = await proposeBudgetAlert({ clientName: 'Acme', title: 'Overrun' } as any, orphan, baDeps())
    expect(ba.ok).toBe(false)
  })
})

describe('claim-burn revert: a money-mover confirm without ack must NOT burn the proposal', () => {
  const claimed: ClaimedProposal = { tool_name: 'propose_budget_change', resolved_payload: { mediaSpendId: 'ms1', newDailyBudget: 150 } }
  const mkDeps = (state: { status: string }): ConfirmDeps => ({
    enabled: true,
    financialEnabled: true,
    writeEnabled: false,
    claim: async () => { state.status = 'executed'; return claimed },
    revertClaim: async () => { state.status = 'proposed' },
    getExecutor: () => ({
      riskTier: 'rich_confirm',
      requiredPermission: 'MEDIA_BUYING',
      execute: async () => ({ resultRef: 'plan1', summary: 'planned' }),
    }) as any,
  })

  it('without ack → confirm_required AND the row is reverted to proposed (retryable)', async () => {
    const state = { status: 'proposed' }
    const res = await executeWriteConfirm({ proposalId: 'prop-12345678' }, mcp, mkDeps(state))
    expect(res.ok).toBe(false)
    expect((res as any).code).toBe('confirm_required')
    expect(state.status).toBe('proposed') // reverted — not burned
  })

  it('with ack:true → executes (row stays consumed)', async () => {
    const state = { status: 'proposed' }
    const res = await executeWriteConfirm({ proposalId: 'prop-12345678', ack: true }, mcp, mkDeps(state))
    expect(res.ok).toBe(true)
    expect(state.status).toBe('executed')
  })
})
