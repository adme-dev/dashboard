/**
 * GET /api/xero/reports/executive-summary
 *
 * Thin wrapper around Xero's Executive Summary report. Returns the
 * native KPI grid (DSO, DPO, gross/net margin, current ratio, etc.)
 * so the /reports page can surface audited numbers instead of
 * recomputing approximations from P&L + Balance Sheet.
 *
 * Xero docs: https://developer.xero.com/documentation/api/accounting/reports#executive-summary
 *
 * Actual row titles observed (AU, 2026):
 *   Cash:         "Cash received", "Cash spent", "Cash surplus (deficit)",
 *                 "Closing bank balance"
 *   Profitability: "Income", "Direct costs", "Gross profit (loss)",
 *                 "Other Income", "Expenses", "Profit (loss)"
 *   Balance Sheet: "Debtors", "Creditors", "Net assets"
 *   Income:       "Number of invoices issued", "Average value of invoices"
 *   Performance:  "Gross profit margin", "Net profit margin",
 *                 "Return on investment (p.a.)"
 *   Position:     "Average debtors days", "Average creditors days",
 *                 "Short term cash forecast",
 *                 "Current assets to liabilities",
 *                 "Term assets to liabilities"
 *
 * Column layout is [label, currentPeriod, priorPeriod, Variance] — we
 * skip the Variance column.
 */

import { createError } from 'h3'
import { xeroFetch } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import { dedupedXeroCall } from '../../../utils/xeroRateLimit'

type XeroCell = { value?: string | number; Value?: string | number }
type XeroRow = {
  rowType?: string; RowType?: string
  title?: string; Title?: string
  cells?: XeroCell[]; Cells?: XeroCell[]
  rows?: XeroRow[]; Rows?: XeroRow[]
}

function parseNumeric(input: unknown): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const isNegative = /^\(.*\)$/.test(trimmed)
  const normalized = trimmed.replace(/[(),%$]/g, '').replace(/[^0-9.-]/g, '')
  if (!normalized || normalized === '-' || normalized === '.') return null
  const n = Number(normalized)
  if (Number.isNaN(n)) return null
  return isNegative ? -n : n
}

function getCells(row: XeroRow): XeroCell[] {
  return row.cells ?? row.Cells ?? []
}

function cellValue(cell: XeroCell | undefined): string {
  const raw = cell?.value ?? cell?.Value
  return raw === undefined || raw === null ? '' : String(raw)
}

/** Xero puts the row label in cells[0]; section titles live on `title`. */
function getRowLabel(row: XeroRow): string {
  return row.title ?? row.Title ?? cellValue(getCells(row)[0])
}

function getRowType(row: XeroRow): string {
  return (row.rowType ?? row.RowType ?? '').toLowerCase()
}

function flatten(rows: XeroRow[] | undefined, out: XeroRow[] = []): XeroRow[] {
  for (const row of rows ?? []) {
    out.push(row)
    flatten(row.rows ?? row.Rows, out)
  }
  return out
}

/**
 * Dashboard-facing metrics keyed to the actual row titles Xero returns.
 * Each entry can match more than one alternative so this stays stable
 * across report versions and minor labeling drift.
 */
const METRIC_MAP: Array<{ key: string; match: RegExp }> = [
  { key: 'cashReceived', match: /^cash\s+received$/i },
  { key: 'cashSpent', match: /^cash\s+spent$/i },
  { key: 'cashSurplus', match: /^cash\s+surplus/i },
  { key: 'closingBank', match: /^closing\s+bank/i },
  { key: 'income', match: /^income$/i },
  { key: 'directCosts', match: /^direct\s+costs?$/i },
  { key: 'grossProfit', match: /^gross\s+profit(\s+\(loss\))?$/i },
  { key: 'otherIncome', match: /^other\s+income$/i },
  { key: 'expenses', match: /^expenses?$/i },
  { key: 'netProfit', match: /^(net\s+)?profit(\s+\(loss\))?$/i },
  { key: 'debtors', match: /^debtors$/i },
  { key: 'creditors', match: /^creditors$/i },
  { key: 'netAssets', match: /^net\s+assets$/i },
  { key: 'invoiceCount', match: /^number\s+of\s+invoices/i },
  { key: 'avgInvoiceValue', match: /^average\s+value\s+of\s+invoices/i },
  { key: 'grossProfitPercent', match: /^gross\s+profit\s+margin$/i },
  { key: 'netProfitPercent', match: /^net\s+profit\s+margin$/i },
  { key: 'returnOnInvestment', match: /^return\s+on\s+investment/i },
  { key: 'debtorDays', match: /^average\s+debtors?\s+days$/i },
  { key: 'creditorDays', match: /^average\s+creditors?\s+days$/i },
  { key: 'shortTermCashForecast', match: /^short\s+term\s+cash\s+forecast$/i },
  { key: 'currentRatio', match: /^current\s+assets\s+to\s+liabilities$/i },
  { key: 'termRatio', match: /^term\s+assets\s+to\s+liabilities$/i },
]

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const dateInput = typeof query.date === 'string' ? query.date : undefined
  const asOf = dateInput ?? new Date().toISOString().slice(0, 10)

  const cacheKey = `xero-report:${tenantId}:executive-summary:${asOf}`

  return cachedFetch(event, cacheKey, 900, async () => {
    const report = await dedupedXeroCall(
      `executive-summary:${tenantId}:${asOf}`,
      'executive-summary',
      () => xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: `Reports/ExecutiveSummary?date=${asOf}`,
      })
    )

    const reportTable = report?.reports?.[0]
    const topRows: XeroRow[] = reportTable?.rows ?? []
    const flat = flatten(topRows)

    // Header row gives us period labels. Drop the trailing "Variance" column
    // so "periods" only holds real reporting periods.
    const headerRow = flat.find(r => getRowType(r) === 'header')
    const headerLabels = headerRow
      ? getCells(headerRow).slice(1).map(c => cellValue(c))
      : []
    const varianceIdx = headerLabels.findIndex(l => /^variance$/i.test(l))
    const periodLabels = varianceIdx >= 0 ? headerLabels.slice(0, varianceIdx) : headerLabels

    const metrics: Record<string, { latest: number | null; previous: number | null; periods: number[]; label: string }> = {}

    for (const { key, match } of METRIC_MAP) {
      const row = flat.find(r => getRowType(r) === 'row' && match.test(getRowLabel(r)))
      if (!row) {
        metrics[key] = { latest: null, previous: null, periods: [], label: '' }
        continue
      }
      // cells = [label, currentPeriod, priorPeriod, Variance]
      const valueCells = getCells(row).slice(1)
      const trimmed = varianceIdx >= 0 ? valueCells.slice(0, varianceIdx) : valueCells
      const periods = trimmed.map(c => parseNumeric(c.value ?? c.Value)).map(v => (v === null ? 0 : v))
      metrics[key] = {
        latest: periods[0] ?? null,   // current period is first
        previous: periods[1] ?? null, // prior period is second
        periods,
        label: getRowLabel(row),
      }
    }

    return {
      asOf,
      reportTitle: reportTable?.reportTitles?.join(' — ') ?? 'Executive Summary',
      periodLabels,
      metrics,
    }
  })
})
