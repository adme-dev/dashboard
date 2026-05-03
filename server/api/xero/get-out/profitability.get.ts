/**
 * GET /api/xero/get-out/profitability
 *
 * Headline P&L numbers for the CFO dashboard: revenue, expenses, net profit
 * and margin for two windows (this calendar month + YTD), so the user can
 * see "are we profitable this month" and "are we profitable for the year"
 * side by side.
 *
 * Reuses Xero's ProfitAndLoss report. Caches per-window for 15 min.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'

type XeroRow = {
  rowType?: string
  RowType?: string
  title?: string
  Title?: string
  cells?: Array<{ value?: string | number; Value?: string | number }>
  Cells?: Array<{ value?: string | number; Value?: string | number }>
  rows?: XeroRow[]
  Rows?: XeroRow[]
}

function parseNumeric(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const trimmed = value.trim()
  if (!trimmed) return 0
  const isNegative = /^\(.*\)$/.test(trimmed)
  const cleaned = trimmed.replace(/[(),$]/g, '').replace(/[^0-9.\-]/g, '')
  const numeric = Number(cleaned)
  if (!Number.isFinite(numeric)) return 0
  return isNegative ? -numeric : numeric
}

function getRows(row: XeroRow | undefined): XeroRow[] {
  return row?.rows ?? row?.Rows ?? []
}
function getCells(row: XeroRow | undefined) {
  return row?.cells ?? row?.Cells ?? []
}
function getRowTitle(row: XeroRow): string {
  return row.title ?? row.Title ?? String(getCells(row)[0]?.value ?? getCells(row)[0]?.Value ?? '')
}

/**
 * Walks the P&L tree and returns the value of the first row whose label
 * matches `matcher`. Xero's report layout puts the label in cell 0 and
 * the totals in subsequent columns.
 */
function findValue(rows: XeroRow[], matcher: RegExp): number {
  for (const row of rows) {
    const title = getRowTitle(row)
    if (matcher.test(title)) {
      const cells = getCells(row).slice(1)  // drop label cell
      const last = cells[cells.length - 1]
      return parseNumeric(last?.value ?? last?.Value)
    }
    const found = findValue(getRows(row), matcher)
    if (found !== 0) return found
  }
  return 0
}

async function fetchPnL(opts: {
  accessToken: string
  tenantId: string
  fromDate: string
  toDate: string
}) {
  const { accessToken, tenantId, fromDate, toDate } = opts
  const report = await xeroFetch<any>({
    accessToken,
    tenantId,
    path: `Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&standardLayout=false`,
  })
  const tableRows: XeroRow[] = report?.reports?.[0]?.rows ?? report?.Reports?.[0]?.Rows ?? []
  const revenue  = findValue(tableRows, /total\s+revenue|total\s+income/i)
  const expenses = findValue(tableRows, /total\s+expense/i)
  // Xero's "gross profit" line — present when standardLayout=false on agencies
  // running with a Direct Costs section. Falls back to revenue when missing.
  const grossProfit = findValue(tableRows, /gross\s+profit/i) || revenue
  const netProfit = findValue(tableRows, /net\s+profit|profit\s+for\s+the\s+period|net\s+income|net\s+loss/i)
  const margin   = revenue !== 0 ? netProfit / revenue : 0
  const grossMargin = revenue !== 0 ? grossProfit / revenue : 0
  return { revenue, expenses, grossProfit, netProfit, margin, grossMargin }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })

  return cachedFetch(event, `xero-get-out:${tenantId}:profitability`, 900, async () => {
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const yearStart  = `${today.getFullYear()}-01-01`
    const todayStr   = today.toISOString().slice(0, 10)

    // Fetch both windows in parallel.
    const [mtd, ytd] = await Promise.all([
      fetchPnL({ accessToken: token.access_token!, tenantId, fromDate: monthStart, toDate: todayStr }),
      fetchPnL({ accessToken: token.access_token!, tenantId, fromDate: yearStart,  toDate: todayStr }),
    ])

    // Health bands on YTD margin — agency target is typically 15-20% net.
    const ytdMargin = ytd.margin
    let band: 'loss' | 'thin' | 'healthy' | 'strong' = 'healthy'
    if (ytdMargin < 0)        band = 'loss'
    else if (ytdMargin < 0.10) band = 'thin'
    else if (ytdMargin >= 0.20) band = 'strong'

    return {
      mtd: {
        revenue:    Math.round(mtd.revenue * 100) / 100,
        expenses:   Math.round(mtd.expenses * 100) / 100,
        grossProfit: Math.round(mtd.grossProfit * 100) / 100,
        netProfit:  Math.round(mtd.netProfit * 100) / 100,
        margin:     Math.round(mtd.margin * 1000) / 10,    // pct, one decimal
        grossMargin: Math.round(mtd.grossMargin * 1000) / 10,
        period: { from: monthStart, to: todayStr },
      },
      ytd: {
        revenue:    Math.round(ytd.revenue * 100) / 100,
        expenses:   Math.round(ytd.expenses * 100) / 100,
        grossProfit: Math.round(ytd.grossProfit * 100) / 100,
        netProfit:  Math.round(ytd.netProfit * 100) / 100,
        margin:     Math.round(ytd.margin * 1000) / 10,
        grossMargin: Math.round(ytd.grossMargin * 1000) / 10,
        period: { from: yearStart, to: todayStr },
      },
      band,
    }
  })
})
