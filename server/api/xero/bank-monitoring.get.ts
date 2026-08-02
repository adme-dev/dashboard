import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'
import { mapWithConcurrency } from '~~/server/utils/concurrency'
import { bankSummaryAccountNames, partitionAccountsForTrends } from '~~/server/utils/xeroDataFetcher'

/** Concurrent bank-transaction fetches. Xero allows 5 concurrent calls per
 *  tenant; the shared rate limiter also spaces calls, so 4 stays well inside. */
const BANK_TX_CONCURRENCY = 4

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

  if (bankSummary?.reports?.[0]?.rows) {
    const reportRows = bankSummary.reports[0].rows || []
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

  // Bank transactions drive the trend/history charts, one Xero round-trip per
  // account. This used to be a fully sequential loop over every Type=BANK
  // account — with a dozen accounts (incl. closed ones and 6 credit cards) that
  // was ~12 serial calls and routinely blew the request budget, which is why
  // callers like the AI context retriever saw this endpoint time out.
  //
  // Two changes: skip accounts Xero's own summary doesn't list (they can only
  // return an empty series), and run the rest with bounded concurrency.
  const { withActivity, skipped } = partitionAccountsForTrends(
    bankAccounts,
    bankSummaryAccountNames(bankSummary)
  )
  if (skipped.length) {
    console.info(`[bank-monitoring] skipped transaction fetch for ${skipped.length} account(s) absent from the bank summary`)
  }

  const bankTransactionResults = await mapWithConcurrency(
    withActivity,
    BANK_TX_CONCURRENCY,
    async (account) => {
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
        return {
          accountId: account.accountID!,
          accountName: account.name!,
          transactions: body?.bankTransactions || []
        }
      } catch (err) {
        console.warn(`Failed to fetch transactions for ${account.name}:`, err)
        return {
          accountId: account.accountID!,
          accountName: account.name!,
          transactions: [] as any[]
        }
      }
    }
  )

  // Process account data
  const accountSummaries = []
  let totalBalance = 0
  let totalCash = 0
  let totalCreditCard = 0
  let totalInflows = 0
  let totalOutflows = 0

  for (const account of bankAccounts) {
    const accountName = account.name || 'Unknown Account'
    // Xero files credit cards under Type=BANK; only BankAccountType tells them
    // apart. Card debt is a payable, so it must not be treated as cash.
    const isCreditCard = String(
      (account as any).bankAccountType ?? (account as any).BankAccountType ?? ''
    ).toUpperCase() === 'CREDITCARD'
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

    if (isCreditCard) {
      // A negative balance on a card means it is drawn down, which is normal —
      // flagging it as an overdraft made every card look critical. Xero exposes
      // no credit limit, so utilisation can't be assessed here.
      if (currentBalance < 0) {
        alerts.push({
          type: 'credit_drawn',
          message: `Card drawn down by $${Math.abs(currentBalance).toFixed(2)}`
        })
      }
    } else if (currentBalance < 0) {
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
      isCreditCard,
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

    if (isCreditCard) totalCreditCard += currentBalance
    else totalCash += currentBalance
    totalBalance += currentBalance
    totalInflows += accountInflows
    totalOutflows += accountOutflows
  }

  // Overall portfolio analysis
  const netCashFlow = totalInflows - totalOutflows
  // Velocity and liquidity risk are about spendable cash, so they key off
  // totalCash — netting drawn credit cards in made both meaningless.
  const cashVelocity = totalCash > 0 ? (totalInflows + totalOutflows) / totalCash : 0

  // Risk assessment — cash accounts only. A drawn-down card is not an overdraft.
  const cashAccounts = accountSummaries.filter(acc => !acc.isCreditCard)
  const lowBalanceAccounts = cashAccounts.filter(acc => acc.currentBalance < 1000)
  const overdraftAccounts = cashAccounts.filter(acc => acc.currentBalance < 0)
  const volatileAccounts = accountSummaries.filter(acc => Math.abs(acc.balanceChangePercent) > 25)

  let overallRiskLevel = 'low'
  if (overdraftAccounts.length > 0 || totalCash < 5000) {
    overallRiskLevel = 'high'
  } else if (lowBalanceAccounts.length > 0 || netCashFlow < -5000) {
    overallRiskLevel = 'medium'
  }

  // Generate insights
  const insights = []
  if (netCashFlow < 0) {
    insights.push(`Net cash outflow of $${Math.abs(netCashFlow).toFixed(2)} over ${daysBack} days`)
  }
  if (totalCash < 10000) {
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
      /** Net across every bank-type account, credit cards included. */
      totalBalance: Math.round(totalBalance * 100) / 100,
      /** Liquid cash — the figure to use for runway and liquidity. */
      totalCash: Math.round(totalCash * 100) / 100,
      /** Credit-card balances, negative when drawn down. */
      totalCreditCard: Math.round(totalCreditCard * 100) / 100,
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
      ...(totalCash < 10000 ? ['Consider building larger cash reserves'] : []),
      ...(overdraftAccounts.length > 0 ? ['Address overdrawn accounts immediately'] : []),
      ...(netCashFlow < -1000 ? ['Review and reduce cash outflows'] : []),
      ...(accountSummaries.length === 1 ? ['Consider opening additional bank accounts for diversification'] : []),
      ...(volatileAccounts.length > 0 ? ['Monitor volatile accounts for unusual activity'] : [])
    ]
  }
  }) // end cachedFetch
})
