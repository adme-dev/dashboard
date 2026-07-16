/**
 * Shared parsing helpers for Xero's Reports API row/cell structures
 * (ProfitAndLoss and friends). Extracted from reports/pnl.get.ts so the
 * dashboard KPI endpoint can read the same real P&L report instead of
 * re-deriving "revenue" and "expenses" by summing invoices (which missed
 * spend-money transactions, payroll wages and manual journals entirely).
 */

export type XeroRow = {
  RowType?: string
  rowType?: string
  Title?: string
  title?: string
  Cells?: XeroCell[]
  cells?: XeroCell[]
  Rows?: XeroRow[]
  rows?: XeroRow[]
}

export type XeroCell = {
  Value?: string | number
  value?: string | number
}

export function getRowType(row: XeroRow): string {
  return (row.RowType || row.rowType || '').toString()
}

export function getRows(row: XeroRow | undefined): XeroRow[] {
  if (!row) return []
  return row.Rows || row.rows || []
}

export function getCells(row: XeroRow | undefined): XeroCell[] {
  if (!row) return []
  return row.Cells || row.cells || []
}

export function getCellValue(cell: XeroCell | undefined): string {
  const raw = cell?.Value ?? cell?.value
  return raw === undefined || raw === null ? '' : String(raw)
}

export function getRowTitle(row: XeroRow | undefined): string {
  if (!row) return ''
  return row.Title || row.title || getCellValue(getCells(row)[0]) || ''
}

export function parseNumeric(value: string | number | undefined): number {
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

export function getPeriodLabels(rows: XeroRow[]): string[] {
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

export function findRowValues(rows: XeroRow[], matcher: RegExp, columnCount: number): number[] {
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

  const result: number[] = match
  if (columnCount > 0 && result.length !== columnCount) {
    // pad or trim to expected column count to keep downstream code simple
    const values = result.slice(0, columnCount)
    while (values.length < columnCount) values.push(0)
    return values
  }

  return result
}

export function extractExpenseBreakdown(rows: XeroRow[], valueIndex: number) {
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

/**
 * Headline totals from a single-period Xero P&L report.
 *
 *   revenue      = Total Income
 *   costOfSales  = Total Cost of Sales (DIRECTCOSTS accounts)
 *   expenses     = Total Operating Expenses — deliberately the literal
 *                  report line, NOT costOfSales + operating: a bookkeeper
 *                  reconciles each dashboard figure against a named P&L
 *                  row, and this org books PPC recharges as contra-COGS
 *                  (negative Cost of Sales), which would make a combined
 *                  figure match nothing on the report
 *   netProfit    = the report's Net Profit line
 *
 * Verified against this org's live ProfitAndLoss layout 2026-07-16
 * (row titles: Total Income / Total Cost of Sales / Total Operating
 * Expenses / Net Profit; cash + accrual).
 */
export function extractPnlTotals(report: any): {
  revenue: number
  costOfSales: number
  operatingExpenses: number
  expenses: number
  netProfit: number
} {
  const reportTable = report?.reports?.[0] ?? report?.Reports?.[0]
  const rows: XeroRow[] = reportTable ? reportTable.rows ?? reportTable.Rows ?? [] : []
  const columnCount = getPeriodLabels(rows).length
  const latest = columnCount > 0 ? columnCount - 1 : 0

  // Xero layouts vary: "Total Income", "Total Revenue", "Total Operating
  // Income", "Total Trading Income", "Total Sales" all appear in the wild.
  const revenue = findRowValues(rows, /total\s+(operating\s+|trading\s+)?(revenue|income|sales)\b/i, columnCount)[latest] ?? 0
  const costOfSales = findRowValues(rows, /total\s+cost\s+of\s+sales|total\s+direct\s+costs/i, columnCount)[latest] ?? 0
  const operatingExpenses = findRowValues(rows, /total\s+expense|total\s+operating\s+expense/i, columnCount)[latest] ?? 0
  const netProfit = findRowValues(rows, /net\s+profit|profit\s+for\s+the\s+period|net\s+income|net\s+loss/i, columnCount)[latest] ?? 0

  return {
    revenue,
    costOfSales,
    operatingExpenses,
    expenses: operatingExpenses,
    netProfit,
  }
}
