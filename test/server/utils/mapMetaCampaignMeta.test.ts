import { describe, it, expect } from 'vitest'
import { mapMetaCampaignMeta } from '~~/server/utils/metaClient'

describe('mapMetaCampaignMeta', () => {
  it('derives lifetime budget type and end date from stop_time', () => {
    const r = mapMetaCampaignMeta({
      id: '1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS',
      effective_status: 'ACTIVE', lifetime_budget: '75000',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP', stop_time: '2026-05-31T00:00:00+1000',
    })
    expect(r).toEqual({ status: 'ACTIVE', endDate: '2026-05-31', bidStrategy: 'LOWEST_COST_WITHOUT_CAP', budgetType: 'lifetime' })
  })

  it('derives daily budget type when only daily_budget is set', () => {
    const r = mapMetaCampaignMeta({ id: '2', name: 'D', status: 'PAUSED', objective: 'X', daily_budget: '5000' })
    expect(r.budgetType).toBe('daily')
    expect(r.endDate).toBeNull()
  })

  it('prefers effective_status for delivery status and tolerates missing fields', () => {
    const r = mapMetaCampaignMeta({ id: '3', name: 'E', status: 'ACTIVE', objective: 'X', effective_status: 'CAMPAIGN_PAUSED' })
    expect(r).toEqual({ status: 'CAMPAIGN_PAUSED', endDate: null, bidStrategy: null, budgetType: null })
  })

  it('returns nulls when budgets are zero or absent', () => {
    const r = mapMetaCampaignMeta({ id: '4', name: 'F', status: 'ACTIVE', objective: 'X', daily_budget: '0', lifetime_budget: '0' })
    expect(r.budgetType).toBeNull()
  })
})
