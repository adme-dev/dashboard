import { createError } from 'h3'
import { xeroFetch } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'
import {
  type XeroRow,
  getPeriodLabels,
  findRowValues,
  extractExpenseBreakdown,
} from '~~/server/utils/xeroPnlParse'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getDefaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 30)
  return { from: ensureDateString(from), to: ensureDateString(to) }
}

function isTransientXeroError(err: any): boolean {
  const status = err?.response?.statusCode
    ?? err?.response?.status
    ?? err?.statusCode
    ?? err?.status

  if (status === 429) return true
  if (Number.isFinite(Number(status)) && Number(status) >= 500) return true
  if (!status) return true
  return false
}

export default eventHandler(async (event) => {
  let token
  try {
    token = await getActiveTokenForSession(event)
  } catch (error: any) {
    // If Xero is not connected or tables don't exist, return empty
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation') || error?.statusCode === 401) {
      throw createError({ statusCode: 401, statusMessage: 'Xero not connected' })
    }
    throw error
  }
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const fromDate = String(query.fromDate || '')
  const toDate = String(query.toDate || '')
  const { from, to } = (!fromDate || !toDate) ? getDefaultRange() : { from: fromDate, to: toDate }

  // Optional: multi-period support for YoY / trend analysis.
  const periodsRaw = query.periods != null ? Number(query.periods) : null
  const timeframeRaw = query.timeframe ? String(query.timeframe).toUpperCase() : null
  const validTimeframe = timeframeRaw && ['MONTH', 'QUARTER', 'YEAR'].includes(timeframeRaw) ? timeframeRaw : null
  const validPeriods = periodsRaw && Number.isInteger(periodsRaw) && periodsRaw >= 1 && periodsRaw <= 24 ? periodsRaw : null
  const multiPeriodSuffix = (validPeriods && validTimeframe)
    ? `&periods=${validPeriods}&timeframe=${validTimeframe}`
    : ''

  // Reporting basis — accrual (Xero default) or cash. Cash maps to Xero's
  // paymentsOnly flag, matching the basis picker on Xero's own P&L report.
  const basis = String(query.basis || '').toLowerCase() === 'cash' ? 'cash' : 'accrual'
  const basisSuffix = basis === 'cash' ? '&paymentsOnly=true' : ''

  const cacheKey = `xero-report:${tenantId}:pnl:${from}:${to}:${validPeriods || 0}:${validTimeframe || ''}:${basis}`

  try {
    return await cachedFetch(event, cacheKey, 1800, async () => {
      const report = await dedupedXeroCall(
        `pnl:${tenantId}:${from}:${to}:${validPeriods || 0}:${validTimeframe || ''}:${basis}`,
        'pnl',
        () => xeroFetch<any>({
          accessToken: token.access_token!,
          tenantId,
          path: `Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}&standardLayout=false${multiPeriodSuffix}${basisSuffix}`,
        }),
      )

      const reportTable = report?.reports?.[0] ?? report?.Reports?.[0]
      const tableRows: XeroRow[] = reportTable ? reportTable.rows ?? reportTable.Rows ?? [] : []
      const periodLabels = getPeriodLabels(tableRows)
      const columnCount = periodLabels.length

      const revenueByPeriod = findRowValues(tableRows, /total\s+revenue|total\s+income/i, columnCount)
      const expensesByPeriod = findRowValues(tableRows, /total\s+expense/i, columnCount)
      const netProfitByPeriod = findRowValues(tableRows, /net\s+profit|profit\s+for\s+the\s+period|net\s+income|net\s+loss/i, columnCount)

      const latestIndex = columnCount > 0 ? columnCount - 1 : 0
      const revenueTotal = revenueByPeriod[latestIndex] ?? 0
      const expensesTotal = expensesByPeriod[latestIndex] ?? 0
      const netProfit = netProfitByPeriod[latestIndex] ?? 0
      const profitMargin = revenueTotal !== 0 ? (netProfit / revenueTotal) : 0

      const periods = periodLabels.map((label, index) => {
        const revenue = revenueByPeriod[index] ?? 0
        const expenses = expensesByPeriod[index] ?? 0
        const net = netProfitByPeriod[index] ?? 0
        const margin = revenue !== 0 ? net / revenue : 0

        return {
          label,
          revenue,
          expenses,
          netProfit: net,
          profitMargin: margin,
        }
      })

      const expensesByCategory = extractExpenseBreakdown(tableRows, latestIndex)

      return {
        fromDate: from,
        toDate: to,
        basis,
        revenueTotal,
        expensesTotal,
        netProfit,
        profitMargin,
        periods,
        expensesByCategory,
      }
    })
  } catch (error: any) {
    if (isTransientXeroError(error)) {
      console.warn('[pnl] returning degraded fallback due Xero limit/network:', error)
      return {
        fromDate: from,
        toDate: to,
        basis,
        revenueTotal: 0,
        expensesTotal: 0,
        netProfit: 0,
        profitMargin: 0,
        periods: [],
        expensesByCategory: [],
        source: 'degraded_fallback',
        message: error?.message || 'Temporary data source issue',
      }
    }
    throw error
  }
})
