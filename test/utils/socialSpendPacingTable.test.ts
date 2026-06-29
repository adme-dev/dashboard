import { describe, expect, it } from 'vitest'
import {
  budgetControlForSpendRow,
  healthForSpendRow,
  lastActionForSpendRow,
  pacingItemsForSpendRow,
  pacingSeverityRank,
  pacingSummaryForSpendRow,
  projectedMonthEndForSpendRow,
  reasonCodesForSpendRow
} from '~~/app/utils/socialSpendPacingTable'

const reviewItems = [
  {
    mediaSpendId: 'spend-1',
    clientName: 'Acme',
    platform: 'google',
    campaignName: 'Brand Search',
    issueType: 'underpacing',
    severity: 'warning',
    budget: 1000,
    projectedMonthEnd: 650,
    recommendedAction: 'Increase delivery.'
  },
  {
    mediaSpendId: 'spend-2',
    clientName: 'Acme',
    platform: 'google',
    campaignName: 'Performance Max',
    issueType: 'overpacing',
    severity: 'critical',
    budget: 1200,
    projectedMonthEnd: 1800,
    recommendedAction: 'Reduce daily budget.'
  },
  {
    mediaSpendId: 'spend-3',
    clientName: 'Other',
    platform: 'meta',
    campaignName: 'Lead Gen',
    issueType: 'zero_conversion',
    severity: 'warning',
    budget: 900,
    projectedMonthEnd: 920,
    recommendedAction: 'Check conversion tracking.'
  }
] as const

describe('socialSpendPacingTable', () => {
  it('matches pacing items to aggregated spend rows by media spend ids', () => {
    const matches = pacingItemsForSpendRow({
      platform: 'google',
      clientName: 'Acme',
      spendIds: ['spend-2']
    }, reviewItems)

    expect(matches.map(item => item.campaignName)).toEqual(['Performance Max'])
  })

  it('falls back to client and platform matching when spend ids are missing', () => {
    const matches = pacingItemsForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme'
    }, reviewItems)

    expect(matches.map(item => item.campaignName)).toEqual(['Performance Max', 'Brand Search'])
  })

  it('summarizes the highest severity and recommendation count for a spend row', () => {
    expect(pacingSummaryForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme'
    }, reviewItems)).toEqual({
      count: 2,
      highestSeverity: 'critical'
    })
  })

  it('sorts critical recommendations before warnings and info', () => {
    expect(['info', 'critical', 'warning'].sort((a, b) => pacingSeverityRank(a) - pacingSeverityRank(b))).toEqual([
      'critical',
      'warning',
      'info'
    ])
  })

  it('derives client health from the worst pacing recommendation first', () => {
    expect(healthForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
      budget: 1200,
      spend: 1000,
      lastSyncedAt: new Date().toISOString()
    }, reviewItems)).toEqual({
      label: 'Action needed',
      tone: 'critical',
      reason: 'Overspending'
    })
  })

  it('flags rows with stale sync or missing budgets when there is no AI recommendation', () => {
    expect(healthForSpendRow({
      platform: 'meta',
      clientName: 'Clean',
      budget: 0,
      spend: 50,
      lastSyncedAt: null
    }, [])).toEqual({
      label: 'Setup needed',
      tone: 'warning',
      reason: 'Missing budget'
    })
  })

  it('projects month-end spend from matched pacing items or row pacing', () => {
    expect(projectedMonthEndForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
      budget: 1200,
      spend: 1000
    }, reviewItems)).toEqual({
      value: 2450,
      variance: 250,
      source: 'ai-review'
    })
  })

  it('summarizes the current row action state from AI recommendations', () => {
    expect(lastActionForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme'
    }, reviewItems)).toEqual({
      label: 'Review needed',
      tone: 'critical',
      detail: 'Reduce daily budget.'
    })
  })

  it('shows live budget control only when global and platform writers are enabled', () => {
    expect(budgetControlForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
      budget: 1200,
      spendIds: ['spend-1']
    }, {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: true
    })).toEqual({
      label: 'Live armed',
      tone: 'warning',
      detail: 'Google Ads budget writes are enabled for mapped campaigns.'
    })
  })

  it('keeps supported platforms in recommend-only mode when live writes are disabled', () => {
    expect(budgetControlForSpendRow({
      platform: 'meta',
      clientName: 'Acme',
      budget: 1200,
      spendIds: ['spend-1']
    }, {
      liveBudgetChangesEnabled: false,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: true
    })).toEqual({
      label: 'Recommend only',
      tone: 'neutral',
      detail: 'AI can recommend changes, but live budget writes are off.'
    })
  })

  it('flags rows where budget control cannot be applied', () => {
    expect(budgetControlForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
      budget: 0,
      spendIds: ['spend-1']
    }, {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: true
    }).label).toBe('No budget')

    expect(budgetControlForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
      budget: 1200,
      spendIds: []
    }, {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: true
    }).label).toBe('No mapping')

    expect(budgetControlForSpendRow({
      platform: 'linkedin',
      clientName: 'Acme',
      budget: 1200,
      spendIds: ['spend-1']
    }, {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: true
    }).label).toBe('Blocked')
  })

  it('returns compact reason codes from matched recommendations or row health', () => {
    expect(reasonCodesForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme'
    }, reviewItems)).toEqual(['Overspending', 'Under-delivering'])

    expect(reasonCodesForSpendRow({
      platform: 'meta',
      clientName: 'Clean',
      budget: 0,
      spend: 50
    }, [])).toEqual(['Missing budget'])
  })

  it('labels linked negative social feedback warnings for spend health', () => {
    expect(healthForSpendRow({
      platform: 'meta',
      clientName: 'Acme',
      spendIds: ['spend-social'],
      budget: 1200,
      spend: 900
    }, [{
      mediaSpendId: 'spend-social',
      clientName: 'Acme',
      platform: 'meta',
      issueType: 'negative_social_feedback',
      severity: 'warning',
      budget: 1200,
      projectedMonthEnd: 1200,
      recommendedAction: 'Review recent comments.'
    }])).toEqual({
      label: 'Watch',
      tone: 'warning',
      reason: 'Negative social feedback'
    })
  })
})
