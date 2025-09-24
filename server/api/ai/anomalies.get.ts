import { $fetch } from 'ofetch'

type AnomalySeverity = 'critical' | 'warning' | 'info'
type AnomalyType = 'profitability' | 'revenue' | 'expenses'

interface AnomalyMetric {
  label: string
  value: number
  format: 'currency' | 'percent' | 'number'
}

interface Anomaly {
  id: string
  type: AnomalyType
  severity: AnomalySeverity
  title: string
  description: string
  metric?: AnomalyMetric
  comparison?: AnomalyMetric & { trend?: 'up' | 'down' }
  context?: {
    period?: string
    range?: { from?: string | null, to?: string | null }
    category?: string
    vendor?: string
  }
  recommendation?: string
  tags?: string[]
  dataSources: string[]
  detectedAt: string
}

interface ProfitAndLossReport {
  fromDate?: string
  toDate?: string
  revenueTotal?: number
  expensesTotal?: number
  netProfit?: number
  profitMargin?: number
  periods?: Array<{
    label?: string
    revenue?: number
    expenses?: number
    netProfit?: number
    profitMargin?: number
  }>
}

interface ExpensesSummary {
  range?: { from?: string, to?: string }
  categories?: Array<{ name: string, amount: number }>
  vendors?: Array<{ name: string, amount: number }>
}

function toPercent(value: number | undefined | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return value
}

function toCurrency(value: number | undefined | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return value
}

export default eventHandler(async (event) => {
  const [pnl, expenses] = await Promise.all<[
    ProfitAndLossReport | null,
    ExpensesSummary | null
  ]>([
    $fetch<ProfitAndLossReport>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null),
    $fetch<ExpensesSummary>('/api/xero/expenses', { headers: event.headers }).catch(() => null)
  ])

  const anomalies: Anomaly[] = []
  const detectedAt = new Date().toISOString()

  if (pnl) {
    const margin = toPercent(pnl.profitMargin)
    const latestPeriod = pnl.periods?.[pnl.periods.length - 1]
    const previousPeriod = pnl.periods?.[pnl.periods.length - 2]

    const netProfitValue = typeof pnl.netProfit === 'number' ? pnl.netProfit : null

    if (netProfitValue !== null && netProfitValue < 0) {
      anomalies.push({
        id: 'net-loss',
        type: 'profitability',
        severity: 'critical',
        title: 'Operating at a net loss',
        description: 'Expenses exceeded revenue in the latest period, resulting in a negative net profit.',
        metric: {
          label: 'Net Profit',
          value: toCurrency(netProfitValue),
          format: 'currency'
        },
        comparison: {
          label: 'Total Revenue',
          value: toCurrency(pnl.revenueTotal ?? 0),
          format: 'currency',
          trend: 'down'
        },
        context: {
          period: latestPeriod?.label,
          range: { from: pnl.fromDate, to: pnl.toDate }
        },
        recommendation: 'Review pricing, defer discretionary spending, or identify cost reductions to return to profitability.',
        tags: ['net loss', 'profitability'],
        dataSources: ['Profit & Loss'],
        detectedAt
      })
    } else if (margin < 0.05) {
      anomalies.push({
        id: 'low-margin',
        type: 'profitability',
        severity: 'warning',
        title: 'Profit margin is below target',
        description: `Gross margin dropped to ${(margin * 100).toFixed(1)}% in the latest reporting period.`,
        metric: {
          label: 'Profit Margin',
          value: margin,
          format: 'percent'
        },
        comparison: previousPeriod
          ? {
              label: `Prior Period Margin`,
              value: toPercent(previousPeriod.profitMargin ?? 0),
              format: 'percent',
              trend: previousPeriod.profitMargin && margin < previousPeriod.profitMargin ? 'down' : 'up'
            }
          : undefined,
        context: {
          period: latestPeriod?.label,
          range: { from: pnl.fromDate, to: pnl.toDate }
        },
        recommendation: 'Evaluate revenue drivers and high-cost categories to improve margins.',
        tags: ['margin', 'profitability'],
        dataSources: ['Profit & Loss'],
        detectedAt
      })
    }

    if (previousPeriod && typeof previousPeriod.profitMargin === 'number' && typeof margin === 'number') {
      const marginDrop = previousPeriod.profitMargin - margin
      if (marginDrop >= 0.08) {
        anomalies.push({
          id: 'margin-compression',
          type: 'profitability',
          severity: 'warning',
          title: 'Margin compression detected',
          description: `Profit margin declined by ${(marginDrop * 100).toFixed(1)} percentage points compared to the prior period.`,
          metric: {
            label: 'Current Margin',
            value: margin,
            format: 'percent'
          },
          comparison: {
            label: 'Prior Margin',
            value: toPercent(previousPeriod.profitMargin ?? 0),
            format: 'percent',
            trend: 'down'
          },
          context: {
            period: latestPeriod?.label,
            range: { from: pnl.fromDate, to: pnl.toDate }
          },
          recommendation: 'Investigate changes in cost of goods sold or pricing adjustments that may have impacted profitability.',
          tags: ['trend', 'margin'],
          dataSources: ['Profit & Loss'],
          detectedAt
        })
      }
    }

    if (previousPeriod && typeof latestPeriod?.revenue === 'number' && typeof previousPeriod.revenue === 'number') {
      const revenueDropRatio = previousPeriod.revenue === 0 ? 0 : (previousPeriod.revenue - latestPeriod.revenue) / previousPeriod.revenue
      if (revenueDropRatio >= 0.15) {
        anomalies.push({
          id: 'revenue-decline',
          type: 'revenue',
          severity: revenueDropRatio >= 0.3 ? 'critical' : 'warning',
          title: 'Significant revenue decline',
          description: `Revenue decreased ${Math.round(revenueDropRatio * 100)}% versus the prior period.`,
          metric: {
            label: 'Current Revenue',
            value: toCurrency(latestPeriod.revenue ?? 0),
            format: 'currency'
          },
          comparison: {
            label: 'Prior Revenue',
            value: toCurrency(previousPeriod.revenue ?? 0),
            format: 'currency',
            trend: 'down'
          },
          context: {
            period: latestPeriod.label,
            range: { from: pnl.fromDate, to: pnl.toDate }
          },
          recommendation: 'Review sales pipeline, marketing performance, and outstanding receivables to identify the cause.',
          tags: ['revenue', 'trend'],
          dataSources: ['Profit & Loss'],
          detectedAt
        })
      }
    }
  }

  if (expenses) {
    const categories = expenses.categories || []
    const top = categories[0]
    const second = categories[1]

    if (top && second && top.amount > second.amount * 2) {
      anomalies.push({
        id: 'category-concentration',
        type: 'expenses',
        severity: 'warning',
        title: 'Expense category concentration',
        description: `${top.name} accounts for more than twice the spend of the next largest category.`,
        metric: {
          label: top.name,
          value: toCurrency(top.amount),
          format: 'currency'
        },
        comparison: {
          label: second.name,
          value: toCurrency(second.amount),
          format: 'currency',
          trend: 'up'
        },
        context: {
          category: top.name,
          range: expenses.range
        },
        recommendation: `Investigate whether ${top.name.toLowerCase()} expenses can be diversified or reduced.`,
        tags: ['expenses', 'concentration'],
        dataSources: ['Expenses Summary'],
        detectedAt
      })
    }

    if (top && pnl && typeof pnl.revenueTotal === 'number' && pnl.revenueTotal > 0) {
      const share = top.amount / pnl.revenueTotal
      if (share >= 0.35) {
        anomalies.push({
          id: 'expense-to-revenue',
          type: 'expenses',
          severity: share >= 0.5 ? 'critical' : 'warning',
          title: 'Single category consuming revenue',
          description: `${top.name} represents ${Math.round(share * 100)}% of revenue for the period.`,
          metric: {
            label: top.name,
            value: toCurrency(top.amount),
            format: 'currency'
          },
          comparison: {
            label: 'Revenue',
            value: toCurrency(pnl.revenueTotal),
            format: 'currency',
            trend: 'down'
          },
          context: {
            category: top.name,
            range: {
              from: expenses.range?.from ?? pnl.fromDate,
              to: expenses.range?.to ?? pnl.toDate
            }
          },
          recommendation: `Validate contracts and spending controls for ${top.name.toLowerCase()} to protect margins.`,
          tags: ['expenses', 'margin impact'],
          dataSources: ['Expenses Summary', 'Profit & Loss'],
          detectedAt
        })
      }
    }

    const vendors = expenses.vendors || []
    const topVendor = vendors[0]
    const totalVendorSpend = vendors.reduce((sum, vendor) => sum + (typeof vendor.amount === 'number' ? vendor.amount : 0), 0)
    if (topVendor && totalVendorSpend > 0) {
      const vendorShare = topVendor.amount / totalVendorSpend
      if (vendorShare >= 0.4) {
        anomalies.push({
          id: 'vendor-concentration',
          type: 'expenses',
          severity: 'info',
          title: 'Vendor concentration risk',
          description: `${topVendor.name} represents ${Math.round(vendorShare * 100)}% of vendor spend in the selected range.`,
          metric: {
            label: topVendor.name,
            value: toCurrency(topVendor.amount),
            format: 'currency'
          },
          comparison: {
            label: 'Total Vendor Spend',
            value: toCurrency(totalVendorSpend),
            format: 'currency',
            trend: 'up'
          },
          context: {
            vendor: topVendor.name,
            range: expenses.range
          },
          recommendation: 'Consider competitive bids or secondary suppliers to reduce reliance on a single vendor.',
          tags: ['vendor', 'concentration'],
          dataSources: ['Expenses Summary'],
          detectedAt
        })
      }
    }
  }

  const severityCounts: Record<AnomalySeverity, number> = {
    critical: 0,
    warning: 0,
    info: 0
  }

  for (const anomaly of anomalies) {
    severityCounts[anomaly.severity] += 1
  }

  return {
    summary: {
      total: anomalies.length,
      bySeverity: severityCounts,
      generatedAt: detectedAt
    },
    anomalies
  }
})
