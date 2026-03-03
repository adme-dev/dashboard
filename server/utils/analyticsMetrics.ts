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

/** Consistent platform colors for charts */
export const PLATFORM_COLORS: Record<string, string> = {
  meta: '#1877F2',
  google_ads: '#4285F4',
  tiktok: '#010101',
  linkedin: '#0A66C2',
  pinterest: '#E60023',
  snapchat: '#FFFC00',
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
 * Parse numeric DB values that may come as strings.
 */
export function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'string' ? parseFloat(val) : val
  return isNaN(n) ? 0 : n
}
