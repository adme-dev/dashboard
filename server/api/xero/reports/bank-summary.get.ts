import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const date = String(query.date || ensureDateString(new Date()))

  const client = await createXeroClient({ tokenSet: token })

  // Try Bank Summary first
  try {
    const { body: report } = await client.accountingApi.getReportBankSummary(
      tenantId,
      date,
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
      totalBalance = rows.reduce((acc, row) => {
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
    const { body: report } = await client.accountingApi.getReportBalanceSheet(
      tenantId,
      date,
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
