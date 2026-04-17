/**
 * GET /api/xero/client-concentration
 *
 * For the YTD window, groups paid ACCREC invoices by contact and
 * returns each client's % of total revenue, plus a Herfindahl-ish
 * "concentration index" so the dashboard can flag revenue
 * concentration risk.
 *
 * Uses the Invoices endpoint (fast; summaryOnly keeps payload small).
 *
 * Xero docs:
 *   https://developer.xero.com/documentation/api/accounting/invoices
 */

import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

function ensureDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function dtExpr(d: Date) {
  return `DateTime(${d.getUTCFullYear()},${String(d.getUTCMonth() + 1).padStart(2, '0')},${String(d.getUTCDate()).padStart(2, '0')})`
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), 0, 1)
  const from = typeof q.from === 'string' ? new Date(q.from) : defaultFrom
  const to = typeof q.to === 'string' ? new Date(q.to) : today
  const fromStr = ensureDate(from)
  const toStr = ensureDate(to)

  const cacheKey = `xero:client-concentration:${tenantId}:${fromStr}:${toStr}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const accessToken = token.access_token!
    const results: any[] = []
    let page = 1

    // Fetch in ~3 pages worst-case; cap at 5 to avoid eating rate-limit budget.
    // Use standard (not summaryOnly) format since summaryOnly omits total/amounts
    // we need for aggregation. pageSize=100 is Xero's default; max allowed is 1000.
    while (page <= 5) {
      const params = new URLSearchParams({
        where: `Type=="ACCREC"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(to)}`,
        order: 'Date DESC',
        page: String(page),
        pageSize: '100',
      })
      try {
        const body = await dedupedXeroCall(
          `client-concentration:${tenantId}:p${page}:${fromStr}:${toStr}`,
          'client-concentration',
          () => xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
        )
        const list = body?.invoices ?? []
        if (!list.length) break
        results.push(...list)
        if (list.length < 100) break
        page += 1
      } catch (err: any) {
        // Soft-fail: return partial data rather than 500ing the whole panel.
        console.warn('[client-concentration] page fetch failed:', err?.statusMessage ?? err?.message)
        break
      }
    }

    const byContact = new Map<string, { id: string; name: string; total: number; paid: number; outstanding: number; invoiceCount: number }>()
    let grandTotal = 0

    for (const inv of results) {
      const id = inv.contact?.contactID ?? ''
      const name = inv.contact?.name ?? 'Unknown'
      const total = Number(inv.total) || 0
      const paid = Number(inv.amountPaid) || 0
      const due = Number(inv.amountDue) || 0
      grandTotal += total
      const entry = byContact.get(id || name) ?? { id, name, total: 0, paid: 0, outstanding: 0, invoiceCount: 0 }
      entry.total += total
      entry.paid += paid
      entry.outstanding += due
      entry.invoiceCount += 1
      byContact.set(id || name, entry)
    }

    const clients = Array.from(byContact.values())
      .map(c => ({
        id: c.id,
        name: c.name,
        total: Math.round(c.total * 100) / 100,
        paid: Math.round(c.paid * 100) / 100,
        outstanding: Math.round(c.outstanding * 100) / 100,
        invoiceCount: c.invoiceCount,
        sharePct: grandTotal > 0 ? Math.round((c.total / grandTotal) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    // Herfindahl-Hirschman Index over revenue shares (0-10000).
    // 0 = perfectly diversified; 10000 = one client.
    const hhi = clients.reduce((s, c) => s + c.sharePct * c.sharePct, 0)
    let risk: 'low' | 'medium' | 'high' = 'low'
    if (hhi >= 2500) risk = 'high'
    else if (hhi >= 1500) risk = 'medium'

    const top1Share = clients[0]?.sharePct ?? 0
    const top3Share = clients.slice(0, 3).reduce((s, c) => s + c.sharePct, 0)
    const top10Share = clients.slice(0, 10).reduce((s, c) => s + c.sharePct, 0)

    return {
      range: { from: fromStr, to: toStr },
      summary: {
        clientCount: clients.length,
        grandTotal: Math.round(grandTotal * 100) / 100,
        top1Share: Math.round(top1Share * 100) / 100,
        top3Share: Math.round(top3Share * 100) / 100,
        top10Share: Math.round(top10Share * 100) / 100,
        hhi: Math.round(hhi),
        risk,
      },
      clients: clients.slice(0, 20),
    }
  })
})
