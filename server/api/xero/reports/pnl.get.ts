import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
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
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const fromDate = String(query.fromDate || '')
  const toDate = String(query.toDate || '')
  const { from, to } = (!fromDate || !toDate) ? getDefaultRange() : { from: fromDate, to: toDate }

  const client = await createXeroClient({ tokenSet: token })
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

  // Parse Xero report to extract totals
  function flattenRows(rows: any[] | undefined, out: any[] = []): any[] {
    if (!rows) return out
    for (const row of rows) {
      out.push(row)
      const childRows = row?.Rows || row?.rows
      if (childRows) flattenRows(childRows, out)
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

  return {
    fromDate: from,
    toDate: to,
    revenueTotal,
    expensesTotal,
    netProfit,
    profitMargin
  }
})
