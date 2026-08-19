import { describe, expect, it } from 'vitest'

import { buildSpendSummaryItems } from '~~/server/utils/socialSpendSummary'

describe('buildSpendSummaryItems', () => {
  it('collapses mapped duplicate client/platform rows into one stable summary item', () => {
    const items = buildSpendSummaryItems([
      {
        platform: 'meta',
        client_id: 'client-1',
        client_name: 'Ferntree Gully Automotive',
        account_id: 'act-1',
        account_name: 'Ferntree Meta',
        sample_campaign_name: 'Campaign A',
        client_ref: 'xero-1',
        owner_id: 'owner-1',
        owner_name: 'Alicia',
        total_budget: '500',
        total_spend: '955.31',
        total_commission: '47.76',
        total_impressions: '1000',
        total_clicks: '50',
        total_conversions: '5',
        campaign_count: 2,
        budgeted_campaign_count: 1,
        last_synced_at: '2026-06-20T00:00:00.000Z',
        spend_ids: ['spend-1', 'spend-2'],
        is_rolling: false,
        commission_rate: '5',
      },
      {
        platform: 'meta',
        client_id: 'client-1',
        client_name: 'Ferntree Gully Automotive',
        account_id: 'act-2',
        account_name: 'Ferntree Used Cars Meta',
        sample_campaign_name: 'Campaign B',
        client_ref: 'xero-1',
        owner_id: null,
        owner_name: null,
        total_budget: '3000',
        total_spend: '3129.21',
        total_commission: '156.46',
        total_impressions: '4000',
        total_clicks: '120',
        total_conversions: '9',
        campaign_count: 3,
        budgeted_campaign_count: 3,
        last_synced_at: '2026-06-25T00:00:00.000Z',
        spend_ids: ['spend-2', 'spend-3'],
        is_rolling: true,
        commission_rate: '5',
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      groupKey: 'meta:client:client-1',
      platform: 'meta',
      clientName: 'Ferntree Gully Automotive',
      clientCode: 'xero-1',
      budget: 3500,
      spend: 4084.52,
      commission: 204.22,
      impressions: 5000,
      clicks: 170,
      conversions: 14,
      campaignCount: 5,
      budgetedCampaignCount: 4,
      rolling: true,
      commissionRate: 5,
      lastSyncedAt: '2026-06-25T00:00:00.000Z',
    })
    expect(items[0].owner).toEqual({ id: 'owner-1', name: 'Alicia' })
    expect(items[0].spendIds).toEqual(['spend-1', 'spend-2', 'spend-3'])
  })

  it('keeps unmapped account groups separate while giving each a stable key', () => {
    const items = buildSpendSummaryItems([
      {
        platform: 'google_ads',
        client_id: null,
        client_name: null,
        account_id: '111',
        account_name: 'Northern Jeep',
        sample_campaign_name: 'Campaign A',
        client_ref: null,
        owner_id: null,
        owner_name: null,
        total_budget: '300',
        total_spend: '194.35',
        total_commission: '0',
        total_impressions: '100',
        total_clicks: '10',
        total_conversions: '1',
        campaign_count: 1,
        last_synced_at: null,
        spend_ids: ['spend-1'],
        is_rolling: false,
        commission_rate: '0',
      },
      {
        platform: 'google_ads',
        client_id: null,
        client_name: null,
        account_id: '222',
        account_name: 'Northern RAM',
        sample_campaign_name: 'Campaign B',
        client_ref: null,
        owner_id: null,
        owner_name: null,
        total_budget: '0',
        total_spend: '228.25',
        total_commission: '0',
        total_impressions: '200',
        total_clicks: '20',
        total_conversions: '2',
        campaign_count: 1,
        last_synced_at: null,
        spend_ids: ['spend-2'],
        is_rolling: false,
        commission_rate: '0',
      },
    ])

    expect(items.map(item => item.groupKey)).toEqual([
      'google_ads:unmapped:222',
      'google_ads:unmapped:111',
    ])
    expect(items.map(item => item.clientName)).toEqual([
      'Unmapped: Northern RAM',
      'Unmapped: Northern Jeep',
    ])
  })
})
