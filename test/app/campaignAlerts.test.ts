import { describe, expect, it } from 'vitest'

import { buildCampaignAlerts } from '../../app/utils/campaignAlerts'

describe('buildCampaignAlerts', () => {
  const window = {
    now: new Date('2026-07-23T12:00:00+10:00'),
    windowStart: '2026-07-01',
    windowEnd: '2026-07-23'
  }

  it('describes lifetime budgets as campaign totals instead of daily budgets', () => {
    const [alert] = buildCampaignAlerts([{
      campaignName: 'CP Ford PMax',
      budgetType: 'lifetime',
      budget: 1000,
      spend: 17,
      endDate: '2026-07-31'
    }], window)

    expect(alert).toMatchObject({
      alertType: 'underspend',
      severity: 'warning',
      message: '98% of campaign-total budget remaining · ends in 8 days',
      spendAmount: 17,
      budgetAmount: 1000,
      budgetScope: 'campaign_total'
    })
    expect(alert?.message).not.toContain('daily budget')
  })

  it('compares average daily spend with the monthly pacing target', () => {
    const [alert] = buildCampaignAlerts([{
      campaignName: 'Daily campaign',
      budgetType: 'daily',
      budget: 3100,
      spend: 1150
    }], window)

    expect(alert).toMatchObject({
      alertType: 'underspend',
      message: '50% under daily pacing target',
      spendAmount: 50,
      budgetAmount: 100,
      budgetScope: 'daily_pacing'
    })
  })

  it('uses fallback spend fields when the primary analytics values are null', () => {
    const [alert] = buildCampaignAlerts([{
      campaignName: 'Fallback campaign',
      budget: null,
      monthlyBudget: 3100,
      spend: null,
      monthlySpend: 1150
    }], window)

    expect(alert).toMatchObject({
      message: '50% under daily pacing target',
      spendAmount: 50,
      budgetAmount: 100
    })
  })

  it('does not flag an unspent lifetime budget before its final two weeks', () => {
    const alerts = buildCampaignAlerts([{
      campaignName: 'Long-running campaign',
      budgetType: 'lifetime',
      budget: 1000,
      spend: 17,
      endDate: '2026-09-30'
    }], window)

    expect(alerts).toEqual([])
  })

  it('still reports zero-spend inactivity independently of budget type', () => {
    const [alert] = buildCampaignAlerts([{
      campaignName: 'Inactive campaign',
      budgetType: 'lifetime',
      budget: 1000,
      spend: 0,
      zeroDays: 3,
      endDate: '2026-09-30'
    }], window)

    expect(alert).toMatchObject({
      alertType: 'inactive',
      severity: 'error',
      message: '$0 spend for 3 days'
    })
  })
})
