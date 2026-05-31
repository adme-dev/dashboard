/**
 * Analytics Metrics — pure computation functions shared across all analytics endpoints.
 * No DB access. Import this wherever you need computed metrics.
 */

export interface ComputedMetrics {
  cpc: number | null
  cpm: number | null
  ctr: number | null
  roas: number | null
  costPerConversion: number | null
  conversionRate: number | null
}

export interface PeriodChange {
  absolute: number
  percent: number | null
}

export interface PacingResult {
  pacingRatio: number
  projectedSpend: number
  status: 'on-track' | 'over' | 'under'
}

/**
 * Normalize a DB DATE value to a 'YYYY-MM-DD' string.
 * The DB driver may return a DATE column as a JS Date object (local midnight) OR a string;
 * naive `String(date).slice(0,10)` corrupts a Date into "Sun May 31" which reparses to year 2001.
 * Handles both shapes and returns null for empty/unparseable values.
 */
export function toDateOnly(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  const s = String(value)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

/**
 * Compute derived metrics from raw aggregates.
 * Returns null for metrics that can't be computed (e.g. no clicks → no CPC).
 */
export function computeMetrics(
  spend: number,
  impressions: number,
  clicks: number,
  conversions: number,
  revenue: number
): ComputedMetrics {
  return {
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    costPerConversion: conversions > 0 ? spend / conversions : null,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : null,
  }
}

/**
 * Compute change between current and previous period values.
 */
export function computeChange(current: number, previous: number): PeriodChange {
  const absolute = current - previous
  const percent = previous > 0 ? ((current - previous) / previous) * 100 : null
  return { absolute, percent }
}

/**
 * Compute spend pacing against budget.
 */
export function computePacing(
  spend: number,
  budget: number,
  daysElapsed: number,
  daysInMonth: number
): PacingResult {
  if (budget <= 0 || daysInMonth <= 0) {
    return { pacingRatio: 0, projectedSpend: 0, status: 'on-track' }
  }

  const expectedSpend = (budget / daysInMonth) * daysElapsed
  const pacingRatio = expectedSpend > 0 ? spend / expectedSpend : 0
  const projectedSpend = daysElapsed > 0 ? (spend / daysElapsed) * daysInMonth : 0

  let status: PacingResult['status'] = 'on-track'
  if (pacingRatio > 1.1) status = 'over'
  else if (pacingRatio < 0.85) status = 'under'

  return { pacingRatio, projectedSpend, status }
}

/** Consistent platform display names */
export const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  pinterest: 'Pinterest Ads',
  snapchat: 'Snapchat Ads',
  twitter: 'X (Twitter) Ads',
  microsoft_ads: 'Microsoft Ads',
}

/** Consistent platform colors for charts (dark-mode safe) */
export const PLATFORM_COLORS: Record<string, string> = {
  meta: '#1877F2',
  google_ads: '#4285F4',
  tiktok: '#69C9D0',
  linkedin: '#0A66C2',
  pinterest: '#E60023',
  snapchat: '#F7D731',
  twitter: '#1DA1F2',
  microsoft_ads: '#00A4EF',
}

/** All supported platform keys */
export const ALL_PLATFORMS = ['meta', 'google_ads', 'tiktok', 'linkedin', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads'] as const

export type PlatformKey = typeof ALL_PLATFORMS[number]

/**
 * Format a number as AUD currency string.
 */
export function formatCurrency(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Format large numbers compactly (e.g. 1.2K, 3.4M).
 */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(0)
}

/**
 * Build a SQL WHERE condition to match media_spend rows for a given client.
 * Checks 3 paths:
 *  1. Direct ms.client_id match
 *  2. social_connections.client_id (ad account → client link)
 *  3. ad_account_client_map (campaign-level mapping, if configured)
 *
 * @param paramIdx - The $N placeholder index for the clientId parameter
 * @returns SQL condition string (caller must push clientId into params at paramIdx)
 */
export function buildClientCondition(paramIdx: number): string {
  return `(
    ms.client_id = $${paramIdx}
    OR EXISTS (
      SELECT 1 FROM social_connections sc
      WHERE sc.id = ms.connection_id AND sc.client_id = $${paramIdx}
    )
    OR EXISTS (
      SELECT 1 FROM ad_account_client_map acm
      JOIN agency_clients ac ON ac.name = acm.xero_client_name
      WHERE ac.id = $${paramIdx}
        AND acm.connection_id = ms.connection_id
        AND (
          acm.campaign_id = ms.campaign_id
          OR (acm.campaign_name_pattern IS NOT NULL AND ms.campaign_name ILIKE '%' || acm.campaign_name_pattern || '%')
          OR (acm.campaign_id IS NULL AND acm.campaign_name_pattern IS NULL)
        )
    )
  )`
}

/**
 * Inclusive day-window WHERE fragment for the daily_spend grain.
 * Use with a `daily_spend ds JOIN media_spend ms ON ms.id = ds.media_spend_id`
 * source (the pattern funnel.get.ts uses) instead of the month-bucketed
 * `ms.period` filter, which silently widens sub-month windows to whole months.
 * Caller pushes the ISO start/end dates into params at the given indices.
 *
 * @example
 *   const where = `${dailySpendWindow(1, 2)} AND ${buildClientCondition(3)}`
 *   queryRows(`... WHERE ${where}`, [startDate, endDate, clientId])
 */
export function dailySpendWindow(startIdx: number, endIdx: number): string {
  return `ds.spend_date BETWEEN $${startIdx} AND $${endIdx}`
}

/**
 * Parse numeric DB values that may come as strings.
 */
export function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'string' ? parseFloat(val) : val
  return isNaN(n) ? 0 : n
}
