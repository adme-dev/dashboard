import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import {
  ensureDateString,
  addDays,
  extractCurrentCash,
  fetchBankSummary,
  fetchReceivables,
  fetchPayables,
  fetchRecentPaidExpenses
} from '../../../utils/xeroDataFetcher'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const period = String(query.period || '30')
  const daysAhead = Number(period)

  const cacheKey = `xero-report:${tenantId}:cash-flow-waterfall:${period}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const today = new Date()

    const client = await createXeroClient({ tokenSet: token, event })

    const [bankReportBody, receivablesBody, payablesBody, expensesBody] = await Promise.all([
      fetchBankSummary(client, tenantId),
      fetchReceivables(client, tenantId),
      fetchPayables(client, tenantId),
      fetchRecentPaidExpenses(client, tenantId)
    ])

    const startingBalance = extractCurrentCash(bankReportBody)

    // Process receivables by categories
    const receivableCategories = new Map<string, number>()
    const overdueReceivables = new Map<string, number>()

    for (const invoice of (receivablesBody?.invoices || [])) {
      const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
      const amountDue = Number(invoice?.amountDue) || 0
      const contactName = invoice?.contact?.name || 'Unknown Customer'

      if (dueDate && amountDue > 0) {
        if (dueDate < today) {
          const current = overdueReceivables.get(contactName) || 0
          overdueReceivables.set(contactName, current + amountDue)
        } else {
          const current = receivableCategories.get(contactName) || 0
          receivableCategories.set(contactName, current + amountDue)
        }
      }
    }

    // Process payables by categories
    const payableCategories = new Map<string, number>()
    const overduePayables = new Map<string, number>()

    for (const invoice of (payablesBody?.invoices || [])) {
      const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
      const amountDue = Number(invoice?.amountDue) || 0
      const contactName = invoice?.contact?.name || 'Unknown Vendor'

      if (dueDate && amountDue > 0) {
        if (dueDate < today) {
          const current = overduePayables.get(contactName) || 0
          overduePayables.set(contactName, current + amountDue)
        } else {
          const current = payableCategories.get(contactName) || 0
          payableCategories.set(contactName, current + amountDue)
        }
      }
    }

    // Estimated operating expenses
    const totalHistoricalExpenses = (expensesBody?.invoices || [])
      .reduce((sum: number, inv: any) => sum + (Number(inv?.total) || 0), 0)
    const avgDailyExpenses = totalHistoricalExpenses / 90
    const projectedOperatingExpenses = avgDailyExpenses * daysAhead

    // Build inflows array (top contributors)
    const inflows = []

    if (overdueReceivables.size > 0) {
      const totalOverdue = Array.from(overdueReceivables.values()).reduce((sum, amt) => sum + amt, 0)
      inflows.push({ category: 'Overdue Receivables', amount: totalOverdue })
    }

    const sortedReceivables = Array.from(receivableCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    for (const [customer, amount] of sortedReceivables) {
      inflows.push({
        category: customer.length > 20 ? customer.substring(0, 20) + '...' : customer,
        amount
      })
    }

    // Build outflows array
    const outflows = []

    if (projectedOperatingExpenses > 0) {
      outflows.push({
        category: `Operating Expenses (${daysAhead}d)`,
        amount: projectedOperatingExpenses
      })
    }

    if (overduePayables.size > 0) {
      const totalOverduePayables = Array.from(overduePayables.values()).reduce((sum, amt) => sum + amt, 0)
      outflows.push({ category: 'Overdue Payables', amount: totalOverduePayables })
    }

    const sortedPayables = Array.from(payableCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    for (const [vendor, amount] of sortedPayables) {
      outflows.push({
        category: vendor.length > 20 ? vendor.substring(0, 20) + '...' : vendor,
        amount
      })
    }

    const totalInflows = inflows.reduce((sum, item) => sum + item.amount, 0)
    const totalOutflows = outflows.reduce((sum, item) => sum + item.amount, 0)
    const endingBalance = startingBalance + totalInflows - totalOutflows

    return {
      period: `${daysAhead} days`,
      startingBalance: Math.round(startingBalance * 100) / 100,
      endingBalance: Math.round(endingBalance * 100) / 100,
      netChange: Math.round((endingBalance - startingBalance) * 100) / 100,
      inflows: inflows.map(item => ({
        ...item,
        amount: Math.round(item.amount * 100) / 100
      })),
      outflows: outflows.map(item => ({
        ...item,
        amount: Math.round(item.amount * 100) / 100
      })),
      totals: {
        totalInflows: Math.round(totalInflows * 100) / 100,
        totalOutflows: Math.round(totalOutflows * 100) / 100,
        netCashFlow: Math.round((totalInflows - totalOutflows) * 100) / 100
      },
      breakdown: {
        overdueReceivables: Array.from(overdueReceivables.entries()).map(([customer, amount]) => ({
          customer,
          amount: Math.round(amount * 100) / 100
        })),
        overduePayables: Array.from(overduePayables.entries()).map(([vendor, amount]) => ({
          vendor,
          amount: Math.round(amount * 100) / 100
        })),
        projectedExpenses: Math.round(projectedOperatingExpenses * 100) / 100
      }
    }
  })
})
