// server/utils/anomalyDetection/analysers/expenses.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toCurrency = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
  return Math.sqrt(avgSquaredDiff)
}

function isStatisticalAnomaly(value: number, mean: number, stdDev: number, threshold: number = 2): boolean {
  if (stdDev === 0) return false
  return Math.abs(value - mean) > threshold * stdDev
}

export async function expensesAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const expenses = ctx.data.expenses
  if (!expenses) return []

  const pnl = ctx.data.pnl
  const out: DetectedAnomaly[] = []

  const categories = expenses.categories || []
  const top = categories[0]
  const second = categories[1]

  if (top && second && top.amount > second.amount * 2) {
    out.push({
      fingerprint: buildFingerprint('expenses', 'category-concentration'),
      type: 'expenses',
      severity: 'warning',
      title: 'Expense category concentration',
      description: `${top.name} accounts for more than twice the spend of the next largest category.`,
      metric: { label: top.name, value: toCurrency(top.amount), format: 'currency' },
      comparison: { label: second.name, value: toCurrency(second.amount), format: 'currency', trend: 'up' },
      context: { category: top.name, range: expenses.range },
      recommendation: `Investigate whether ${top.name.toLowerCase()} expenses can be diversified or reduced.`,
      tags: ['expenses', 'concentration'],
      dataSources: ['Expenses Summary'],
    })
  }

  if (top && pnl && typeof pnl.revenueTotal === 'number' && pnl.revenueTotal > 0) {
    const share = top.amount / pnl.revenueTotal
    if (share >= 0.35) {
      out.push({
        fingerprint: buildFingerprint('expenses', 'expense-to-revenue'),
        type: 'expenses',
        severity: share >= 0.5 ? 'critical' : 'warning',
        title: 'Single category consuming revenue',
        description: `${top.name} represents ${Math.round(share * 100)}% of revenue for the period.`,
        metric: { label: top.name, value: toCurrency(top.amount), format: 'currency' },
        comparison: { label: 'Revenue', value: toCurrency(pnl.revenueTotal), format: 'currency', trend: 'down' },
        context: { category: top.name, range: { from: expenses.range?.from ?? pnl.fromDate, to: expenses.range?.to ?? pnl.toDate } },
        recommendation: `Validate contracts and spending controls for ${top.name.toLowerCase()} to protect margins.`,
        tags: ['expenses', 'margin impact'],
        dataSources: ['Expenses Summary', 'Profit & Loss'],
      })
    }
  }

  const vendors = expenses.vendors || []
  const topVendor = vendors[0]
  const totalVendorSpend = vendors.reduce((sum: number, vendor: any) => sum + (typeof vendor.amount === 'number' ? vendor.amount : 0), 0)
  if (topVendor && totalVendorSpend > 0) {
    const vendorShare = topVendor.amount / totalVendorSpend
    if (vendorShare >= 0.4) {
      out.push({
        fingerprint: buildFingerprint('expenses', 'vendor-concentration'),
        type: 'expenses',
        severity: 'info',
        title: 'Vendor concentration risk',
        description: `${topVendor.name} represents ${Math.round(vendorShare * 100)}% of vendor spend in the selected range.`,
        metric: { label: topVendor.name, value: toCurrency(topVendor.amount), format: 'currency' },
        comparison: { label: 'Total Vendor Spend', value: toCurrency(totalVendorSpend), format: 'currency', trend: 'up' },
        context: { vendor: topVendor.name, range: expenses.range },
        recommendation: 'Consider competitive bids or secondary suppliers to reduce reliance on a single vendor.',
        tags: ['vendor', 'concentration'],
        dataSources: ['Expenses Summary'],
      })
    }
  }

  // Statistical analysis on daily totals
  const dailyTotals = (expenses as any).dailyTotals as Array<{ date: string, amount: number }> | undefined
  if (dailyTotals && dailyTotals.length > 7) {
    const amounts = dailyTotals.map(d => d.amount)
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length
    const stdDev = calculateStandardDeviation(amounts)

    for (const day of dailyTotals) {
      if (isStatisticalAnomaly(day.amount, mean, stdDev, 2)) {
        out.push({
          fingerprint: buildFingerprint('expenses', 'daily-spike-' + day.date),
          type: 'expenses',
          severity: Math.abs(day.amount - mean) > 3 * stdDev ? 'warning' : 'info',
          title: 'Daily spending spike detected',
          description: `Spending on ${day.date} was $${day.amount.toFixed(0)} — ${day.amount > mean ? 'significantly above' : 'significantly below'} the daily average of $${mean.toFixed(0)}.`,
          metric: { label: 'Daily Spend', value: toCurrency(day.amount), format: 'currency' },
          comparison: { label: 'Daily Average', value: toCurrency(mean), format: 'currency', trend: day.amount > mean ? 'up' : 'down' },
          context: { range: expenses.range },
          recommendation: 'Review transactions on this date for unexpected charges or one-off expenses.',
          tags: ['statistical', 'daily spike'],
          dataSources: ['Expenses Summary'],
        })
      }
    }
  }

  // Statistical analysis on vendor spending
  if (vendors.length > 3) {
    const vendorAmounts = vendors.map((v: any) => v.amount)
    const vendorMean = vendorAmounts.reduce((s: number, v: number) => s + v, 0) / vendorAmounts.length
    const vendorStdDev = calculateStandardDeviation(vendorAmounts)

    for (const v of vendors) {
      if (isStatisticalAnomaly(v.amount, vendorMean, vendorStdDev, 2.5)) {
        // Only flag outliers above the mean (unusually high)
        if (v.amount > vendorMean) {
          out.push({
            fingerprint: buildFingerprint('expenses', 'vendor-outlier-' + v.name.replace(/\s+/g, '-').toLowerCase().slice(0, 30)),
            type: 'expenses',
            severity: 'info',
            title: `Statistical outlier: ${v.name}`,
            description: `${v.name} spending of $${v.amount.toFixed(0)} is ${((v.amount - vendorMean) / vendorStdDev).toFixed(1)} standard deviations above the vendor average.`,
            metric: { label: v.name, value: toCurrency(v.amount), format: 'currency' },
            comparison: { label: 'Vendor Average', value: toCurrency(vendorMean), format: 'currency', trend: 'up' },
            context: { vendor: v.name, range: expenses.range },
            recommendation: `Review whether the level of spend with ${v.name} is justified or if alternative vendors should be considered.`,
            tags: ['statistical', 'vendor outlier'],
            dataSources: ['Expenses Summary'],
          })
        }
      }
    }
  }

  return out
}
