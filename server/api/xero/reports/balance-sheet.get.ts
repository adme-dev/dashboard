import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getDefaultToDate() {
  const to = new Date()
  return ensureDateString(to)
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
  const toDate = String(query.toDate || getDefaultToDate())

  const url = new URL('https://api.xero.com/api.xro/2.0/Reports/BalanceSheet')
  url.searchParams.set('date', toDate)
  url.searchParams.set('summarizeBy', 'Total')

  const report = await $fetch<any>(url.toString(), {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
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
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0

  for (const row of rows) {
    const title = row?.Cells?.[0]?.Value || row?.Title || ''
    const valueStr = row?.Cells?.[row.Cells?.length - 1]?.Value
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
