import { xeroFetch } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import { dedupedXeroCall } from '../../../utils/xeroRateLimit'
import { ensureDateString, flattenRows } from '../../../utils/xeroDataFetcher'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const date = String(query.date || ensureDateString(new Date()))

  const cacheKey = `xero-report:${tenantId}:bank-summary:${date}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const accessToken = token.access_token!

    // Try Bank Summary first
    try {
      const dateKey = date
      const toDate = new Date(date)
      const fromDate = new Date(toDate)
      fromDate.setDate(fromDate.getDate() - 30)

      const report = await dedupedXeroCall(
        `bankSummary:${tenantId}:${dateKey}`,
        'bank-summary',
        () => xeroFetch<any>({
          accessToken,
          tenantId,
          path: `Reports/BankSummary?fromDate=${ensureDateString(fromDate)}&toDate=${ensureDateString(toDate)}`,
        })
      )

      const reportRows = report?.reports || report?.Reports
      const rows = flattenRows(reportRows?.[0]?.rows || reportRows?.[0]?.Rows || [])
      let totalBalance = 0

      for (const row of rows) {
        const cells = row?.Cells || row?.cells || []
        const title = cells?.[0]?.Value || cells?.[0]?.value || row?.Title || row?.title || ''
        const lastCell = cells?.[cells.length - 1]
        const valueStr = lastCell?.Value ?? lastCell?.value
        const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)
        if (/total/i.test(title)) {
          totalBalance = numeric
        }
      }

      if (!totalBalance) {
        totalBalance = rows.reduce((acc: number, row: any) => {
          const cells = row?.Cells || row?.cells || []
          const lastCell = cells?.[cells.length - 1]
          const valueStr = lastCell?.Value ?? lastCell?.value
          const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)
          return acc + (Number.isFinite(numeric) ? numeric : 0)
        }, 0)
      }

      return { date, totalBalance }
    } catch {
      // Fallback to Balance Sheet: sum bank/cash assets
      const report = await dedupedXeroCall(
        `balanceSheetFallback:${tenantId}:${date}`,
        'balance-sheet-fallback',
        () => xeroFetch<any>({
          accessToken,
          tenantId,
          path: `Reports/BalanceSheet?date=${date}`,
        })
      )

      const reportRows = report?.reports || report?.Reports
      const rows = flattenRows(reportRows?.[0]?.rows || reportRows?.[0]?.Rows || [])
      let totalBalance = 0
      for (const row of rows) {
        const cells = row?.Cells || row?.cells || []
        const title = (cells?.[0]?.Value || cells?.[0]?.value || row?.Title || row?.title || '').toLowerCase()
        const lastCell = cells?.[cells.length - 1]
        const valueStr = lastCell?.Value ?? lastCell?.value
        const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)
        if (/bank|cash\s+and\s+cash\s+equivalents|cash$/i.test(title)) {
          totalBalance += Number.isFinite(numeric) ? numeric : 0
        }
      }

      return { date, totalBalance }
    }
  })
})
