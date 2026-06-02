import { $fetch } from 'ofetch'
import { queryRows } from '~~/server/utils/db'
import { buildBudgetChatContext } from '~~/server/utils/budgetChatContext'

export default eventHandler(async (event) => {
  const body = await readBody<{ prompt?: string }>(event)
  const prompt = (body?.prompt || '').toLowerCase()
  if (!prompt) throw createError({ statusCode: 400, statusMessage: 'prompt required' })

  // Naive routing
  const want = {
    pnl: /p&l|profit|revenue|expenses|margin/.test(prompt),
    cash: /cash|balance|bank|runway|forecast/.test(prompt),
    invoices: /invoice|overdue|outstanding|paid/.test(prompt),
    expenses: /expense|vendor|category|spend/.test(prompt),
    budget: /underspend|overspend|pacing|budget tracker|on track|campaign spend|ad ?spend/.test(prompt)
  }

  const results: string[] = []

  if (want.pnl) {
    const pnl = await $fetch<any>('/api/xero/reports/pnl', { headers: event.headers }).catch(() => null)
    if (pnl) {
      results.push(`P&L: Revenue ${Math.round(pnl.revenueTotal).toLocaleString('en-US')}, Expenses ${Math.round(pnl.expensesTotal).toLocaleString('en-US')}, Profit ${Math.round(pnl.netProfit).toLocaleString('en-US')}, Margin ${(Math.round((pnl.profitMargin || 0) * 100))}%`)
    }
  }

  if (want.cash) {
    const cash = await $fetch<any>('/api/cashflow', { headers: event.headers }).catch(() => null)
    if (cash) {
      const next30 = cash.buckets?.[0]
      results.push(`Cash: Starting ${Math.round(cash.startingBalance).toLocaleString('en-US')}; 30d projected ${Math.round(next30?.projected || 0).toLocaleString('en-US')}`)
    }
  }

  if (want.invoices) {
    const inv = await $fetch<any>('/api/xero/invoices', { headers: event.headers }).catch(() => null)
    if (inv) {
      results.push(`Invoices: Outstanding ${inv.outstanding?.length || 0}, Overdue ${inv.overdue?.length || 0}, Paid (recent) ${inv.paid?.length || 0}`)
    }
  }

  if (want.expenses) {
    const ex = await $fetch<any>('/api/xero/expenses', { headers: event.headers }).catch(() => null)
    if (ex) {
      const top = ex.categories?.[0]
      results.push(`Expenses: Top category ${top?.name || 'N/A'} at ${Math.round(top?.amount || 0).toLocaleString('en-US')} last 90d`)
    }
  }

  if (want.budget) {
    const rows = await queryRows<{ severity: string; title: string; tags: string[] | null }>(
      `SELECT severity, title, tags
       FROM anomalies
       WHERE type = 'adspend' AND status NOT IN ('resolved','dismissed')
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
       LIMIT 20`,
    ).catch(() => [])
    results.push(buildBudgetChatContext(rows))
  }

  if (!results.length) {
    results.push('Try asking about P&L, cash flow, invoices, or expenses.')
  }

  return { reply: results.join(' | ') }
})
