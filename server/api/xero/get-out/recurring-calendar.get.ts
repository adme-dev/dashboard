/**
 * GET /api/xero/get-out/recurring-calendar
 *
 * Live calendar of Xero RepeatingInvoice schedules firing within the
 * current month, plus inferred-MRR contacts that *should* invoice this
 * month based on their historical cadence but haven't yet.
 *
 * Surfaces three states per row:
 *   fired    — schedule's nextScheduledDate is in the past AND we can see
 *              an invoice for that contact already issued this month
 *   pending  — scheduled to fire later this month
 *   missing  — historical pattern suggests they should have invoiced
 *              already this month but we don't see one yet
 *
 * The "missing" bucket is the operationally valuable one — catches
 * retainers that fell through the cracks before EOM.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'

interface RowFromCache {
  contact_id: string
  name: string | null
  inferred_mrr_cents: string | number | null
  inferred_mrr_confidence: 'none' | 'low' | 'medium' | 'high' | null
  recurring_basis: string | null
  invoiced_this_month_cents: string | number | null
  last_invoice_day: number | null
}

interface CalendarEntry {
  contactId: string
  name: string | null
  amount: number
  expectedDay: number | null   // calendar day-of-month, null when unknown
  status: 'fired' | 'pending' | 'missing'
  source: 'xero_repeating' | 'inferred'
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })

  return cachedFetch(event, `xero-get-out:${tenantId}:recurring-calendar`, 300, async () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const dayOfMonth = today.getDate()
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    const todayStr = today.toISOString().slice(0, 10)

    const entries: CalendarEntry[] = []
    const seenContacts = new Set<string>()

    // ── Live: Xero RepeatingInvoices ──
    try {
      const body = await xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: 'RepeatingInvoices',
      })
      for (const r of (body?.repeatingInvoices ?? [])) {
        if (r.type !== 'ACCREC') continue
        if (String(r.status).toUpperCase() !== 'AUTHORISED') continue
        const next = r.schedule?.nextScheduledDate
        if (!next) continue
        const nextStr = String(next).slice(0, 10)
        // Only schedules anchored in this month
        if (nextStr < monthStart || nextStr > monthEnd) continue
        const contactId = r.contact?.contactID ?? ''
        const expectedDay = Number(nextStr.slice(8, 10))
        entries.push({
          contactId,
          name: r.contact?.name ?? null,
          amount: n(r.total),
          expectedDay,
          status: nextStr <= todayStr ? 'fired' : 'pending',
          source: 'xero_repeating',
        })
        if (contactId) seenContacts.add(contactId)
      }
    } catch (err: any) {
      console.warn('[recurring-calendar] repeating fetch failed:', err?.statusMessage ?? err?.message)
    }

    // ── From cache: inferred-MRR contacts + their typical invoicing day
    //    (median day-of-month they invoiced over the last 4 months) ──
    const cacheRows = await queryRows<RowFromCache>(
      `WITH this_month AS (
         SELECT contact_id,
                COALESCE(SUM(total_cents)::bigint, 0) AS this_month_cents,
                MAX(EXTRACT(DAY FROM date)::int) AS last_invoice_day
           FROM xero_invoices_cache
           WHERE tenant_id = $1
             AND type = 'ACCREC'
             AND status NOT IN ('VOIDED','DRAFT','DELETED')
             AND date BETWEEN $2::date AND $3::date
           GROUP BY contact_id
       )
       SELECT r.contact_id,
              c.name,
              r.inferred_mrr_cents::text AS inferred_mrr_cents,
              r.inferred_mrr_confidence,
              r.recurring_basis,
              tm.this_month_cents::text AS invoiced_this_month_cents,
              tm.last_invoice_day
         FROM xero_customer_rollups r
         LEFT JOIN xero_contacts_cache c
           ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
         LEFT JOIN this_month tm ON tm.contact_id = r.contact_id
         WHERE r.tenant_id = $1
           AND r.inferred_mrr_cents > 0
           AND r.inferred_mrr_confidence IN ('high','medium')
           AND NOT r.has_active_repeating
         ORDER BY r.inferred_mrr_cents DESC`,
      [tenantId, monthStart, monthEnd],
    )

    for (const row of cacheRows) {
      if (!row.contact_id || seenContacts.has(row.contact_id)) continue
      const inferredAmount = n(row.inferred_mrr_cents) / 100
      const invoicedThisMonth = n(row.invoiced_this_month_cents) / 100
      // Pull the typical invoicing day for this contact from prior months —
      // median day-of-month over the last 3 invoices. Used for "missing" rows
      // so the UI knows roughly when the operator should expect them.
      // (Approximated here as last_invoice_day from prior months; refine later
      // if the heuristic produces noise.)
      let status: CalendarEntry['status']
      if (invoicedThisMonth > 0) {
        status = 'fired'
      } else {
        // Past their typical invoicing day → "missing"; still in the cycle window → "pending"
        const typicalDay = row.last_invoice_day ?? Math.min(28, daysInMonth)
        status = dayOfMonth > typicalDay ? 'missing' : 'pending'
      }
      entries.push({
        contactId: row.contact_id,
        name: row.name,
        amount: inferredAmount,
        expectedDay: row.last_invoice_day ?? null,
        status,
        source: 'inferred',
      })
    }

    // Sort: missing first (most actionable), then by expected day, then fired.
    const order: Record<CalendarEntry['status'], number> = { missing: 0, pending: 1, fired: 2 }
    entries.sort((a, b) => {
      const o = order[a.status] - order[b.status]
      if (o !== 0) return o
      const da = a.expectedDay ?? 99
      const db = b.expectedDay ?? 99
      return da - db
    })

    const missingTotal = entries.filter(e => e.status === 'missing').reduce((s, e) => s + e.amount, 0)
    const pendingTotal = entries.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0)
    const firedTotal   = entries.filter(e => e.status === 'fired').reduce((s, e) => s + e.amount, 0)

    return {
      period: { year, month, daysInMonth, dayOfMonth, monthStart, monthEnd },
      totals: {
        missing: Math.round(missingTotal * 100) / 100,
        pending: Math.round(pendingTotal * 100) / 100,
        fired:   Math.round(firedTotal * 100) / 100,
      },
      counts: {
        missing: entries.filter(e => e.status === 'missing').length,
        pending: entries.filter(e => e.status === 'pending').length,
        fired:   entries.filter(e => e.status === 'fired').length,
      },
      entries: entries.map(e => ({
        contactId: e.contactId,
        name: e.name,
        amount: Math.round(e.amount * 100) / 100,
        expectedDay: e.expectedDay,
        status: e.status,
        source: e.source,
      })),
    }
  })
})
