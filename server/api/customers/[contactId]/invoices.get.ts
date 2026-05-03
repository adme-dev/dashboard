/**
 * GET /api/customers/[contactId]/invoices
 *
 * Full invoice history for a single contact, sorted newest first.
 * Reads from xero_invoices_cache — no live Xero call.
 *
 * Query params:
 *   ?status=AUTHORISED|PAID|...   filter by single status
 *   ?type=ACCREC|ACCPAY            default ACCREC (sales)
 *   ?limit=N                       default 100, max 500
 */

import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface InvoiceRow {
  invoice_id: string
  invoice_number: string | null
  reference: string | null
  status: string
  date: string
  due_date: string | null
  fully_paid_on_date: string | null
  total_cents: string | number
  amount_due_cents: string | number
  amount_paid_cents: string | number
  amount_credited_cents: string | number
  currency_code: string | null
}

function dollars(cents: unknown): number {
  if (cents == null) return 0
  const n = typeof cents === 'number' ? cents : Number(cents)
  return Number.isFinite(n) ? n / 100 : 0
}

function daysPastDue(dueDate: string | null, paidDate: string | null): number | null {
  if (!dueDate) return null
  const due = new Date(dueDate).getTime()
  const ref = paidDate ? new Date(paidDate).getTime() : Date.now()
  if (!Number.isFinite(due) || !Number.isFinite(ref)) return null
  const days = Math.floor((ref - due) / (1000 * 60 * 60 * 24))
  return days
}

export default defineEventHandler(async (event) => {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const query = getQuery(event)
  const type = String(query.type ?? 'ACCREC').toUpperCase()
  const status = query.status ? String(query.status).toUpperCase() : null
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 100))

  const params: any[] = [tenantId, contactId, type]
  let statusClause = ''
  if (status) {
    statusClause = `AND status = $${params.length + 1}`
    params.push(status)
  }
  params.push(limit)

  const rows = await queryRows<InvoiceRow>(
    `SELECT invoice_id, invoice_number, reference, status, date, due_date,
            fully_paid_on_date, total_cents, amount_due_cents, amount_paid_cents,
            amount_credited_cents, currency_code
       FROM xero_invoices_cache
       WHERE tenant_id = $1 AND contact_id = $2 AND type = $3
         ${statusClause}
       ORDER BY date DESC
       LIMIT $${params.length}`,
    params,
  )

  const invoices = rows.map((r) => {
    const overdueDays = r.status === 'AUTHORISED' ? daysPastDue(r.due_date, null) : null
    const daysToPay = r.status === 'PAID' ? daysPastDue(r.date, r.fully_paid_on_date) : null
    return {
      id: r.invoice_id,
      invoiceNumber: r.invoice_number,
      reference: r.reference,
      status: r.status,
      date: r.date,
      dueDate: r.due_date,
      paidDate: r.fully_paid_on_date,
      total: dollars(r.total_cents),
      amountDue: dollars(r.amount_due_cents),
      amountPaid: dollars(r.amount_paid_cents),
      amountCredited: dollars(r.amount_credited_cents),
      currency: r.currency_code ?? 'AUD',
      overdueDays: overdueDays != null && overdueDays > 0 ? overdueDays : null,
      daysToPay: daysToPay != null ? daysToPay : null,
    }
  })

  // Quick summary so the UI doesn't have to re-walk the rows.
  const summary = {
    total: invoices.length,
    open: invoices.filter(i => i.status === 'AUTHORISED').length,
    paid: invoices.filter(i => i.status === 'PAID').length,
    voided: invoices.filter(i => i.status === 'VOIDED').length,
    overdue: invoices.filter(i => (i.overdueDays ?? 0) > 0).length,
    totalOutstanding: invoices.reduce((s, i) => s + (i.status === 'AUTHORISED' ? i.amountDue : 0), 0),
    totalOverdue: invoices.reduce((s, i) => s + ((i.overdueDays ?? 0) > 0 ? i.amountDue : 0), 0),
  }

  return { invoices, summary }
})
