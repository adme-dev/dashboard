import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { cachedFetch } from '~~/server/utils/kv'
import { getSelectedTenant } from '~~/server/utils/session'

type InsightSeverity = 'success' | 'info' | 'warning' | 'critical'

interface KeyMetric {
  label: string
  value: string
  format?: 'currency' | 'percent' | 'number' | 'days'
  trend?: 'up' | 'down' | 'flat'
  context?: string
}

interface Insight {
  title: string
  detail: string
  severity: InsightSeverity
  metric?: { label: string, value: string }
  comparison?: { label: string, value: string, trend?: 'up' | 'down' }
  tags?: string[]
}

interface Section {
  id: string
  title: string
  icon: string
  insights: Insight[]
}

interface Recommendation {
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  category: string
  actionSteps?: string[]
}

function fmtAud(value: number): string {
  return Number(value).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: Math.abs(value) < 1 ? 2 : 0 })
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function severityFromMargin(margin: number): InsightSeverity {
  if (margin >= 0.2) return 'success'
  if (margin >= 0.1) return 'info'
  if (margin >= 0.05) return 'warning'
  return 'critical'
}

function healthLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 65) return 'Good'
  if (score >= 50) return 'Fair'
  if (score >= 35) return 'Needs Attention'
  return 'Critical'
}

export default eventHandler(async (event) => {
  const tenantId = await getSelectedTenant(event)

  const cacheKey = tenantId ? `ai:insights:${tenantId}` : 'ai:insights:default'

  return cachedFetch(event, cacheKey, 3600, async () => {
    // Fetch all 8 data sources in parallel
    const [pnl, expenses, invoices, bankMonitoring, cashForecast, aging, budgetVariance, cashFlowInsights] = await Promise.all([
      $fetch<any>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null),
      $fetch<any>('/api/xero/expenses', { headers: event.headers }).catch(() => null),
      $fetch<any>('/api/xero/invoices', { headers: event.headers }).catch(() => null),
      $fetch<any>('/api/xero/bank-monitoring', { headers: event.headers }).catch(() => null),
      $fetch<any>('/api/xero/reports/cash-flow-forecast', { headers: event.headers }).catch(() => null),
      $fetch<any>('/api/xero/reports/aging', { headers: event.headers, query: { type: 'receivables' } }).catch(() => null),
      $fetch<any>('/api/xero/reports/budget-variance', { headers: event.headers }).catch(() => null),
      $fetch<any>('/api/cashflow', { headers: event.headers }).catch(() => null),
    ])

    const sections: Section[] = []
    const keyMetrics: KeyMetric[] = []
    const recommendations: Recommendation[] = []

    // ── Health score components (each 0-25, total 0-100) ──
    let profitabilityScore = 15 // default neutral
    let cashScore = 15
    let receivablesScore = 15
    let budgetScore = 15

    // ════════════════════════════════════════════════════════
    // Section 1: Profitability
    // ════════════════════════════════════════════════════════
    if (pnl) {
      const margin = typeof pnl.profitMargin === 'number' ? pnl.profitMargin : null
      const netProfit = typeof pnl.netProfit === 'number' ? pnl.netProfit : null
      const revenue = typeof pnl.revenueTotal === 'number' ? pnl.revenueTotal : null
      const expensesTotal = typeof pnl.expensesTotal === 'number' ? pnl.expensesTotal : null
      const latestPeriod = pnl.periods?.[pnl.periods.length - 1]
      const previousPeriod = pnl.periods?.[pnl.periods.length - 2]

      const sectionInsights: Insight[] = []

      // Health score for profitability
      if (margin !== null) {
        if (margin >= 0.2) profitabilityScore = 25
        else if (margin >= 0.1) profitabilityScore = 20
        else if (margin >= 0.05) profitabilityScore = 12
        else if (margin >= 0) profitabilityScore = 6
        else profitabilityScore = 0
      }

      if (margin !== null) {
        keyMetrics.push({ label: 'Profit Margin', value: fmtPct(margin), format: 'percent', context: margin >= 0.15 ? 'Healthy' : margin >= 0.05 ? 'Below target' : 'Critical' })
      }
      if (netProfit !== null) {
        keyMetrics.push({ label: 'Net Profit', value: fmtAud(netProfit), format: 'currency', trend: netProfit >= 0 ? 'up' : 'down' })
      }
      if (revenue !== null) {
        keyMetrics.push({ label: 'Revenue', value: fmtAud(revenue), format: 'currency' })
      }

      // Margin insight
      if (margin !== null) {
        sectionInsights.push({
          title: 'Profit Margin',
          detail: `Current profit margin is ${fmtPct(margin)}. ${margin >= 0.15 ? 'This is within a healthy range for a services agency.' : margin >= 0.05 ? 'Margin is below the 15% target — review cost structure.' : 'Margins are critically low and need immediate attention.'}`,
          severity: severityFromMargin(margin),
          metric: { label: 'Margin', value: fmtPct(margin) }
        })
      }

      // Net profit insight
      if (netProfit !== null) {
        sectionInsights.push({
          title: netProfit >= 0 ? 'Profitable' : 'Net Loss',
          detail: `Net profit for the period is ${fmtAud(netProfit)}.${revenue ? ` Revenue of ${fmtAud(revenue)} against expenses of ${fmtAud(expensesTotal || 0)}.` : ''}`,
          severity: netProfit >= 0 ? 'success' : 'critical',
          metric: { label: 'Net Profit', value: fmtAud(netProfit) }
        })
      }

      // Expense ratio
      if (revenue && expensesTotal && revenue > 0) {
        const ratio = expensesTotal / revenue
        sectionInsights.push({
          title: 'Expense Ratio',
          detail: `Expenses are ${fmtPct(ratio)} of revenue. ${ratio > 0.85 ? 'Very little room for profit — cost control is essential.' : ratio > 0.7 ? 'Moderate expense ratio. Monitor for upward trends.' : 'Healthy expense ratio with good margin protection.'}`,
          severity: ratio > 0.85 ? 'warning' : ratio > 0.7 ? 'info' : 'success',
          metric: { label: 'Expense/Revenue', value: fmtPct(ratio) }
        })
      }

      // Period-over-period trend
      if (latestPeriod && previousPeriod && typeof latestPeriod.netProfit === 'number' && typeof previousPeriod.netProfit === 'number') {
        const change = previousPeriod.netProfit !== 0 ? (latestPeriod.netProfit - previousPeriod.netProfit) / Math.abs(previousPeriod.netProfit) : 0
        if (Math.abs(change) >= 0.05) {
          sectionInsights.push({
            title: 'Profit Trend',
            detail: `Net profit ${change > 0 ? 'increased' : 'decreased'} by ${fmtPct(Math.abs(change))} compared to the prior period (${fmtAud(previousPeriod.netProfit)} → ${fmtAud(latestPeriod.netProfit)}).`,
            severity: change > 0 ? 'success' : 'warning',
            comparison: { label: 'Prior Period', value: fmtAud(previousPeriod.netProfit), trend: change > 0 ? 'up' : 'down' }
          })
        }
      }

      if (sectionInsights.length > 0) {
        sections.push({ id: 'profitability', title: 'Profitability', icon: 'i-lucide-piggy-bank', insights: sectionInsights })
      }

      // Recommendations
      if (margin !== null && margin < 0.1) {
        recommendations.push({
          title: 'Improve profit margins',
          description: `Current margin of ${fmtPct(margin)} is below the 10% minimum target. Focus on pricing and cost management.`,
          impact: margin < 0.05 ? 'high' : 'medium',
          category: 'Profitability',
          actionSteps: ['Review pricing across all service lines', 'Identify the top 3 cost centres driving the margin down', 'Benchmark staff utilisation rates against industry norms']
        })
      }
    }

    // ════════════════════════════════════════════════════════
    // Section 2: Cash Position
    // ════════════════════════════════════════════════════════
    {
      const sectionInsights: Insight[] = []

      if (bankMonitoring?.portfolio) {
        const p = bankMonitoring.portfolio
        const totalBalance = typeof p.totalBalance === 'number' ? p.totalBalance : null

        if (totalBalance !== null) {
          keyMetrics.push({ label: 'Cash Balance', value: fmtAud(totalBalance), format: 'currency', trend: totalBalance >= 0 ? 'up' : 'down' })

          sectionInsights.push({
            title: 'Cash Position',
            detail: `Total cash across ${p.accountCount || 'all'} accounts is ${fmtAud(totalBalance)}.${typeof p.netCashFlow === 'number' ? ` Net cash flow for the period is ${fmtAud(p.netCashFlow)}.` : ''}`,
            severity: totalBalance < 0 ? 'critical' : totalBalance < 10000 ? 'warning' : 'success',
            metric: { label: 'Total Cash', value: fmtAud(totalBalance) }
          })
        }

        // Burn rate / runway
        if (typeof p.totalBalance === 'number' && typeof p.totalOutflows === 'number' && p.totalOutflows > 0) {
          const days = bankMonitoring.period?.days || 30
          const dailyBurn = p.totalOutflows / days
          const runway = dailyBurn > 0 ? Math.round(p.totalBalance / dailyBurn) : 999

          // Health score for cash
          if (runway >= 90) cashScore = 25
          else if (runway >= 60) cashScore = 20
          else if (runway >= 30) cashScore = 12
          else if (runway >= 15) cashScore = 6
          else cashScore = 0

          keyMetrics.push({ label: 'Cash Runway', value: `${runway} days`, format: 'days', context: runway < 30 ? 'Critical' : runway < 60 ? 'Monitor' : 'Healthy' })

          sectionInsights.push({
            title: 'Cash Burn Rate',
            detail: `Daily average outflows are ${fmtAud(dailyBurn)}. At this rate, current reserves provide ${runway} days of runway.`,
            severity: runway < 30 ? 'critical' : runway < 60 ? 'warning' : 'info',
            metric: { label: 'Daily Burn', value: fmtAud(dailyBurn) }
          })
        }
      }

      if (cashForecast) {
        if (cashForecast.shortfallDates?.length > 0) {
          sectionInsights.push({
            title: 'Cash Shortfall Ahead',
            detail: `Forecast projects a cash shortfall on ${cashForecast.shortfallDates[0]}. Minimum projected balance is ${fmtAud(cashForecast.minProjectedBalance ?? 0)}.`,
            severity: 'critical',
            metric: { label: 'Min Balance', value: fmtAud(cashForecast.minProjectedBalance ?? 0) }
          })
          cashScore = Math.min(cashScore, 5)
        } else if (typeof cashForecast.projectedEndBalance === 'number') {
          sectionInsights.push({
            title: 'Cash Forecast',
            detail: `Projected cash position in ${cashForecast.forecastPeriod || 90} days is ${fmtAud(cashForecast.projectedEndBalance)}.`,
            severity: cashForecast.projectedEndBalance >= 0 ? 'info' : 'warning',
            metric: { label: 'Projected Balance', value: fmtAud(cashForecast.projectedEndBalance) }
          })
        }
      } else if (cashFlowInsights?.buckets?.length) {
        const next30 = cashFlowInsights.buckets[0]
        if (next30) {
          sectionInsights.push({
            title: '30-Day Cash Outlook',
            detail: `Projected cash in 30 days is ${fmtAud(next30.projected)} (inflows ${fmtAud(next30.inflow)}, outflows ${fmtAud(next30.outflow)}).`,
            severity: next30.projected < 0 ? 'warning' : 'info',
            metric: { label: 'Projected', value: fmtAud(next30.projected) }
          })
        }
      }

      if (sectionInsights.length > 0) {
        sections.push({ id: 'cash-position', title: 'Cash Position', icon: 'i-lucide-wallet', insights: sectionInsights })
      }

      if (bankMonitoring?.portfolio && typeof bankMonitoring.portfolio.totalBalance === 'number' && bankMonitoring.portfolio.totalBalance < 10000) {
        recommendations.push({
          title: 'Build cash reserves',
          description: 'Cash reserves are below $10,000. Aim for 2-3 months of operating expenses as a safety buffer.',
          impact: 'high',
          category: 'Cash Flow',
          actionSteps: ['Accelerate outstanding invoice collection', 'Negotiate extended payment terms with suppliers', 'Review and reduce discretionary spending']
        })
      }
    }

    // ════════════════════════════════════════════════════════
    // Section 3: Revenue & Receivables
    // ════════════════════════════════════════════════════════
    {
      const sectionInsights: Insight[] = []

      if (invoices?.summary) {
        const s = invoices.summary
        const outstanding = typeof s.outstandingTotal === 'number' ? s.outstandingTotal : null
        const overdue = typeof s.overdueTotal === 'number' ? s.overdueTotal : null

        if (outstanding !== null) {
          keyMetrics.push({ label: 'Outstanding Invoices', value: fmtAud(outstanding), format: 'currency' })

          sectionInsights.push({
            title: 'Outstanding Receivables',
            detail: `${s.outstandingCount || 0} invoices totalling ${fmtAud(outstanding)} are currently outstanding.${overdue ? ` Of these, ${fmtAud(overdue)} (${s.overdueCount || 0} invoices) are overdue.` : ''}`,
            severity: overdue && outstanding > 0 && overdue / outstanding > 0.3 ? 'warning' : 'info',
            metric: { label: 'Outstanding', value: fmtAud(outstanding) }
          })
        }

        if (typeof s.avgDaysToPay === 'number') {
          sectionInsights.push({
            title: 'Average Days to Pay',
            detail: `Clients take an average of ${Math.round(s.avgDaysToPay)} days to pay invoices.${s.avgDaysToPay > 30 ? ' This exceeds standard 30-day terms.' : ''}`,
            severity: s.avgDaysToPay > 45 ? 'warning' : s.avgDaysToPay > 30 ? 'info' : 'success',
            metric: { label: 'Avg Days', value: `${Math.round(s.avgDaysToPay)}` }
          })
        }

        // Top customers
        if (s.topCustomers?.length > 0) {
          const topCust = s.topCustomers[0]
          sectionInsights.push({
            title: 'Top Client by Outstanding',
            detail: `${topCust.name} has ${fmtAud(topCust.outstanding)} outstanding across ${topCust.count} invoices.${topCust.overdue > 0 ? ` ${fmtAud(topCust.overdue)} is overdue.` : ''}`,
            severity: topCust.overdue > 0 ? 'warning' : 'info',
            metric: { label: topCust.name, value: fmtAud(topCust.outstanding) }
          })
        }
      }

      if (aging) {
        const totalOutstanding = aging.totalOutstanding ?? 0
        const criticalAmount = aging.criticalAmount ?? 0
        const overdueRatio = totalOutstanding > 0 ? criticalAmount / totalOutstanding : 0

        // Health score for receivables
        if (overdueRatio <= 0.1) receivablesScore = 25
        else if (overdueRatio <= 0.2) receivablesScore = 20
        else if (overdueRatio <= 0.35) receivablesScore = 12
        else if (overdueRatio <= 0.5) receivablesScore = 6
        else receivablesScore = 0

        const agingSummary = aging.agingSummary || []
        if (agingSummary.length > 0) {
          const bucketLabels = agingSummary.map((b: any) => `${b.bucket}: ${fmtAud(b.amount)} (${b.percentage?.toFixed(0) || Math.round(b.amount / totalOutstanding * 100)}%)`).join(', ')
          sectionInsights.push({
            title: 'Aging Breakdown',
            detail: `Receivables by age: ${bucketLabels}.`,
            severity: overdueRatio > 0.3 ? 'warning' : 'info',
            tags: ['aging']
          })
        }
      }

      if (sectionInsights.length > 0) {
        sections.push({ id: 'revenue', title: 'Revenue & Receivables', icon: 'i-lucide-receipt', insights: sectionInsights })
      }

      // Recommendations
      if (aging && aging.criticalAmount > 0 && aging.totalOutstanding > 0 && aging.criticalAmount / aging.totalOutstanding > 0.2) {
        recommendations.push({
          title: 'Reduce overdue receivables',
          description: `${fmtAud(aging.criticalAmount)} in critical overdue invoices. Focused collection could improve cash flow significantly.`,
          impact: 'high',
          category: 'Revenue',
          actionSteps: ['Contact all 90+ day overdue clients this week', 'Offer early-payment discounts for large outstanding balances', 'Implement automated payment reminders at 7, 14, and 30 days']
        })
      }
    }

    // ════════════════════════════════════════════════════════
    // Section 4: Expenses
    // ════════════════════════════════════════════════════════
    if (expenses) {
      const sectionInsights: Insight[] = []
      const categories = expenses.categories || []
      const vendors = expenses.vendors || []
      const totalExpenses = categories.reduce((s: number, c: any) => s + (c.amount || 0), 0)

      if (categories.length > 0 && totalExpenses > 0) {
        // Top categories
        const topCats = categories.slice(0, 3)
        const topCatLines = topCats.map((c: any) => `${c.name}: ${fmtAud(c.amount)} (${((c.amount / totalExpenses) * 100).toFixed(0)}%)`).join(', ')
        sectionInsights.push({
          title: 'Top Expense Categories',
          detail: `Largest spend areas: ${topCatLines}. Total period expenses: ${fmtAud(totalExpenses)}.`,
          severity: 'info',
          metric: { label: 'Total Expenses', value: fmtAud(totalExpenses) }
        })
      }

      if (vendors.length > 0) {
        const topVendor = vendors[0]
        const vendorTotal = vendors.reduce((s: number, v: any) => s + (v.amount || 0), 0)
        const vendorShare = vendorTotal > 0 ? topVendor.amount / vendorTotal : 0
        sectionInsights.push({
          title: 'Top Vendor',
          detail: `${topVendor.name} is the highest vendor at ${fmtAud(topVendor.amount)} (${(vendorShare * 100).toFixed(0)}% of vendor spend).${vendorShare > 0.4 ? ' High concentration — consider diversifying.' : ''}`,
          severity: vendorShare > 0.4 ? 'warning' : 'info',
          metric: { label: topVendor.name, value: fmtAud(topVendor.amount) }
        })
      }

      // MoM change
      const mom = expenses.monthOverMonth
      if (mom && typeof mom.change === 'number' && Math.abs(mom.change) >= 5) {
        sectionInsights.push({
          title: 'Month-over-Month Change',
          detail: `Spending ${mom.change > 0 ? 'increased' : 'decreased'} ${Math.abs(mom.change).toFixed(1)}% compared to last period (${fmtAud(Math.abs(mom.changeAmount || 0))} ${mom.change > 0 ? 'more' : 'less'}).`,
          severity: mom.change > 20 ? 'warning' : mom.change > 0 ? 'info' : 'success',
          comparison: { label: 'Previous Period', value: fmtAud(mom.previous?.total || 0), trend: mom.change > 0 ? 'up' : 'down' }
        })
      }

      // Fixed vs variable
      const fv = expenses.fixedVsVariable
      if (fv && typeof fv.fixed?.total === 'number' && totalExpenses > 0) {
        const fixedRatio = fv.fixed.total / totalExpenses
        sectionInsights.push({
          title: 'Fixed vs Variable Costs',
          detail: `Fixed costs are ${fmtAud(fv.fixed.total)} (${(fixedRatio * 100).toFixed(0)}%) and variable costs are ${fmtAud(fv.variable?.total || 0)} (${((1 - fixedRatio) * 100).toFixed(0)}%).`,
          severity: fixedRatio > 0.7 ? 'warning' : 'info',
          tags: ['cost structure']
        })
      }

      // Subscriptions
      const subs = expenses.subscriptions
      if (subs?.items?.length > 0) {
        sectionInsights.push({
          title: 'Recurring Subscriptions',
          detail: `${subs.items.length} recurring vendors totalling ${fmtAud(subs.total || 0)}/month. Top: ${subs.items.slice(0, 3).map((s: any) => s.vendor).join(', ')}.`,
          severity: subs.total > totalExpenses * 0.15 ? 'warning' : 'info',
          metric: { label: 'Monthly Subscriptions', value: fmtAud(subs.total || 0) }
        })
      }

      if (sectionInsights.length > 0) {
        sections.push({ id: 'expenses', title: 'Expenses', icon: 'i-lucide-credit-card', insights: sectionInsights })
      }

      if (expenses.subscriptions?.items?.length > 5) {
        recommendations.push({
          title: 'Audit recurring subscriptions',
          description: `${expenses.subscriptions.items.length} subscription vendors totalling ${fmtAud(expenses.subscriptions.total || 0)}/month. Likely savings of 10-20%.`,
          impact: 'medium',
          category: 'Expenses',
          actionSteps: ['List all active subscription services', 'Identify overlapping or underutilised tools', 'Cancel or downgrade low-value subscriptions']
        })
      }
    }

    // ════════════════════════════════════════════════════════
    // Section 5: Budget Performance
    // ════════════════════════════════════════════════════════
    if (budgetVariance) {
      const sectionInsights: Insight[] = []
      const summary = budgetVariance.summary
      const categoryAnalysis = budgetVariance.categoryAnalysis || []

      if (summary) {
        // Health score for budget
        const variancePct = typeof summary.totalVariancePercent === 'number' ? summary.totalVariancePercent : 0
        if (variancePct <= 5) budgetScore = 25
        else if (variancePct <= 15) budgetScore = 20
        else if (variancePct <= 30) budgetScore = 12
        else if (variancePct <= 50) budgetScore = 6
        else budgetScore = 0

        sectionInsights.push({
          title: 'Budget Overview',
          detail: `Actual spending is ${fmtAud(summary.totalActual || 0)} against a budget of ${fmtAud(summary.totalBudget || 0)} — a ${variancePct.toFixed(0)}% ${variancePct > 0 ? 'overrun' : 'underspend'}.`,
          severity: variancePct > 30 ? 'critical' : variancePct > 15 ? 'warning' : variancePct <= 0 ? 'success' : 'info',
          metric: { label: 'Variance', value: `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(0)}%` }
        })

        if (typeof summary.projectedMonthEnd === 'number' && typeof summary.totalBudget === 'number' && summary.totalBudget > 0) {
          const projectedOverage = (summary.projectedMonthEnd / summary.totalBudget - 1) * 100
          if (projectedOverage > 5) {
            sectionInsights.push({
              title: 'Month-End Projection',
              detail: `At current run rate, spending will reach ${fmtAud(summary.projectedMonthEnd)} by month-end — ${projectedOverage.toFixed(0)}% over budget.`,
              severity: projectedOverage > 20 ? 'warning' : 'info',
              metric: { label: 'Projected', value: fmtAud(summary.projectedMonthEnd) }
            })
          }
        }

        const overBudgetCount = summary.overBudgetCount ?? categoryAnalysis.filter((c: any) => c.status === 'over').length
        if (overBudgetCount > 0) {
          sectionInsights.push({
            title: 'Categories Over Budget',
            detail: `${overBudgetCount} expense ${overBudgetCount === 1 ? 'category is' : 'categories are'} currently over budget.`,
            severity: overBudgetCount >= 3 ? 'warning' : 'info',
            metric: { label: 'Over Budget', value: `${overBudgetCount}` }
          })
        }

        // Top over-budget categories
        const overBudgetCats = categoryAnalysis.filter((c: any) => c.status === 'over' && c.variancePercent > 10).slice(0, 3)
        for (const cat of overBudgetCats) {
          sectionInsights.push({
            title: `${cat.category} Over Budget`,
            detail: `${cat.category} is ${cat.variancePercent.toFixed(0)}% over budget (${fmtAud(cat.actual)} actual vs ${fmtAud(cat.budgeted)} budgeted).`,
            severity: cat.variancePercent > 30 ? 'warning' : 'info',
            metric: { label: 'Actual', value: fmtAud(cat.actual) },
            comparison: { label: 'Budget', value: fmtAud(cat.budgeted), trend: 'up' }
          })
        }
      }

      if (sectionInsights.length > 0) {
        sections.push({ id: 'budget', title: 'Budget Performance', icon: 'i-lucide-calculator', insights: sectionInsights })
      }

      if (summary && typeof summary.totalVariancePercent === 'number' && summary.totalVariancePercent > 15) {
        recommendations.push({
          title: 'Address budget overruns',
          description: `Spending is ${summary.totalVariancePercent.toFixed(0)}% over budget. Review the ${summary.overBudgetCount || 'affected'} over-budget categories.`,
          impact: summary.totalVariancePercent > 30 ? 'high' : 'medium',
          category: 'Budget',
          actionSteps: ['Freeze non-essential spending for the rest of the month', 'Review budgets — are they realistic?', 'Set up automated alerts when categories approach 80% of budget']
        })
      }
    }

    // ── Compute health score ──
    const healthScore = Math.min(100, Math.max(0, profitabilityScore + cashScore + receivablesScore + budgetScore))

    // ── Generate executive headline via Groq (or fallback) ──
    let headline = ''
    try {
      const dataSummary = [
        pnl ? `Profit margin: ${fmtPct(pnl.profitMargin || 0)}, Net profit: ${fmtAud(pnl.netProfit || 0)}` : null,
        bankMonitoring?.portfolio ? `Cash balance: ${fmtAud(bankMonitoring.portfolio.totalBalance || 0)}` : null,
        aging ? `Outstanding receivables: ${fmtAud(aging.totalOutstanding || 0)}, Overdue: ${fmtAud(aging.criticalAmount || 0)}` : null,
        budgetVariance?.summary ? `Budget variance: ${budgetVariance.summary.totalVariancePercent?.toFixed(0) || 0}%` : null,
        `Health score: ${healthScore}/100 (${healthLabel(healthScore)})`
      ].filter(Boolean).join('. ')

      const raw = await generateGroqInsight(
        `Based on these financial metrics for an Australian marketing agency, write a single-sentence executive headline (max 25 words) summarising the financial position. Be specific and data-driven.\n\nData: ${dataSummary}`,
        {
          model: GROQ_MODELS.LLAMA_8B,
          temperature: 0.3,
          maxTokens: 100,
          featureKey: 'financial_insights_headline',
          clientId: tenantId || undefined,
          requestId: cacheKey,
          metadata: {
            route: '/api/ai/insights',
            tenantId: tenantId || null,
            healthScore,
            healthLabel: healthLabel(healthScore),
            hasPnl: Boolean(pnl),
            hasBankMonitoring: Boolean(bankMonitoring),
            hasAging: Boolean(aging),
            hasBudgetVariance: Boolean(budgetVariance),
            keyMetricCount: keyMetrics.length,
            sectionCount: sections.length,
            recommendationCount: recommendations.length,
          },
          systemPrompt: 'You are a CFO writing a one-line executive summary. Respond with just the sentence, no quotes or formatting.'
        }
      )
      headline = raw.trim().replace(/^["']|["']$/g, '')
    } catch {
      // Rule-based fallback
      if (healthScore >= 80) headline = 'Financial health is strong across all indicators.'
      else if (healthScore >= 65) headline = 'Overall financial position is good with some areas to watch.'
      else if (healthScore >= 50) headline = 'Several financial metrics need attention — review the details below.'
      else headline = 'Financial position needs urgent attention across multiple areas.'
    }

    // ── Try Groq for recommendations enhancement ──
    if (recommendations.length > 0) {
      try {
        const recSummary = recommendations.map(r => `${r.title}: ${r.description}`).join('\n')
        const raw = await generateGroqInsight(
          `Given these financial recommendations for an Australian marketing agency, provide 1-2 additional strategic recommendations in JSON array format. Each item should have: title, description, impact (high/medium/low), category.\n\nExisting recommendations:\n${recSummary}`,
          {
            model: GROQ_MODELS.LLAMA_8B,
            temperature: 0.3,
            maxTokens: 500,
            featureKey: 'financial_insights_recommendations',
            clientId: tenantId || undefined,
            requestId: cacheKey,
            metadata: {
              route: '/api/ai/insights',
              tenantId: tenantId || null,
              healthScore,
              healthLabel: healthLabel(healthScore),
              existingRecommendationCount: recommendations.length,
              sectionCount: sections.length,
              keyMetricCount: keyMetrics.length,
              hasPnl: Boolean(pnl),
              hasExpenses: Boolean(expenses),
              hasInvoices: Boolean(invoices),
              hasCashForecast: Boolean(cashForecast),
              hasCashFlowInsights: Boolean(cashFlowInsights),
            },
            systemPrompt: 'You are a senior financial adviser. Respond with valid JSON array only — no markdown, no code fences.'
          }
        )
        try {
          let parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) {
            const match = raw.match(/\[[\s\S]*\]/)
            if (match) parsed = JSON.parse(match[0])
          }
          if (Array.isArray(parsed)) {
            for (const r of parsed.slice(0, 2)) {
              if (r.title && r.description) {
                recommendations.push({
                  title: r.title,
                  description: r.description,
                  impact: r.impact || 'medium',
                  category: r.category || 'Strategy',
                  actionSteps: r.actionSteps || r.action_steps
                })
              }
            }
          }
        } catch { /* ignore parse failures */ }
      } catch { /* ignore Groq failures */ }
    }

    return {
      generatedAt: new Date().toISOString(),
      executiveSummary: {
        headline,
        healthScore,
        healthLabel: healthLabel(healthScore),
        keyMetrics
      },
      sections,
      recommendations
    }
  })
})
