// Pacing & delivery-health detectors over media_spend + daily_spend. Separate
// from adspend.ts (which detects spend SPIKES). Each detector is a pure
// function exported for unit testing; the analyser composes them. All emit
// type 'adspend' with month-level fingerprints so re-detection updates one row
// per campaign per month.
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'
import { periodOf, dayOfMonth, expectedToDate, projectedMonthEnd } from '../adPacingMath'
import { computeCampaignBudgetPacing } from '~~/server/utils/budgetPacing'

export interface DailyPoint { date: string; spend: number; conversions: number; leads?: number }
export interface Group {
  mediaSpendId: string
  clientId: string
  clientName: string
  platform: string
  campaignId?: string | null
  campaignName?: string
  period: string
  budget: number
  campaignStatus: string | null
  endDate: string | null
  syncedAt: string | null
  days: DailyPoint[]
}

interface HealthRow {
  client_id: string
  client_name: string | null
  platform: string
  spend_date: string
  spend: number | string
  media_spend_id: string
  budget_allocated: number | string
  period: string
  campaign_status: string | null
  end_date?: string | null
  synced_at: string | null
  conversions: number | string | null
  lead_count?: number | string | null
  campaign_id?: string | null
  campaign_name?: string | null
}

export interface AdPerformanceSignalRow {
  media_spend_id: string
  ad_id: string
  ad_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  client_id: string
  client_name: string | null
  platform: string
  range_start: string
  range_end: string
  spend: number | string
  impressions: number | string
  clicks: number | string
  frequency: number | string | null
  first_served_date: string | null
  previous_spend: number | string | null
  previous_impressions: number | string | null
  previous_clicks: number | string | null
  previous_frequency: number | string | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n).toLocaleString('en-US')

const mtd = (g: Group): number => g.days.reduce((s, d) => s + d.spend, 0)

export function buildGroups(rows: HealthRow[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  for (const r of rows) {
    if (!r.media_spend_id) continue
    let g = groups.get(r.media_spend_id)
    if (!g) {
      g = {
        mediaSpendId: r.media_spend_id,
        clientId: r.client_id,
        clientName: r.client_name ?? '(unknown client)',
        platform: r.platform,
        campaignId: r.campaign_id ?? null,
        campaignName: r.campaign_name ?? '(unnamed campaign)',
        period: r.period,
        budget: num(r.budget_allocated),
        campaignStatus: r.campaign_status,
        endDate: r.end_date ?? null,
        syncedAt: r.synced_at,
        days: [],
      }
      groups.set(r.media_spend_id, g)
    }
    g.days.push({ date: r.spend_date, spend: num(r.spend), conversions: num(r.conversions), leads: num(r.lead_count) })
  }
  return groups
}

export function detectUnderspend(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 7) return null

  const spent = mtd(g)
  const pacing = computeCampaignBudgetPacing({
    monthlyBudget: g.budget,
    mtdSpend: spent,
    period: g.period,
    now,
    campaignStatus: g.campaignStatus,
    endDate: g.endDate,
  })
  if (pacing.pacingStatus !== 'warning_under_pacing' && pacing.pacingStatus !== 'no_spend') return null

  const expected = expectedToDate(g.budget, now)
  if (expected <= 0) return null

  const ratio = spent / expected
  const severity = ratio < 0.25 ? 'critical' : 'warning'
  const shortfall = expected - spent
  const projected = projectedMonthEnd(spent, now)

  return {
    fingerprint: buildFingerprint('adspend', `underspend-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) underspending`,
    description: `Spent $${round(spent)} of an expected $${round(expected)} by day ${dayOfMonth(now)} — $${round(shortfall)} behind pace (tracking to $${round(projected)} of a $${round(g.budget)} budget). Current daily spend is $${round(pacing.currentDailyBudget)}; recommended daily budget is $${round(pacing.newDailyBudget)}.`,
    metric: { label: 'Month-to-date spend', value: spent, format: 'currency' },
    comparison: { label: 'Expected to date', value: expected, format: 'currency', trend: 'down' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Check delivery/targeting or reallocate budget — at this pace the client is under-served and budget will go unspent.',
    tags: ['ad spend', 'underspend', 'pacing', g.platform],
    dataSources: ['Daily Spend'],
  }
}

export function detectStopped(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget > 0) return null // underspend covers budgeted campaigns

  const sorted = [...g.days].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 6) return null

  const last3 = sorted.slice(-3)
  const baseline = sorted.slice(0, -3)
  const baselineDaily = baseline.reduce((s, d) => s + d.spend, 0) / baseline.length
  if (baselineDaily <= 5) return null

  const recent = last3.reduce((s, d) => s + d.spend, 0)
  if (recent >= baselineDaily * 3 * 0.1) return null

  return {
    fingerprint: buildFingerprint('adspend', `stopped-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'critical',
    title: `${g.clientName} (${g.platform}) stopped spending`,
    description: `Was averaging $${round(baselineDaily)}/day, then spent only $${round(recent)} over the last 3 days — effectively dark.`,
    metric: { label: 'Last 3 days spend', value: recent, format: 'currency' },
    comparison: { label: 'Baseline daily', value: baselineDaily, format: 'currency', trend: 'down' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Confirm the campaign is still live and delivering — spend has collapsed versus its recent baseline.',
    tags: ['ad spend', 'stopped', g.platform],
    dataSources: ['Daily Spend'],
  }
}

// Substring tokens, not exact statuses: Meta writes the campaign EFFECTIVE_STATUS
// (metaClient.ts → `effective_status || status`), which uses compound values like
// CAMPAIGN_PAUSED / ADSET_PAUSED. Google writes plain ENABLED / PAUSED / REMOVED.
// Matching by substring catches both — `adset_paused`.includes('paused') etc. —
// without false-positiving on active/with_issues/in_process/pending_review.
const PAUSED_STATUS_TOKENS = ['paused', 'removed', 'disabled', 'archived']

export function detectPausedWithBudget(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  const status = (g.campaignStatus ?? '').toLowerCase()
  if (!PAUSED_STATUS_TOKENS.some(t => status.includes(t))) return null

  const spent = mtd(g)
  const expected = expectedToDate(g.budget, now)
  const ratio = expected > 0 ? spent / expected : 1
  const severity = dayOfMonth(now) >= 7 && ratio < 0.5 ? 'critical' : 'warning'

  return {
    fingerprint: buildFingerprint('adspend', `paused-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) paused with budget allocated`,
    description: `Campaign status is "${g.campaignStatus}" but $${round(g.budget)} is allocated this month — it isn't running.`,
    metric: { label: 'Allocated budget', value: g.budget, format: 'currency' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Re-enable the campaign or reallocate the budget — an allocated-but-paused campaign delivers nothing for the client.',
    tags: ['ad spend', 'paused', g.platform],
    dataSources: ['Daily Spend'],
  }
}

export function detectOverspend(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 7) return null

  const spent = mtd(g)
  const pacing = computeCampaignBudgetPacing({
    monthlyBudget: g.budget,
    mtdSpend: spent,
    period: g.period,
    now,
    campaignStatus: g.campaignStatus,
    endDate: g.endDate,
  })
  if (pacing.pacingStatus !== 'warning_over_pacing' && pacing.pacingStatus !== 'critical_over_pacing') return null

  const projected = projectedMonthEnd(spent, now)
  const ratio = projected / g.budget
  const severity = pacing.pacingStatus === 'critical_over_pacing' ? 'critical' : 'warning'
  return {
    fingerprint: buildFingerprint('adspend', `overspend-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) overspending`,
    description: `Tracking to $${round(projected)} against a $${round(g.budget)} budget (${Math.round((ratio - 1) * 100)}% over) at the current pace. Current daily spend is $${round(pacing.currentDailyBudget)}; recommended daily budget is $${round(pacing.newDailyBudget)}.`,
    metric: { label: 'Projected month-end', value: projected, format: 'currency' },
    comparison: { label: 'Budget', value: g.budget, format: 'currency', trend: 'up' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Throttle or cap the campaign to land on budget, or confirm the overspend is approved.',
    tags: ['ad spend', 'overspend', 'pacing', g.platform],
    dataSources: ['Daily Spend'],
  }
}

export function detectStaleSync(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null

  const synced = g.syncedAt ? new Date(g.syncedAt) : null
  const ageH = synced ? (now.getTime() - synced.getTime()) / 3_600_000 : Infinity
  if (ageH < 48) return null

  const severity = ageH >= 72 ? 'critical' : 'warning'
  const ageLabel = synced ? `${Math.round(ageH)}h ago` : 'never'
  return {
    fingerprint: buildFingerprint('adspend', `stale-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) spend data is stale`,
    description: `Last synced ${ageLabel} — pacing for this campaign can't be trusted until sync resumes. A broken sync can hide a stopped or underspending campaign.`,
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Re-run the spend sync for this account and check the platform connection/credentials.',
    tags: ['ad spend', 'stale-sync', g.platform],
    dataSources: ['Daily Spend'],
  }
}

export function detectZeroConversion(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 10) return null

  const spent = g.days.reduce((s, d) => s + d.spend, 0)
  const conv = g.days.reduce((s, d) => s + d.conversions, 0)
  if (spent <= 500) return null
  if (conv > 0) return null

  return {
    fingerprint: buildFingerprint('adspend', `zeroconv-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'warning',
    title: `${g.clientName} (${g.platform}) spending with zero conversions`,
    description: `$${round(spent)} spent this month with 0 recorded conversions — check conversion tracking or campaign setup.`,
    metric: { label: 'Month-to-date spend', value: spent, format: 'currency' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Verify conversion tracking is firing and the campaign objective is correct before more budget is wasted.',
    tags: ['ad spend', 'zero-conversion', g.platform],
    dataSources: ['Daily Spend'],
  }
}

export function detectBudgetUnset(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now) || g.budget > 0) return null
  const spent = mtd(g)
  if (spent <= 100) return null
  return {
    fingerprint: buildFingerprint('adspend', `budget-unset-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'warning',
    title: `${g.clientName} (${g.platform}) has spend but no budget`,
    description: `$${round(spent)} has been spent this month without a configured budget, so pacing cannot be calculated.`,
    metric: { label: 'Month-to-date spend', value: spent, format: 'currency' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Set the campaign budget at the level it is managed, then re-run pacing.',
    tags: ['ad spend', 'budget-unset', g.platform],
    dataSources: ['Daily Spend', 'Campaign Budget'],
  }
}

export function detectPastEndStillDelivering(g: Group, now: Date): DetectedAnomaly | null {
  if (!g.endDate || g.endDate >= now.toISOString().slice(0, 10)) return null
  const status = (g.campaignStatus ?? '').toLowerCase()
  if (!status.includes('active') && !status.includes('enabled')) return null
  const postEndSpend = g.days.filter(day => day.date > g.endDate!).reduce((sum, day) => sum + day.spend, 0)
  if (postEndSpend <= 0) return null
  return {
    fingerprint: buildFingerprint('adspend', `past-end-delivering-${g.mediaSpendId}-${g.endDate}`),
    type: 'adspend',
    severity: 'critical',
    title: `${g.clientName} (${g.platform}) is delivering past its end date`,
    description: `Campaign status is "${g.campaignStatus}" and it spent $${round(postEndSpend)} after its end date of ${g.endDate}.`,
    metric: { label: 'Spend after end date', value: postEndSpend, format: 'currency' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Pause the campaign immediately or correct the recorded end date and confirm the offer is still valid.',
    tags: ['ad spend', 'past-end-date', 'still-delivering', g.platform],
    dataSources: ['Daily Spend', 'Campaign Status'],
  }
}

const ACTIVE_STATUS_TOKENS = ['active', 'enabled']
const MONTH_TOKENS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function isActive(g: Group) {
  const status = (g.campaignStatus ?? '').toLowerCase()
  return ACTIVE_STATUS_TOKENS.some(token => status.includes(token))
}

/** Detect offer names whose named sales window has already closed. */
export function detectStaleOffer(g: Group, now: Date): DetectedAnomaly | null {
  if (!isActive(g)) return null
  const campaignName = g.campaignName ?? '(unnamed campaign)'
  const name = campaignName.toLowerCase()
  const monthIndex = MONTH_TOKENS.findIndex(token => new RegExp(`\\b${token}(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\\b`, 'i').test(name))
  const staleMonth = monthIndex >= 0 && monthIndex < now.getUTCMonth()
  const staleEofy = /\beofy\b/i.test(name) && now.getUTCMonth() >= 6
  const datedYear = name.match(/\b(20\d{2})\b/)
  const staleYear = datedYear?.[1] ? Number(datedYear[1]) < now.getUTCFullYear() : false
  if (!staleMonth && !staleEofy && !staleYear) return null

  return {
    fingerprint: buildFingerprint('adspend', `stale-offer-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'critical',
    title: `${g.clientName} (${g.platform}) may be running a stale offer`,
    description: `Active campaign “${campaignName}” names a sales window that has already closed.`,
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Confirm the live ad and offer immediately; pause it or replace the stale creative and copy.',
    tags: ['ad spend', 'stale-offer', g.platform],
    dataSources: ['Campaign Status', 'Campaign Name'],
  }
}

function windowTotals(g: Group, from: number, to: number) {
  return g.days.reduce((totals, day) => {
    const time = Date.parse(`${day.date}T00:00:00Z`)
    if (time >= from && time < to) {
      totals.spend += day.spend
      totals.leads += day.leads ?? 0
    }
    return totals
  }, { spend: 0, leads: 0 })
}

export function detectSpendWithoutLeads(g: Group, now: Date): DetectedAnomaly | null {
  if (!isActive(g)) return null
  const end = now.getTime() + 86_400_000
  const current = windowTotals(g, end - 7 * 86_400_000, end)
  if (current.spend < 100 || current.leads > 0) return null
  return {
    fingerprint: buildFingerprint('adspend', `spend-no-leads-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'critical',
    title: `${g.clientName} (${g.platform}) spent for 7 days with no leads`,
    description: `$${round(current.spend)} was spent in the last 7 days with zero matched lead submissions.`,
    metric: { label: '7-day spend', value: current.spend, format: 'currency' },
    comparison: { label: '7-day leads', value: current.leads, format: 'number', trend: 'down' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Check lead-form delivery and tracking before allowing further spend.',
    tags: ['ad spend', 'spend-without-leads', g.platform],
    dataSources: ['Daily Spend', 'Lead Inbox'],
  }
}

export function detectCplDegrading(g: Group, now: Date): DetectedAnomaly | null {
  const end = now.getTime() + 86_400_000
  const current = windowTotals(g, end - 7 * 86_400_000, end)
  const previous = windowTotals(g, end - 14 * 86_400_000, end - 7 * 86_400_000)
  if (current.leads <= 0 || previous.leads <= 0) return null
  const currentCpl = current.spend / current.leads
  const previousCpl = previous.spend / previous.leads
  if (previousCpl <= 0 || currentCpl / previousCpl <= 1.4) return null
  return {
    fingerprint: buildFingerprint('adspend', `cpl-degrading-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'warning',
    title: `${g.clientName} (${g.platform}) cost per lead is degrading`,
    description: `7-day CPL rose ${Math.round((currentCpl / previousCpl - 1) * 100)}%, from $${round(previousCpl)} to $${round(currentCpl)}.`,
    metric: { label: 'Current 7-day CPL', value: currentCpl, format: 'currency' },
    comparison: { label: 'Previous 7-day CPL', value: previousCpl, format: 'currency', trend: 'up' },
    context: { client: g.clientName, vendor: g.platform, period: g.period, mediaSpendId: g.mediaSpendId },
    recommendation: 'Review creative, targeting and lead-form quality; prioritise the worst-performing ad for refresh.',
    tags: ['ad spend', 'cpl-degrading', g.platform],
    dataSources: ['Daily Spend', 'Lead Inbox'],
  }
}

export function detectCreativeFatigue(row: AdPerformanceSignalRow): DetectedAnomaly | null {
  const frequency = row.frequency == null ? null : num(row.frequency)
  const previousFrequency = row.previous_frequency == null ? null : num(row.previous_frequency)
  const impressions = num(row.impressions)
  const previousImpressions = num(row.previous_impressions)
  const ctr = impressions > 0 ? num(row.clicks) / impressions : null
  const previousCtr = previousImpressions > 0 ? num(row.previous_clicks) / previousImpressions : null
  if (frequency == null || frequency <= 3.5 || ctr == null || previousCtr == null || previousCtr <= 0) return null
  const ctrDeltaPct = ((ctr - previousCtr) / previousCtr) * 100
  if (ctrDeltaPct >= -25) return null
  return {
    fingerprint: buildFingerprint('adspend', `creative-fatigue-${row.media_spend_id}-${row.ad_id}`),
    type: 'adspend',
    severity: 'warning',
    title: `${row.client_name ?? '(unknown client)'} creative is fatiguing`,
    description: `Ad “${row.ad_name ?? row.ad_id}” has frequency ${frequency.toFixed(2)} while CTR fell ${Math.abs(Math.round(ctrDeltaPct))}% versus its preceding snapshot.`,
    metric: { label: 'Frequency', value: frequency, format: 'number' },
    comparison: { label: 'CTR change', value: ctrDeltaPct, format: 'percent', trend: 'down' },
    context: { client: row.client_name ?? '(unknown client)', vendor: row.platform, mediaSpendId: row.media_spend_id },
    recommendation: 'Refresh or rotate this ad creative and monitor CTR after replacement.',
    tags: ['ad spend', 'creative-fatigue', row.platform],
    dataSources: ['Ad Performance Snapshots'],
  }
}

export function detectCreativeAge(row: AdPerformanceSignalRow, now: Date): DetectedAnomaly | null {
  if (!row.first_served_date || num(row.spend) <= 0) return null
  const ageDays = Math.floor((now.getTime() - Date.parse(`${row.first_served_date}T00:00:00Z`)) / 86_400_000)
  if (ageDays <= 60) return null
  return {
    fingerprint: buildFingerprint('adspend', `creative-age-${row.media_spend_id}-${row.ad_id}`),
    type: 'adspend',
    severity: 'info',
    title: `${row.client_name ?? '(unknown client)'} creative has run for ${ageDays} days`,
    description: `Ad “${row.ad_name ?? row.ad_id}” first served on ${row.first_served_date} and still recorded spend in the latest snapshot.`,
    metric: { label: 'Creative age', value: ageDays, format: 'number' },
    context: { client: row.client_name ?? '(unknown client)', vendor: row.platform, mediaSpendId: row.media_spend_id },
    recommendation: 'Review the creative for refresh, prioritising it if frequency or CPL is also degrading.',
    tags: ['ad spend', 'creative-age', row.platform],
    dataSources: ['Ad Performance Snapshots'],
  }
}

export const adspendHealthAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.mediaSpend as HealthRow[] | null
  if (!rows || rows.length === 0) return []
  const groups = buildGroups(rows)
  const out: DetectedAnomaly[] = []
  for (const g of groups.values()) {
    const u = detectUnderspend(g, ctx.now); if (u) out.push(u)
    const s = detectStopped(g, ctx.now); if (s) out.push(s)
    const p = detectPausedWithBudget(g, ctx.now); if (p) out.push(p)
    const o = detectOverspend(g, ctx.now); if (o) out.push(o)
    const st = detectStaleSync(g, ctx.now); if (st) out.push(st)
    const z = detectZeroConversion(g, ctx.now); if (z) out.push(z)
    const b = detectBudgetUnset(g, ctx.now); if (b) out.push(b)
    const e = detectPastEndStillDelivering(g, ctx.now); if (e) out.push(e)
    const staleOffer = detectStaleOffer(g, ctx.now); if (staleOffer) out.push(staleOffer)
    const noLeads = detectSpendWithoutLeads(g, ctx.now); if (noLeads) out.push(noLeads)
    const cpl = detectCplDegrading(g, ctx.now); if (cpl) out.push(cpl)
  }
  const adSignals = (ctx.data.adPerformance ?? []) as AdPerformanceSignalRow[]
  for (const row of adSignals) {
    const fatigue = detectCreativeFatigue(row); if (fatigue) out.push(fatigue)
    const age = detectCreativeAge(row, ctx.now); if (age) out.push(age)
  }
  return out
}

// Shared helpers for detectors (exported for reuse within this module).
export const _internal = { num, round }
