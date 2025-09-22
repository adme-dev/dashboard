import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

type XeroRow = {
  RowType?: string
  rowType?: string
  Title?: string
  title?: string
  Cells?: XeroCell[]
  cells?: XeroCell[]
  Rows?: XeroRow[]
  rows?: XeroRow[]
}

type XeroCell = {
  Value?: string | number
  value?: string | number
}

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

  const reportTable = report?.reports?.[0] ?? report?.Reports?.[0]
  const tableRows: XeroRow[] = reportTable ? reportTable.rows ?? reportTable.Rows ?? [] : []
  const rows = flattenRows(tableRows)
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0

  for (const row of rows) {
    const cells = getCells(row)
    const title = getRowTitle(row)
    const lastCell = cells[cells.length - 1]
    const numeric = parseNumeric(getCellValue(lastCell))

    if (/total\s+assets/i.test(title)) totalAssets = numeric
    if (/total\s+liabilit/i.test(title)) totalLiabilities = numeric
    if (/total\s+equity/i.test(title) || /net\s+assets/i.test(title)) totalEquity = numeric
  }

  const workingCapital = totalAssets - totalLiabilities
  const debtToEquity = totalEquity !== 0 ? totalLiabilities / totalEquity : 0
  const equityRatio = totalAssets !== 0 ? totalEquity / totalAssets : 0

  return {
    date: toDate,
    totalAssets,
    totalLiabilities,
    totalEquity,
    workingCapital,
    debtToEquity,
    equityRatio
  }
})

function flattenRows(rows: XeroRow[] | undefined, out: XeroRow[] = []): XeroRow[] {
  if (!rows) return out
  for (const row of rows) {
    out.push(row)
    const child = row.Rows || row.rows
    if (child) flattenRows(child, out)
  }
  return out
}

function getCells(row: XeroRow | undefined): XeroCell[] {
  if (!row) return []
  return row.Cells || row.cells || []
}

function getRowTitle(row: XeroRow | undefined): string {
  if (!row) return ''
  return row.Title || row.title || getCellValue(getCells(row)[0]) || ''
}

function getCellValue(cell: XeroCell | undefined): string {
  const raw = cell?.Value ?? cell?.value
  return raw === undefined || raw === null ? '' : String(raw)
}

function parseNumeric(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 0

    const isNegative = /^\(.*\)$/.test(trimmed)
    const normalized = trimmed
      .replace(/[(),]/g, '')
      .replace(/[^0-9.-]/g, '')

    const numeric = Number(normalized)
    if (Number.isNaN(numeric)) return 0

    return isNegative ? -numeric : numeric
  }

  return 0
}
