import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'

function ensureDateString(d: Date) { return d.toISOString().slice(0, 10) }
function getDefaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 30)
  return { from: ensureDateString(from), to: ensureDateString(to) }
}

async function fetchTenants(client: Awaited<ReturnType<typeof createXeroClient>>) {
  return await client.updateTenants(false)
}

async function fetchPnLForTenant(client: Awaited<ReturnType<typeof createXeroClient>>, tenantId: string, from: string, to: string) {
  const { body: report } = await client.accountingApi.getReportProfitAndLoss(
    tenantId,
    from,
    to,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    false
  )

  function flattenRows(rows: any[] | undefined, out: any[] = []): any[] {
    if (!rows) return out
    for (const row of rows) {
      out.push(row)
      const child = row?.Rows || row?.rows
      if (child) flattenRows(child, out)
    }
    return out
  }

  const reportRows = report?.reports || report?.Reports
  const rows = flattenRows(reportRows?.[0]?.rows || reportRows?.[0]?.Rows)
  let revenueTotal = 0
  let expensesTotal = 0
  let netProfit = 0

  for (const row of rows) {
    const cells = row?.Cells || row?.cells || []
    const title = cells?.[0]?.Value || cells?.[0]?.value || row?.Title || row?.title || ''
    const lastCell = cells?.[cells.length - 1]
    const valueStr = lastCell?.Value ?? lastCell?.value
    const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)

    if (/total\s+revenue/i.test(title)) revenueTotal = numeric
    if (/total\s+expense/i.test(title) || /total\s+expenses/i.test(title)) expensesTotal = numeric
    if (/net\s+profit/i.test(title) || /profit\s+for\s+the\s+period/i.test(title)) netProfit = numeric
  }

  const profitMargin = revenueTotal !== 0 ? (netProfit / revenueTotal) : 0
  return { revenueTotal, expensesTotal, netProfit, profitMargin }
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const client = await createXeroClient({ tokenSet: token })

  const query = getQuery(event)
  const fromDate = String(query.fromDate || '')
  const toDate = String(query.toDate || '')
  const { from, to } = (!fromDate || !toDate) ? getDefaultRange() : { from: fromDate, to: toDate }

  const tenants = await fetchTenants(client)

  const results = [] as Array<{ tenantId: string, tenantName: string, revenueTotal: number, expensesTotal: number, netProfit: number, profitMargin: number }>

  for (const t of tenants) {
    if (!t.tenantId || !t.tenantName) continue
    try {
      const pnl = await fetchPnLForTenant(client, t.tenantId, from, to)
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
