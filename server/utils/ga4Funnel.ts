// server/utils/ga4Funnel.ts
/**
 * Merge spend (ad platforms), GA4 channel metrics, and owned leads into a
 * single per-channel funnel, plus a totals row. All three inputs are keyed by
 * GA4 channel group (see channelMap.ts). Cost ratios are null — not Infinity —
 * when spend is 0 (e.g. organic channels) or the denominator is 0.
 */

export interface FunnelChannelRow {
  channel: string
  spend: number
  sessions: number
  engagedSessions: number
  keyEvents: number
  leads: number
  totalUsers: number
  newUsers: number
  engagementRate: number | null
  avgSessionDuration: number | null
  costPerSession: number | null
  costPerKeyEvent: number | null
  costPerLead: number | null
  sessionToLeadRate: number | null
}

/**
 * Per-channel GA4 aggregate. `engagementRate` and `avgSessionDuration` are
 * stored as session-weighted sums (SUM(metric * sessions)); divide by sessions
 * to recover the average — this keeps channel/total roll-ups correct.
 */
interface Ga4ChannelAgg {
  sessions: number
  engagedSessions: number
  keyEvents: number
  totalUsers: number
  newUsers: number
  engagementRateWeighted: number
  durationWeighted: number
}

export interface FunnelInput {
  spendByChannel: Record<string, number>
  ga4ByChannel: Record<string, Ga4ChannelAgg>
  leadsByChannel: Record<string, number>
}

/** Metrics we compute a period-over-period delta for. */
export type FunnelComparedMetric = 'spend' | 'sessions' | 'totalUsers' | 'keyEvents' | 'leads'

export interface FunnelComparison {
  /** Previous-window totals (same shape as the current totals row). */
  totals: FunnelChannelRow
  /** Fractional change current-vs-previous (0.1 = +10%); null when previous is 0. */
  deltaPct: Record<FunnelComparedMetric, number | null>
}

/** Fractional change; null when the previous value is 0 (can't divide). */
export function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null
  return (curr - prev) / prev
}

/** Build the comparison block from current + previous totals rows. */
export function buildComparison(current: FunnelChannelRow, previous: FunnelChannelRow): FunnelComparison {
  return {
    totals: previous,
    deltaPct: {
      spend: pctDelta(current.spend, previous.spend),
      sessions: pctDelta(current.sessions, previous.sessions),
      totalUsers: pctDelta(current.totalUsers, previous.totalUsers),
      keyEvents: pctDelta(current.keyEvents, previous.keyEvents),
      leads: pctDelta(current.leads, previous.leads)
    }
  }
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

function emptyRow(channel: string): FunnelChannelRow {
  return {
    channel, spend: 0, sessions: 0, engagedSessions: 0, keyEvents: 0, leads: 0,
    totalUsers: 0, newUsers: 0, engagementRate: null, avgSessionDuration: null,
    costPerSession: null, costPerKeyEvent: null, costPerLead: null, sessionToLeadRate: null
  }
}

const emptyGa4Agg: Ga4ChannelAgg = {
  sessions: 0, engagedSessions: 0, keyEvents: 0,
  totalUsers: 0, newUsers: 0, engagementRateWeighted: 0, durationWeighted: 0
}

export function buildFunnel(input: FunnelInput): { channels: FunnelChannelRow[]; totals: FunnelChannelRow } {
  const channels = new Set<string>([
    ...Object.keys(input.spendByChannel),
    ...Object.keys(input.ga4ByChannel),
    ...Object.keys(input.leadsByChannel)
  ])

  const rows: FunnelChannelRow[] = []
  // Track session-weighted sums so the totals row recovers correct averages.
  let totalEngagementWeighted = 0
  let totalDurationWeighted = 0
  for (const channel of channels) {
    const spend = input.spendByChannel[channel] || 0
    const ga4 = input.ga4ByChannel[channel] || emptyGa4Agg
    const leads = input.leadsByChannel[channel] || 0
    totalEngagementWeighted += ga4.engagementRateWeighted || 0
    totalDurationWeighted += ga4.durationWeighted || 0
    rows.push({
      channel,
      spend,
      sessions: ga4.sessions,
      engagedSessions: ga4.engagedSessions,
      keyEvents: ga4.keyEvents,
      leads,
      totalUsers: ga4.totalUsers || 0,
      newUsers: ga4.newUsers || 0,
      engagementRate: ratio(ga4.engagementRateWeighted || 0, ga4.sessions),
      avgSessionDuration: ratio(ga4.durationWeighted || 0, ga4.sessions),
      costPerSession: spend ? ratio(spend, ga4.sessions) : null,
      costPerKeyEvent: spend ? ratio(spend, ga4.keyEvents) : null,
      costPerLead: spend ? ratio(spend, leads) : null,
      sessionToLeadRate: ratio(leads, ga4.sessions)
    })
  }

  rows.sort((a, b) => (b.spend - a.spend) || (b.sessions - a.sessions))

  const totals = rows.reduce((acc, r) => {
    acc.spend += r.spend
    acc.sessions += r.sessions
    acc.engagedSessions += r.engagedSessions
    acc.keyEvents += r.keyEvents
    acc.leads += r.leads
    acc.totalUsers += r.totalUsers
    acc.newUsers += r.newUsers
    return acc
  }, emptyRow('All channels'))
  totals.engagementRate = ratio(totalEngagementWeighted, totals.sessions)
  totals.avgSessionDuration = ratio(totalDurationWeighted, totals.sessions)
  totals.costPerSession = totals.spend ? ratio(totals.spend, totals.sessions) : null
  totals.costPerKeyEvent = totals.spend ? ratio(totals.spend, totals.keyEvents) : null
  totals.costPerLead = totals.spend ? ratio(totals.spend, totals.leads) : null
  totals.sessionToLeadRate = ratio(totals.leads, totals.sessions)

  return { channels: rows, totals }
}

const DAY_MS = 86_400_000

/**
 * Previous equal-length window, ending the day before startDate.
 * Dates are treated as UTC calendar days; returns YYYY-MM-DD strings.
 * Mirrors the prior-period logic in server/api/agency/analytics/overview.get.ts.
 */
export function previousWindow(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - DAY_MS)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10)
  }
}
