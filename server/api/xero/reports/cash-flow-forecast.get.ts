import { createError } from 'h3'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import {
  ensureDateString,
  addDays,
  creditCardAccountIdsFrom,
  extractCurrentCash,
  fetchBankAccounts
} from '../../../utils/xeroDataFetcher'
import { fetchCashFlowInputs } from '../../../utils/xeroCashFlowInputs'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const daysAhead = Number(query.days) || 90

  const cacheKey = `xero-report:${tenantId}:cash-flow-forecast:${daysAhead}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const today = new Date()
    const accessToken = token.access_token!

    const [[bankReportBody, receivablesBody, payablesBody, expensesBody], accountsBody] = await Promise.all([
      fetchCashFlowInputs(accessToken, tenantId),
      // Only refines the cash/credit split — a failure here still leaves a
      // usable (if card-inclusive) balance rather than failing the forecast.
      fetchBankAccounts(accessToken, tenantId).catch(() => null)
    ])

    // Liquid cash only — credit-card debt is a payable, not negative cash, and
    // projecting a card-netted balance forward is meaningless.
    const currentCash = extractCurrentCash(bankReportBody, creditCardAccountIdsFrom(accountsBody))

    const totalHistoricalExpenses = (expensesBody?.invoices || [])
      .reduce((sum: number, inv: any) => sum + (Number(inv?.total) || 0), 0)
    const avgDailyExpenses = totalHistoricalExpenses / 90

    // Build forecast data points
    const forecast = []
    let runningBalance = currentCash

    for (let i = 0; i <= daysAhead; i++) {
      const forecastDate = addDays(today, i)
      const dateStr = ensureDateString(forecastDate)

      const receivablesForDate = (receivablesBody?.invoices || [])
        .filter((inv: any) => {
          const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
          return dueDate && ensureDateString(dueDate) === dateStr
        })
        .reduce((sum: number, inv: any) => sum + (Number(inv?.amountDue) || 0), 0)

      const payablesForDate = (payablesBody?.invoices || [])
        .filter((inv: any) => {
          const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
          return dueDate && ensureDateString(dueDate) === dateStr
        })
        .reduce((sum: number, inv: any) => sum + (Number(inv?.amountDue) || 0), 0)

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

    const minBalance = Math.min(...forecast.map(f => f.balance))
    const maxBalance = Math.max(...forecast.map(f => f.balance))
    const endBalance = forecast[forecast.length - 1]?.balance || currentCash

    const shortfallDates = forecast
      .filter(f => f.balance < 0)
      .map(f => f.date)

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
      forecast: forecast.filter((_, index) => index % 7 === 0),
      dailyForecast: forecast
    }
  })
})
