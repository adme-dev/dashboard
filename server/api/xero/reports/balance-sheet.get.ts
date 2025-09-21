import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getDefaultToDate() {
  const to = new Date()
  return ensureDateString(to)
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const toDate = String(query.toDate || getDefaultToDate())

  const client = await createXeroClient({ tokenSet: token })
  const { body: report } = await client.accountingApi.getReportBalanceSheet(
    tenantId,
    toDate,
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
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0

  for (const row of rows) {
    const cells = row?.Cells || row?.cells || []
    const title = cells?.[0]?.Value || cells?.[0]?.value || row?.Title || row?.title || ''
    const lastCell = cells?.[cells.length - 1]
    const valueStr = lastCell?.Value ?? lastCell?.value
    const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)

    if (/total\s+assets/i.test(title)) totalAssets = numeric
    if (/total\s+liabilit/i.test(title)) totalLiabilities = numeric
    if (/total\s+equity/i.test(title) || /net\s+assets/i.test(title)) totalEquity = numeric
  }

  return {
    date: toDate,
    totalAssets,
    totalLiabilities,
    totalEquity
  }
})
