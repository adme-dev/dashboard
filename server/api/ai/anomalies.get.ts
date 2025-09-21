import { $fetch } from 'ofetch'

export default eventHandler(async (event) => {
  const [pnl, expenses] = await Promise.all([
    $fetch<any>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/expenses', { headers: event.headers }).catch(() => null)
  ])

  const anomalies: { type: string, message: string, severity: 'warning' | 'info' }[] = []

  if (pnl) {
    const margin = (pnl.profitMargin || 0)
    if (margin < 0.05) {
      anomalies.push({ type: 'revenue', message: `Low profit margin (${Math.round(margin * 100)}%)`, severity: 'warning' })
    }
  }

  if (expenses) {
    const top = expenses.categories?.[0]
    const second = expenses.categories?.[1]
    if (top && second && top.amount > second.amount * 2) {
      anomalies.push({ type: 'expense', message: `Category ${top.name} is over 2x next category`, severity: 'warning' })
    }
  }

  return { anomalies }
})
