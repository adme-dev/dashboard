/**
 * GET /api/xero/get-out/forecast
 *
 * Layered projection of where the agency will land this month:
 *   • invoiced — already in the books (xero_invoices_cache)
 *   • arCollectible — AUTHORISED ACCREC due this month or overdue (cache)
 *   • recurring — repeating-invoice schedules firing later this month (live)
 *   • quotesProbable — open quotes weighted by status (live)
 * Plus leakage:
 *   • creditNotesIssued — money refunded/credited this month (live)
 *   • voidedInvoices — invoiced then voided this month (cache)
 *
 * Cached 5 minutes per tenant since the live calls (quotes, repeating,
 * credit notes) are otherwise paid on every page load.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

// Probability weights used to size the "Probable" forecast layer.
// Tuned conservatively — prefer under-promising over over-promising.
const QUOTE_PROBABILITY: Record<string, number> = {
  DRAFT: 0.20,
  SENT: 0.40,
  ACCEPTED: 0.80,
}

// Worst- and best-case scenarios apply different haircuts on each layer:
//   worst  → "what if everything slips?"
//   best   → "what if it all closes?"
const WORST_QUOTE_PROBABILITY: Record<string, number> = {
  DRAFT: 0.05, SENT: 0.20, ACCEPTED: 0.60,
}
const BEST_QUOTE_PROBABILITY: Record<string, number> = {
  DRAFT: 0.40, SENT: 0.70, ACCEPTED: 0.95,
}
// AR haircut for worst case: clients usually pay around DSO, so within-month
// collectibility is rough. Best case = full AR collectible.
const WORST_AR_HAIRCUT = 0.6
const WORST_RECURRING_HAIRCUT = 0.85  // some schedules slip / client cancels mid-cycle

interface InvoicedTotals {
  invoiced_cents: string | number
  voided_cents: string | number
  ar_collectible_cents: string | number
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}
function dollars(c: unknown) { return n(c) / 100 }

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantIdRaw = await getSelectedTenant(event)
  if (!tenantIdRaw) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }
  const tenantId = tenantIdRaw
  const accessToken = token.access_token!

  return cachedFetch(event, `xero-get-out:${tenantId}:forecast`, 300, async () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // ── From cache: invoiced this month + voided this month + AR
    //    likely to land this month ──
    // AR likely = AUTHORISED ACCREC where due_date is in the past or
    // anywhere in this month. Anything due next month doesn't count
    // toward this month's cash forecast.
    const totals = await queryOne<InvoicedTotals>(
      `SELECT
         COALESCE(SUM(CASE
           WHEN status NOT IN ('VOIDED','DRAFT','DELETED')
                AND date BETWEEN $2::date AND $3::date
           THEN total_cents ELSE 0 END), 0)::text AS invoiced_cents,
         COALESCE(SUM(CASE
           WHEN status = 'VOIDED'
                AND date BETWEEN $2::date AND $3::date
           THEN total_cents ELSE 0 END), 0)::text AS voided_cents,
         COALESCE(SUM(CASE
           WHEN status = 'AUTHORISED'
                AND amount_due_cents > 0
                AND (due_date IS NULL OR due_date <= $3::date)
           THEN amount_due_cents ELSE 0 END), 0)::text AS ar_collectible_cents
       FROM xero_invoices_cache
       WHERE tenant_id = $1 AND type = 'ACCREC'`,
      [tenantId, monthStart, monthEnd],
    )

    const invoiced = dollars(totals?.invoiced_cents)
    const voided = dollars(totals?.voided_cents)
    const arCollectible = dollars(totals?.ar_collectible_cents)

    // ── Live: open quotes (filtered to anything still in play) ──
    let quotesByStatus: Record<string, { count: number; total: number }> = {
      DRAFT: { count: 0, total: 0 },
      SENT: { count: 0, total: 0 },
      ACCEPTED: { count: 0, total: 0 },
    }
    let quotesProbable = 0
    let quotesWorst = 0
    let quotesBest = 0
    try {
      const quotesBody = await xeroFetch<any>({
        accessToken,
        tenantId,
        path: 'Quotes?order=Date DESC',
      })
      for (const q of (quotesBody?.quotes ?? [])) {
        const status = String(q.status ?? '').toUpperCase()
        if (!QUOTE_PROBABILITY[status]) continue
        const total = n(q.total)
        quotesByStatus[status]!.count++
        quotesByStatus[status]!.total += total
        quotesProbable += total * QUOTE_PROBABILITY[status]
        quotesWorst    += total * (WORST_QUOTE_PROBABILITY[status] ?? 0)
        quotesBest     += total * (BEST_QUOTE_PROBABILITY[status] ?? 0)
      }
    } catch (err: any) {
      console.warn('[get-out/forecast] quotes fetch failed:', err?.statusMessage ?? err?.message)
    }

    // ── Live: repeating invoices firing later this month ──
    let recurringRemaining = 0
    let recurringSchedulesRemaining = 0
    try {
      const repBody = await xeroFetch<any>({
        accessToken,
        tenantId,
        path: 'RepeatingInvoices',
      })
      for (const r of (repBody?.repeatingInvoices ?? [])) {
        if (r.type !== 'ACCREC') continue
        if (String(r.status).toUpperCase() !== 'AUTHORISED') continue
        const next = r.schedule?.nextScheduledDate
        if (!next) continue
        const nextStr = String(next).slice(0, 10)
        // Only count schedules that will fire between today and end-of-month.
        // Past-of-month means it already fired and is in the cache as a real invoice.
        const todayStr = today.toISOString().slice(0, 10)
        if (nextStr < todayStr || nextStr > monthEnd) continue
        recurringRemaining += n(r.total)
        recurringSchedulesRemaining++
      }
    } catch (err: any) {
      console.warn('[get-out/forecast] repeating invoices fetch failed:', err?.statusMessage ?? err?.message)
    }

    // ── Live: credit notes issued this month (leakage) ──
    let creditNotesIssued = 0
    let creditNotesCount = 0
    try {
      const creditBody = await xeroFetch<any>({
        accessToken,
        tenantId,
        path: `CreditNotes?where=Type=="ACCRECCREDIT"`,
      })
      for (const c of (creditBody?.creditNotes ?? [])) {
        const dateStr = c.date ? String(c.date).slice(0, 10) : null
        if (!dateStr || dateStr < monthStart || dateStr > monthEnd) continue
        creditNotesIssued += n(c.total)
        creditNotesCount++
      }
    } catch (err: any) {
      console.warn('[get-out/forecast] credit notes fetch failed:', err?.statusMessage ?? err?.message)
    }

    // ── Compose forecast layers ──
    const config = await loadGetOutConfig(tenantId)
    const target = summariseConfig(config).totalCents / 100

    // Net leakage reduces what's already in the books — if you've credited
    // $10k this month, that money won't actually arrive even though it
    // shows up in invoiced totals.
    const leakage = creditNotesIssued + voided
    const committed = Math.max(0, invoiced + arCollectible - leakage)
    const committedPlusRecurring = committed + recurringRemaining
    const totalProjected = committedPlusRecurring + quotesProbable
    const gap = Math.max(0, target - totalProjected)
    const surplus = Math.max(0, totalProjected - target)

    // Worst / best case envelopes — same pieces, different haircuts.
    // Worst: AR collectibility ↓, recurring slips ↓, quotes weighted lower.
    // Best:  full AR, full recurring, quotes weighted upper.
    const arWorst         = arCollectible * WORST_AR_HAIRCUT
    const recurringWorst  = recurringRemaining * WORST_RECURRING_HAIRCUT
    const worstTotal      = Math.max(0, invoiced + arWorst - leakage) + recurringWorst + quotesWorst
    const bestTotal       = Math.max(0, invoiced + arCollectible - leakage) + recurringRemaining + quotesBest

    return {
      target: Math.round(target * 100) / 100,
      layers: {
        invoiced: Math.round(invoiced * 100) / 100,
        arCollectible: Math.round(arCollectible * 100) / 100,
        recurring: Math.round(recurringRemaining * 100) / 100,
        quotesProbable: Math.round(quotesProbable * 100) / 100,
      },
      leakage: {
        total: Math.round(leakage * 100) / 100,
        creditNotes: Math.round(creditNotesIssued * 100) / 100,
        creditNotesCount,
        voidedInvoices: Math.round(voided * 100) / 100,
      },
      committed: Math.round(committed * 100) / 100,
      committedPlusRecurring: Math.round(committedPlusRecurring * 100) / 100,
      totalProjected: Math.round(totalProjected * 100) / 100,
      gap: Math.round(gap * 100) / 100,
      surplus: Math.round(surplus * 100) / 100,
      onTrack: totalProjected >= target,
      scenarios: {
        worst:     Math.round(worstTotal * 100) / 100,
        realistic: Math.round(totalProjected * 100) / 100,
        best:      Math.round(bestTotal * 100) / 100,
        worstGap:  Math.round(Math.max(0, target - worstTotal) * 100) / 100,
        bestGap:   Math.round(Math.max(0, target - bestTotal) * 100) / 100,
      },
      quotes: {
        byStatus: {
          draft: { count: quotesByStatus.DRAFT!.count, total: Math.round(quotesByStatus.DRAFT!.total * 100) / 100 },
          sent: { count: quotesByStatus.SENT!.count, total: Math.round(quotesByStatus.SENT!.total * 100) / 100 },
          accepted: { count: quotesByStatus.ACCEPTED!.count, total: Math.round(quotesByStatus.ACCEPTED!.total * 100) / 100 },
        },
      },
      recurringSchedulesRemaining,
      computedAt: new Date().toISOString(),
    }
  })
})
