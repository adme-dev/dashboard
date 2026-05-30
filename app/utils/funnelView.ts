/**
 * Pure presentation math for the GA4 funnel view (AnalyticsFunnelChart).
 * Kept framework-free so it is unit-testable without mounting components.
 */

/** Percentage change vs a previous value. Null when prev is missing or zero. */
export function pctDelta(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

/** Stage-to-stage conversion as a percentage. Null when the denominator is zero. */
export function conversionRate(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return (numerator / denominator) * 100
}

/** Fraction of a total, clamped to [0,1]. Guards divide-by-zero and negatives. */
export function shareOfTotal(value: number, total: number): number {
  if (!total || total <= 0) return 0
  const s = value / total
  if (s < 0) return 0
  if (s > 1) return 1
  return s
}

/**
 * Best (lowest) and worst (highest) cost-per-lead channels. Channels with a
 * null cost/lead (e.g. organic, no spend) are excluded. Returns nulls unless at
 * least two channels qualify, so a single channel is never highlighted as both.
 */
export function bestWorstCostPerLead(
  rows: Array<{ channel: string; costPerLead: number | null }>
): { best: string | null; worst: string | null } {
  const valid = rows.filter((r): r is { channel: string; costPerLead: number } => r.costPerLead != null)
  if (valid.length < 2) return { best: null, worst: null }
  let best = valid[0]
  let worst = valid[0]
  for (const r of valid) {
    if (r.costPerLead < best.costPerLead) best = r
    if (r.costPerLead > worst.costPerLead) worst = r
  }
  return { best: best.channel, worst: worst.channel }
}
