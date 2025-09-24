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
  const daysAhead = Number(query.days) || 90
  const today = new Date()
  const endDate = addDays(today, daysAhead)

  const client = await createXeroClient({ tokenSet: token, event })

  // Get current bank balances
  // For bank summary, we need a date range. Use today as toDate and 30 days before as fromDate
  const fromDate = addDays(today, -30)
  const { body: bankReport } = await client.accountingApi.getReportBankSummary(
    tenantId,
    ensureDateString(fromDate),
    ensureDateString(today),
    undefined,
    false
  )

  let currentCash = 0
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
      currentCash += value
    } else if (typeof value === 'string') {
      const parsed = Number(value)
      if (!isNaN(parsed)) currentCash += parsed
    }
  }

  // Get outstanding invoices (money coming in)
  const { body: receivables } = await client.accountingApi.getInvoices(
    tenantId,
    undefined,
    'Type=="ACCREC"&&Status=="AUTHORISED"',
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

  // Get outstanding bills (money going out)
  const { body: payables } = await client.accountingApi.getInvoices(
    tenantId,
    undefined,
    'Type=="ACCPAY"&&Status=="AUTHORISED"',
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

  // Calculate historical average daily expenses
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
    500
  )

  const totalHistoricalExpenses = (recentExpenses?.invoices || [])
    .reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0)
  const avgDailyExpenses = totalHistoricalExpenses / 90

  // Build forecast data points
  const forecast = []
  let runningBalance = currentCash
  
  // Create daily projections
  for (let i = 0; i <= daysAhead; i++) {
    const forecastDate = addDays(today, i)
    const dateStr = ensureDateString(forecastDate)
    
    // Add expected receivables for this date
    const receivablesForDate = (receivables?.invoices || [])
      .filter(inv => {
        const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
        return dueDate && ensureDateString(dueDate) === dateStr
      })
      .reduce((sum, inv) => sum + (Number(inv?.amountDue) || 0), 0)

    // Add expected payables for this date
    const payablesForDate = (payables?.invoices || [])
      .filter(inv => {
        const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
        return dueDate && ensureDateString(dueDate) === dateStr
      })
      .reduce((sum, inv) => sum + (Number(inv?.amountDue) || 0), 0)

    // Subtract daily operating expenses (only on weekdays)
    const isWeekday = forecastDate.getDay() >= 1 && forecastDate.getDay() <= 5
    const dailyExpenses = isWeekday ? avgDailyExpenses : 0

    runningBalance += receivablesForDate - payablesForDate - dailyExpenses

    forecast.push({
      date: dateStr,
      balance: Math.round(runningBalance * 100) / 100,
      inflows: Math.round(receivablesForDate * 100) / 100,
      outflows: Math.round((payablesForDate + dailyExpenses) * 100) / 100,
      netChange: Math.round((receivablesForDate - payablesForDate - dailyExpenses) * 100) / 100
    })
  }

  // Calculate key metrics
  const minBalance = Math.min(...forecast.map(f => f.balance))
  const maxBalance = Math.max(...forecast.map(f => f.balance))
  const endBalance = forecast[forecast.length - 1]?.balance || currentCash
  
  // Find cash shortfall dates
  const shortfallDates = forecast
    .filter(f => f.balance < 0)
    .map(f => f.date)

  // Calculate burn rate (weekly average)
  const weeklyOutflows = forecast.slice(0, 7).reduce((sum, f) => sum + f.outflows, 0)
  const burnRate = weeklyOutflows / 7

  return {
    currentCash: Math.round(currentCash * 100) / 100,
    forecastPeriod: daysAhead,
    projectedEndBalance: endBalance,
    minProjectedBalance: minBalance,
    maxProjectedBalance: maxBalance,
    dailyBurnRate: Math.round(burnRate * 100) / 100,
    shortfallDates,
    forecast: forecast.filter((_, index) => index % 7 === 0), // Weekly data points for chart
    dailyForecast: forecast // Full daily data for detailed analysis
  }
})
