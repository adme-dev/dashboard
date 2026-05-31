// server/utils/benchmarks.ts
/**
 * Internal (portfolio) benchmarking helpers — pure stats over a set of
 * per-client metric values. Used by the internal-benchmarks endpoint to show
 * where one client sits versus the portfolio median/quartiles.
 */

/** Linear-interpolated percentile (matches Postgres percentile_cont). p in [0,1]. */
export function percentile(values: number[], p: number): number | null {
  const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  if (xs.length === 0) return null
  if (xs.length === 1) return xs[0]
  const idx = p * (xs.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return xs[lo]
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo)
}

/** Fraction of values ≤ v (0..1). Empty set → null. */
export function percentileRank(values: number[], v: number): number | null {
  const xs = values.filter(x => Number.isFinite(x))
  if (xs.length === 0) return null
  const countLe = xs.filter(x => x <= v).length
  return countLe / xs.length
}

export interface BenchmarkSummary {
  count: number
  min: number | null
  p25: number | null
  median: number | null
  p75: number | null
  max: number | null
}

export function summarize(values: number[]): BenchmarkSummary {
  const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  return {
    count: xs.length,
    min: xs.length ? xs[0] : null,
    p25: percentile(xs, 0.25),
    median: percentile(xs, 0.5),
    p75: percentile(xs, 0.75),
    max: xs.length ? xs[xs.length - 1] : null
  }
}
