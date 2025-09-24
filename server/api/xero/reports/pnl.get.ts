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

  const client = await createXeroClient({ tokenSet: token, event })
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

  const reportTable = report?.reports?.[0] ?? report?.Reports?.[0]
  const tableRows: XeroRow[] = reportTable ? reportTable.rows ?? reportTable.Rows ?? [] : []
  const periodLabels = getPeriodLabels(tableRows)
  const columnCount = periodLabels.length

  const revenueByPeriod = findRowValues(tableRows, /total\s+revenue|total\s+income/i, columnCount)
  const expensesByPeriod = findRowValues(tableRows, /total\s+expense/i, columnCount)
  const netProfitByPeriod = findRowValues(tableRows, /net\s+profit|profit\s+for\s+the\s+period|net\s+income|net\s+loss/i, columnCount)

  const latestIndex = columnCount > 0 ? columnCount - 1 : 0
  const revenueTotal = revenueByPeriod[latestIndex] ?? 0
  const expensesTotal = expensesByPeriod[latestIndex] ?? 0
  const netProfit = netProfitByPeriod[latestIndex] ?? 0
  const profitMargin = revenueTotal !== 0 ? (netProfit / revenueTotal) : 0

  const periods = periodLabels.map((label, index) => {
    const revenue = revenueByPeriod[index] ?? 0
    const expenses = expensesByPeriod[index] ?? 0
    const net = netProfitByPeriod[index] ?? 0
    const margin = revenue !== 0 ? net / revenue : 0

    return {
      label,
      revenue,
      expenses,
      netProfit: net,
      profitMargin: margin
    }
  })

  const expensesByCategory = extractExpenseBreakdown(tableRows, latestIndex)

  return {
    fromDate: from,
    toDate: to,
    revenueTotal,
    expensesTotal,
    netProfit,
    profitMargin,
    periods,
    expensesByCategory
  }
})

function getRowType(row: XeroRow): string {
  return (row.RowType || row.rowType || '').toString()
}

function getRows(row: XeroRow | undefined): XeroRow[] {
  if (!row) return []
  return row.Rows || row.rows || []
}

function getCells(row: XeroRow | undefined): XeroCell[] {
  if (!row) return []
  return row.Cells || row.cells || []
}

function getCellValue(cell: XeroCell | undefined): string {
  const raw = cell?.Value ?? cell?.value
  return raw === undefined || raw === null ? '' : String(raw)
}

function getRowTitle(row: XeroRow | undefined): string {
  if (!row) return ''
  return row.Title || row.title || getCellValue(getCells(row)[0]) || ''
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

function getPeriodLabels(rows: XeroRow[]): string[] {
  const headerRow = rows.find(row => getRowType(row).toLowerCase() === 'header')
  if (headerRow) {
    const [, ...cells] = getCells(headerRow)
    const labels = cells.map(cell => getCellValue(cell))
    if (labels.length > 0) {
      return labels
    }
  }

  // Fallback: infer labels from the first data row (skipping description cell)
  for (const row of rows) {
    const cells = getCells(row)
    if (cells.length > 1) {
      return cells.slice(1).map((_, index) => `Period ${index + 1}`)
    }
  }

  return []
}

function findRowValues(rows: XeroRow[], matcher: RegExp, columnCount: number): number[] {
  let match: number[] | null = null

  const visit = (row: XeroRow) => {
    if (match) return
    const title = getRowTitle(row)
    if (matcher.test(title)) {
      const cells = getCells(row)
      // skip the first column, which is the label
      const values = cells.slice(1).map(cell => parseNumeric(cell?.Value ?? cell?.value))
      match = values
      return
    }

    for (const child of getRows(row)) {
      visit(child)
      if (match) return
    }
  }

  rows.forEach(row => visit(row))

  if (!match) {
    return Array.from({ length: columnCount }, () => 0)
  }

  if (columnCount > 0 && match.length !== columnCount) {
    // pad or trim to expected column count to keep downstream code simple
    const values = match.slice(0, columnCount)
    while (values.length < columnCount) values.push(0)
    return values
  }

  return match
}

function extractExpenseBreakdown(rows: XeroRow[], valueIndex: number) {
  const categories = new Map<string, number>()

  const visit = (row: XeroRow, inExpensesSection: boolean) => {
    const title = getRowTitle(row)
    const rowType = getRowType(row).toLowerCase()
    const matchesExpenseSection = /expense/i.test(title)
    const isSummary = rowType === 'summaryrow'

    const nextInExpenses = inExpensesSection || (rowType === 'section' && matchesExpenseSection)

    if (nextInExpenses && rowType === 'row' && !isSummary) {
      const cells = getCells(row)
      const cell = cells[valueIndex + 1] // +1 skips the descriptor cell
      const numeric = Math.abs(parseNumeric(cell?.Value ?? cell?.value))
      if (numeric > 0 && title) {
        const label = title.replace(/total\s+/i, '').trim()
        categories.set(label, (categories.get(label) ?? 0) + numeric)
      }
    }

    for (const child of getRows(row)) {
      visit(child, nextInExpenses)
    }
  }

  rows.forEach(row => visit(row, false))

  const entries = Array.from(categories.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])

  return entries.slice(0, 8).map(([name, value]) => ({
    name,
    value
  }))
}
