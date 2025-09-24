import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function dtExpr(d: Date) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `DateTime(${y},${m},${day})`
}

// Default budget targets (in a real app, these would come from user settings or database)
const DEFAULT_MONTHLY_BUDGETS = {
  'Office Supplies': 2000,
  'Travel & Entertainment': 3000,
  'Software & Subscriptions': 2500,
  'Professional Services': 4000,
  'Marketing & Advertising': 5000,
  'Utilities': 1000,
  'Equipment': 2000,
  'Training & Development': 1500,
  'Rent': 8000,
  'Insurance': 1200,
  'Other': 2000
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const monthInput = String(query.month || '')
  const yearInput = String(query.year || '')
  
  const today = new Date()
  const targetMonth = monthInput ? Number(monthInput) - 1 : today.getMonth()
  const targetYear = yearInput ? Number(yearInput) : today.getFullYear()
  
  const monthStart = getMonthStart(new Date(targetYear, targetMonth))
  const monthEnd = getMonthEnd(new Date(targetYear, targetMonth))

  const client = await createXeroClient({ tokenSet: token, event })

  // Get chart of accounts for proper category names
  let accountsMap = new Map<string, string>()
  try {
    const { body } = await client.accountingApi.getAccounts(tenantId)
    const accounts = body?.accounts || []
    for (const account of accounts) {
      if (account.accountID && account.name) {
        accountsMap.set(account.accountID, account.name)
        if (account.code) {
          accountsMap.set(account.code, account.name)
        }
      }
    }
  } catch (err) {
    console.warn('Failed to fetch chart of accounts:', err)
  }

  // Fetch expenses for the target month
  async function fetchAllInvoices(whereExpr: string) {
    const results: any[] = []
    let page = 1
    for (;;) {
      const { body } = await client.accountingApi.getInvoices(
        tenantId,
        undefined,
        whereExpr,
        'Date DESC',
        undefined,
        undefined,
        undefined,
        undefined,
        page,
        undefined,
        undefined,
        undefined,
        100
      )
      const list = body?.invoices || []
      if (!list.length) break
      results.push(...list)
      if (list.length < 100) break
      page += 1
      if (page > 20) break
    }
    return results
  }

  const whereClause = `Type=="ACCPAY"&&Date>=${dtExpr(monthStart)}&&Date<=${dtExpr(monthEnd)}`
  const expenses = await fetchAllInvoices(whereClause)

  // Process expenses by category
  const actualSpend = new Map<string, number>()
  
  for (const expense of expenses) {
    const lines = expense?.lineItems || []
    const total = Number(expense?.total) || 0
    
    if (lines.length > 0) {
      for (const line of lines) {
        const accountKey = line?.accountCode || line?.accountID
        const categoryName = accountKey && accountsMap.has(accountKey) 
          ? accountsMap.get(accountKey)! 
          : (accountKey || 'Other')
        const amount = Number(line?.lineAmount) || 0
        actualSpend.set(categoryName, (actualSpend.get(categoryName) || 0) + amount)
      }
    } else {
      // If no line items, categorize as 'Other'
      actualSpend.set('Other', (actualSpend.get('Other') || 0) + total)
    }
  }

  // Calculate variance analysis
  const budgetAnalysis = []
  let totalBudget = 0
  let totalActual = 0
  let totalVariance = 0

  // Get all unique categories from both budget and actual
  const allCategories = new Set([
    ...Object.keys(DEFAULT_MONTHLY_BUDGETS),
    ...actualSpend.keys()
  ])

  for (const category of allCategories) {
    const budgeted = DEFAULT_MONTHLY_BUDGETS[category] || 0
    const actual = actualSpend.get(category) || 0
    const variance = actual - budgeted
    const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : (actual > 0 ? 100 : 0)
    
    totalBudget += budgeted
    totalActual += actual
    totalVariance += variance

    budgetAnalysis.push({
      category,
      budgeted: Math.round(budgeted * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variancePercent: Math.round(variancePercent * 100) / 100,
      status: variance > budgeted * 0.1 ? 'over' : variance < -budgeted * 0.1 ? 'under' : 'on-track'
    })
  }

  // Sort by variance (worst first)
  budgetAnalysis.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))

  // Calculate summary metrics
  const overBudgetCategories = budgetAnalysis.filter(item => item.variance > 0)
  const underBudgetCategories = budgetAnalysis.filter(item => item.variance < 0)
  const totalVariancePercent = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0

  // Calculate forecast for rest of month (if current month)
  const isCurrentMonth = targetYear === today.getFullYear() && targetMonth === today.getMonth()
  const daysInMonth = monthEnd.getDate()
  const daysPassed = isCurrentMonth ? today.getDate() : daysInMonth
  const daysRemaining = daysInMonth - daysPassed

  let projectedMonthEnd = totalActual
  if (isCurrentMonth && daysPassed > 0) {
    const dailyAverage = totalActual / daysPassed
    projectedMonthEnd = totalActual + (dailyAverage * daysRemaining)
  }

  return {
    period: {
      month: targetMonth + 1,
      year: targetYear,
      monthName: monthStart.toLocaleString('default', { month: 'long' }),
      isCurrentMonth,
      daysPassed,
      daysRemaining
    },
    summary: {
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance: Math.round(totalVariance * 100) / 100,
      totalVariancePercent: Math.round(totalVariancePercent * 100) / 100,
      projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
      overBudgetCount: overBudgetCategories.length,
      underBudgetCount: underBudgetCategories.length
    },
    categoryAnalysis: budgetAnalysis,
    alerts: [
      ...overBudgetCategories
        .filter(item => item.variancePercent > 20)
        .map(item => ({
          type: 'warning',
          category: item.category,
          message: `${item.category} is ${item.variancePercent.toFixed(1)}% over budget`,
          severity: item.variancePercent > 50 ? 'high' : 'medium'
        })),
      ...(isCurrentMonth && projectedMonthEnd > totalBudget * 1.1 ? [{
        type: 'forecast',
        category: 'Overall',
        message: `Projected to exceed total budget by ${((projectedMonthEnd - totalBudget) / totalBudget * 100).toFixed(1)}%`,
        severity: 'high'
      }] : [])
    ]
  }
})
