import { $fetch } from 'ofetch'

export default eventHandler(async (event) => {
  const [pnl, invoices, expenses] = await Promise.all([
    $fetch<any>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/invoices', { headers: event.headers }).catch(() => null),
    $fetch<any>('/api/xero/expenses', { headers: event.headers }).catch(() => null)
  ])

  const recs: { category: 'collections' | 'cost' | 'cash', text: string }[] = []

  if (invoices) {
    const overdueCount = invoices.overdue?.length || 0
    if (overdueCount > 0) {
      recs.push({ category: 'collections', text: `You have ${overdueCount} overdue invoices. Consider sending automated reminders and offering small early-payment discounts.` })
    }
  }

  if (expenses) {
    const top = expenses.categories?.[0]
    if (top && top.amount > 1000) {
      recs.push({ category: 'cost', text: `Review top expense category (${top.name}). Negotiate with vendors or reduce recurring services.` })
    }
  }

  if (pnl && (pnl.profitMargin || 0) < 0.1) {
    recs.push({ category: 'cash', text: 'Low profit margin; consider tightening payment terms to improve short-term cash flow.' })
  }

  return { recommendations: recs }
})
