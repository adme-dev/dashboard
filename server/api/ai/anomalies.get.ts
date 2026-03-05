type AnomalySeverity = 'critical' | 'warning' | 'info'
type AnomalyType = 'profitability' | 'revenue' | 'expenses' | 'cashflow' | 'receivables' | 'budget'

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
  dailyTotals?: Array<{ date: string, amount: number }>
}

function toPercent(value: number | undefined | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return value
}

function toCurrency(value: number | undefined | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return value
}

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

export default eventHandler(async (event) => {
  const [pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance] = await Promise.all([
    $fetch<ProfitAndLossReport>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null),
    $fetch<ExpensesSummary>('/api/xero/expenses', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/bank-monitoring', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/reports/cash-flow-forecast', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/reports/aging', { headers: event.headers, query: { type: 'receivables' } }).catch(() => null),
    $fetch<any>('/api/xero/reports/budget-variance', { headers: event.headers }).catch(() => null),
  ]) as [ProfitAndLossReport | null, ExpensesSummary | null, any, any, any, any]

  const anomalies: Anomaly[] = []
  const detectedAt = new Date().toISOString()

  // ── Profitability anomalies (from P&L) ──
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
        metric: { label: 'Net Profit', value: toCurrency(netProfitValue), format: 'currency' },
        comparison: { label: 'Total Revenue', value: toCurrency(pnl.revenueTotal ?? 0), format: 'currency', trend: 'down' },
        context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
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
        metric: { label: 'Profit Margin', value: margin, format: 'percent' },
        comparison: previousPeriod
          ? { label: 'Prior Period Margin', value: toPercent(previousPeriod.profitMargin ?? 0), format: 'percent', trend: previousPeriod.profitMargin && margin < previousPeriod.profitMargin ? 'down' : 'up' }
          : undefined,
        context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
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
          metric: { label: 'Current Margin', value: margin, format: 'percent' },
          comparison: { label: 'Prior Margin', value: toPercent(previousPeriod.profitMargin ?? 0), format: 'percent', trend: 'down' },
          context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
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
          metric: { label: 'Current Revenue', value: toCurrency(latestPeriod.revenue ?? 0), format: 'currency' },
          comparison: { label: 'Prior Revenue', value: toCurrency(previousPeriod.revenue ?? 0), format: 'currency', trend: 'down' },
          context: { period: latestPeriod.label, range: { from: pnl.fromDate, to: pnl.toDate } },
          recommendation: 'Review sales pipeline, marketing performance, and outstanding receivables to identify the cause.',
          tags: ['revenue', 'trend'],
          dataSources: ['Profit & Loss'],
          detectedAt
        })
      }
    }
  }

  // ── Expense anomalies (from expenses summary) ──
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
        metric: { label: top.name, value: toCurrency(top.amount), format: 'currency' },
        comparison: { label: second.name, value: toCurrency(second.amount), format: 'currency', trend: 'up' },
        context: { category: top.name, range: expenses.range },
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
          metric: { label: top.name, value: toCurrency(top.amount), format: 'currency' },
          comparison: { label: 'Revenue', value: toCurrency(pnl.revenueTotal), format: 'currency', trend: 'down' },
          context: { category: top.name, range: { from: expenses.range?.from ?? pnl.fromDate, to: expenses.range?.to ?? pnl.toDate } },
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
          metric: { label: topVendor.name, value: toCurrency(topVendor.amount), format: 'currency' },
          comparison: { label: 'Total Vendor Spend', value: toCurrency(totalVendorSpend), format: 'currency', trend: 'up' },
          context: { vendor: topVendor.name, range: expenses.range },
          recommendation: 'Consider competitive bids or secondary suppliers to reduce reliance on a single vendor.',
          tags: ['vendor', 'concentration'],
          dataSources: ['Expenses Summary'],
          detectedAt
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
          anomalies.push({
            id: `daily-spike-${day.date}`,
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
            detectedAt
          })
        }
      }
    }

    // Statistical analysis on vendor spending
    if (vendors.length > 3) {
      const vendorAmounts = vendors.map(v => v.amount)
      const vendorMean = vendorAmounts.reduce((s, v) => s + v, 0) / vendorAmounts.length
      const vendorStdDev = calculateStandardDeviation(vendorAmounts)

      for (const v of vendors) {
        if (isStatisticalAnomaly(v.amount, vendorMean, vendorStdDev, 2.5)) {
          // Only flag outliers above the mean (unusually high)
          if (v.amount > vendorMean) {
            anomalies.push({
              id: `vendor-outlier-${v.name.replace(/\s+/g, '-').toLowerCase().slice(0, 30)}`,
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
              detectedAt
            })
          }
        }
      }
    }
  }

  // ── Cash flow anomalies (from bank monitoring + forecast) ──
  if (bankMonitoring) {
    const portfolio = bankMonitoring.portfolio
    const accounts = bankMonitoring.accounts || []

    // Check for overdraft on any account
    for (const acct of accounts) {
      if (typeof acct.currentBalance === 'number' && acct.currentBalance < 0) {
        anomalies.push({
          id: `bank-overdraft-${acct.accountName?.replace(/\s+/g, '-').toLowerCase().slice(0, 20) || 'unknown'}`,
          type: 'cashflow',
          severity: 'critical',
          title: `Account in overdraft: ${acct.accountName}`,
          description: `${acct.accountName} has a negative balance of $${Math.abs(acct.currentBalance).toFixed(0)}.`,
          metric: { label: acct.accountName, value: toCurrency(acct.currentBalance), format: 'currency' },
          recommendation: 'Transfer funds immediately or arrange overdraft facilities to avoid fees and failed payments.',
          tags: ['overdraft', 'bank'],
          dataSources: ['Bank Monitoring'],
          detectedAt
        })
      }
    }

    // Low cash reserves
    if (typeof portfolio?.totalBalance === 'number' && portfolio.totalBalance < 10000 && portfolio.totalBalance >= 0) {
      anomalies.push({
        id: 'low-cash-reserves',
        type: 'cashflow',
        severity: 'warning',
        title: 'Low cash reserves',
        description: `Total cash across all accounts is $${portfolio.totalBalance.toFixed(0)}, below the $10,000 safety threshold.`,
        metric: { label: 'Total Cash', value: toCurrency(portfolio.totalBalance), format: 'currency' },
        recommendation: 'Accelerate receivable collection, defer non-essential spending, or arrange a credit facility.',
        tags: ['cash reserves', 'liquidity'],
        dataSources: ['Bank Monitoring'],
        detectedAt
      })
    }

    // High cash velocity
    if (typeof portfolio?.cashVelocity === 'number' && portfolio.cashVelocity > 5) {
      anomalies.push({
        id: 'cash-velocity-extreme',
        type: 'cashflow',
        severity: 'info',
        title: 'High cash velocity',
        description: `Cash velocity is ${portfolio.cashVelocity.toFixed(1)}x — money is cycling through accounts faster than normal.`,
        metric: { label: 'Cash Velocity', value: portfolio.cashVelocity, format: 'number' },
        recommendation: 'High velocity can indicate healthy activity or tight cash management. Review if reserves are adequate.',
        tags: ['velocity', 'cash movement'],
        dataSources: ['Bank Monitoring'],
        detectedAt
      })
    }

    // High burn rate — running out in <30 days
    if (typeof portfolio?.totalBalance === 'number' && typeof portfolio?.totalOutflows === 'number' && portfolio.totalOutflows > 0) {
      const period = bankMonitoring.period
      const days = period?.days || 30
      const dailyBurn = portfolio.totalOutflows / days
      const runwayDays = dailyBurn > 0 ? portfolio.totalBalance / dailyBurn : Infinity
      if (runwayDays < 30 && runwayDays >= 0) {
        anomalies.push({
          id: 'high-burn-rate',
          type: 'cashflow',
          severity: 'warning',
          title: 'High cash burn rate',
          description: `At current spending rates ($${dailyBurn.toFixed(0)}/day), cash reserves will be depleted in ${Math.round(runwayDays)} days.`,
          metric: { label: 'Runway', value: Math.round(runwayDays), format: 'number' },
          comparison: { label: 'Daily Burn', value: toCurrency(dailyBurn), format: 'currency', trend: 'up' },
          recommendation: 'Reduce discretionary spending and accelerate invoice collection to extend cash runway.',
          tags: ['burn rate', 'runway'],
          dataSources: ['Bank Monitoring'],
          detectedAt
        })
      }
    }
  }

  if (cashForecast) {
    // Shortfall projected
    if (cashForecast.shortfallDates?.length > 0) {
      anomalies.push({
        id: 'shortfall-projected',
        type: 'cashflow',
        severity: 'critical',
        title: 'Cash shortfall projected',
        description: `Forecast shows negative cash balance on ${cashForecast.shortfallDates.length} date(s). First shortfall: ${cashForecast.shortfallDates[0]}.`,
        metric: { label: 'Min Projected Balance', value: toCurrency(cashForecast.minProjectedBalance ?? 0), format: 'currency' },
        comparison: { label: 'Current Cash', value: toCurrency(cashForecast.currentCash ?? 0), format: 'currency', trend: 'down' },
        recommendation: 'Arrange bridging finance, accelerate collections, or defer outgoing payments before the shortfall date.',
        tags: ['forecast', 'shortfall'],
        dataSources: ['Cash Flow Forecast'],
        detectedAt
      })
    }
  }

  // ── Receivables anomalies (from aging report) ──
  if (aging) {
    const totalOutstanding = aging.totalOutstanding ?? 0
    const criticalAmount = aging.criticalAmount ?? 0
    const avgDaysPastDue = aging.averageDaysPastDue ?? 0
    const agingSummary = aging.agingSummary || []
    const topContacts = aging.topContacts || []

    // Overdue spike
    if (totalOutstanding > 0 && criticalAmount / totalOutstanding > 0.4) {
      anomalies.push({
        id: 'overdue-spike',
        type: 'receivables',
        severity: 'critical',
        title: 'Critical overdue receivables',
        description: `$${criticalAmount.toFixed(0)} in critical overdue invoices — ${Math.round(criticalAmount / totalOutstanding * 100)}% of all outstanding receivables.`,
        metric: { label: 'Critical Overdue', value: toCurrency(criticalAmount), format: 'currency' },
        comparison: { label: 'Total Outstanding', value: toCurrency(totalOutstanding), format: 'currency', trend: 'down' },
        recommendation: 'Escalate collection efforts on overdue accounts. Consider offering settlement discounts for immediate payment.',
        tags: ['overdue', 'collections'],
        dataSources: ['Aging Report'],
        detectedAt
      })
    }

    // Aging concentration — 90+ bucket > 30% of outstanding
    const bucket90Plus = agingSummary.find((b: any) => b.bucket === '90+')
    if (bucket90Plus && totalOutstanding > 0 && bucket90Plus.amount / totalOutstanding > 0.3) {
      anomalies.push({
        id: 'aging-concentration',
        type: 'receivables',
        severity: 'warning',
        title: 'Aging concentration in 90+ days',
        description: `$${bucket90Plus.amount.toFixed(0)} (${bucket90Plus.percentage?.toFixed(0) || Math.round(bucket90Plus.amount / totalOutstanding * 100)}%) of receivables are aged over 90 days.`,
        metric: { label: '90+ Days', value: toCurrency(bucket90Plus.amount), format: 'currency' },
        comparison: { label: 'Total Outstanding', value: toCurrency(totalOutstanding), format: 'currency', trend: 'up' },
        recommendation: 'Review aged receivables for write-off candidates and intensify collection for recoverable amounts.',
        tags: ['aging', '90+ days'],
        dataSources: ['Aging Report'],
        detectedAt
      })
    }

    // Slow payer risk
    if (avgDaysPastDue > 45) {
      anomalies.push({
        id: 'slow-payer-risk',
        type: 'receivables',
        severity: 'info',
        title: 'Slow payer trend',
        description: `Average days past due is ${Math.round(avgDaysPastDue)} days — well above the 30-day standard.`,
        metric: { label: 'Avg Days Past Due', value: Math.round(avgDaysPastDue), format: 'number' },
        recommendation: 'Review payment terms, consider early-payment incentives, or tighten credit policies for slow payers.',
        tags: ['payment terms', 'slow payers'],
        dataSources: ['Aging Report'],
        detectedAt
      })
    }

    // Client concentration
    if (topContacts.length > 0 && totalOutstanding > 0) {
      const topClient = topContacts[0]
      const topClientShare = topClient.amount / totalOutstanding
      if (topClientShare > 0.5) {
        anomalies.push({
          id: 'client-concentration',
          type: 'receivables',
          severity: 'warning',
          title: 'Client concentration risk',
          description: `${topClient.name} represents ${Math.round(topClientShare * 100)}% of all outstanding receivables ($${topClient.amount.toFixed(0)}).`,
          metric: { label: topClient.name, value: toCurrency(topClient.amount), format: 'currency' },
          comparison: { label: 'Total Outstanding', value: toCurrency(totalOutstanding), format: 'currency', trend: 'up' },
          recommendation: 'Diversify the client base and ensure this client has strong credit standing. Monitor their payment patterns closely.',
          tags: ['concentration', 'client risk'],
          dataSources: ['Aging Report'],
          detectedAt
        })
      }
    }
  }

  // ── Budget anomalies (from budget variance) ──
  if (budgetVariance) {
    const summary = budgetVariance.summary
    const categoryAnalysis = budgetVariance.categoryAnalysis || []

    // Overall budget overspend
    if (summary && typeof summary.totalVariancePercent === 'number') {
      if (summary.totalVariancePercent > 50) {
        anomalies.push({
          id: 'budget-overspend-critical',
          type: 'budget',
          severity: 'critical',
          title: 'Budget significantly exceeded',
          description: `Total spending is ${summary.totalVariancePercent.toFixed(0)}% over budget ($${(summary.totalActual || 0).toFixed(0)} actual vs $${(summary.totalBudget || 0).toFixed(0)} budgeted).`,
          metric: { label: 'Total Variance', value: summary.totalVariancePercent / 100, format: 'percent' },
          comparison: { label: 'Budget', value: toCurrency(summary.totalBudget || 0), format: 'currency', trend: 'up' },
          recommendation: 'Immediately review and freeze discretionary spending. Identify the categories driving the overrun.',
          tags: ['budget', 'overspend'],
          dataSources: ['Budget Variance'],
          detectedAt
        })
      } else if (summary.totalVariancePercent > 30) {
        anomalies.push({
          id: 'budget-overspend-warning',
          type: 'budget',
          severity: 'warning',
          title: 'Budget overrun',
          description: `Total spending is ${summary.totalVariancePercent.toFixed(0)}% over budget for the current period.`,
          metric: { label: 'Total Variance', value: summary.totalVariancePercent / 100, format: 'percent' },
          comparison: { label: 'Budget', value: toCurrency(summary.totalBudget || 0), format: 'currency', trend: 'up' },
          recommendation: 'Review spending by category and identify areas where budget can be reallocated or spending reduced.',
          tags: ['budget', 'overspend'],
          dataSources: ['Budget Variance'],
          detectedAt
        })
      }
    }

    // Projected month-end overspend
    if (summary && typeof summary.projectedMonthEnd === 'number' && typeof summary.totalBudget === 'number' && summary.totalBudget > 0) {
      if (summary.projectedMonthEnd > summary.totalBudget * 1.15) {
        anomalies.push({
          id: 'projected-overspend',
          type: 'budget',
          severity: 'warning',
          title: 'Projected to exceed budget by month-end',
          description: `At current run rate, spending will reach $${summary.projectedMonthEnd.toFixed(0)} by month-end — ${Math.round((summary.projectedMonthEnd / summary.totalBudget - 1) * 100)}% over the $${summary.totalBudget.toFixed(0)} budget.`,
          metric: { label: 'Projected Total', value: toCurrency(summary.projectedMonthEnd), format: 'currency' },
          comparison: { label: 'Budget', value: toCurrency(summary.totalBudget), format: 'currency', trend: 'up' },
          recommendation: 'Slow spending in over-budget categories for the remainder of the month.',
          tags: ['budget', 'forecast'],
          dataSources: ['Budget Variance'],
          detectedAt
        })
      }
    }

    // Individual category overruns >30%
    for (const cat of categoryAnalysis) {
      if (cat.status === 'over' && typeof cat.variancePercent === 'number' && cat.variancePercent > 30) {
        anomalies.push({
          id: `budget-cat-${cat.category?.replace(/\s+/g, '-').toLowerCase().slice(0, 25) || 'unknown'}`,
          type: 'budget',
          severity: cat.variancePercent > 50 ? 'warning' : 'info',
          title: `${cat.category} over budget`,
          description: `${cat.category} is ${cat.variancePercent.toFixed(0)}% over budget ($${(cat.actual || 0).toFixed(0)} actual vs $${(cat.budgeted || 0).toFixed(0)} budgeted).`,
          metric: { label: 'Actual', value: toCurrency(cat.actual || 0), format: 'currency' },
          comparison: { label: 'Budgeted', value: toCurrency(cat.budgeted || 0), format: 'currency', trend: 'up' },
          context: { category: cat.category },
          recommendation: `Review ${cat.category} spending and determine if the budget needs revision or if spending can be reduced.`,
          tags: ['budget', 'category overrun'],
          dataSources: ['Budget Variance'],
          detectedAt
        })
      }
    }

    // Multiple categories over budget
    const overBudgetCount = summary?.overBudgetCount || categoryAnalysis.filter((c: any) => c.status === 'over').length
    if (overBudgetCount >= 3) {
      anomalies.push({
        id: 'multiple-budget-overruns',
        type: 'budget',
        severity: 'info',
        title: 'Multiple categories over budget',
        description: `${overBudgetCount} expense categories are currently over budget — suggesting systemic underfunding or spending discipline issues.`,
        metric: { label: 'Over-Budget Categories', value: overBudgetCount, format: 'number' },
        recommendation: 'Conduct a full budget review. Consider if budgets are realistic or if organisation-wide spending controls are needed.',
        tags: ['budget', 'systemic'],
        dataSources: ['Budget Variance'],
        detectedAt
      })
    }
  }

  // ── Build summary ──
  const severityCounts: Record<AnomalySeverity, number> = { critical: 0, warning: 0, info: 0 }
  const typeCounts: Record<AnomalyType, number> = { profitability: 0, revenue: 0, expenses: 0, cashflow: 0, receivables: 0, budget: 0 }

  for (const anomaly of anomalies) {
    severityCounts[anomaly.severity] += 1
    typeCounts[anomaly.type] += 1
  }

  return {
    summary: {
      total: anomalies.length,
      bySeverity: severityCounts,
      byType: typeCounts,
      generatedAt: detectedAt
    },
    anomalies
  }
})
