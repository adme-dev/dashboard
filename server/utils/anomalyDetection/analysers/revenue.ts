// server/utils/anomalyDetection/analysers/revenue.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toCurrency = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

export async function revenueAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const pnl = ctx.data.pnl
  if (!pnl) return []

  const out: DetectedAnomaly[] = []
  const latestPeriod = pnl.periods?.[pnl.periods.length - 1]
  const previousPeriod = pnl.periods?.[pnl.periods.length - 2]

  if (previousPeriod && typeof latestPeriod?.revenue === 'number' && typeof previousPeriod.revenue === 'number') {
    const revenueDropRatio = previousPeriod.revenue === 0 ? 0 : (previousPeriod.revenue - latestPeriod.revenue) / previousPeriod.revenue
    if (revenueDropRatio >= 0.15) {
      out.push({
        fingerprint: buildFingerprint('revenue', 'revenue-decline'),
        type: 'revenue',
        severity: revenueDropRatio >= 0.3 ? 'critical' : 'warning',
        title: 'Significant revenue decline',
        description: `Revenue decreased ${Math.round(revenueDropRatio * 100)}% versus the prior period.`,
        metric: { label: 'Current Revenue', value: toCurrency(latestPeriod.revenue ?? 0), format: 'currency' },
        comparison: { label: 'Prior Revenue', value: toCurrency(previousPeriod.revenue ?? 0), format: 'currency', trend: 'down' },
        context: { period: latestPeriod.label, range: { from: pnl.fromDate, to: pnl.toDate } },
        recommendation: 'Review sales pipeline, marketing performance, and outstanding receivables to identify the cause.',
        tags: ['revenue', 'trend'],
        dataSources: ['Profit & Loss'],
      })
    }
  }

  return out
}
