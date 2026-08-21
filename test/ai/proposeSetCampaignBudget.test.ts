import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  proposeSetCampaignBudget,
  proposeBulkSetCampaignBudgets,
  type AllocationTargetRow
} from '~~/server/utils/ai/tools/proposeSetCampaignBudget'
import {
  makeSetCampaignBudgetExecutor,
  makeBulkSetCampaignBudgetsExecutor
} from '~~/server/utils/ai/executors/setCampaignBudget'

vi.mock('~~/server/utils/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/permissions')>()
  return {
    ...actual,
    roleHasPermission: (role: string) => role === 'owner' || role === 'media_buyer'
  }
})

const ctx = (role = 'media_buyer'): ToolContext => ({ userId: 'u1', userRole: role, source: 'mcp', event: {} as never })

const ID_A = '00000000-0000-4000-8000-00000000000a'
const ID_B = '00000000-0000-4000-8000-00000000000b'
const ID_MISSING = '00000000-0000-4000-8000-0000000000ff'

const row = (over: Partial<AllocationTargetRow>): AllocationTargetRow => ({
  id: ID_A,
  period: '2026-08',
  platform: 'google',
  client_id: 'c1',
  client_name: 'Knox GWM Haval',
  campaign_id: '23885193765',
  campaign_name: 'Capture_Fixed_Google_PMaxInventory_Knox_GWM_August_Offers',
  budget_allocated: null,
  end_date: null,
  mtd_spend: '1730.62',
  spend_as_of: '2026-08-19',
  ...over
})

describe('propose_set_campaign_budget (W-1)', () => {
  it('shapes a reviewable proposal for a no_budget row: null current budget + implied pacing', async () => {
    const propose = vi.fn(async () => 'prop-1')
    const res = await proposeSetCampaignBudget(
      { mediaSpendId: ID_A, budgetAllocated: 3000 }, ctx(),
      { loadTargets: async () => [row({})], propose }
    )
    expect(res.ok).toBe(true)
    const data = (res as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      proposalId: 'prop-1',
      kind: 'campaign_budget_allocation',
      clientName: 'Knox GWM Haval',
      campaignId: '23885193765',
      platform: 'google',
      period: '2026-08',
      currentBudgetAllocated: null,
      proposedBudgetAllocated: 3000,
      mtdSpend: 1730.62
    })
    expect(typeof data.impliedPacingStatus).toBe('string')
  })

  it('shows the current budget when overwriting an existing allocation', async () => {
    const res = await proposeSetCampaignBudget(
      { mediaSpendId: ID_A, budgetAllocated: 2500 }, ctx(),
      { loadTargets: async () => [row({ budget_allocated: '2000' })], propose: async () => 'prop-2' }
    )
    expect((res as { data: { currentBudgetAllocated: number } }).data.currentBudgetAllocated).toBe(2000)
  })

  it('dryRun returns the complete preview without creating a proposal', async () => {
    const propose = vi.fn(async () => 'must-not-exist')
    const res = await proposeSetCampaignBudget(
      { mediaSpendId: ID_A, budgetAllocated: 2500, dryRun: true }, ctx('owner'),
      { loadTargets: async () => [row({ budget_allocated: '2000' })], propose }
    )
    expect(res).toMatchObject({ ok: true, data: {
      dryRun: true,
      currentBudgetAllocated: 2000,
      proposedBudgetAllocated: 2500,
      spendAsOf: '2026-08-19'
    } })
    expect(propose).not.toHaveBeenCalled()
  })

  it('refuses without MEDIA_BUYING and on an unknown row', async () => {
    const denied = await proposeSetCampaignBudget(
      { mediaSpendId: ID_A, budgetAllocated: 100 }, ctx('viewer'),
      { loadTargets: async () => [row({})], propose: async () => 'x' }
    )
    expect(denied.ok).toBe(false)
    const missing = await proposeSetCampaignBudget(
      { mediaSpendId: ID_MISSING, budgetAllocated: 100 }, ctx(),
      { loadTargets: async () => [], propose: async () => 'x' }
    )
    expect(missing).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('propose_bulk_set_campaign_budgets (W-2)', () => {
  it('returns the full untruncated table, totals, and overwrite flags', async () => {
    const res = await proposeBulkSetCampaignBudgets(
      { allocations: [
        { mediaSpendId: ID_A, budgetAllocated: 3000 },
        { mediaSpendId: ID_B, budgetAllocated: 2181.2 }
      ] }, ctx(),
      {
        loadTargets: async () => [row({}), row({ id: ID_B, budget_allocated: '500', campaign_name: 'WBAC PMax' })],
        propose: async () => 'prop-bulk'
      }
    )
    expect(res.ok).toBe(true)
    const data = (res as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      kind: 'bulk_campaign_budget_allocation',
      rowCount: 2,
      totalProposedBudget: 5181.2,
      rowsOverwritingExisting: 1,
      overwritingMediaSpendIds: [ID_B]
    })
    expect((data.allocations as unknown[]).length).toBe(2)
  })

  it('is all-or-nothing: one unresolvable row refuses the whole proposal and names it', async () => {
    const propose = vi.fn(async () => 'never')
    const res = await proposeBulkSetCampaignBudgets(
      { allocations: [
        { mediaSpendId: ID_A, budgetAllocated: 3000 },
        { mediaSpendId: ID_MISSING, budgetAllocated: 100 }
      ] }, ctx(),
      { loadTargets: async () => [row({})], propose }
    )
    expect(res).toMatchObject({ ok: false, code: 'not_found', details: { missingIds: [ID_MISSING] } })
    expect(propose).not.toHaveBeenCalled()
  })

  it('refuses duplicate mediaSpendIds', async () => {
    const res = await proposeBulkSetCampaignBudgets(
      { allocations: [
        { mediaSpendId: ID_A, budgetAllocated: 100 },
        { mediaSpendId: ID_A, budgetAllocated: 200 }
      ] }, ctx(),
      { loadTargets: async () => [row({})], propose: async () => 'never' }
    )
    expect(res).toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('bulk dryRun returns every row and never creates an action', async () => {
    const propose = vi.fn(async () => 'must-not-exist')
    const res = await proposeBulkSetCampaignBudgets(
      { allocations: [
        { mediaSpendId: ID_A, budgetAllocated: 3000 },
        { mediaSpendId: ID_B, budgetAllocated: 2100 }
      ], dryRun: true },
      ctx('owner'),
      { loadTargets: async () => [row({}), row({ id: ID_B })], propose }
    )
    expect(res).toMatchObject({ ok: true, data: { dryRun: true, rowCount: 2 } })
    expect(((res as any).data.allocations as unknown[])).toHaveLength(2)
    expect(propose).not.toHaveBeenCalled()
  })
})

describe('executors', () => {
  it('single executor PATCHes the existing audited endpoint with the proposed amount', async () => {
    const patch = vi.fn(async () => ({}))
    const executor = makeSetCampaignBudgetExecutor(patch)
    const result = await executor.execute(
      { mediaSpendId: ID_A, proposedBudgetAllocated: 3000, campaignName: 'Knox PMax', currentBudgetAllocated: null },
      ctx()
    )
    expect(patch).toHaveBeenCalledWith(`/api/agency/social/spend/${ID_A}`,
      expect.objectContaining({ budgetAllocated: 3000 }), expect.anything())
    expect(result.resultRef).toBe(ID_A)
    expect(result.summary).toContain('unset → $3000')
  })

  it('bulk executor groups by distinct amount and shares one correlation id across calls', async () => {
    const calls: Array<{ path: string, body: Record<string, unknown> }> = []
    const executor = makeBulkSetCampaignBudgetsExecutor(async (path, body) => { calls.push({ path, body }); return {} })
    const result = await executor.execute({
      allocations: [
        { mediaSpendId: ID_A, proposedBudgetAllocated: 500 },
        { mediaSpendId: ID_B, proposedBudgetAllocated: 500 },
        { mediaSpendId: ID_MISSING, proposedBudgetAllocated: 750 }
      ],
      totalProposedBudget: 1750
    }, ctx())
    expect(calls).toHaveLength(2)
    expect(calls[0]!.body.spendIds).toEqual([ID_A, ID_B])
    expect(calls[1]!.body.spendIds).toEqual([ID_MISSING])
    const notes = calls.map(call => String(call.body.note))
    expect(notes[0]).toBe(notes[1])
    expect(notes[0]).toContain('[batch:')
    expect(result.resultRef).toHaveLength(36)
  })
})

describe('god-mode preparation context (round-7 regression)', () => {
  it('accepts source god_mode_preparation with a null conversationId — the god-mode MCP write path', async () => {
    const godCtx: ToolContext = { userId: 'u1', userRole: 'owner', source: 'god_mode_preparation', event: {} as never }
    const res = await proposeSetCampaignBudget(
      { mediaSpendId: ID_A, budgetAllocated: 3000 }, godCtx,
      { loadTargets: async () => [row({})], propose: async () => 'prop-god' }
    )
    expect(res.ok).toBe(true)
    expect((res as { data: { proposalId: string } }).data.proposalId).toBe('prop-god')
  })

  it('still refuses a chat context without a conversation', async () => {
    const chatCtx: ToolContext = { userId: 'u1', userRole: 'owner', source: 'chat', event: {} as never }
    const res = await proposeSetCampaignBudget(
      { mediaSpendId: ID_A, budgetAllocated: 3000 }, chatCtx,
      { loadTargets: async () => [row({})], propose: async () => 'never' }
    )
    expect(res.ok).toBe(false)
  })
})
