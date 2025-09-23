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

  const client = await createXeroClient({ tokenSet: token })

  // Get base forecast data (reuse logic from cash-flow-forecast)
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

  // Get receivables and payables
  const [receivables, payables, recentExpenses] = await Promise.all([
    client.accountingApi.getInvoices(
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
    ),
    client.accountingApi.getInvoices(
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
    ),
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(addDays(today, -90))}`,
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
  ])

  const totalHistoricalExpenses = (recentExpenses?.body?.invoices || [])
    .reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0)
  const avgDailyExpenses = totalHistoricalExpenses / 90

  // Create scenario multipliers
  const scenarios = {
    best: {
      receivableMultiplier: 1.2, // 20% better collection
      payableMultiplier: 0.9,    // 10% less expenses
      expenseMultiplier: 0.8,    // 20% less daily expenses
      collectionSpeedup: 7       // Collect 7 days earlier
    },
    likely: {
      receivableMultiplier: 1.0, // Normal collection
      payableMultiplier: 1.0,    // Normal expenses
      expenseMultiplier: 1.0,    // Normal daily expenses
      collectionSpeedup: 0       // No change in timing
    },
    worst: {
      receivableMultiplier: 0.8, // 20% worse collection
      payableMultiplier: 1.2,    // 20% more expenses
      expenseMultiplier: 1.3,    // 30% more daily expenses
      collectionSlowdown: 14     // Collect 14 days later
    }
  }

  // Generate forecasts for each scenario
  const generateScenario = (scenarioConfig: any) => {
    const forecast = []
    let runningBalance = currentCash
    
    for (let i = 0; i <= daysAhead; i++) {
      const forecastDate = addDays(today, i)
      const dateStr = ensureDateString(forecastDate)
      
      // Calculate receivables with scenario adjustments
      const receivablesForDate = (receivables?.body?.invoices || [])
        .filter(inv => {
          const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
          if (!dueDate) return false
          
          const adjustedDate = addDays(dueDate, -scenarioConfig.collectionSpeedup || scenarioConfig.collectionSlowdown || 0)
          return ensureDateString(adjustedDate) === dateStr
        })
        .reduce((sum, inv) => sum + (Number(inv?.amountDue) || 0), 0) * scenarioConfig.receivableMultiplier

      // Calculate payables with scenario adjustments
      const payablesForDate = (payables?.body?.invoices || [])
        .filter(inv => {
          const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
          return dueDate && ensureDateString(dueDate) === dateStr
        })
        .reduce((sum, inv) => sum + (Number(inv?.amountDue) || 0), 0) * scenarioConfig.payableMultiplier

      // Calculate daily expenses with scenario adjustments
      const isWeekday = forecastDate.getDay() >= 1 && forecastDate.getDay() <= 5
      const dailyExpenses = isWeekday ? (avgDailyExpenses * scenarioConfig.expenseMultiplier) : 0

      runningBalance += receivablesForDate - payablesForDate - dailyExpenses

      forecast.push({
        date: dateStr,
        balance: Math.round(runningBalance * 100) / 100,
        inflows: Math.round(receivablesForDate * 100) / 100,
        outflows: Math.round((payablesForDate + dailyExpenses) * 100) / 100,
        netChange: Math.round((receivablesForDate - payablesForDate - dailyExpenses) * 100) / 100
      })
    }
    
    return forecast
  }

  // Generate all scenarios
  const bestCaseForecast = generateScenario(scenarios.best)
  const likelyCaseForecast = generateScenario(scenarios.likely)
  const worstCaseForecast = generateScenario(scenarios.worst)

  // Combine scenarios for easy chart consumption
  const combinedScenarios = likelyCaseForecast.map((item, index) => ({
    date: item.date,
    bestCase: bestCaseForecast[index]?.balance || item.balance,
    likelyCase: item.balance,
    worstCase: worstCaseForecast[index]?.balance || item.balance
  }))

  // Calculate scenario summaries
  const calculateSummary = (forecast: any[]) => ({
    endBalance: forecast[forecast.length - 1]?.balance || currentCash,
    minBalance: Math.min(...forecast.map(f => f.balance)),
    maxBalance: Math.max(...forecast.map(f => f.balance)),
    shortfallDays: forecast.filter(f => f.balance < 0).length,
    totalInflows: forecast.reduce((sum, f) => sum + f.inflows, 0),
    totalOutflows: forecast.reduce((sum, f) => sum + f.outflows, 0)
  })

  return {
    currentCash: Math.round(currentCash * 100) / 100,
    forecastPeriod: daysAhead,
    scenarios: {
      best: bestCaseForecast.filter((_, index) => index % 7 === 0), // Weekly data points
      likely: likelyCaseForecast.filter((_, index) => index % 7 === 0),
      worst: worstCaseForecast.filter((_, index) => index % 7 === 0),
      combined: combinedScenarios.filter((_, index) => index % 7 === 0)
    },
    summaries: {
      best: calculateSummary(bestCaseForecast),
      likely: calculateSummary(likelyCaseForecast),
      worst: calculateSummary(worstCaseForecast)
    },
    assumptions: {
      best: {
        description: "Optimistic scenario with improved collections and reduced expenses",
        receivableCollection: "+20% better collection rate",
        expenseReduction: "-20% operating expenses",
        collectionTiming: "7 days faster collection"
      },
      likely: {
        description: "Most probable scenario based on historical patterns",
        receivableCollection: "Normal collection rate",
        expenseReduction: "Normal operating expenses",
        collectionTiming: "Normal collection timing"
      },
      worst: {
        description: "Conservative scenario with delayed collections and increased expenses",
        receivableCollection: "-20% collection rate",
        expenseReduction: "+30% operating expenses",
        collectionTiming: "14 days slower collection"
      }
    }
  }
})
