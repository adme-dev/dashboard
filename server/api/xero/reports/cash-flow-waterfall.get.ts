import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function toXeroDateTime(date: Date) {
  return `DateTime(${date.getUTCFullYear()}, ${date.getUTCMonth() + 1}, ${date.getUTCDate()})`
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const period = String(query.period || '30') // 30, 60, or 90 days
  const daysAhead = Number(period)
  const today = new Date()
  const endDate = addDays(today, daysAhead)

  const client = await createXeroClient({ tokenSet: token })

  // Get current bank balance
  // For bank summary, we need a date range. Use today as toDate and 30 days before as fromDate
  const fromDate = addDays(today, -30)
  const { body: bankReport } = await client.accountingApi.getReportBankSummary(
    tenantId,
    ensureDateString(fromDate),
    ensureDateString(today),
    undefined,
    false
  )

  let startingBalance = 0
  const reportRows = bankReport?.reports?.[0]?.rows || bankReport?.Reports?.[0]?.Rows || []
  
  function flattenRows(rows: any[], out: any[] = []): any[] {
    for (const row of rows) {
      out.push(row)
      if (row?.Rows || row?.rows) {
        flattenRows(row.Rows || row.rows, out)
      }
    }
    return out
  }

  const allRows = flattenRows(reportRows)
  for (const row of allRows) {
    const cells = row?.Cells || row?.cells || []
    const lastCell = cells[cells.length - 1]
    const value = lastCell?.Value ?? lastCell?.value
    if (typeof value === 'number') {
      startingBalance += value
    } else if (typeof value === 'string') {
      const parsed = Number(value)
      if (!isNaN(parsed)) startingBalance += parsed
    }
  }

  // Get receivables and payables for the period
  const [receivables, payables] = await Promise.all([
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      `Type=="ACCREC"&&Status=="AUTHORISED"`,
      'DueDate ASC',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      200
    ),
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      `Type=="ACCPAY"&&Status=="AUTHORISED"`,
      'DueDate ASC',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      200
    )
  ])

  // Process receivables by categories
  const receivableCategories = new Map<string, number>()
  const overdueReceivables = new Map<string, number>()

  for (const invoice of (receivables?.body?.invoices || [])) {
    const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
    const amountDue = Number(invoice?.amountDue) || 0
    const contactName = invoice?.contact?.name || 'Unknown Customer'
    
    if (dueDate && amountDue > 0) {
      if (dueDate < today) {
        // Overdue
        const current = overdueReceivables.get(contactName) || 0
        overdueReceivables.set(contactName, current + amountDue)
      } else {
        // Future receivables
        const current = receivableCategories.get(contactName) || 0
        receivableCategories.set(contactName, current + amountDue)
      }
    }
  }

  // Process payables by categories  
  const payableCategories = new Map<string, number>()
  const overduePayables = new Map<string, number>()

  for (const invoice of (payables?.body?.invoices || [])) {
    const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
    const amountDue = Number(invoice?.amountDue) || 0
    const contactName = invoice?.contact?.name || 'Unknown Vendor'
    
    if (dueDate && amountDue > 0) {
      if (dueDate < today) {
        // Overdue
        const current = overduePayables.get(contactName) || 0
        overduePayables.set(contactName, current + amountDue)
      } else {
        // Future payables
        const current = payableCategories.get(contactName) || 0
        payableCategories.set(contactName, current + amountDue)
      }
    }
  }

  // Get estimated operating expenses for the period
  const pastDate = addDays(today, -90)
  const { body: recentExpenses } = await client.accountingApi.getInvoices(
    tenantId,
    undefined,
    `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(pastDate)}`,
    'Date DESC',
    undefined,
    undefined,
    undefined,
    undefined,
    1,
    undefined,
    undefined,
    undefined,
    300
  )

  const totalHistoricalExpenses = (recentExpenses?.invoices || [])
    .reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0)
  const avgDailyExpenses = totalHistoricalExpenses / 90
  const projectedOperatingExpenses = avgDailyExpenses * daysAhead

  // Build inflows array (top contributors)
  const inflows = []
  
  // Add overdue receivables as priority inflow
  if (overdueReceivables.size > 0) {
    const totalOverdue = Array.from(overdueReceivables.values()).reduce((sum, amt) => sum + amt, 0)
    inflows.push({
      category: 'Overdue Receivables',
      amount: totalOverdue
    })
  }

  // Add top 5 receivable categories
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

  // Add projected operating expenses
  if (projectedOperatingExpenses > 0) {
    outflows.push({
      category: `Operating Expenses (${daysAhead}d)`,
      amount: projectedOperatingExpenses
    })
  }

  // Add overdue payables
  if (overduePayables.size > 0) {
    const totalOverduePayables = Array.from(overduePayables.values()).reduce((sum, amt) => sum + amt, 0)
    outflows.push({
      category: 'Overdue Payables',
      amount: totalOverduePayables
    })
  }

  // Add top 5 payable categories
  const sortedPayables = Array.from(payableCategories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  for (const [vendor, amount] of sortedPayables) {
    outflows.push({
      category: vendor.length > 20 ? vendor.substring(0, 20) + '...' : vendor,
      amount
    })
  }

  // Calculate totals
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
