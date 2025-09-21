import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../../utils/tokenStore'

function ensureDateString(d: Date) { return d.toISOString().slice(0, 10) }
function getDefaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 30)
  return { from: ensureDateString(from), to: ensureDateString(to) }
}

async function fetchTenants(accessToken: string) {
  return await $fetch<any[]>('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
}

async function fetchPnLForTenant(accessToken: string, tenantId: string, from: string, to: string) {
  const url = new URL('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss')
  url.searchParams.set('fromDate', from)
  url.searchParams.set('toDate', to)
  url.searchParams.set('summarizeBy', 'Total')

  const report = await $fetch<any>(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId
    }
  })

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
  return { revenueTotal, expensesTotal, netProfit, profitMargin }
}

export default eventHandler(async (event) => {
  const token = await getTokenForSession(event)
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected' })
  }

  const query = getQuery(event)
  const fromDate = String(query.fromDate || '')
  const toDate = String(query.toDate || '')
  const { from, to } = (!fromDate || !toDate) ? getDefaultRange() : { from: fromDate, to: toDate }

  const tenants = await fetchTenants(token.access_token)

  const results = [] as Array<{ tenantId: string, tenantName: string, revenueTotal: number, expensesTotal: number, netProfit: number, profitMargin: number }>

  for (const t of tenants) {
    try {
      const pnl = await fetchPnLForTenant(token.access_token, t.tenantId, from, to)
      results.push({ tenantId: t.tenantId, tenantName: t.tenantName, ...pnl })
    } catch {
      // Skip tenant on error
    }
  }

  const totals = results.reduce((acc, r) => {
    acc.revenueTotal += r.revenueTotal
    acc.expensesTotal += r.expensesTotal
    acc.netProfit += r.netProfit
    return acc
  }, { revenueTotal: 0, expensesTotal: 0, netProfit: 0 })

  const profitMargin = totals.revenueTotal !== 0 ? (totals.netProfit / totals.revenueTotal) : 0

  return { fromDate: from, toDate: to, tenants: results, totals: { ...totals, profitMargin } }
})
