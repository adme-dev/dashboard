import { describe, expect, it } from 'vitest'
import {
  computeCampaignBudgetPacing,
  statusSeverityRank,
} from '~~/server/utils/budgetPacing'

describe('computeCampaignBudgetPacing', () => {
  const now = new Date('2026-06-09T12:00:00+10:00')

  it('calculates MTD difference and daily budget recommendations for the current month', () => {
    const result = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 300,
      period: '2026-06',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })

    expect(result.mtdDifference).toBe(700)
    expect(result.elapsedDays).toBe(9)
    expect(result.remainingDays).toBe(21)
    expect(result.currentDailyBudget).toBeCloseTo(33.33, 2)
    expect(result.newDailyBudget).toBeCloseTo(33.33, 2)
    expect(result.monthElapsedPct).toBe(30)
    expect(result.budgetConsumedPct).toBe(30)
    expect(result.pacingRatio).toBe(1)
    expect(result.pacingStatus).toBe('on_track')
  })

  it('marks active budgeted campaigns with no spend after day two', () => {
    const result = computeCampaignBudgetPacing({
      monthlyBudget: 500,
      mtdSpend: 0,
      period: '2026-06',
      now,
      campaignStatus: 'ENABLED',
      endDate: null,
    })

    expect(result.pacingStatus).toBe('no_spend')
    expect(result.newDailyBudget).toBeCloseTo(23.81, 2)
  })

  it('classifies over-pacing with warning and critical thresholds', () => {
    const warning = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 340,
      period: '2026-06',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })
    const critical = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 390,
      period: '2026-06',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })

    expect(warning.pacingRatio).toBeCloseTo(1.13, 2)
    expect(warning.pacingStatus).toBe('warning_over_pacing')
    expect(critical.pacingRatio).toBeCloseTo(1.3, 2)
    expect(critical.pacingStatus).toBe('critical_over_pacing')
  })

  it('classifies under-pacing only after the first week', () => {
    const early = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 40,
      period: '2026-06',
      now: new Date('2026-06-05T12:00:00+10:00'),
      campaignStatus: 'ACTIVE',
      endDate: null,
    })
    const afterWeek = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 200,
      period: '2026-06',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })

    expect(early.pacingStatus).toBe('on_track')
    expect(afterWeek.pacingStatus).toBe('warning_under_pacing')
  })

  it('prioritises campaign ended and no budget statuses', () => {
    const ended = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 600,
      period: '2026-06',
      now,
      campaignStatus: 'ACTIVE',
      endDate: '2026-06-01',
    })
    const noBudget = computeCampaignBudgetPacing({
      monthlyBudget: 0,
      mtdSpend: 50,
      period: '2026-06',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })

    expect(ended.pacingStatus).toBe('campaign_ended')
    expect(noBudget.pacingStatus).toBe('no_budget')
  })

  it('uses full month pacing for past periods and zero elapsed days for future periods', () => {
    const past = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 700,
      period: '2026-05',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })
    const future = computeCampaignBudgetPacing({
      monthlyBudget: 1000,
      mtdSpend: 0,
      period: '2026-07',
      now,
      campaignStatus: 'ACTIVE',
      endDate: null,
    })

    expect(past.elapsedDays).toBe(31)
    expect(past.remainingDays).toBe(0)
    expect(past.newDailyBudget).toBe(0)
    expect(past.pacingStatus).toBe('warning_under_pacing')
    expect(future.elapsedDays).toBe(0)
    expect(future.remainingDays).toBe(31)
    expect(future.pacingStatus).toBe('on_track')
  })
})

describe('statusSeverityRank', () => {
  it('sorts statuses by operational severity', () => {
    expect(statusSeverityRank('critical_over_pacing')).toBeLessThan(statusSeverityRank('warning_over_pacing'))
    expect(statusSeverityRank('warning_over_pacing')).toBeLessThan(statusSeverityRank('on_track'))
    expect(statusSeverityRank('campaign_ended')).toBeLessThan(statusSeverityRank('no_budget'))
  })
})
