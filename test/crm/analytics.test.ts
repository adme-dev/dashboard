import { describe, it, expect } from 'vitest'
import {
  funnel,
  winRate,
  weightedForecast,
  avgCycleLengthDays,
  avgTimeInStageDays,
  type AnalyticsOpp,
  type AnalyticsStage,
  type StageHistoryRow,
} from '~~/server/utils/crm/analytics'

const stages: AnalyticsStage[] = [
  { id: 's1', code: 'new', name: 'New', sort_order: 1, is_won: false, is_lost: false },
  { id: 's2', code: 'proposal', name: 'Proposal', sort_order: 3, is_won: false, is_lost: false },
  { id: 's3', code: 'won', name: 'Won', sort_order: 5, is_won: true, is_lost: false },
]
const opp = (o: Partial<AnalyticsOpp>): AnalyticsOpp => ({
  id: 'o', stage_id: 's1', amount: 0, probability: 0, status: 'open',
  owner_id: null, created_at: null, actual_close_date: null, ...o,
})

describe('funnel', () => {
  it('counts and sums value per stage, ordered by sort_order', () => {
    const f = funnel(
      [opp({ stage_id: 's1', amount: 100 }), opp({ stage_id: 's1', amount: 50 }), opp({ stage_id: 's3', amount: 200 })],
      stages,
    )
    expect(f).toEqual([
      { stage_id: 's1', code: 'new', name: 'New', count: 2, value: 150 },
      { stage_id: 's2', code: 'proposal', name: 'Proposal', count: 0, value: 0 },
      { stage_id: 's3', code: 'won', name: 'Won', count: 1, value: 200 },
    ])
  })
})

describe('winRate', () => {
  it('is won / (won + lost), ignoring open deals', () => {
    const r = winRate([
      opp({ status: 'won' }), opp({ status: 'won' }), opp({ status: 'lost' }), opp({ status: 'open' }),
    ])
    expect(r.won).toBe(2)
    expect(r.lost).toBe(1)
    expect(r.open).toBe(1)
    expect(r.winRate).toBeCloseTo(2 / 3, 5)
  })
  it('is 0 when nothing has closed', () => {
    expect(winRate([opp({ status: 'open' })]).winRate).toBe(0)
  })
})

describe('weightedForecast', () => {
  it('sums amount * probability/100 over OPEN deals only', () => {
    const v = weightedForecast([
      opp({ status: 'open', amount: 100, probability: 50 }),
      opp({ status: 'open', amount: 200, probability: 25 }),
      opp({ status: 'won', amount: 999, probability: 100 }),
    ])
    expect(v).toBe(100) // 50 + 50
  })
})

describe('avgCycleLengthDays', () => {
  it('averages close - created across closed deals', () => {
    const v = avgCycleLengthDays([
      opp({ status: 'won', created_at: '2026-01-01T00:00:00Z', actual_close_date: '2026-01-11' }),
      opp({ status: 'open', created_at: '2026-01-01T00:00:00Z' }),
    ])
    expect(v).toBe(10)
  })
  it('returns null when nothing has closed', () => {
    expect(avgCycleLengthDays([opp({ status: 'open' })])).toBeNull()
  })
})

describe('avgTimeInStageDays', () => {
  it('averages the duration spent in each stage from history transitions', () => {
    const hist: StageHistoryRow[] = [
      { opportunity_id: 'A', from_stage_id: null, to_stage_id: 's1', changed_at: '2026-01-01T00:00:00Z' },
      { opportunity_id: 'A', from_stage_id: 's1', to_stage_id: 's2', changed_at: '2026-01-03T00:00:00Z' },
      { opportunity_id: 'A', from_stage_id: 's2', to_stage_id: 's3', changed_at: '2026-01-06T00:00:00Z' },
    ]
    const r = avgTimeInStageDays(hist)
    expect(r).toEqual([
      { stage_id: 's1', avgDays: 2 },
      { stage_id: 's2', avgDays: 3 },
    ])
  })
})
