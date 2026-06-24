import { describe, expect, it } from 'vitest'

import {
  findHighConfidenceClientMatch,
  labelSpendSummaryGroup,
  normalizeSpendMatchName,
} from '~~/server/utils/socialSpendAccuracy'

describe('social spend accuracy helpers', () => {
  it('normalizes common business suffixes and punctuation for account matching', () => {
    expect(normalizeSpendMatchName('Garry & Warren Smith Honda Springvale Pty Ltd')).toBe('garry warren smith springvale')
    expect(normalizeSpendMatchName('Bay City Auto Group')).toBe('bay city')
  })

  it('returns an exact normalized client match before looser candidates', () => {
    const match = findHighConfidenceClientMatch('Astoria GWM', [
      { id: 'client-1', name: 'Astoria GWM' },
      { id: 'client-2', name: 'Astoria' },
    ])

    expect(match).toEqual({
      clientId: 'client-1',
      clientName: 'Astoria GWM',
      confidence: 'exact',
      reason: 'Normalized account name exactly matches client name',
    })
  })

  it('allows one unambiguous contains match but rejects ambiguous matches', () => {
    expect(findHighConfidenceClientMatch('Garry and Warren Smith Honda Springvale', [
      { id: 'client-1', name: 'Garry and Warren Smith' },
      { id: 'client-2', name: 'Astoria GWM' },
    ])).toMatchObject({ clientId: 'client-1', confidence: 'contains' })

    expect(findHighConfidenceClientMatch('Brighton', [
      { id: 'client-1', name: 'Brighton Auto Group' },
      { id: 'client-2', name: 'Brighton Nissan' },
    ])).toBeNull()

    expect(findHighConfidenceClientMatch('Knox GWM', [
      { id: 'client-1', name: 'Knox Mitsubishi' },
    ])).toBeNull()
  })

  it('labels unmapped spend by account instead of campaign name', () => {
    expect(labelSpendSummaryGroup({
      clientName: null,
      accountName: 'Astoria GWM',
      campaignName: 'Convert_Rolling_Google_PMaxInventory_Astoria_GWM_New/Demo_Q2_OEM_Offers_v2',
      platform: 'google_ads',
    })).toBe('Unmapped: Astoria GWM')

    expect(labelSpendSummaryGroup({
      clientName: 'Astoria GWM',
      accountName: 'Astoria GWM',
      campaignName: 'Convert_Rolling',
      platform: 'google_ads',
    })).toBe('Astoria GWM')
  })
})
