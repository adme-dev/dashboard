// server/utils/anomalyDetection/analysers/profitability.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toPercent = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

const toCurrency = toPercent

export async function profitabilityAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const pnl = ctx.data.pnl
  if (!pnl) return []

  const out: DetectedAnomaly[] = []
  const margin = toPercent(pnl.profitMargin)
  const latestPeriod = pnl.periods?.[pnl.periods.length - 1]
  const previousPeriod = pnl.periods?.[pnl.periods.length - 2]
  const netProfit = typeof pnl.netProfit === 'number' ? pnl.netProfit : null

  if (netProfit !== null && netProfit < 0) {
    out.push({
      fingerprint: buildFingerprint('profitability', 'net-loss'),
      type: 'profitability', severity: 'critical',
      title: 'Operating at a net loss',
      description: 'Expenses exceeded revenue in the latest period, resulting in a negative net profit.',
      metric: { label: 'Net Profit', value: toCurrency(netProfit), format: 'currency' },
      comparison: { label: 'Total Revenue', value: toCurrency(pnl.revenueTotal ?? 0), format: 'currency', trend: 'down' },
      context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
      recommendation: 'Review pricing, defer discretionary spending, or identify cost reductions to return to profitability.',
      tags: ['net loss', 'profitability'],
      dataSources: ['Profit & Loss'],
    })
  } else if (margin < 0.05) {
    out.push({
      fingerprint: buildFingerprint('profitability', 'low-margin'),
      type: 'profitability', severity: 'warning',
      title: 'Profit margin is below target',
      description: `Gross margin dropped to ${(margin * 100).toFixed(1)}% in the latest reporting period.`,
      metric: { label: 'Profit Margin', value: margin, format: 'percent' },
      comparison: previousPeriod
        ? { label: 'Prior Period Margin', value: toPercent(previousPeriod.profitMargin ?? 0), format: 'percent', trend: previousPeriod.profitMargin && margin < previousPeriod.profitMargin ? 'down' : 'up' }
        : undefined,
      context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
      recommendation: 'Evaluate revenue drivers and high-cost categories to improve margins.',
      tags: ['margin', 'profitability'],
      dataSources: ['Profit & Loss'],
    })
  }

  if (previousPeriod && typeof previousPeriod.profitMargin === 'number') {
    const drop = previousPeriod.profitMargin - margin
    if (drop >= 0.08) {
      out.push({
        fingerprint: buildFingerprint('profitability', 'margin-compression'),
        type: 'profitability', severity: 'warning',
        title: 'Margin compression detected',
        description: `Profit margin declined by ${(drop * 100).toFixed(1)} percentage points compared to the prior period.`,
        metric: { label: 'Current Margin', value: margin, format: 'percent' },
        comparison: { label: 'Prior Margin', value: toPercent(previousPeriod.profitMargin ?? 0), format: 'percent', trend: 'down' },
        context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
        recommendation: 'Investigate changes in cost of goods sold or pricing adjustments that may have impacted profitability.',
        tags: ['trend', 'margin'],
        dataSources: ['Profit & Loss'],
      })
    }
  }

  return out
}
