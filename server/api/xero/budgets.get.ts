/**
 * GET /api/xero/budgets
 *
 * Lists Xero-managed budgets plus the latest BudgetSummary for the
 * active one. Replaces the computed "budget-variance" endpoint that
 * inferred budgets from expense patterns.
 *
 * Query:
 *   budgetID – pin to a specific budget; otherwise uses the first.
 *   periods  – number of months to return (default 6, cap 12)
 *
 * Xero docs:
 *   https://developer.xero.com/documentation/api/accounting/budgets
 *   https://developer.xero.com/documentation/api/accounting/reports#budget-summary
 */

import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

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

function flatten(rows: XeroRow[] | undefined, out: XeroRow[] = []): XeroRow[] {
  for (const row of rows ?? []) {
    out.push(row)
    flatten(row.rows ?? row.Rows, out)
  }
  return out
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const requestedBudgetId = typeof q.budgetID === 'string' ? q.budgetID : null
  const periods = Math.min(12, Math.max(1, Number(q.periods) || 6))

  const accessToken = token.access_token!
  const cacheKey = `xero:budgets:${tenantId}:${requestedBudgetId ?? 'auto'}:${periods}`

  return cachedFetch(event, cacheKey, 900, async () => {
    // 1. Discover budgets
    const listBody = await dedupedXeroCall(
      `budgets-list:${tenantId}`,
      'budgets-list',
      () => xeroFetch<any>({ accessToken, tenantId, path: 'Budgets' })
    )
    const budgets = (listBody?.budgets ?? []) as Array<{ budgetID: string; description?: string; type?: string; updatedDateUtc?: string }>

    if (!budgets.length) {
      return {
        budgets: [],
        selected: null,
        rows: [],
        periodLabels: [],
      }
    }

    const chosen = (requestedBudgetId && budgets.find(b => b.budgetID === requestedBudgetId))
      ?? budgets[0]!

    // 2. Load the BudgetSummary report for the chosen budget
    const summaryBody = await dedupedXeroCall(
      `budget-summary:${tenantId}:${chosen.budgetID}:${periods}`,
      'budget-summary',
      () => xeroFetch<any>({
        accessToken,
        tenantId,
        path: `Reports/BudgetSummary?periods=${periods}&timeframe=1`, // 1 = monthly
      })
    )

    const reportTable = summaryBody?.reports?.[0]
    const reportRows: XeroRow[] = reportTable?.rows ?? []
    const flat = flatten(reportRows)
    const headerRow = flat.find(r => (r.rowType ?? r.RowType ?? '').toLowerCase() === 'header')
    const periodLabels = headerRow
      ? (headerRow.cells ?? headerRow.Cells ?? []).slice(1).map(c => String(c.value ?? c.Value ?? ''))
      : []

    const rows = flat
      .filter(r => (r.rowType ?? r.RowType ?? '').toLowerCase() === 'row')
      .map(r => {
        const cells = r.cells ?? r.Cells ?? []
        const label = String(cells[0]?.value ?? cells[0]?.Value ?? '')
        const values = cells.slice(1).map(c => parseNumeric(c.value ?? c.Value))
        return { label, values }
      })
      .filter(r => r.label && r.values.some(v => v !== 0))

    return {
      budgets: budgets.map(b => ({ id: b.budgetID, description: b.description ?? '', type: b.type ?? '', updatedAt: b.updatedDateUtc ?? null })),
      selected: { id: chosen.budgetID, description: chosen.description ?? '' },
      periodLabels,
      rows,
    }
  })
})
