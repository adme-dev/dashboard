// Pure view helpers for the internal-benchmarks panel.
// Mirrors the API shapes from server/api/agency/analytics/internal-benchmarks.get.ts.

export interface BenchmarkPortfolio {
  count: number
  min: number | null
  p25: number | null
  median: number | null
  p75: number | null
  max: number | null
}

export type BenchmarkMetricKey = 'engagementRate' | 'cvr' | 'cpl' | 'cpa'

export interface LeaderboardClient {
  clientId: string
  clientName: string
  metrics: Record<BenchmarkMetricKey, number | null>
}

export interface BenchmarkBadge {
  label: string
  tone: 'success' | 'error' | 'neutral'
}

/**
 * Direction-aware badge from a percentile rank (fraction of portfolio ≤ value).
 * For lower-is-better metrics (CPL/CPA) a low rank is GOOD, so we invert.
 */
export function benchmarkBadge(percentileRank: number | null, lowerIsBetter: boolean): BenchmarkBadge | null {
  if (percentileRank == null || !Number.isFinite(percentileRank)) return null
  const goodness = lowerIsBetter ? 1 - percentileRank : percentileRank
  const pct = Math.round(goodness * 100)
  if (goodness >= 0.5) {
    return { label: `Top ${Math.max(1, 100 - pct)}%`, tone: goodness >= 0.75 ? 'success' : 'neutral' }
  }
  return { label: `Bottom ${Math.max(1, pct)}%`, tone: goodness <= 0.25 ? 'error' : 'neutral' }
}

/** Position of `value` along the portfolio min→max range, as 0..100. */
export function benchmarkMarkerPct(value: number | null, p: BenchmarkPortfolio): number | null {
  if (value == null || !Number.isFinite(value) || p.min == null || p.max == null) return null
  if (p.max === p.min) return 50
  const frac = (value - p.min) / (p.max - p.min)
  return Math.round(Math.min(1, Math.max(0, frac)) * 100)
}

export interface LeaderboardRow {
  clientId: string
  clientName: string
  value: number | null
  rank: number | null
}

/** Sort clients by a metric (nulls last); assign 1-based ranks to non-null values. */
export function leaderboardRows(
  clients: LeaderboardClient[],
  metricKey: BenchmarkMetricKey,
  lowerIsBetter: boolean
): LeaderboardRow[] {
  const rows = clients.map(c => ({ clientId: c.clientId, clientName: c.clientName, value: c.metrics[metricKey] }))
  rows.sort((a, b) => {
    if (a.value == null && b.value == null) return 0
    if (a.value == null) return 1
    if (b.value == null) return -1
    return lowerIsBetter ? a.value - b.value : b.value - a.value
  })
  let rank = 0
  return rows.map(r => ({ ...r, rank: r.value == null ? null : ++rank }))
}
