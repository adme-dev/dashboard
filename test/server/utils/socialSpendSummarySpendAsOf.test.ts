import { describe, it, expect } from 'vitest'
import { buildSpendSummaryItems, type SpendSummaryRow } from '../../../server/utils/socialSpendSummary'

function row(overrides: Partial<SpendSummaryRow>): SpendSummaryRow {
  return {
    platform: 'meta',
    client_id: 'c1',
    client_name: 'Geely Ringwood',
    account_id: 'a1',
    account_name: 'Geely Ringwood Meta',
    sample_campaign_name: null,
    client_ref: null,
    owner_id: null,
    owner_name: null,
    total_budget: 900,
    total_spend: 500,
    total_commission: 0,
    total_impressions: 0,
    total_clicks: 0,
    total_conversions: 0,
    campaign_count: 1,
    budgeted_campaign_count: 1,
    last_synced_at: '2026-08-25T06:00:00Z',
    oldest_synced_at: '2026-08-25T06:00:00Z',
    spend_as_of: '2026-08-25',
    stale_row_count: 0,
    spend_ids: ['ms1'],
    is_rolling: false,
    commission_rate: 0,
    ...overrides,
  }
}

describe('group spendAsOf semantics (2026-08-25 daily-check incident regression)', () => {
  it('uses the NEWEST provider spend date — a dormant campaign cannot drag the pacing clock back', () => {
    // One campaign current through today, one dormant since the 8th (paused mid-month).
    const items = buildSpendSummaryItems([
      row({ spend_as_of: '2026-08-25' }),
      row({ spend_as_of: '2026-08-08', spend_ids: ['ms2'] }),
    ])
    expect(items).toHaveLength(1)
    // MIN here caused get_adspend_pacing to see a truncated month (elapsed ~8 days) and call
    // current data "overpacing 223%" while get_budget_health (MAX semantics) said healthy.
    expect(items[0].spendAsOf).toBe('2026-08-25')
  })

  it('still surfaces the lag signal through oldestSyncedAt, not spendAsOf', () => {
    const items = buildSpendSummaryItems([
      row({ last_synced_at: '2026-08-25T06:00:00Z', oldest_synced_at: '2026-08-25T06:00:00Z' }),
      row({ last_synced_at: '2026-08-10T06:00:00Z', oldest_synced_at: '2026-08-10T06:00:00Z', spend_as_of: '2026-08-09', spend_ids: ['ms2'] }),
    ])
    expect(items[0].oldestSyncedAt).toBe('2026-08-10T06:00:00Z')
    expect(items[0].lastSyncedAt).toBe('2026-08-25T06:00:00Z')
    expect(items[0].spendAsOf).toBe('2026-08-25')
  })

  it('falls back to the only available date when a group has one row', () => {
    const items = buildSpendSummaryItems([row({ spend_as_of: '2026-08-20' })])
    expect(items[0].spendAsOf).toBe('2026-08-20')
  })
})
