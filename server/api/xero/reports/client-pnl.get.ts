/**
 * GET /api/xero/reports/client-pnl
 *
 * Slices the Profit & Loss by a tracking category (typically "Client"
 * or "Project" in an agency's Xero chart). Returns one column per
 * tracking option so the dashboard can render a per-client P&L grid.
 *
 * Query params:
 *   trackingCategoryID – optional; defaults to the first active
 *                        category (most agencies only have one).
 *   fromDate / toDate  – ISO strings; defaults to current month.
 *   basis              – "Accrual" (default) or "Cash"
 *
 * Xero docs:
 *   https://developer.xero.com/documentation/api/accounting/reports#profit-and-loss
 *   https://developer.xero.com/documentation/api/accounting/trackingcategories
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

function parseNumeric(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  if (typeof input !== 'string') return 0
  const trimmed = input.trim()
  if (!trimmed) return 0
  const isNegative = /^\(.*\)$/.test(trimmed)
  const normalized = trimmed.replace(/[(),%$]/g, '').replace(/[^0-9.-]/g, '')
  const n = Number(normalized)
  if (Number.isNaN(n)) return 0
  return isNegative ? -n : n
}

function getTitle(row: XeroRow): string {
  return row.title ?? row.Title ?? (row.cells ?? row.Cells ?? [])[0]?.value as string ?? ''
}

function getCells(row: XeroRow): XeroCell[] {
  return row.cells ?? row.Cells ?? []
}

function findRow(rows: XeroRow[], matcher: RegExp): XeroRow | null {
  for (const row of rows) {
    if (matcher.test(getTitle(row))) return row
    const child = findRow(row.rows ?? row.Rows ?? [], matcher)
    if (child) return child
  }
  return null
}

function monthBounds(date: Date) {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const from = new Date(Date.UTC(y, m, 1))
  const to = new Date(Date.UTC(y, m + 1, 0))
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const { from: defaultFrom, to: defaultTo } = monthBounds(new Date())
  const fromDate = typeof q.fromDate === 'string' ? q.fromDate : defaultFrom
  const toDate = typeof q.toDate === 'string' ? q.toDate : defaultTo
  const basis = typeof q.basis === 'string' && q.basis.toLowerCase() === 'cash' ? 'Cash' : 'Accrual'
  const requestedCategory = typeof q.trackingCategoryID === 'string' ? q.trackingCategoryID : null

  const accessToken = token.access_token!
  const cacheKey = `xero-report:${tenantId}:client-pnl:${fromDate}:${toDate}:${basis}:${requestedCategory ?? 'auto'}`

  return cachedFetch(event, cacheKey, 900, async () => {
    // 1. Discover tracking categories (pick first active unless caller specified one).
    const tcBody = await dedupedXeroCall(
      `trackingCategories:${tenantId}`,
      'tracking-categories',
      () => xeroFetch<any>({ accessToken, tenantId, path: 'TrackingCategories' })
    )

    const categories: Array<{ trackingCategoryID: string; name: string; status: string; options?: Array<{ trackingOptionID: string; name: string; status: string }> }>
      = tcBody?.trackingCategories ?? []
    const active = categories.filter(c => c.status === 'ACTIVE')

    const chosen = requestedCategory
      ? active.find(c => c.trackingCategoryID === requestedCategory)
      : active[0]

    if (!chosen) {
      return {
        fromDate,
        toDate,
        basis,
        availableCategories: active.map(c => ({ id: c.trackingCategoryID, name: c.name })),
        category: null,
        options: [],
        rows: { revenue: [], directCosts: [], operatingExpenses: [], netProfit: [] },
        totals: {},
      }
    }

    // 2. Fetch P&L with columns per tracking option.
    const params = new URLSearchParams({
      fromDate,
      toDate,
      trackingCategoryID: chosen.trackingCategoryID,
      standardLayout: 'false',
    })
    if (basis === 'Cash') params.set('paymentsOnly', 'true')

    const report = await dedupedXeroCall(
      `clientPnl:${tenantId}:${chosen.trackingCategoryID}:${fromDate}:${toDate}:${basis}`,
      'client-pnl',
      () => xeroFetch<any>({ accessToken, tenantId, path: `Reports/ProfitAndLoss?${params.toString()}` })
    )

    const reportTable = report?.reports?.[0]
    const rows: XeroRow[] = reportTable?.rows ?? []
    const headerRow = rows.find(r => (r.rowType ?? r.RowType ?? '').toLowerCase() === 'header')
    const optionLabels: string[] = headerRow
      ? getCells(headerRow).slice(1, -1).map(c => String(c.value ?? c.Value ?? ''))
      : [] // last column is Total

    // Helper: find a summary row and extract numeric columns (skip first label, skip last total).
    function extractOptionValues(matcher: RegExp): number[] {
      const row = findRow(rows, matcher)
      if (!row) return optionLabels.map(() => 0)
      const cells = getCells(row).slice(1, -1)
      return cells.map(c => parseNumeric(c.value ?? c.Value))
    }

    const revenue = extractOptionValues(/total\s+(revenue|income|sales|turnover)/i)
    const directCosts = extractOptionValues(/total\s+(cost\s+of\s+sales|direct\s+costs?)/i)
    const operatingExpenses = extractOptionValues(/total\s+(operating\s+expenses?|expenses?|overheads?)/i)
    const grossProfit = revenue.map((r, i) => r - (directCosts[i] ?? 0))
    const netProfit = extractOptionValues(/net\s+profit|profit\s+for\s+the\s+(period|year)/i)

    const options = optionLabels.map((label, i) => ({
      name: label,
      revenue: revenue[i] ?? 0,
      directCosts: directCosts[i] ?? 0,
      grossProfit: grossProfit[i] ?? 0,
      operatingExpenses: operatingExpenses[i] ?? 0,
      netProfit: netProfit[i] ?? 0,
      netMargin: revenue[i] ? (netProfit[i] ?? 0) / revenue[i] : 0,
    })).sort((a, b) => b.revenue - a.revenue)

    const totals = {
      revenue: revenue.reduce((s, v) => s + v, 0),
      directCosts: directCosts.reduce((s, v) => s + v, 0),
      operatingExpenses: operatingExpenses.reduce((s, v) => s + v, 0),
      netProfit: netProfit.reduce((s, v) => s + v, 0),
    }

    return {
      fromDate,
      toDate,
      basis,
      availableCategories: active.map(c => ({ id: c.trackingCategoryID, name: c.name })),
      category: { id: chosen.trackingCategoryID, name: chosen.name },
      options,
      totals,
    }
  })
})
