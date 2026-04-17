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
  const daysAhead = Number(query.days) || 90

  const cacheKey = `xero-report:${tenantId}:cash-flow-scenarios:${daysAhead}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const today = new Date()

    const accessToken = token.access_token!

    const [bankReportBody, receivablesBody, payablesBody, expensesBody] = await Promise.all([
      fetchBankSummary(accessToken, tenantId),
      fetchReceivables(accessToken, tenantId),
      fetchPayables(accessToken, tenantId),
      fetchRecentPaidExpenses(accessToken, tenantId)
    ])

    const currentCash = extractCurrentCash(bankReportBody)

    const totalHistoricalExpenses = (expensesBody?.invoices || [])
      .reduce((sum: number, inv: any) => sum + (Number(inv?.total) || 0), 0)
    const avgDailyExpenses = totalHistoricalExpenses / 90

    const scenarios = {
      best: {
        receivableMultiplier: 1.2,
        payableMultiplier: 0.9,
        expenseMultiplier: 0.8,
        collectionSpeedup: 7
      },
      likely: {
        receivableMultiplier: 1.0,
        payableMultiplier: 1.0,
        expenseMultiplier: 1.0,
        collectionSpeedup: 0
      },
      worst: {
        receivableMultiplier: 0.8,
        payableMultiplier: 1.2,
        expenseMultiplier: 1.3,
        collectionSlowdown: 14
      }
    }

    const generateScenario = (scenarioConfig: any) => {
      const forecast = []
      let runningBalance = currentCash

      for (let i = 0; i <= daysAhead; i++) {
        const forecastDate = addDays(today, i)
        const dateStr = ensureDateString(forecastDate)

        const receivablesForDate = (receivablesBody?.invoices || [])
          .filter((inv: any) => {
            const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
            if (!dueDate) return false
            const adjustedDate = addDays(dueDate, -(scenarioConfig.collectionSpeedup || 0) + (scenarioConfig.collectionSlowdown || 0))
            return ensureDateString(adjustedDate) === dateStr
          })
          .reduce((sum: number, inv: any) => sum + (Number(inv?.amountDue) || 0), 0) * scenarioConfig.receivableMultiplier

        const payablesForDate = (payablesBody?.invoices || [])
          .filter((inv: any) => {
            const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
            return dueDate && ensureDateString(dueDate) === dateStr
          })
          .reduce((sum: number, inv: any) => sum + (Number(inv?.amountDue) || 0), 0) * scenarioConfig.payableMultiplier

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

    const bestCaseForecast = generateScenario(scenarios.best)
    const likelyCaseForecast = generateScenario(scenarios.likely)
    const worstCaseForecast = generateScenario(scenarios.worst)

    const combinedScenarios = likelyCaseForecast.map((item, index) => ({
      date: item.date,
      bestCase: bestCaseForecast[index]?.balance || item.balance,
      likelyCase: item.balance,
      worstCase: worstCaseForecast[index]?.balance || item.balance
    }))

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
        best: bestCaseForecast.filter((_, index) => index % 7 === 0),
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
})
