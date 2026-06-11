import { describe, expect, it } from 'vitest'
import {
  pacingItemsForSpendRow,
  pacingSeverityRank,
  pacingSummaryForSpendRow,
} from '~~/app/utils/socialSpendPacingTable'

const reviewItems = [
  {
    mediaSpendId: 'spend-1',
    clientName: 'Acme',
    platform: 'google',
    campaignName: 'Brand Search',
    severity: 'warning',
  },
  {
    mediaSpendId: 'spend-2',
    clientName: 'Acme',
    platform: 'google',
    campaignName: 'Performance Max',
    severity: 'critical',
  },
  {
    mediaSpendId: 'spend-3',
    clientName: 'Other',
    platform: 'meta',
    campaignName: 'Lead Gen',
    severity: 'warning',
  },
] as const

describe('socialSpendPacingTable', () => {
  it('matches pacing items to aggregated spend rows by media spend ids', () => {
    const matches = pacingItemsForSpendRow({
      platform: 'google',
      clientName: 'Acme',
      spendIds: ['spend-2'],
    }, reviewItems)

    expect(matches.map(item => item.campaignName)).toEqual(['Performance Max'])
  })

  it('falls back to client and platform matching when spend ids are missing', () => {
    const matches = pacingItemsForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
    }, reviewItems)

    expect(matches.map(item => item.campaignName)).toEqual(['Performance Max', 'Brand Search'])
  })

  it('summarizes the highest severity and recommendation count for a spend row', () => {
    expect(pacingSummaryForSpendRow({
      platform: 'google_ads',
      clientName: 'Acme',
    }, reviewItems)).toEqual({
      count: 2,
      highestSeverity: 'critical',
    })
  })

  it('sorts critical recommendations before warnings and info', () => {
    expect(['info', 'critical', 'warning'].sort((a, b) => pacingSeverityRank(a) - pacingSeverityRank(b))).toEqual([
      'critical',
      'warning',
      'info',
    ])
  })
})
