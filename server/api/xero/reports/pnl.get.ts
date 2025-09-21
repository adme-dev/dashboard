import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getDefaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 30)
  return { from: ensureDateString(from), to: ensureDateString(to) }
}

export default eventHandler(async (event) => {
  const token = await getTokenForSession(event)
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected' })
  }
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const fromDate = String(query.fromDate || '')
  const toDate = String(query.toDate || '')
  const { from, to } = (!fromDate || !toDate) ? getDefaultRange() : { from: fromDate, to: toDate }

  const url = new URL('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss')
  url.searchParams.set('fromDate', from)
  url.searchParams.set('toDate', to)
  url.searchParams.set('summarizeBy', 'Total')

  const report = await $fetch<any>(url.toString(), {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'xero-tenant-id': tenantId
    }
  })

  // Parse Xero report to extract totals
  function flattenRows(rows: any[] | undefined, out: any[] = []): any[] {
    if (!rows) return out
    for (const row of rows) {
      out.push(row)
      if (row.Rows) flattenRows(row.Rows, out)
    }
    return out
  }

  const rows = flattenRows(report?.Reports?.[0]?.Rows)
  let revenueTotal = 0
  let expensesTotal = 0
  let netProfit = 0

  for (const row of rows) {
    const title = row?.Cells?.[0]?.Value || row?.Title || ''
    const valueStr = row?.Cells?.[row.Cells?.length - 1]?.Value
    const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)

    if (/total\s+revenue/i.test(title)) revenueTotal = numeric
    if (/total\s+expense/i.test(title) || /total\s+expenses/i.test(title)) expensesTotal = numeric
    if (/net\s+profit/i.test(title) || /profit\s+for\s+the\s+period/i.test(title)) netProfit = numeric
  }

  const profitMargin = revenueTotal !== 0 ? (netProfit / revenueTotal) : 0

  return {
    fromDate: from,
    toDate: to,
    revenueTotal,
    expensesTotal,
    netProfit,
    profitMargin
  }
})
