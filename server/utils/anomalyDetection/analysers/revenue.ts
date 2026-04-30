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

  // YoY rule — requires ≥13 monthly periods. If the data window is shorter,
  // the rule silently no-ops (e.g. a freshly-connected Xero org with limited history).
  const periods = pnl.periods ?? []
  if (periods.length >= 13) {
    const current = periods[periods.length - 1]
    const yearAgo = periods[periods.length - 13]
    if (
      typeof current?.revenue === 'number' &&
      typeof yearAgo?.revenue === 'number' &&
      yearAgo.revenue > 0
    ) {
      const drop = (yearAgo.revenue - current.revenue) / yearAgo.revenue
      if (drop >= 0.15) {
        out.push({
          fingerprint: buildFingerprint('revenue', 'yoy-decline'),
          type: 'revenue',
          severity: drop >= 0.3 ? 'critical' : 'warning',
          title: 'Revenue down vs. same month last year',
          description: `Revenue is ${Math.round(drop * 100)}% below ${yearAgo.label ?? 'this month last year'}.`,
          metric: { label: 'Current Month', value: current.revenue, format: 'currency' },
          comparison: { label: yearAgo.label ?? 'YoY Baseline', value: yearAgo.revenue, format: 'currency', trend: 'down' },
          context: { period: current.label, range: { from: pnl.fromDate, to: pnl.toDate } },
          recommendation: 'Compare this period to the same month last year — review pipeline, retainer renewals, and seasonal client patterns.',
          tags: ['revenue', 'YoY'],
          dataSources: ['Profit & Loss'],
        })
      }
    }
  }

  return out
}
