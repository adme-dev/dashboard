import { describe, it, expect, vi, beforeEach } from 'vitest'

const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))

import { resolveMetaBudgetTarget, updateMetaDailyBudget } from '~~/server/utils/metaClient'

beforeEach(() => ofetchMock.mockReset())

describe('resolveMetaBudgetTarget', () => {
  it('returns campaign-level target for CBO (campaign has daily_budget)', async () => {
    ofetchMock.mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS', daily_budget: '50000' }] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('campaign')
    expect(r.targetId).toBe('c1')
  })

  it('returns single ad-set target for ABO with one active ad set', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] }) // no campaign daily_budget
      .mockResolvedValueOnce({ data: [{ id: 'as1', name: 'AS', status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS', daily_budget: '10000' }] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('adset')
    expect(r.targetId).toBe('as1')
    expect(r.optimizationGoal).toBe('OFFSITE_CONVERSIONS')
  })

  it('flags ABO with multiple active ad sets as manual', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] })
      .mockResolvedValueOnce({ data: [
        { id: 'as1', name: 'A', status: 'ACTIVE', daily_budget: '10000' },
        { id: 'as2', name: 'B', status: 'ACTIVE', daily_budget: '10000' },
      ] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('manual')
    expect(r.adSetCount).toBe(2)
  })
})

describe('updateMetaDailyBudget', () => {
  it('POSTs cents then reads back major units', async () => {
    ofetchMock
      .mockResolvedValueOnce({ success: true })                 // POST
      .mockResolvedValueOnce({ daily_budget: '12000' })          // read-back GET
    const r = await updateMetaDailyBudget('c1', 120, 'tok')
    expect(r.readBackDailyMajor).toBe(120)
    const postCall = ofetchMock.mock.calls[0]
    expect(postCall[1].method).toBe('POST')
    expect(postCall[1].body.toString()).toContain('daily_budget=12000')
  })
})
