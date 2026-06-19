import { describe, it, expect, vi } from 'vitest'
import {
  proposeBudgetChange, proposalToBudgetPlanBody, proposeBudgetChangeTool,
  type ProposeBudgetChangeDeps, type PacingCandidate,
} from '~~/server/utils/ai/tools/proposeBudgetChange'
import { registry } from '~~/server/utils/ai/tools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = (role = 'media_buyer') => ({ userId: 'u1', userRole: role, conversationId: 'c1', event: { headers: {} } as any }) as ToolContext

const cand = (over: Partial<PacingCandidate> = {}): PacingCandidate => ({
  mediaSpendId: 'ms1', campaignName: 'Acme Retargeting', platform: 'meta', currentDailyBudget: 50, issueType: 'overpacing', ...over,
})

const deps = (over: Partial<ProposeBudgetChangeDeps> = {}): ProposeBudgetChangeDeps => ({
  resolveCampaign: vi.fn().mockResolvedValue([cand()]),
  sanityCheck: vi.fn().mockResolvedValue({ sane: true, concern: null }),
  propose: vi.fn().mockResolvedValue('prop-1'),
  ...over,
})

const data = (r: any) => { expect(r.ok).toBe(true); return (r as any).data }

describe('proposeBudgetChange', () => {
  it('PROPOSES a change with current→proposed, % and the sanity check — never writes', async () => {
    const d = deps()
    const out = data(await proposeBudgetChange({ campaignName: 'Acme Retargeting', newDailyBudget: 40 }, ctx(), d))
    expect(out.proposalId).toBe('prop-1')
    expect(out.resolved).toMatchObject({
      mediaSpendId: 'ms1', campaignName: 'Acme Retargeting', platform: 'meta',
      currentDailyBudget: 50, newDailyBudget: 40, pctChange: -20, sanityCheck: { sane: true, concern: null },
    })
  })

  it('runs the counter-model sanity check and surfaces its concern on the proposal', async () => {
    const d = deps({ sanityCheck: vi.fn().mockResolvedValue({ sane: false, concern: '10x jump' }) })
    const out = data(await proposeBudgetChange({ campaignName: 'Acme Retargeting', newDailyBudget: 500 }, ctx(), d))
    expect(out.resolved.sanityCheck).toEqual({ sane: false, concern: '10x jump' })
    expect(out.resolved.pctChange).toBe(900)
  })

  it('disambiguates when several flagged campaigns match (no proposal)', async () => {
    const d = deps({ resolveCampaign: vi.fn().mockResolvedValue([cand({ mediaSpendId: 'a', campaignName: 'Acme Retargeting AU' }), cand({ mediaSpendId: 'b', campaignName: 'Acme Retargeting NZ' })]) })
    const out = data(await proposeBudgetChange({ campaignName: 'Acme Retargeting', newDailyBudget: 40 }, ctx(), d))
    expect(out.disambiguation?.field).toBe('campaignName')
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('honors an exact campaign-name match amid substring matches', async () => {
    const d = deps({ resolveCampaign: vi.fn().mockResolvedValue([cand({ mediaSpendId: 'a', campaignName: 'Acme Retargeting' }), cand({ mediaSpendId: 'b', campaignName: 'Acme Retargeting NZ' })]) })
    const out = data(await proposeBudgetChange({ campaignName: 'Acme Retargeting', newDailyBudget: 40 }, ctx(), d))
    expect(out.resolved.mediaSpendId).toBe('a')
  })

  it('fails when no flagged campaign matches', async () => {
    const d = deps({ resolveCampaign: vi.fn().mockResolvedValue([]) })
    const r = await proposeBudgetChange({ campaignName: 'Ghost', newDailyBudget: 40 }, ctx(), d)
    expect(r.ok).toBe(false)
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('rejects a role without MEDIA_BUYING and a non-positive budget', async () => {
    const d = deps()
    expect((await proposeBudgetChange({ campaignName: 'Acme Retargeting', newDailyBudget: 40 }, ctx('viewer'), d)).ok).toBe(false)
    expect((await proposeBudgetChange({ campaignName: 'Acme Retargeting', newDailyBudget: 0 }, ctx(), d)).ok).toBe(false)
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('is a MEDIA_BUYING rich_confirm mutating tool, registered + in the media_buyer pack', async () => {
    expect(proposeBudgetChangeTool.mutates).toBe(true)
    expect(proposeBudgetChangeTool.riskTier).toBe('rich_confirm')
    expect(proposeBudgetChangeTool.requiredPermission).toBe('MEDIA_BUYING')
    expect(registry.find(t => t.name === 'propose_budget_change')).toBeDefined()
    const { PERSONAS } = await import('~~/server/utils/ai/personas')
    expect(PERSONAS.media_buyer!.toolAllowlist).toContain('propose_budget_change')
  })
})

describe('proposalToBudgetPlanBody', () => {
  it('maps to the spend-actions plan body (ai_copilot source, new budget as the recommendation)', () => {
    const body = proposalToBudgetPlanBody({ mediaSpendId: 'ms1', currentDailyBudget: 50, newDailyBudget: 40, reason: 'overpacing', issueType: 'overpacing' })
    expect(body).toEqual({ currentDailyBudget: 50, recommendedDailyBudget: 40, source: 'ai_copilot', reason: 'overpacing', issueType: 'overpacing' })
  })
})
