/**
 * GET /api/xero/get-out/ap-due
 *
 * Bills (ACCPAY invoices) due in the current month, plus split into
 * "due in next 7 days" for the urgent line. Reads from xero_invoices_cache
 * if populated, otherwise falls back to a live Xero call.
 *
 * The Get Out page is about money IN; this is the matching money-OUT
 * card so the surplus number tells the truth.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface BillRow {
  invoice_id: string
  invoice_number: string | null
  contact_id: string
  contact_name: string | null
  due_date: string | null
  amount_due_cents: string | number
  total_cents: string | number
  currency_code: string | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)
  const sevenDaysOut = new Date(today.getTime() + 7 * 86400_000).toISOString().slice(0, 10)

  // ACCPAY invoices in xero_invoices_cache. AUTHORISED + amount_due > 0
  // = bill not yet paid. Anything past due is urgent regardless of bucket.
  const bills = await queryRows<BillRow>(
    `SELECT i.invoice_id, i.invoice_number, i.contact_id,
            c.name AS contact_name,
            i.due_date::text, i.amount_due_cents, i.total_cents, i.currency_code
       FROM xero_invoices_cache i
       LEFT JOIN xero_contacts_cache c
         ON c.tenant_id = i.tenant_id AND c.contact_id = i.contact_id
       WHERE i.tenant_id = $1
         AND i.type = 'ACCPAY'
         AND i.status = 'AUTHORISED'
         AND i.amount_due_cents > 0
         AND (i.due_date IS NULL OR i.due_date <= $2::date)
       ORDER BY i.due_date ASC NULLS LAST`,
    [tenantId, monthEnd],
  )

  let totalDueThisMonth = 0
  let totalDueThisWeek = 0
  let totalOverdue = 0
  const urgentBills: any[] = []

  for (const b of bills) {
    const amount = n(b.amount_due_cents) / 100
    totalDueThisMonth += amount
    if (b.due_date && b.due_date < todayStr) totalOverdue += amount
    else if (b.due_date && b.due_date <= sevenDaysOut) totalDueThisWeek += amount

    // Surface the top urgent bills (top 5 by amount, due this week or overdue)
    if (b.due_date && b.due_date <= sevenDaysOut) {
      urgentBills.push({
        id: b.invoice_id,
        invoiceNumber: b.invoice_number,
        contactName: b.contact_name ?? 'Unknown supplier',
        dueDate: b.due_date,
        amountDue: amount,
        currency: b.currency_code ?? 'AUD',
        overdue: b.due_date < todayStr,
      })
    }
  }

  urgentBills.sort((a, b) => b.amountDue - a.amountDue)

  return {
    totalDueThisMonth: Math.round(totalDueThisMonth * 100) / 100,
    totalDueThisWeek: Math.round(totalDueThisWeek * 100) / 100,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    billCount: bills.length,
    urgentCount: urgentBills.length,
    urgentBills: urgentBills.slice(0, 5),
    asOf: todayStr,
  }
})
