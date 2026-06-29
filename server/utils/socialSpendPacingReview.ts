import { computeCampaignBudgetPacing } from '~~/server/utils/budgetPacing'
import { SPEND_BUDGET_ACTION_SYNC_STALE_HOURS, spendSyncAgeHours } from '~~/server/utils/spendSyncFreshness'
import {
  parseSocialCampaignFeedbackSummary,
  type SocialCampaignFeedbackSummary
} from '~~/server/utils/socialInbox/campaignFeedback'

export type PacingReviewPlatform = 'meta' | 'google'
export type PacingReviewIssueType
  = | 'overpacing'
    | 'underpacing'
    | 'no_spend'
    | 'paused_with_budget'
    | 'stale_sync'
    | 'zero_conversion'
    | 'negative_social_feedback'
export type PacingReviewSeverity = 'critical' | 'warning' | 'info'

export interface PacingReviewRow {
  media_spend_id: string
  client_name: string | null
  platform: string
  campaign_id: string | null
  campaign_name: string | null
  campaign_status: string | null
  budget_allocated: number | string | null
  actual_spend: number | string | null
  impressions: number | string | null
  clicks: number | string | null
  conversions: number | string | null
  reach: number | string | null
  frequency: number | string | null
  impression_share: number | string | null
  lost_impression_share_budget: number | string | null
  lost_impression_share_rank: number | string | null
  bid_strategy: string | null
  budget_type: string | null
  period: string
  synced_at: string | null
  end_date: string | null
  social_feedback_count?: number | string | null
  social_negative_feedback_count?: number | string | null
  social_feedback_latest_at?: string | null
  social_feedback_examples?: unknown
}

/**
 * The exact `media_spend` column projection that maps onto `PacingReviewRow`.
 * Shared by every endpoint that builds a pacing review (the list at
 * pacing-review.get.ts and the single-campaign ai-analysis.post.ts) so the two
 * SELECTs can't drift. Assumes `media_spend ms LEFT JOIN agency_clients ac`.
 */
export const PACING_REVIEW_SELECT_COLUMNS = `
  ms.id::text AS media_spend_id,
  COALESCE(ac.name, ms.campaign_name, 'Unknown') AS client_name,
  ms.platform,
  ms.campaign_id,
  ms.campaign_name,
  ms.campaign_status,
  ms.budget_allocated,
  ms.actual_spend,
  ms.impressions,
  ms.clicks,
  ms.conversions,
  ms.reach,
  ms.frequency,
  ms.impression_share,
  ms.lost_impression_share_budget,
  ms.lost_impression_share_rank,
  ms.bid_strategy,
  ms.budget_type,
  ms.period,
  ms.synced_at,
  ms.end_date`

export interface PacingReviewPerformance {
  impressions: number
  clicks: number
  conversions: number
  ctr: number | null
  cpc: number | null
  costPerConversion: number | null
  conversionRate: number | null
  reach: number | null
  frequency: number | null
  impressionShare: number | null
  lostImpressionShareBudget: number | null
  lostImpressionShareRank: number | null
  bidStrategy: string | null
  budgetType: string | null
}

export interface PacingReviewItem {
  mediaSpendId: string
  clientName: string
  platform: PacingReviewPlatform
  campaignId: string | null
  campaignName: string
  campaignStatus: string | null
  issueType: PacingReviewIssueType
  severity: PacingReviewSeverity
  budget: number
  mtdSpend: number
  expectedToDate: number
  projectedMonthEnd: number
  currentDailyBudget: number
  recommendedDailyBudget: number
  pacingRatio: number
  performance: PacingReviewPerformance
  syncedAt: string | null
  recommendedAction: string
  canApplyAutomatically: false
  socialFeedback?: SocialCampaignFeedbackSummary
}

export interface PacingReviewSummary {
  criticalCount: number
  warningCount: number
  infoCount: number
  staleCount: number
  projectedOverspend: number
  projectedUnderspend: number
}

export interface PacingReviewResult {
  period: string
  generatedAt: string
  items: PacingReviewItem[]
  summary: PacingReviewSummary
}

const PAUSED_STATUS_TOKENS = ['paused', 'removed', 'disabled', 'archived']

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function pct(value: number): number {
  return Math.round(value * 100) / 100
}

function nullableNum(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizePlatform(platform: string): PacingReviewPlatform | null {
  if (platform === 'meta') return 'meta'
  if (platform === 'google' || platform === 'google_ads') return 'google'
  return null
}

function parsePeriod(period: string): { year: number, month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
  return { year: Number(match[1]), month: Number(match[2]) }
}

function daysInPeriod(period: string): number {
  const { year, month } = parsePeriod(period)
  return new Date(year, month, 0).getDate()
}

function elapsedDaysForPeriod(period: string, now: Date): number {
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (period === currentPeriod) return now.getDate()
  return daysInPeriod(period)
}

function expectedToDate(budget: number, period: string, now: Date): number {
  const elapsed = elapsedDaysForPeriod(period, now)
  return money(budget * (elapsed / daysInPeriod(period)))
}

function projectedMonthEnd(spend: number, period: string, now: Date): number {
  const elapsed = elapsedDaysForPeriod(period, now)
  return elapsed > 0 ? money(spend * (daysInPeriod(period) / elapsed)) : 0
}

function isPausedStatus(status: string | null): boolean {
  const normalized = (status ?? '').toLowerCase()
  return PAUSED_STATUS_TOKENS.some(token => normalized.includes(token))
}

function performanceFromRow(row: PacingReviewRow, spend: number): PacingReviewPerformance {
  const impressions = num(row.impressions)
  const clicks = num(row.clicks)
  const conversions = num(row.conversions)
  return {
    impressions,
    clicks,
    conversions,
    ctr: impressions > 0 ? pct((clicks / impressions) * 100) : null,
    cpc: clicks > 0 ? money(spend / clicks) : null,
    costPerConversion: conversions > 0 ? money(spend / conversions) : null,
    conversionRate: clicks > 0 ? pct((conversions / clicks) * 100) : null,
    reach: nullableNum(row.reach),
    frequency: nullableNum(row.frequency),
    impressionShare: nullableNum(row.impression_share),
    lostImpressionShareBudget: nullableNum(row.lost_impression_share_budget),
    lostImpressionShareRank: nullableNum(row.lost_impression_share_rank),
    bidStrategy: row.bid_strategy,
    budgetType: row.budget_type
  }
}

function socialFeedbackFromRow(row: PacingReviewRow): SocialCampaignFeedbackSummary | null {
  return parseSocialCampaignFeedbackSummary({
    totalCount: row.social_feedback_count,
    negativeCount: row.social_negative_feedback_count,
    latestAt: row.social_feedback_latest_at,
    examples: row.social_feedback_examples
  })
}

function baseItem(row: PacingReviewRow, issueType: PacingReviewIssueType, severity: PacingReviewSeverity, now: Date): PacingReviewItem | null {
  const platform = normalizePlatform(row.platform)
  if (!platform) return null
  const budget = money(num(row.budget_allocated))
  const spend = money(num(row.actual_spend))
  const socialFeedback = socialFeedbackFromRow(row)
  const pacing = computeCampaignBudgetPacing({
    monthlyBudget: budget,
    mtdSpend: spend,
    period: row.period,
    now,
    campaignStatus: row.campaign_status,
    endDate: row.end_date
  })
  return {
    mediaSpendId: row.media_spend_id,
    clientName: row.client_name || '(unknown client)',
    platform,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || '(unknown campaign)',
    campaignStatus: row.campaign_status,
    issueType,
    severity,
    budget,
    mtdSpend: spend,
    expectedToDate: expectedToDate(budget, row.period, now),
    projectedMonthEnd: projectedMonthEnd(spend, row.period, now),
    currentDailyBudget: pacing.currentDailyBudget,
    recommendedDailyBudget: pacing.newDailyBudget,
    pacingRatio: pacing.pacingRatio,
    performance: performanceFromRow(row, spend),
    syncedAt: row.synced_at,
    recommendedAction: '',
    canApplyAutomatically: false,
    ...(socialFeedback ? { socialFeedback } : {})
  }
}

function withAction(item: PacingReviewItem): PacingReviewItem {
  const actionByIssue: Record<PacingReviewIssueType, string> = {
    overpacing: 'Review delivery and reduce daily budget or cap spend to land on the monthly budget.',
    underpacing: 'Review delivery constraints and increase delivery, broaden targeting, or reallocate budget before month-end.',
    no_spend: 'Check campaign setup, billing, policy status, and tracking because budget is allocated but no spend is recorded.',
    paused_with_budget: 'Re-enable the campaign or move the allocated budget to an active campaign.',
    stale_sync: 'Sync spend before acting; current pacing may be based on stale platform data.',
    zero_conversion: 'Check conversion tracking and campaign objective before allowing more budget to run.',
    negative_social_feedback: 'Review recent social comments or reviews before scaling budget, creative, or audience delivery.'
  }
  return { ...item, recommendedAction: actionByIssue[item.issueType] }
}

export function summarizePacingReview(items: PacingReviewItem[]): PacingReviewSummary {
  return {
    criticalCount: items.filter(i => i.severity === 'critical').length,
    warningCount: items.filter(i => i.severity === 'warning').length,
    infoCount: items.filter(i => i.severity === 'info').length,
    staleCount: items.filter(i => i.issueType === 'stale_sync').length,
    projectedOverspend: money(items
      .filter(i => i.issueType === 'overpacing')
      .reduce((sum, i) => sum + Math.max(0, i.projectedMonthEnd - i.budget), 0)),
    projectedUnderspend: money(items
      .filter(i => i.issueType === 'underpacing' || i.issueType === 'no_spend')
      .reduce((sum, i) => sum + Math.max(0, i.budget - i.projectedMonthEnd), 0))
  }
}

export function buildPacingReview(rows: PacingReviewRow[], opts: { now?: Date, period: string }): PacingReviewResult {
  const now = opts.now ?? new Date()
  const items: PacingReviewItem[] = []

  for (const row of rows) {
    const budget = num(row.budget_allocated)
    const spend = num(row.actual_spend)
    const conversions = num(row.conversions)
    if (!normalizePlatform(row.platform) || row.period !== opts.period) continue

    const pacing = computeCampaignBudgetPacing({
      monthlyBudget: budget,
      mtdSpend: spend,
      period: row.period,
      now,
      campaignStatus: row.campaign_status,
      endDate: row.end_date
    })

    if (spendSyncAgeHours(row.synced_at, now) >= SPEND_BUDGET_ACTION_SYNC_STALE_HOURS && budget > 0) {
      const severity = spendSyncAgeHours(row.synced_at, now) >= 72 ? 'critical' : 'warning'
      const item = baseItem(row, 'stale_sync', severity, now)
      if (item) items.push(withAction(item))
    }

    if (budget > 0 && isPausedStatus(row.campaign_status)) {
      const item = baseItem(row, 'paused_with_budget', 'critical', now)
      if (item) items.push(withAction(item))
    }

    if (pacing.pacingStatus === 'critical_over_pacing' || pacing.pacingStatus === 'warning_over_pacing') {
      const item = baseItem(row, 'overpacing', pacing.pacingStatus === 'critical_over_pacing' ? 'critical' : 'warning', now)
      if (item) items.push(withAction(item))
    }

    if (pacing.pacingStatus === 'warning_under_pacing') {
      const item = baseItem(row, 'underpacing', 'warning', now)
      if (item) items.push(withAction(item))
    }

    if (pacing.pacingStatus === 'no_spend') {
      const item = baseItem(row, 'no_spend', 'critical', now)
      if (item) items.push(withAction(item))
    }

    if (now.getDate() >= 10 && budget > 0 && spend > 500 && conversions <= 0) {
      const item = baseItem(row, 'zero_conversion', 'warning', now)
      if (item) items.push(withAction(item))
    }

    const socialFeedback = socialFeedbackFromRow(row)
    if (budget > 0 && !isPausedStatus(row.campaign_status) && (socialFeedback?.negativeCount ?? 0) > 0) {
      const item = baseItem(row, 'negative_social_feedback', 'warning', now)
      if (item) items.push(withAction(item))
    }
  }

  items.sort((a, b) => {
    const severityRank: Record<PacingReviewSeverity, number> = { critical: 0, warning: 1, info: 2 }
    return severityRank[a.severity] - severityRank[b.severity]
      || Math.max(0, b.projectedMonthEnd - b.budget) - Math.max(0, a.projectedMonthEnd - a.budget)
      || a.clientName.localeCompare(b.clientName)
  })

  return {
    period: opts.period,
    generatedAt: now.toISOString(),
    items,
    summary: summarizePacingReview(items)
  }
}
