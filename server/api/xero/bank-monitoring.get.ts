import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function dtExpr(d: Date) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `DateTime(${y},${m},${day})`
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const daysBack = Number(query.days) || 30
  const includeTransactions = query.transactions === 'true'

  const today = new Date()
  const startDate = addDays(today, -daysBack)

  const cacheKey = `xero:bank-monitoring:${tenantId}:${daysBack}:${includeTransactions}`

  return cachedFetch(event, cacheKey, 300, async () => {
  const client = await createXeroClient({ tokenSet: token, event })

  // Get all bank accounts
  const accountsBody = await dedupedXeroCall(
    `bank-accounts:${tenantId}`,
    'bank-accounts',
    async () => {
      const { body } = await client.accountingApi.getAccounts(
        tenantId,
        undefined,
        'Type=="BANK"',
        'Name ASC'
      )
      return body
    }
  )

  const bankAccounts = accountsBody?.accounts || []

  // Get current bank balances
  const fromDate = addDays(today, -30)
  const bankSummary = await dedupedXeroCall(
    `bank-summary:${tenantId}`,
    'bank-summary',
    async () => {
      const { body } = await client.accountingApi.getReportBankSummary(
        tenantId,
        ensureDateString(fromDate),
        ensureDateString(today)
      )
      return body
    }
  )

  // Parse bank summary for current balances
  const currentBalances = new Map<string, number>()
  
  function flattenRows(rows: any[], out: any[] = []): any[] {
    for (const row of rows) {
      out.push(row)
      if (row?.Rows || row?.rows) {
        flattenRows(row.Rows || row.rows, out)
      }
    }
    return out
  }

  if (bankSummary?.reports?.[0]?.rows || bankSummary?.Reports?.[0]?.Rows) {
    const reportRows = bankSummary.reports?.[0]?.rows || bankSummary.Reports?.[0]?.Rows || []
    const allRows = flattenRows(reportRows)
    for (const row of allRows) {
      const cells = row?.Cells || row?.cells || []
      const accountName = cells?.[0]?.Value || cells?.[0]?.value || ''
      const balanceCell = cells[cells.length - 1]
      const balance = Number(balanceCell?.Value ?? balanceCell?.value) || 0
      
      if (accountName && balance !== 0) {
        currentBalances.set(accountName.trim(), balance)
      }
    }
  }

  // Get bank transactions for trend analysis — sequential to avoid concurrent rate limits
  const bankTransactionResults: Array<{ accountId: string, accountName: string, transactions: any[] }> = []
  for (const account of bankAccounts) {
    try {
      const body = await dedupedXeroCall(
        `bank-tx:${tenantId}:${account.accountID}`,
        'bank-tx',
        async () => {
          const { body } = await client.accountingApi.getBankTransactions(
            tenantId,
            undefined,
            `BankAccount.AccountID==Guid("${account.accountID}")&&Date>=${dtExpr(startDate)}&&Date<=${dtExpr(today)}`,
            'Date DESC',
            1,
            undefined,
            100
          )
          return body
        }
      )
      bankTransactionResults.push({
        accountId: account.accountID!,
        accountName: account.name!,
        transactions: body?.bankTransactions || []
      })
    } catch (err) {
      console.warn(`Failed to fetch transactions for ${account.name}:`, err)
      bankTransactionResults.push({
        accountId: account.accountID!,
        accountName: account.name!,
        transactions: []
      })
    }
  }

  // Process account data
  const accountSummaries = []
  let totalBalance = 0
  let totalInflows = 0
  let totalOutflows = 0

  for (const account of bankAccounts) {
    const accountName = account.name || 'Unknown Account'
    const currentBalance = currentBalances.get(accountName) || 0
    const transactionData = bankTransactionResults.find(r => r.accountId === account.accountID)
    const transactions = transactionData?.transactions || []

    // Calculate transaction totals
    let accountInflows = 0
    let accountOutflows = 0
    const dailyBalances = new Map<string, number>()

    // Sort transactions by date for balance tracking
    const sortedTransactions = [...transactions].sort((a, b) => 
      new Date(a.date || '').getTime() - new Date(b.date || '').getTime()
    )

    let runningBalance = currentBalance
    for (let i = sortedTransactions.length - 1; i >= 0; i--) {
      const transaction = sortedTransactions[i]
      if (!transaction) continue
      const amount = Number(transaction.total) || 0
      const date = ensureDateString(new Date(transaction.date || today))

      if (amount > 0) {
        accountInflows += amount
        runningBalance -= amount // Going backwards in time
      } else {
        accountOutflows += Math.abs(amount)
        runningBalance -= amount // Going backwards in time
      }

      dailyBalances.set(date, runningBalance)
    }

    // Generate daily balance history (forward in time)
    const balanceHistory = []
    let historicalBalance = runningBalance
    for (let i = 0; i <= daysBack; i++) {
      const date = addDays(startDate, i)
      const dateStr = ensureDateString(date)
      
      // Find transactions for this date and update balance
      const dayTransactions = transactions.filter(t => 
        ensureDateString(new Date(t.date || '')) === dateStr
      )
      
      for (const tx of dayTransactions) {
        historicalBalance += Number(tx.total) || 0
      }

      balanceHistory.push({
        date: dateStr,
        balance: Math.round(historicalBalance * 100) / 100
      })
    }

    // Calculate trends
    const startBalance = balanceHistory[0]?.balance || currentBalance
    const balanceChange = currentBalance - startBalance
    const balanceChangePercent = startBalance !== 0 ? (balanceChange / Math.abs(startBalance)) * 100 : 0

    // Account health assessment
    let healthStatus = 'healthy'
    let alerts = []

    if (currentBalance < 0) {
      healthStatus = 'critical'
      alerts.push({ type: 'overdraft', message: 'Account is overdrawn' })
    } else if (currentBalance < 1000) {
      healthStatus = 'warning'
      alerts.push({ type: 'low_balance', message: 'Balance is critically low' })
    }

    if (Math.abs(balanceChangePercent) > 50) {
      alerts.push({ 
        type: 'volatility', 
        message: `Balance changed by ${balanceChangePercent.toFixed(1)}% in ${daysBack} days` 
      })
    }

    const avgDailyChange = balanceChange / daysBack
    if (avgDailyChange < -100) {
      alerts.push({ 
        type: 'burn_rate', 
        message: `Average daily outflow of $${Math.abs(avgDailyChange).toFixed(2)}` 
      })
    }

    accountSummaries.push({
      accountId: account.accountID,
      accountName,
      accountCode: account.code,
      currentBalance: Math.round(currentBalance * 100) / 100,
      balanceChange: Math.round(balanceChange * 100) / 100,
      balanceChangePercent: Math.round(balanceChangePercent * 100) / 100,
      inflows: Math.round(accountInflows * 100) / 100,
      outflows: Math.round(accountOutflows * 100) / 100,
      netFlow: Math.round((accountInflows - accountOutflows) * 100) / 100,
      transactionCount: transactions.length,
      healthStatus,
      alerts,
      balanceHistory: balanceHistory.filter((_, index) => index % 7 === 0), // Weekly points for charts
      ...(includeTransactions && {
        recentTransactions: transactions.slice(0, 10).map(tx => ({
          id: tx.bankTransactionID,
          date: ensureDateString(new Date(tx.date || today)),
          description: tx.reference || (tx as any).description || 'Bank Transaction',
          amount: Math.round((Number(tx.total) || 0) * 100) / 100,
          type: (Number(tx.total) || 0) > 0 ? 'credit' : 'debit',
          contact: tx.contact?.name
        }))
      })
    })

    totalBalance += currentBalance
    totalInflows += accountInflows
    totalOutflows += accountOutflows
  }

  // Overall portfolio analysis
  const netCashFlow = totalInflows - totalOutflows
  const cashVelocity = totalBalance > 0 ? (totalInflows + totalOutflows) / totalBalance : 0
  
  // Risk assessment
  const lowBalanceAccounts = accountSummaries.filter(acc => acc.currentBalance < 1000)
  const overdraftAccounts = accountSummaries.filter(acc => acc.currentBalance < 0)
  const volatileAccounts = accountSummaries.filter(acc => Math.abs(acc.balanceChangePercent) > 25)

  let overallRiskLevel = 'low'
  if (overdraftAccounts.length > 0 || totalBalance < 5000) {
    overallRiskLevel = 'high'
  } else if (lowBalanceAccounts.length > 0 || netCashFlow < -5000) {
    overallRiskLevel = 'medium'
  }

  // Generate insights
  const insights = []
  if (netCashFlow < 0) {
    insights.push(`Net cash outflow of $${Math.abs(netCashFlow).toFixed(2)} over ${daysBack} days`)
  }
  if (totalBalance < 10000) {
    insights.push('Total cash reserves are below recommended levels')
  }
  if (volatileAccounts.length > 0) {
    insights.push(`${volatileAccounts.length} account(s) showing high volatility`)
  }
  if (accountSummaries.length === 1) {
    insights.push('Consider diversifying across multiple bank accounts for better cash management')
  }

  return {
    asOfDate: ensureDateString(today),
    period: {
      from: ensureDateString(startDate),
      to: ensureDateString(today),
      days: daysBack
    },
    
    // Portfolio overview
    portfolio: {
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalInflows: Math.round(totalInflows * 100) / 100,
      totalOutflows: Math.round(totalOutflows * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      cashVelocity: Math.round(cashVelocity * 100) / 100,
      accountCount: accountSummaries.length,
      riskLevel: overallRiskLevel
    },
    
    // Individual account details
    accounts: accountSummaries,
    
    // Risk indicators
    risks: {
      lowBalanceCount: lowBalanceAccounts.length,
      overdraftCount: overdraftAccounts.length,
      volatileCount: volatileAccounts.length,
      concentrationRisk: accountSummaries.length === 1
    },
    
    // Alerts requiring attention
    alerts: accountSummaries.flatMap(acc => 
      acc.alerts.map(alert => ({
        accountName: acc.accountName,
        ...alert
      }))
    ),
    
    // AI-generated insights
    insights,
    
    // Recommendations
    recommendations: [
      ...(totalBalance < 10000 ? ['Consider building larger cash reserves'] : []),
      ...(overdraftAccounts.length > 0 ? ['Address overdrawn accounts immediately'] : []),
      ...(netCashFlow < -1000 ? ['Review and reduce cash outflows'] : []),
      ...(accountSummaries.length === 1 ? ['Consider opening additional bank accounts for diversification'] : []),
      ...(volatileAccounts.length > 0 ? ['Monitor volatile accounts for unusual activity'] : [])
    ]
  }
  }) // end cachedFetch
})
