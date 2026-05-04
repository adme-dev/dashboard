/**
 * GET /api/xero/get-out/ar-collection-forecast
 *
 * Turns the AR aging snapshot into a forward cash signal: for each
 * outstanding invoice, predict its expected payment date using the
 * contact's historical DSO. Bucket totals into:
 *   thisMonth  — likely to land before EOM
 *   nextMonth  — slipping into the following calendar month
 *   later      — beyond next month
 *
 * Per-invoice expected payment date =
 *   max(due_date, issue_date + contact_dso_days)
 *
 * If a contact has no DSO history yet we fall back to due_date + 7
 * (this agency's standard Net-7 + a few days slip).
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface InvoiceRow {
  invoice_id: string
  contact_id: string
  contact_name: string | null
  invoice_number: string | null
  date: string
  due_date: string | null
  amount_due_cents: string | number
  contact_dso_days: string | number | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const FALLBACK_DSO_DAYS = 7

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  const nextMonthStart = new Date(year, month, 1)
  const nextMonthEnd = new Date(year, month + 1, 0)
  const nextMonthEndStr = nextMonthEnd.toISOString().slice(0, 10)

  // Authorised AR with balance, joined with the contact's average DSO
  // over their last-10 PAID invoices (already computed in rollups).
  const rows = await queryRows<InvoiceRow>(
    `SELECT i.invoice_id,
            i.contact_id,
            c.name AS contact_name,
            i.invoice_number,
            i.date::text          AS date,
            i.due_date::text      AS due_date,
            i.amount_due_cents::text AS amount_due_cents,
            r.dso_days::text      AS contact_dso_days
       FROM xero_invoices_cache i
       LEFT JOIN xero_contacts_cache c
         ON c.tenant_id = i.tenant_id AND c.contact_id = i.contact_id
       LEFT JOIN xero_customer_rollups r
         ON r.tenant_id = i.tenant_id AND r.contact_id = i.contact_id
       WHERE i.tenant_id = $1
         AND i.type = 'ACCREC'
         AND i.status = 'AUTHORISED'
         AND i.amount_due_cents > 0
       ORDER BY i.due_date ASC NULLS LAST`,
    [tenantId],
  )

  let thisMonthCents = 0
  let nextMonthCents = 0
  let laterCents = 0
  const thisMonthInvoices: any[] = []

  for (const r of rows) {
    const amount = n(r.amount_due_cents) / 100
    const dso = r.contact_dso_days != null ? Math.round(Number(r.contact_dso_days)) : FALLBACK_DSO_DAYS
    // Expected payment date = the later of due_date and (issue + DSO).
    const issueExpectation = addDays(r.date, dso)
    const dueExpectation = r.due_date ?? r.date
    const expected = issueExpectation > dueExpectation ? issueExpectation : dueExpectation

    if (expected <= monthEnd) {
      thisMonthCents += amount
      thisMonthInvoices.push({
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        contactName: r.contact_name,
        amount: Math.round(amount * 100) / 100,
        dueDate: r.due_date,
        expectedDate: expected,
        dsoDays: dso,
      })
    } else if (expected <= nextMonthEndStr) {
      nextMonthCents += amount
    } else {
      laterCents += amount
    }
  }

  thisMonthInvoices.sort((a, b) => (a.expectedDate < b.expectedDate ? -1 : 1))

  return {
    period: { monthEnd, nextMonthEnd: nextMonthEndStr },
    totals: {
      thisMonth: Math.round(thisMonthCents * 100) / 100,
      nextMonth: Math.round(nextMonthCents * 100) / 100,
      later:     Math.round(laterCents * 100) / 100,
      total:     Math.round((thisMonthCents + nextMonthCents + laterCents) * 100) / 100,
    },
    counts: {
      thisMonth: thisMonthInvoices.length,
      nextMonth: rows.length - thisMonthInvoices.length, // approximate, not split next/later
      total: rows.length,
    },
    thisMonthInvoices: thisMonthInvoices.slice(0, 12), // top 12 by expected date
    methodology: 'expectedDate = max(due_date, issue_date + contact_DSO). DSO falls back to 7 days when no history.',
  }
})
