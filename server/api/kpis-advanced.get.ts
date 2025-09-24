import { createError } from 'h3'
import { createXeroClient } from '../utils/xeroClient'
import { getActiveTokenForSession } from '../utils/tokenStore'
import { getSelectedTenant } from '../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function dtExpr(d: Date) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `DateTime(${y},${m},${day})`
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const today = new Date()
  const monthStart = getMonthStart(today)
  const yearStart = new Date(today.getFullYear(), 0, 1)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  
  const client = await createXeroClient({ tokenSet: token, event })

  // Parallel data fetching for better performance
  const [
    currentCashResponse,
    currentMonthInvoicesResponse,
    lastMonthInvoicesResponse,
    currentMonthExpensesResponse,
    lastMonthExpensesResponse,
    outstandingInvoicesResponse,
    overdueInvoicesResponse,
    balanceSheetResponse
  ] = await Promise.allSettled([
    // Current cash position - need date range for bank summary
    client.accountingApi.getReportBankSummary(tenantId, ensureDateString(addDays(today, -30)), ensureDateString(today)),
    
    // Current month revenue
    client.accountingApi.getInvoices(
      tenantId, undefined, 
      `Type=="ACCREC"&&Status=="PAID"&&Date>=${dtExpr(monthStart)}&&Date<=${dtExpr(today)}`,
      'Date DESC', undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined, 500
    ),
    
    // Last month revenue (for comparison)
    client.accountingApi.getInvoices(
      tenantId, undefined,
      `Type=="ACCREC"&&Status=="PAID"&&Date>=${dtExpr(lastMonth)}&&Date<=${dtExpr(lastMonthEnd)}`,
      'Date DESC', undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined, 500
    ),
    
    // Current month expenses
    client.accountingApi.getInvoices(
      tenantId, undefined,
      `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(monthStart)}&&Date<=${dtExpr(today)}`,
      'Date DESC', undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined, 500
    ),
    
    // Last month expenses (for comparison)
    client.accountingApi.getInvoices(
      tenantId, undefined,
      `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(lastMonth)}&&Date<=${dtExpr(lastMonthEnd)}`,
      'Date DESC', undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined, 500
    ),
    
    // Outstanding receivables
    client.accountingApi.getInvoices(
      tenantId, undefined,
      'Type=="ACCREC"&&Status=="AUTHORISED"',
      'DueDate ASC', undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined, 200
    ),
    
    // Overdue receivables
    client.accountingApi.getInvoices(
      tenantId, undefined,
      `Type=="ACCREC"&&Status=="AUTHORISED"&&DueDate<${dtExpr(today)}`,
      'DueDate ASC', undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined, 200
    ),
    
    // Balance sheet for financial ratios
    client.accountingApi.getReportBalanceSheet(tenantId, ensureDateString(today))
  ])

  // Helper function to safely extract data from settled promises
  function extractData<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === 'fulfilled' ? result.value : null
  }

  // Process cash position
  let currentCash = 0
  const cashData = extractData(currentCashResponse)
  if (cashData?.body?.reports?.[0]?.rows) {
    function flattenRows(rows: any[], out: any[] = []): any[] {
      for (const row of rows) {
        out.push(row)
        if (row?.Rows || row?.rows) {
          flattenRows(row.Rows || row.rows, out)
        }
      }
      return out
    }
    
    const allRows = flattenRows(cashData.body.reports[0].rows)
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
  }

  // Process revenue data
  const currentMonthRevenue = extractData(currentMonthInvoicesResponse)?.body?.invoices
    ?.reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0) || 0
  
  const lastMonthRevenue = extractData(lastMonthInvoicesResponse)?.body?.invoices
    ?.reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0) || 0

  // Process expense data
  const currentMonthExpenses = extractData(currentMonthExpensesResponse)?.body?.invoices
    ?.reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0) || 0
    
  const lastMonthExpenses = extractData(lastMonthExpensesResponse)?.body?.invoices
    ?.reduce((sum, inv) => sum + (Number(inv?.total) || 0), 0) || 0

  // Process outstanding invoices
  const outstandingInvoices = extractData(outstandingInvoicesResponse)?.body?.invoices || []
  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (Number(inv?.amountDue) || 0), 0)
  
  const overdueInvoices = extractData(overdueInvoicesResponse)?.body?.invoices || []
  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (Number(inv?.amountDue) || 0), 0)

  // Process balance sheet data
  const balanceSheet = extractData(balanceSheetResponse)?.body?.reports?.[0] || null
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0

  if (balanceSheet?.rows) {
    function flattenRows(rows: any[], out: any[] = []): any[] {
      for (const row of rows) {
        out.push(row)
        if (row?.Rows || row?.rows) {
          flattenRows(row.Rows || row.rows, out)
        }
      }
      return out
    }

    const rows = flattenRows(balanceSheet.rows)
    for (const row of rows) {
      const cells = row?.Cells || row?.cells || []
      const title = cells?.[0]?.Value || cells?.[0]?.value || ''
      const lastCell = cells[cells.length - 1]
      const numeric = Number(lastCell?.Value ?? lastCell?.value) || 0

      if (/total\s+assets/i.test(title)) totalAssets = numeric
      if (/total\s+liabilit/i.test(title)) totalLiabilities = numeric
      if (/total\s+equity/i.test(title) || /net\s+assets/i.test(title)) totalEquity = numeric
    }
  }

  // Calculate KPIs and trends
  const currentProfit = currentMonthRevenue - currentMonthExpenses
  const lastMonthProfit = lastMonthRevenue - lastMonthExpenses
  const profitMargin = currentMonthRevenue > 0 ? (currentProfit / currentMonthRevenue) * 100 : 0
  
  // Month-over-month growth rates
  const revenueGrowth = lastMonthRevenue > 0 ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0
  const expenseGrowth = lastMonthExpenses > 0 ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100 : 0
  const profitGrowth = lastMonthProfit !== 0 ? ((currentProfit - lastMonthProfit) / Math.abs(lastMonthProfit)) * 100 : 0

  // Financial health ratios
  const currentRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : 0
  const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0
  const workingCapital = totalAssets - totalLiabilities

  // Cash flow metrics
  const daysInMonth = today.getDate()
  const dailyBurnRate = currentMonthExpenses / daysInMonth
  const cashRunway = dailyBurnRate > 0 ? currentCash / dailyBurnRate : 999

  // Collection metrics
  const averageInvoiceValue = outstandingInvoices.length > 0 
    ? totalOutstanding / outstandingInvoices.length : 0
  const overdueRate = totalOutstanding > 0 ? (totalOverdue / totalOutstanding) * 100 : 0

  return {
    timestamp: new Date().toISOString(),
    period: {
      current: {
        from: ensureDateString(monthStart),
        to: ensureDateString(today)
      },
      comparison: {
        from: ensureDateString(lastMonth),
        to: ensureDateString(lastMonthEnd)
      }
    },
    
    // Core financial metrics
    revenue: {
      current: Math.round(currentMonthRevenue * 100) / 100,
      lastMonth: Math.round(lastMonthRevenue * 100) / 100,
      growth: Math.round(revenueGrowth * 100) / 100,
      trend: revenueGrowth > 5 ? 'up' : revenueGrowth < -5 ? 'down' : 'stable'
    },
    
    expenses: {
      current: Math.round(currentMonthExpenses * 100) / 100,
      lastMonth: Math.round(lastMonthExpenses * 100) / 100,
      growth: Math.round(expenseGrowth * 100) / 100,
      trend: expenseGrowth > 5 ? 'up' : expenseGrowth < -5 ? 'down' : 'stable'
    },
    
    profit: {
      current: Math.round(currentProfit * 100) / 100,
      lastMonth: Math.round(lastMonthProfit * 100) / 100,
      margin: Math.round(profitMargin * 100) / 100,
      growth: Math.round(profitGrowth * 100) / 100,
      trend: profitGrowth > 5 ? 'up' : profitGrowth < -5 ? 'down' : 'stable'
    },
    
    // Cash and liquidity
    cash: {
      current: Math.round(currentCash * 100) / 100,
      dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
      runway: Math.round(cashRunway),
      status: cashRunway > 90 ? 'healthy' : cashRunway > 30 ? 'warning' : 'critical'
    },
    
    // Receivables
    receivables: {
      total: Math.round(totalOutstanding * 100) / 100,
      overdue: Math.round(totalOverdue * 100) / 100,
      overdueRate: Math.round(overdueRate * 100) / 100,
      count: outstandingInvoices.length,
      overdueCount: overdueInvoices.length,
      averageValue: Math.round(averageInvoiceValue * 100) / 100
    },
    
    // Financial health ratios
    ratios: {
      currentRatio: Math.round(currentRatio * 100) / 100,
      debtToEquity: Math.round(debtToEquity * 100) / 100,
      workingCapital: Math.round(workingCapital * 100) / 100,
      healthScore: Math.min(100, Math.max(0, 
        (currentRatio > 1.5 ? 25 : currentRatio * 16.67) +
        (debtToEquity < 0.5 ? 25 : Math.max(0, 25 - debtToEquity * 25)) +
        (profitMargin > 10 ? 25 : Math.max(0, profitMargin * 2.5)) +
        (cashRunway > 90 ? 25 : Math.max(0, cashRunway * 0.28))
      ))
    },
    
    // Alerts and insights
    alerts: [
      ...(cashRunway < 30 ? [{ 
        type: 'cash_flow', 
        severity: 'critical', 
        message: `Critical: Only ${Math.round(cashRunway)} days of cash remaining` 
      }] : []),
      ...(overdueRate > 20 ? [{ 
        type: 'collections', 
        severity: 'warning', 
        message: `${overdueRate.toFixed(1)}% of receivables are overdue` 
      }] : []),
      ...(expenseGrowth > revenueGrowth + 10 ? [{ 
        type: 'profitability', 
        severity: 'warning', 
        message: 'Expenses growing faster than revenue' 
      }] : []),
      ...(currentRatio < 1 ? [{ 
        type: 'liquidity', 
        severity: 'warning', 
        message: 'Current assets less than current liabilities' 
      }] : [])
    ],
    
    // Performance indicators
    indicators: {
      revenueVelocity: revenueGrowth,
      expenseControl: -expenseGrowth, // Negative growth is good for expenses
      cashEfficiency: currentCash / currentMonthExpenses,
      collectionEfficiency: 100 - overdueRate
    }
  }
})
