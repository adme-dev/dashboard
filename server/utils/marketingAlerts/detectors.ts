// Pure detectors for the marketing alerts pipeline. Each takes rows already loaded from the
// database (see sources.ts) and returns DetectedMarketingAlert[]. No I/O, no actions: every alert's
// next step is a question a person asks Claude via a read-only MCP tool.
import { computeCampaignBudgetPacing } from '~~/server/utils/budgetPacing'
import type { MarketingAlertsThresholds } from './config'
import type { DetectedMarketingAlert, MarketingAlertSeverity } from './types'

const money = (value: number): string =>
  `$${(Math.round(value * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const n = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const platformLabel = (platform: string | null | undefined): string => {
  switch (platform) {
    case 'google_ads':
    case 'google': return 'Google Ads'
    case 'meta': return 'Meta'
    default: return platform ? platform.replace(/_/g, ' ') : 'Ad platform'
  }
}
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown'
const clientLabel = (name: string | null | undefined): string => name || 'Unmapped client'
const clientLink = (clientId: string | null, fallback: string): string => clientId ? `/agency/clients/${clientId}` : fallback

function ageHours(iso: string | null | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const at = Date.parse(iso)
  return Number.isFinite(at) ? (now.getTime() - at) / 3_600_000 : Number.POSITIVE_INFINITY
}

const INACTIVE_STATUSES = new Set(['PAUSED', 'REMOVED', 'ARCHIVED', 'DELETED', 'ENDED', 'COMPLETED'])
const isInactive = (status: string | null | undefined): boolean => !!status && INACTIVE_STATUSES.has(status.toUpperCase())

// ── (1) Budget pacing ──────────────────────────────────────────────────────────────────────

export interface PacingRow {
  media_spend_id: string
  client_id: string | null
  client_name: string | null
  platform: string
  account_id: string | null
  account_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  campaign_status: string | null
  end_date: string | null
  budget_rolling: boolean | null
  monthly_budget: number | string | null
  mtd_spend: number | string | null
  spend_as_of: string | null
  synced_at: string | null
}

export function detectBudgetPacing(
  rows: PacingRow[],
  opts: { period: string, now: Date, thresholds: MarketingAlertsThresholds }
): DetectedMarketingAlert[] {
  const t = opts.thresholds
  const alerts: DetectedMarketingAlert[] = []
  for (const row of rows) {
    // Stale rows would produce confident-but-wrong pacing; the spend_sync source reports staleness.
    if (ageHours(row.synced_at, opts.now) > t.pacingMaxSyncAgeHours) continue
    const monthlyBudget = n(row.monthly_budget)
    const mtdSpend = n(row.mtd_spend)
    const pacing = computeCampaignBudgetPacing({
      monthlyBudget,
      mtdSpend,
      period: opts.period,
      now: opts.now,
      spendAsOf: row.spend_as_of ?? row.synced_at,
      campaignStatus: row.campaign_status,
      endDate: row.end_date
    })
    if (pacing.pacingStatus === 'campaign_ended') continue

    const client = clientLabel(row.client_name)
    const campaign = row.campaign_name || row.campaign_id || 'Unnamed campaign'
    const where = `${client} · ${platformLabel(row.platform)} · ${campaign}`
    const base = {
      source: 'budget_pacing' as const,
      clientId: row.client_id,
      clientName: row.client_name,
      platform: row.platform,
      accountRef: row.account_id ?? row.account_name,
      campaignRef: row.campaign_id ?? row.campaign_name,
      mcpTool: 'get_budget_health',
      deepLink: '/agency/budget-health',
      evidence: {
        mediaSpendId: row.media_spend_id,
        period: opts.period,
        monthlyBudget: pacing.monthlyBudget,
        mtdSpend: pacing.mtdSpend,
        pacingRatio: pacing.pacingRatio,
        budgetConsumedPct: pacing.budgetConsumedPct,
        monthElapsedPct: pacing.monthElapsedPct,
        spendAsOf: pacing.spendAsOf
      }
    }

    if (monthlyBudget <= 0) {
      if (mtdSpend < t.noBudgetMinSpend || isInactive(row.campaign_status)) continue
      alerts.push({
        ...base,
        dedupeKey: `pacing:no_budget:${row.media_spend_id}:${opts.period}`,
        kind: 'no_budget',
        severity: 'warning',
        summary: `${where} has spent ${money(mtdSpend)} this month with no budget set in XeroFlow, so pacing can't be checked.`,
        nextStep: `Ask Claude: "what budget should ${client}'s ${campaign} campaign have this month?" (read-only: get_budget_health)`
      })
      continue
    }
    if (row.budget_rolling) continue // rolling budgets don't pace against a calendar month

    const ratio = pacing.pacingRatio
    const underPacing = !isInactive(row.campaign_status) && pacing.elapsedDays > t.underPacingMinDay && ratio <= t.underPacingWarningRatio
    const severity: MarketingAlertSeverity | null = ratio >= t.overPacingCriticalRatio
      ? 'critical'
      : ratio >= t.overPacingWarningRatio || underPacing ? 'warning' : null
    if (!severity) continue
    const kind = ratio >= t.overPacingWarningRatio ? 'over_pacing' : 'under_pacing'

    const over = kind === 'over_pacing'
    alerts.push({
      ...base,
      // Severity is not in the key: a warning that escalates to critical stays the same alert.
      dedupeKey: `pacing:${kind}:${row.media_spend_id}:${opts.period}`,
      kind,
      severity,
      summary: `${where} is ${over ? 'over' : 'under'}-pacing: ${pacing.budgetConsumedPct}% of the ${money(monthlyBudget)} budget spent with ${pacing.monthElapsedPct}% of the month elapsed (pace ${ratio}×).`,
      nextStep: `Ask Claude: "check pacing for ${client} ${campaign} and suggest a daily budget" (read-only: check_pacing / get_budget_health)`
    })
  }
  return alerts
}

// ── (2) Open anomalies for marketing clients ───────────────────────────────────────────────

export interface AnomalyRow {
  id: string
  type: string
  severity: string
  title: string
  description: string | null
  fingerprint: string
  client_id: string | null
  client_name: string | null
  platform: string | null
}

/** Fingerprints the pacing detector already covers — skipped so one condition alerts once. */
export const PACING_COVERED_ANOMALY_PREFIXES = ['adspend:budget-unset-', 'adspend:overspend-', 'adspend:underspend-']

export function detectOpenAnomalies(rows: AnomalyRow[]): DetectedMarketingAlert[] {
  const alerts: DetectedMarketingAlert[] = []
  for (const row of rows) {
    if (row.severity !== 'critical' && row.severity !== 'warning') continue
    if (PACING_COVERED_ANOMALY_PREFIXES.some(prefix => row.fingerprint.startsWith(prefix))) continue
    const client = clientLabel(row.client_name)
    alerts.push({
      dedupeKey: `anomaly:${row.id}`,
      source: 'anomaly',
      kind: row.type,
      severity: row.severity,
      clientId: row.client_id,
      clientName: row.client_name,
      platform: row.platform,
      accountRef: null,
      campaignRef: null,
      summary: `${row.title}${row.description ? ` — ${row.description}` : ''}`.slice(0, 500),
      nextStep: `Ask Claude: "explain the open anomalies for ${client} and what to check first" (read-only: get_open_anomalies)`,
      mcpTool: 'get_open_anomalies',
      deepLink: '/anomalies',
      evidence: { anomalyId: row.id, fingerprint: row.fingerprint, anomalyType: row.type }
    })
  }
  return alerts
}

// ── (3) Google policy-limited campaigns / ads ──────────────────────────────────────────────

export interface PolicyCampaignRow {
  media_spend_id: string
  client_id: string | null
  client_name: string | null
  account_id: string | null
  campaign_id: string | null
  campaign_name: string | null
  campaign_status: string | null
  serving_status: string | null
  reasons: string[] | null
}

export interface PolicyAdRow {
  media_spend_id: string
  client_id: string | null
  client_name: string | null
  account_id: string | null
  campaign_id: string | null
  campaign_name: string | null
  ad_id: string
  ad_name: string | null
  approval_status: string | null
  policy_issues: unknown
}

const isPolicyReason = (reason: string): boolean => /POLICY|DISAPPROV/.test(reason.toUpperCase())
const isBudgetReason = (reason: string): boolean => /LIMITED_BY_BUDGET|BUDGET_CONSTRAINED/.test(reason.toUpperCase())

export function detectGooglePolicy(campaigns: PolicyCampaignRow[], ads: PolicyAdRow[]): DetectedMarketingAlert[] {
  const alerts: DetectedMarketingAlert[] = []
  for (const row of campaigns) {
    if (isInactive(row.campaign_status) || isInactive(row.serving_status)) continue
    const reasons = [...new Set((row.reasons ?? []).filter(Boolean))]
    const client = clientLabel(row.client_name)
    const campaign = row.campaign_name || row.campaign_id || 'Unnamed campaign'
    const base = {
      source: 'google_policy' as const,
      clientId: row.client_id,
      clientName: row.client_name,
      platform: 'google_ads',
      accountRef: row.account_id,
      campaignRef: row.campaign_id ?? row.campaign_name,
      deepLink: clientLink(row.client_id, '/agency/social/google'),
      evidence: { mediaSpendId: row.media_spend_id, servingStatus: row.serving_status, reasons }
    }
    const policy = reasons.filter(isPolicyReason)
    if (policy.length) {
      alerts.push({
        ...base,
        dedupeKey: `policy:campaign:${row.media_spend_id}`,
        kind: 'policy_limited',
        severity: 'warning',
        summary: `${client} · Google Ads · ${campaign} is limited by Google policy (${policy.join(', ')}); some ads or assets aren't serving.`,
        nextStep: `Ask Claude: "which ads or assets in ${client}'s ${campaign} are limited by policy, and why?" (read-only: google_ads_list_ads / google_ads_list_assets)`,
        mcpTool: 'google_ads_list_ads'
      })
    }
    if (reasons.some(isBudgetReason)) {
      // Informational: the budget is the constraint, not a fault. Digest-only.
      alerts.push({
        ...base,
        dedupeKey: `policy:budget_limited:${row.media_spend_id}`,
        kind: 'budget_limited',
        severity: 'info',
        summary: `${client} · Google Ads · ${campaign} is limited by budget (Google could spend more if the budget allowed).`,
        nextStep: `Ask Claude: "is ${client}'s ${campaign} worth more budget, given pacing?" (read-only: get_budget_health)`,
        mcpTool: 'get_budget_health'
      })
    }
  }
  for (const row of ads) {
    const status = (row.approval_status ?? '').toUpperCase()
    if (!/DISAPPROVED|LIMITED/.test(status)) continue
    const client = clientLabel(row.client_name)
    const campaign = row.campaign_name || row.campaign_id || 'Unnamed campaign'
    const ad = row.ad_name || row.ad_id
    alerts.push({
      dedupeKey: `policy:ad:${row.media_spend_id}:${row.ad_id}`,
      source: 'google_policy',
      kind: status.includes('DISAPPROVED') ? 'ad_disapproved' : 'ad_policy_limited',
      severity: 'warning',
      clientId: row.client_id,
      clientName: row.client_name,
      platform: 'google_ads',
      accountRef: row.account_id,
      campaignRef: row.campaign_id ?? row.campaign_name,
      summary: `${client} · Google Ads · ${campaign}: ad "${ad}" is ${status.includes('DISAPPROVED') ? 'disapproved' : 'approved (limited)'} by Google policy.`,
      nextStep: `Ask Claude: "why is the ad ${ad} in ${client}'s ${campaign} ${status.includes('DISAPPROVED') ? 'disapproved' : 'limited'}?" (read-only: google_ads_list_ads)`,
      mcpTool: 'google_ads_list_ads',
      deepLink: clientLink(row.client_id, '/agency/social/google'),
      evidence: { mediaSpendId: row.media_spend_id, adId: row.ad_id, approvalStatus: row.approval_status, policyIssues: row.policy_issues ?? null }
    })
  }
  return alerts
}

// ── (4) Spend-sync failures and staleness ──────────────────────────────────────────────────

export interface SyncJobRow {
  platform: string
  status: string
  failures: unknown
  error: string | null
  coverage_failed: boolean | null
  started_at: string
  last_success_at: string | null
}

function classifySyncFailure(reason: string): { kind: string, severity: MarketingAlertSeverity, plain: string } {
  if (/\b403\b|access denied|manager link|permission/i.test(reason)) {
    return { kind: 'access_denied', severity: 'critical', plain: 'XeroFlow lost access to this ad account (403 — usually a broken manager link or revoked access), so its spend is no longer updating' }
  }
  if (/coverage halt|coverage/i.test(reason)) {
    return { kind: 'coverage_halt', severity: 'warning', plain: 'the provider returned fewer campaigns than last time, so XeroFlow refused to overwrite the stored spend (it may be stale)' }
  }
  if (/token|expired|reauth|oauth|401/i.test(reason)) {
    return { kind: 'auth_expired', severity: 'critical', plain: 'the connection needs re-authorising before spend can sync' }
  }
  return { kind: 'sync_error', severity: 'warning', plain: 'the last spend sync failed for this account' }
}

/** Only the newest job per platform is passed in; older failures that have since cleared resolve. */
export function detectSpendSyncFailures(
  jobs: SyncJobRow[],
  opts: { now: Date, thresholds: MarketingAlertsThresholds }
): DetectedMarketingAlert[] {
  const alerts: DetectedMarketingAlert[] = []
  for (const job of jobs) {
    if (!['google', 'google_ads', 'meta'].includes(job.platform)) continue
    const label = platformLabel(job.platform)
    const platform = job.platform === 'google' ? 'google_ads' : job.platform
    const failures = Array.isArray(job.failures) ? job.failures as Array<{ account?: unknown, reason?: unknown }> : []
    const seen = new Set<string>()
    for (const failure of failures) {
      const account = typeof failure?.account === 'string' && failure.account.trim() ? failure.account.trim() : 'Unknown account'
      const reason = typeof failure?.reason === 'string' ? failure.reason.slice(0, 300) : 'Unknown error'
      const cls = classifySyncFailure(reason)
      const dedupeKey = `sync:${platform}:${cls.kind}:${slug(account)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      alerts.push({
        dedupeKey,
        source: 'spend_sync',
        kind: cls.kind,
        severity: cls.severity,
        clientId: null,
        clientName: null,
        platform,
        accountRef: account,
        campaignRef: null,
        summary: `${label} spend sync · ${account}: ${cls.plain}.`,
        nextStep: `Ask Claude: "what's the ${label} sync status for ${account}?" (read-only: get_sync_status)`,
        mcpTool: 'get_sync_status',
        deepLink: '/agency/social/spend',
        evidence: { reason, jobStartedAt: job.started_at, jobStatus: job.status }
      })
    }
    if (job.status === 'failed' && failures.length === 0) {
      alerts.push({
        dedupeKey: `sync:${platform}:job_failed`,
        source: 'spend_sync',
        kind: 'job_failed',
        severity: 'warning',
        clientId: null,
        clientName: null,
        platform,
        accountRef: null,
        campaignRef: null,
        summary: `The latest ${label} spend sync failed${job.error ? `: ${job.error.slice(0, 200)}` : ''}.`,
        nextStep: `Ask Claude: "why did the last ${label} spend sync fail?" (read-only: get_sync_status)`,
        mcpTool: 'get_sync_status',
        deepLink: '/agency/social/spend',
        evidence: { error: job.error, jobStartedAt: job.started_at }
      })
    }
    const hours = ageHours(job.last_success_at, opts.now)
    if (hours > opts.thresholds.syncStaleHours) {
      alerts.push({
        dedupeKey: `sync:${platform}:stale`,
        source: 'spend_sync',
        kind: 'stale',
        severity: 'critical',
        clientId: null,
        clientName: null,
        platform,
        accountRef: null,
        campaignRef: null,
        summary: Number.isFinite(hours)
          ? `${label} spend hasn't synced successfully for ${Math.round(hours)} hours — pacing and budget numbers for every ${label} client are stale.`
          : `${label} spend has never synced successfully — there is no ${label} spend data to pace against.`,
        nextStep: `Ask Claude: "is the ${label} spend sync healthy?" (read-only: get_sync_status)`,
        mcpTool: 'get_sync_status',
        deepLink: '/agency/social/spend',
        evidence: { lastSuccessAt: job.last_success_at, thresholdHours: opts.thresholds.syncStaleHours }
      })
    }
  }
  return alerts
}

// ── (5) Wasted search-term spend ───────────────────────────────────────────────────────────

export interface SearchTermRow {
  media_spend_id: string
  client_id: string | null
  client_name: string | null
  account_id: string | null
  campaign_id: string | null
  campaign_name: string | null
  campaign_conversions: number | string | null
  search_term: string
  targeting_status: string | null
  clicks: number | string | null
  cost: number | string | null
  range_start: string
  range_end: string
}

const MANAGED_TARGETING = new Set(['ADDED', 'EXCLUDED', 'ADDED_EXCLUDED'])

/**
 * Stored search-term snapshots carry cost and clicks but not per-term conversions, so "wasted" is
 * deliberately conservative: unmanaged terms (not added as keywords, not excluded) costing at least
 * the per-term threshold, in a campaign with zero recorded conversions this period, totalling at
 * least the per-campaign threshold. One alert per campaign.
 */
export function detectWastedSearchTerms(rows: SearchTermRow[], thresholds: MarketingAlertsThresholds): DetectedMarketingAlert[] {
  const byCampaign = new Map<string, SearchTermRow[]>()
  for (const row of rows) {
    if (n(row.campaign_conversions) > 0) continue
    if (MANAGED_TARGETING.has((row.targeting_status ?? '').toUpperCase())) continue
    if (n(row.cost) < thresholds.searchTermMinTermCost || n(row.clicks) <= 0) continue
    const list = byCampaign.get(row.media_spend_id) ?? []
    list.push(row)
    byCampaign.set(row.media_spend_id, list)
  }
  const alerts: DetectedMarketingAlert[] = []
  for (const [mediaSpendId, terms] of byCampaign) {
    const total = terms.reduce((sum, term) => sum + n(term.cost), 0)
    if (total < thresholds.searchTermWastedCampaignTotal) continue
    const first = terms[0]!
    const top = [...terms].sort((a, b) => n(b.cost) - n(a.cost)).slice(0, 3)
    const client = clientLabel(first.client_name)
    const campaign = first.campaign_name || first.campaign_id || 'Unnamed campaign'
    alerts.push({
      dedupeKey: `search_terms:wasted:${mediaSpendId}:${first.range_start}`,
      source: 'search_terms',
      kind: 'wasted_spend',
      severity: 'warning',
      clientId: first.client_id,
      clientName: first.client_name,
      platform: 'google_ads',
      accountRef: first.account_id,
      campaignRef: first.campaign_id ?? first.campaign_name,
      summary: `${client} · Google Ads · ${campaign}: ${money(total)} on ${terms.length} search term(s) with no conversions recorded (${first.range_start} to ${first.range_end}), e.g. ${top.map(t => `"${t.search_term}" ${money(n(t.cost))}`).join(', ')}.`,
      nextStep: `Ask Claude: "review search terms for ${client} ${campaign} — which ones look wasted?" (read-only: get_search_terms)`,
      mcpTool: 'get_search_terms',
      deepLink: clientLink(first.client_id, '/agency/social/google'),
      evidence: {
        mediaSpendId,
        rangeStart: first.range_start,
        rangeEnd: first.range_end,
        wastedTotal: Math.round(total * 100) / 100,
        termCount: terms.length,
        topTerms: top.map(t => ({ term: t.search_term, cost: n(t.cost), clicks: n(t.clicks) }))
      }
    })
  }
  return alerts
}
