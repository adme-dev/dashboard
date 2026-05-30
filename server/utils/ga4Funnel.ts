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
  costPerSession: number | null
  costPerKeyEvent: number | null
  costPerLead: number | null
  sessionToLeadRate: number | null
}

interface Ga4ChannelAgg { sessions: number, engagedSessions: number, keyEvents: number }

export interface FunnelInput {
  spendByChannel: Record<string, number>
  ga4ByChannel: Record<string, Ga4ChannelAgg>
  leadsByChannel: Record<string, number>
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

function emptyRow(channel: string): FunnelChannelRow {
  return {
    channel, spend: 0, sessions: 0, engagedSessions: 0, keyEvents: 0, leads: 0,
    costPerSession: null, costPerKeyEvent: null, costPerLead: null, sessionToLeadRate: null
  }
}

export function buildFunnel(input: FunnelInput): { channels: FunnelChannelRow[], totals: FunnelChannelRow } {
  const channels = new Set<string>([
    ...Object.keys(input.spendByChannel),
    ...Object.keys(input.ga4ByChannel),
    ...Object.keys(input.leadsByChannel)
  ])

  const rows: FunnelChannelRow[] = []
  for (const channel of channels) {
    const spend = input.spendByChannel[channel] || 0
    const ga4 = input.ga4ByChannel[channel] || { sessions: 0, engagedSessions: 0, keyEvents: 0 }
    const leads = input.leadsByChannel[channel] || 0
    rows.push({
      channel,
      spend,
      sessions: ga4.sessions,
      engagedSessions: ga4.engagedSessions,
      keyEvents: ga4.keyEvents,
      leads,
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
    return acc
  }, emptyRow('All channels'))
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
 * Equivalent (for calendar-date inputs) to the prior-period logic in server/api/agency/analytics/overview.get.ts.
 */
export function previousWindow(startDate: string, endDate: string): { prevStart: string, prevEnd: string } {
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
