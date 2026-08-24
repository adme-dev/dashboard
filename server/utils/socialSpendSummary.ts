import { labelSpendSummaryGroup } from '~~/server/utils/socialSpendAccuracy'

export interface SpendSummaryRow {
  platform: string | null
  client_id: string | null
  client_name: string | null
  account_id: string | null
  account_name: string | null
  sample_campaign_name: string | null
  client_ref: string | null
  owner_id: string | null
  owner_name: string | null
  total_budget: string | number | null
  total_spend: string | number | null
  total_commission: string | number | null
  total_impressions: string | number | null
  total_clicks: string | number | null
  total_conversions: string | number | null
  campaign_count: string | number | null
  budgeted_campaign_count?: string | number | null
  last_synced_at: string | null
  oldest_synced_at?: string | null
  spend_as_of?: string | null
  stale_row_count?: string | number | null
  spend_ids: Array<string | null> | null
  is_rolling: boolean | null
  commission_rate: string | number | null
}

export interface SpendSummaryItem {
  groupKey: string
  platform: string
  clientName: string
  clientCode: string | null
  owner: { id: string, name: string | null } | null
  budget: number
  spend: number
  commission: number
  variance: number
  variancePercent: number
  impressions: number
  clicks: number
  conversions: number
  campaignCount: number
  budgetedCampaignCount: number
  spendIds: string[]
  rolling: boolean
  commissionRate: number
  lastSyncedAt: string | null
  oldestSyncedAt: string | null
  spendAsOf: string | null
  staleRowCount: number
}

interface SummaryAccumulator {
  groupKey: string
  platform: string
  clientName: string | null
  accountName: string | null
  campaignName: string | null
  clientCode: string | null
  owner: { id: string, name: string | null } | null
  budget: number
  spend: number
  commission: number
  impressions: number
  clicks: number
  conversions: number
  campaignCount: number
  budgetedCampaignCount: number
  spendIds: string[]
  rolling: boolean
  commissionRate: number
  lastSyncedAt: string | null
  oldestSyncedAt: string | null
  spendAsOf: string | null
  staleRowCount: number
}

function numberValue(value: string | number | null | undefined): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

function intValue(value: string | number | null | undefined): number {
  return Math.trunc(numberValue(value))
}

function latestTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return b > a ? b : a
}

function oldestTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return b < a ? b : a
}

function rowGroupKey(row: SpendSummaryRow): string {
  const platform = row.platform || 'unknown'
  if (row.client_id) return `${platform}:client:${row.client_id}`

  const accountIdentity = row.account_id
    || row.account_name
    || row.sample_campaign_name
    || 'unknown'
  return `${platform}:unmapped:${accountIdentity}`
}

export function buildSpendSummaryItems(rows: SpendSummaryRow[]): SpendSummaryItem[] {
  const grouped = new Map<string, SummaryAccumulator>()

  for (const row of rows) {
    const groupKey = rowGroupKey(row)
    const platform = row.platform || 'unknown'
    const current = grouped.get(groupKey)
    const acc: SummaryAccumulator = current || {
      groupKey,
      platform,
      clientName: row.client_name || null,
      accountName: row.account_name || null,
      campaignName: row.sample_campaign_name || null,
      clientCode: row.client_ref || null,
      owner: row.owner_id ? { id: row.owner_id, name: row.owner_name || null } : null,
      budget: 0,
      spend: 0,
      commission: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      campaignCount: 0,
      budgetedCampaignCount: 0,
      spendIds: [],
      rolling: false,
      commissionRate: 0,
      lastSyncedAt: null,
      oldestSyncedAt: null,
      spendAsOf: null,
      staleRowCount: 0,
    }

    acc.budget += numberValue(row.total_budget)
    acc.spend += numberValue(row.total_spend)
    acc.commission += numberValue(row.total_commission)
    acc.impressions += intValue(row.total_impressions)
    acc.clicks += intValue(row.total_clicks)
    acc.conversions += intValue(row.total_conversions)
    acc.campaignCount += intValue(row.campaign_count)
    acc.budgetedCampaignCount += intValue(row.budgeted_campaign_count)
    acc.rolling = acc.rolling || Boolean(row.is_rolling)
    acc.commissionRate = Math.max(acc.commissionRate, numberValue(row.commission_rate))
    acc.lastSyncedAt = latestTimestamp(acc.lastSyncedAt, row.last_synced_at || null)
    acc.oldestSyncedAt = oldestTimestamp(acc.oldestSyncedAt, row.oldest_synced_at || row.last_synced_at || null)
    // Newest provider-reported spend date across the group. MUST match budget-alerts/health.get.ts's
    // MAX() semantics: taking the oldest here let a single dormant campaign drag a client's pacing
    // data-clock back weeks, so get_adspend_pacing called current data "overpacing" while
    // get_budget_health called the same row healthy (2026-08-25 daily-check incident).
    acc.spendAsOf = latestTimestamp(acc.spendAsOf, row.spend_as_of || null)
    acc.staleRowCount += intValue(row.stale_row_count)

    if (!acc.owner && row.owner_id) {
      acc.owner = { id: row.owner_id, name: row.owner_name || null }
    }
    if (!acc.clientCode && row.client_ref) acc.clientCode = row.client_ref
    if (!acc.clientName && row.client_name) acc.clientName = row.client_name
    if (!acc.accountName && row.account_name) acc.accountName = row.account_name
    if (!acc.campaignName && row.sample_campaign_name) acc.campaignName = row.sample_campaign_name

    for (const id of row.spend_ids || []) {
      if (id && !acc.spendIds.includes(id)) acc.spendIds.push(id)
    }

    grouped.set(groupKey, acc)
  }

  return [...grouped.values()]
    .map(acc => {
      const variance = acc.budget > 0 ? acc.spend - acc.budget : 0
      const variancePercent = acc.budget > 0 ? ((acc.spend - acc.budget) / acc.budget) * 100 : 0

      return {
        groupKey: acc.groupKey,
        platform: acc.platform,
        clientName: labelSpendSummaryGroup({
          clientName: acc.clientName,
          accountName: acc.accountName,
          campaignName: acc.campaignName,
          platform: acc.platform,
        }),
        clientCode: acc.clientCode,
        owner: acc.owner,
        budget: Math.round(acc.budget * 100) / 100,
        spend: Math.round(acc.spend * 100) / 100,
        commission: Math.round(acc.commission * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variancePercent: Math.round(variancePercent * 10) / 10,
        impressions: acc.impressions,
        clicks: acc.clicks,
        conversions: acc.conversions,
        campaignCount: acc.campaignCount,
        budgetedCampaignCount: acc.budgetedCampaignCount,
        spendIds: acc.spendIds,
        rolling: acc.rolling,
        commissionRate: acc.commissionRate,
        lastSyncedAt: acc.lastSyncedAt,
        oldestSyncedAt: acc.oldestSyncedAt,
        spendAsOf: acc.spendAsOf,
        staleRowCount: acc.staleRowCount,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

export function buildSpendSummaryTotals(summary: SpendSummaryItem[]) {
  return {
    budget: summary.reduce((s, r) => s + r.budget, 0),
    spend: summary.reduce((s, r) => s + r.spend, 0),
    commission: summary.reduce((s, r) => s + r.commission, 0),
    variance: summary.reduce((s, r) => s + r.variance, 0),
  }
}
