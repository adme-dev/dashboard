import { describe, it, expect } from 'vitest'
import {
  mapProposal, mapAuditRow, payloadSummary, summarizeUsage, auditByTool, buildOverview,
  type ProposalRow, type AuditRow,
} from '~~/server/utils/ai/commandCenter'

const proposal = (over: Partial<ProposalRow> = {}): ProposalRow => ({
  id: 'p1', tool_name: 'create_task', user_id: 'u1', user_name: 'Sam',
  created_at: 't0', expires_at: 't1', resolved_payload: { title: 'Ship it' }, ...over,
})
const audit = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 'a1', tool_name: 'create_task', risk_tier: 'confirm', user_id: 'u1', user_name: 'Sam',
  confirmed_by: 'u1', confirmer_name: 'Sam', outcome: 'executed', result_ref: 't9', client_scope: null, created_at: 't', ...over,
})

describe('mapProposal', () => {
  it('shapes a proposal with a name + payload summary', () => {
    expect(mapProposal(proposal())).toMatchObject({ id: 'p1', toolName: 'create_task', proposedBy: 'Sam', summary: 'Ship it' })
  })
  it('falls back to the user_id when no name resolved', () => {
    expect(mapProposal(proposal({ user_name: null })).proposedBy).toBe('u1')
  })
})

describe('payloadSummary', () => {
  it('summarises a budget change as current→proposed/day', () => {
    expect(payloadSummary('propose_budget_change', { campaignName: 'Acme', currentDailyBudget: 50, newDailyBudget: 40 }))
      .toBe('Acme: 50→40/day')
  })
  it('handles a missing/non-object payload', () => {
    expect(payloadSummary('create_task', null)).toBe('')
  })
})

describe('mapAuditRow', () => {
  it('shapes an audit row and flags client-scoped actions', () => {
    expect(mapAuditRow(audit({ client_scope: 'c9' }))).toMatchObject({ outcome: 'executed', riskTier: 'confirm', clientScoped: true })
    expect(mapAuditRow(audit()).clientScoped).toBe(false)
  })
})

describe('summarizeUsage', () => {
  it('totals cost + tokens across turns (string or number cost)', () => {
    const u = summarizeUsage([
      { cost_usd: '0.0012', prompt_tokens: 100, completion_tokens: 50 },
      { cost_usd: 0.0008, prompt_tokens: 200, completion_tokens: 25 },
    ])
    expect(u).toEqual({ turns: 2, costUsd: 0.002, tokens: 375 })
  })
  it('treats missing/garbage as zero', () => {
    expect(summarizeUsage([{ cost_usd: null }, {}])).toEqual({ turns: 2, costUsd: 0, tokens: 0 })
  })
})

describe('auditByTool', () => {
  it('tallies executed/failed/total per tool, sorted by volume', () => {
    const out = auditByTool([
      audit({ tool_name: 'create_task', outcome: 'executed' }),
      audit({ tool_name: 'create_task', outcome: 'failed' }),
      audit({ tool_name: 'propose_budget_change', outcome: 'executed' }),
    ])
    expect(out[0]).toEqual({ toolName: 'create_task', executed: 1, failed: 1, total: 2 })
    expect(out[1]).toEqual({ toolName: 'propose_budget_change', executed: 1, failed: 0, total: 1 })
  })
})

describe('buildOverview', () => {
  it('assembles proposals + audit + usage + memory into one payload', () => {
    const o = buildOverview({
      proposals: [proposal()],
      audit: [audit()],
      usage: { turns: 1, costUsd: 0.001, tokens: 15 },
      memory: { total: 12, users: 3 },
    })
    expect(o.openProposalCount).toBe(1)
    expect(o.proposals[0].toolName).toBe('create_task')
    expect(o.auditByTool[0].toolName).toBe('create_task')
    expect(o.usage).toEqual({ turns: 1, costUsd: 0.001, tokens: 15 })
    expect(o.memory).toEqual({ total: 12, users: 3 })
  })
})
