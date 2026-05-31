// server/utils/blendedMetrics.ts
/**
 * Blend spend (ad platforms), GA4 sessions, owned leads and platform-reported
 * conversions/revenue into a single per-canonical-channel view with blended
 * CPL / CPA / ROAS, plus a totals row. Inputs are keyed by CANONICAL channel
 * (resolved via channelTaxonomy.ts) so Meta + Google + GA4 reconcile on one axis.
 *
 * Cost/return ratios are null — not Infinity — when the denominator is 0
 * (organic channels with no spend, channels with no leads/conversions).
 *
 * NOTE: `conversions`/`cpa`/`roas` are PLATFORM-REPORTED (each ad platform's own
 * conversion + revenue counting), not a single deduplicated cross-platform truth.
 * `leads` are owned (first-party) lead rows. Surfaced labels reflect this.
 */

export interface BlendedChannelRow {
  channel: string
  spend: number
  leads: number
  conversions: number
  revenue: number
  sessions: number
  cpl: number | null // spend / leads (owned leads)
  cpa: number | null // spend / conversions (platform-reported)
  roas: number | null // revenue / spend (platform-reported)
}

export interface BlendedInput {
  spendByChannel: Record<string, number>
  leadsByChannel: Record<string, number>
  conversionsByChannel: Record<string, number>
  revenueByChannel: Record<string, number>
  sessionsByChannel: Record<string, number>
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

function emptyRow(channel: string): BlendedChannelRow {
  return { channel, spend: 0, leads: 0, conversions: 0, revenue: 0, sessions: 0, cpl: null, cpa: null, roas: null }
}

export function buildBlended(input: BlendedInput): { channels: BlendedChannelRow[], totals: BlendedChannelRow } {
  const channelNames = new Set<string>([
    ...Object.keys(input.spendByChannel),
    ...Object.keys(input.leadsByChannel),
    ...Object.keys(input.conversionsByChannel),
    ...Object.keys(input.revenueByChannel),
    ...Object.keys(input.sessionsByChannel)
  ])

  const rows: BlendedChannelRow[] = []
  for (const channel of channelNames) {
    const spend = input.spendByChannel[channel] || 0
    const leads = input.leadsByChannel[channel] || 0
    const conversions = input.conversionsByChannel[channel] || 0
    const revenue = input.revenueByChannel[channel] || 0
    const sessions = input.sessionsByChannel[channel] || 0
    rows.push({
      channel, spend, leads, conversions, revenue, sessions,
      // Cost metrics are null for zero-spend (organic) channels — mirrors the
      // funnel's `spend ? ratio(...) : null` convention.
      cpl: spend ? ratio(spend, leads) : null,
      cpa: spend ? ratio(spend, conversions) : null,
      roas: ratio(revenue, spend)
    })
  }

  rows.sort((a, b) => (b.spend - a.spend) || (b.leads - a.leads))

  const totals = rows.reduce((acc, r) => {
    acc.spend += r.spend
    acc.leads += r.leads
    acc.conversions += r.conversions
    acc.revenue += r.revenue
    acc.sessions += r.sessions
    return acc
  }, emptyRow('All channels'))
  totals.cpl = totals.spend ? ratio(totals.spend, totals.leads) : null
  totals.cpa = totals.spend ? ratio(totals.spend, totals.conversions) : null
  totals.roas = ratio(totals.revenue, totals.spend)

  return { channels: rows, totals }
}

export type BlendedComparedMetric = 'spend' | 'leads' | 'conversions' | 'revenue' | 'sessions'

export interface BlendedComparison {
  totals: BlendedChannelRow
  deltaPct: Record<BlendedComparedMetric, number | null>
}

function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null
  return (curr - prev) / prev
}

export function buildBlendedComparison(current: BlendedChannelRow, previous: BlendedChannelRow): BlendedComparison {
  return {
    totals: previous,
    deltaPct: {
      spend: pctDelta(current.spend, previous.spend),
      leads: pctDelta(current.leads, previous.leads),
      conversions: pctDelta(current.conversions, previous.conversions),
      revenue: pctDelta(current.revenue, previous.revenue),
      sessions: pctDelta(current.sessions, previous.sessions)
    }
  }
}
