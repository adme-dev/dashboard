/**
 * GET /api/xero/reports/executive-summary
 *
 * Thin wrapper around Xero's Executive Summary report. Returns the
 * native KPI grid (DSO, DPO, gross profit %, current ratio, etc.) so
 * the /reports page can surface audited numbers instead of recomputing
 * approximations from P&L + Balance Sheet.
 *
 * Xero docs: https://developer.xero.com/documentation/api/accounting/reports#executive-summary
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
  const n = Number(normalized)
  if (Number.isNaN(n)) return null
  return isNegative ? -n : n
}

function getRowTitle(row: XeroRow): string {
  return row.title ?? row.Title ?? ''
}

function getCells(row: XeroRow): XeroCell[] {
  return row.cells ?? row.Cells ?? []
}

function flatten(rows: XeroRow[] | undefined, out: XeroRow[] = []): XeroRow[] {
  for (const row of rows ?? []) {
    out.push(row)
    flatten(row.rows ?? row.Rows, out)
  }
  return out
}

/**
 * Executive Summary rows the agency dashboard surfaces. Keys match
 * common Xero row titles; values may be absent if Xero can't compute
 * them for the period (e.g. no receivables → DSO is null).
 */
const METRIC_MAP: Array<{ key: string; match: RegExp }> = [
  { key: 'income', match: /^income$/i },
  { key: 'directCosts', match: /^direct\s+costs?$/i },
  { key: 'grossProfit', match: /^gross\s+profit$/i },
  { key: 'grossProfitPercent', match: /^gross\s+profit\s+%$/i },
  { key: 'operatingExpenses', match: /^operating\s+expenses?$/i },
  { key: 'netProfit', match: /^net\s+profit$/i },
  { key: 'netProfitPercent', match: /^net\s+profit\s+%$/i },
  { key: 'cashReceived', match: /cash\s+received/i },
  { key: 'cashSpent', match: /cash\s+spent/i },
  { key: 'cashSurplus', match: /cash\s+surplus|cash\s+deficit/i },
  { key: 'closingBank', match: /closing\s+bank/i },
  { key: 'debtorsSales', match: /debtors\s+sales/i },
  { key: 'debtorDays', match: /debtor\s+days|days\s+sales\s+outstanding|\bdso\b/i },
  { key: 'creditorDays', match: /creditor\s+days|days\s+payable\s+outstanding|\bdpo\b/i },
  { key: 'currentRatio', match: /current\s+ratio/i },
  { key: 'quickRatio', match: /quick\s+ratio/i },
  { key: 'inventoryTurnover', match: /inventory\s+turnover/i },
  { key: 'returnOnInvestment', match: /return\s+on\s+investment/i },
  { key: 'returnOnCapital', match: /return\s+on\s+capital/i },
  { key: 'returnOnAssets', match: /return\s+on\s+assets/i },
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

    // Xero returns a single report with one header row followed by many
    // metric rows. Each metric row has a cell per period; we surface the
    // latest period's value.
    const reportTable = report?.reports?.[0]
    const rows = flatten(reportTable?.rows ?? [])
    const periodHeader = rows.find(r => (r.rowType ?? r.RowType ?? '').toLowerCase() === 'header')
    const periodLabels = periodHeader
      ? getCells(periodHeader).slice(1).map(c => String(c.value ?? c.Value ?? ''))
      : []

    const metrics: Record<string, { latest: number | null; periods: number[]; label: string }> = {}

    for (const { key, match } of METRIC_MAP) {
      const row = rows.find(r => match.test(getRowTitle(r)))
      if (!row) {
        metrics[key] = { latest: null, periods: [], label: '' }
        continue
      }
      const cells = getCells(row).slice(1) // skip the label cell
      const periods = cells.map(c => parseNumeric(c.value ?? c.Value)).map(v => v ?? 0)
      const latestIndex = periods.length - 1
      metrics[key] = {
        latest: periods[latestIndex] ?? null,
        periods,
        label: getRowTitle(row),
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
