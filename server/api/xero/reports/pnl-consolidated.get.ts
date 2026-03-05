import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

function ensureDateString(d: Date) { return d.toISOString().slice(0, 10) }
function getDefaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 30)
  return { from: ensureDateString(from), to: ensureDateString(to) }
}

async function fetchTenants(client: Awaited<ReturnType<typeof createXeroClient>>) {
  return await client.updateTenants(false)
}

// Match the broader patterns from pnl-detailed.get.ts to support all Xero report formats
const REVENUE_RE = /total\s+(revenue|income|trading\s+income|sales|turnover)/i
const EXPENSES_RE = /total\s+(operating\s+expenses?|expenses?|overheads?|administration\s+expenses?)/i
const NET_PROFIT_RE = /net\s+profit|net\s+income|net\s+loss|profit\s+for\s+the\s+(period|year)|profit\s+\(loss\)|operating\s+profit/i

function parseNumeric(valueStr: any): number {
  if (typeof valueStr === 'number') return Number.isFinite(valueStr) ? valueStr : 0
  if (typeof valueStr === 'string') {
    const trimmed = valueStr.trim()
    if (!trimmed) return 0
    const isNeg = /^\(.*\)$/.test(trimmed)
    const normalized = trimmed.replace(/[(),]/g, '').replace(/[^0-9.-]/g, '')
    const num = Number(normalized)
    if (Number.isNaN(num)) return 0
    return isNeg ? -num : num
  }
  return 0
}

async function fetchPnLForTenant(client: Awaited<ReturnType<typeof createXeroClient>>, tenantId: string, from: string, to: string) {
  const { body: report } = await dedupedXeroCall(
    `pnlConsolidated:${tenantId}:${from}:${to}`,
    'pnl-consolidated',
    () => client.accountingApi.getReportProfitAndLoss(
      tenantId, from, to,
      undefined, undefined, undefined,
      undefined, undefined, undefined, false
    )
  )

  function flattenRows(rows: any[] | undefined, out: any[] = []): any[] {
    if (!rows) return out
    for (const row of rows) {
      out.push(row)
      const child = row?.Rows || row?.rows
      if (child) flattenRows(child, out)
    }
    return out
  }

  const reportRows = (report as any)?.reports || (report as any)?.Reports
  const rows = flattenRows(reportRows?.[0]?.rows || reportRows?.[0]?.Rows)
  let revenueTotal = 0
  let expensesTotal = 0
  let netProfit = 0

  for (const row of rows) {
    const cells = row?.Cells || row?.cells || []
    const title = cells?.[0]?.Value || cells?.[0]?.value || row?.Title || row?.title || ''
    const lastCell = cells?.[cells.length - 1]
    const numeric = parseNumeric(lastCell?.Value ?? lastCell?.value)

    if (REVENUE_RE.test(title)) revenueTotal = numeric
    if (EXPENSES_RE.test(title)) expensesTotal = numeric
    if (NET_PROFIT_RE.test(title)) netProfit = numeric
  }

  // Normalize expenses to positive (Xero may report as negative debits)
  expensesTotal = Math.abs(expensesTotal)

  const profitMargin = revenueTotal !== 0 ? (netProfit / revenueTotal) : 0
  return { revenueTotal, expensesTotal, netProfit, profitMargin }
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const client = await createXeroClient({ tokenSet: token, event })

  const query = getQuery(event)
  const fromDate = String(query.fromDate || '')
  const toDate = String(query.toDate || '')
  const { from, to } = (!fromDate || !toDate) ? getDefaultRange() : { from: fromDate, to: toDate }

  const tenants = await fetchTenants(client)
  const tenantIds = tenants.filter(t => t.tenantId && t.tenantName).map(t => t.tenantId)
  const cacheKey = `xero-report:consolidated:${tenantIds.sort().join(',')}:${from}:${to}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const results = [] as Array<{ tenantId: string, tenantName: string, revenueTotal: number, expensesTotal: number, netProfit: number, profitMargin: number }>
    const warnings = [] as string[]

    // Fetch all tenants in parallel (rate limiter handles concurrency)
    const settled = await Promise.allSettled(
      tenants
        .filter(t => t.tenantId && t.tenantName)
        .map(async (t) => {
          const pnl = await fetchPnLForTenant(client, t.tenantId!, from, to)
          return { tenantId: t.tenantId!, tenantName: t.tenantName!, ...pnl }
        })
    )

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        const msg = result.reason?.message || 'Unknown error'
        console.warn('[pnl-consolidated] Tenant fetch failed:', msg)
        warnings.push(`One entity could not be loaded: ${msg}`)
      }
    }

    const totals = results.reduce((acc, r) => {
      acc.revenueTotal += r.revenueTotal
      acc.expensesTotal += r.expensesTotal
      acc.netProfit += r.netProfit
      return acc
    }, { revenueTotal: 0, expensesTotal: 0, netProfit: 0 })

    const profitMargin = totals.revenueTotal !== 0 ? (totals.netProfit / totals.revenueTotal) : 0

    return { fromDate: from, toDate: to, tenants: results, totals: { ...totals, profitMargin }, warnings }
  })
})
