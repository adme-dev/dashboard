import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
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
  const date = String(query.date || ensureDateString(new Date()))

  const url = new URL('https://api.xero.com/api.xro/2.0/Reports/BankSummary')
  url.searchParams.set('date', date)
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
  let totalBalance = 0

  for (const row of rows) {
    const title = row?.Cells?.[0]?.Value || row?.Title || ''
    const valueStr = row?.Cells?.[row.Cells?.length - 1]?.Value
    const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)
    if (/total/i.test(title)) {
      // Some variants include a total row
      totalBalance = numeric
    }
  }

  // If no explicit total row, sum leaf rows with numeric values
  if (!totalBalance) {
    totalBalance = rows.reduce((acc, row) => {
      const valueStr = row?.Cells?.[row.Cells?.length - 1]?.Value
      const numeric = typeof valueStr === 'string' ? Number(valueStr) : (typeof valueStr === 'number' ? valueStr : 0)
      return acc + (Number.isFinite(numeric) ? numeric : 0)
    }, 0)
  }

  return { date, totalBalance }
})
