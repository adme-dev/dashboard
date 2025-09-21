import { $fetch } from 'ofetch'

export default eventHandler(async (event) => {
  // Fetch key signals
  const [pnl, cashflow, expenses] = await Promise.all([
    $fetch<any>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/cashflow', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/expenses', { headers: event.headers }).catch(() => null)
  ])

  const insights: { title: string, detail: string, severity?: 'info' | 'warning' | 'success' }[] = []

  if (pnl) {
    const marginPct = Math.round((pnl.profitMargin || 0) * 100)
    insights.push({
      title: 'Profitability',
      detail: `Profit margin is ${marginPct}% for the selected period. Net profit is ${Math.round(pnl.netProfit).toLocaleString('en-US')}.`,
      severity: marginPct >= 20 ? 'success' : marginPct < 5 ? 'warning' : 'info'
    })
  }

  if (cashflow) {
    const next30 = cashflow?.buckets?.[0]
    if (next30) {
      insights.push({
        title: '30-day Cash Outlook',
        detail: `Projected cash position in 30 days is ${next30.projected.toLocaleString('en-US')} with inflows ${next30.inflow.toLocaleString('en-US')}.`,
        severity: next30.projected < 0 ? 'warning' : 'info'
      })
    }
  }

  if (expenses) {
    const topVendor = expenses.vendors?.[0]
    const topCategory = expenses.categories?.[0]
    if (topVendor) {
      insights.push({
        title: 'Top Vendor Spend',
        detail: `Highest 90-day vendor spend is ${topVendor.name} at ${Math.round(topVendor.amount).toLocaleString('en-US')}.`,
        severity: 'info'
      })
    }
    if (topCategory) {
      insights.push({
        title: 'Top Expense Category',
        detail: `Category ${topCategory.name} totals ${Math.round(topCategory.amount).toLocaleString('en-US')} over 90 days. Consider reviewing recurring costs.`,
        severity: 'info'
      })
    }
  }

  return { insights }
})
