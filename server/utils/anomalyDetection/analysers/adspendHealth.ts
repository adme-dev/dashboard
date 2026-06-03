// Pacing & delivery-health detectors over media_spend + daily_spend. Separate
// from adspend.ts (which detects spend SPIKES). Each detector is a pure
// function exported for unit testing; the analyser composes them. All emit
// type 'adspend' with month-level fingerprints so re-detection updates one row
// per campaign per month.
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'
import { periodOf, dayOfMonth, expectedToDate, projectedMonthEnd } from '../adPacingMath'

export interface DailyPoint { date: string; spend: number; conversions: number }
export interface Group {
  mediaSpendId: string
  clientId: string
  clientName: string
  platform: string
  period: string
  budget: number
  campaignStatus: string | null
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
  synced_at: string | null
  conversions: number | string | null
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
        period: r.period,
        budget: num(r.budget_allocated),
        campaignStatus: r.campaign_status,
        syncedAt: r.synced_at,
        days: [],
      }
      groups.set(r.media_spend_id, g)
    }
    g.days.push({ date: r.spend_date, spend: num(r.spend), conversions: num(r.conversions) })
  }
  return groups
}

export function detectUnderspend(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 7) return null

  const spent = mtd(g)
  const expected = expectedToDate(g.budget, now)
  if (expected <= 0) return null

  const ratio = spent / expected
  if (ratio >= 0.5) return null

  const severity = ratio < 0.25 ? 'critical' : 'warning'
  const shortfall = expected - spent
  const projected = projectedMonthEnd(spent, now)

  return {
    fingerprint: buildFingerprint('adspend', `underspend-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) underspending`,
    description: `Spent $${round(spent)} of an expected $${round(expected)} by day ${dayOfMonth(now)} — $${round(shortfall)} behind pace (tracking to $${round(projected)} of a $${round(g.budget)} budget).`,
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
  const projected = projectedMonthEnd(spent, now)
  const ratio = projected / g.budget
  if (ratio <= 1.15) return null

  const severity = ratio > 1.3 ? 'critical' : 'warning'
  return {
    fingerprint: buildFingerprint('adspend', `overspend-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) overspending`,
    description: `Tracking to $${round(projected)} against a $${round(g.budget)} budget (${Math.round((ratio - 1) * 100)}% over) at the current pace.`,
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
  if (g.budget <= 0) return null

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
  }
  return out
}

// Shared helpers for detectors (exported for reuse within this module).
export const _internal = { num, round }
