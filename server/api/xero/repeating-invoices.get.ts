/**
 * GET /api/xero/repeating-invoices
 *
 * Surfaces active repeating ACCREC invoices so the agency can see
 * contracted recurring revenue (retainers, subscriptions). Returns
 * per-schedule MRR and a blended MRR across the book.
 *
 * Xero docs: https://developer.xero.com/documentation/api/accounting/repeatinginvoices
 */

import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

type Schedule = {
  period?: number
  unit?: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | string
  dueDate?: number
  dueDateType?: string
  startDate?: string
  endDate?: string
  nextScheduledDate?: string
}

type RepeatingInvoice = {
  repeatingInvoiceID?: string
  type?: string
  reference?: string
  status?: string
  total?: number
  subTotal?: number
  totalTax?: number
  currencyCode?: string
  contact?: { name?: string; contactID?: string }
  schedule?: Schedule
  lineItems?: Array<{ lineAmount?: number; description?: string }>
}

/**
 * Normalise any schedule to a monthly amount so we can compute blended MRR.
 *  - WEEKLY → amount × 52 / 12
 *  - MONTHLY → amount
 *  - YEARLY → amount / 12
 * `period` is the repeat count (e.g. every 2 weeks = WEEKLY × 2).
 */
function toMonthly(total: number, schedule: Schedule | undefined): number {
  if (!schedule || !total) return 0
  const period = schedule.period && schedule.period > 0 ? schedule.period : 1
  switch ((schedule.unit ?? '').toUpperCase()) {
    case 'WEEKLY': return (total * (52 / 12)) / period
    case 'MONTHLY': return total / period
    case 'YEARLY': return total / (12 * period)
    default: return 0
  }
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero:repeating-invoices:${tenantId}`

  return cachedFetch(event, cacheKey, 900, async () => {
    const body = await dedupedXeroCall(
      `repeatingInvoices:${tenantId}`,
      'repeating-invoices',
      () => xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: 'RepeatingInvoices',
      })
    )

    const all: RepeatingInvoice[] = body?.repeatingInvoices ?? []

    // Xero RepeatingInvoice.Status = DRAFT | AUTHORISED | DELETED.
    //  - AUTHORISED → schedule auto-issues invoices
    //  - DRAFT      → schedule still creates invoices each cycle, but as
    //                  drafts requiring manual approval. Still contracted
    //                  revenue. Include both.
    //  - DELETED    → retired template. Exclude.
    const isActive = (ri: RepeatingInvoice) => ri.status === 'AUTHORISED' || ri.status === 'DRAFT'

    function buildSchedule(ri: RepeatingInvoice) {
      const monthly = toMonthly(Number(ri.total) || 0, ri.schedule)
      return {
        id: ri.repeatingInvoiceID ?? '',
        reference: ri.reference ?? '',
        contact: ri.contact?.name ?? 'Unknown',
        contactId: ri.contact?.contactID ?? '',
        currency: ri.currencyCode ?? 'AUD',
        status: ri.status ?? '',
        total: Number(ri.total) || 0,
        subTotal: Number(ri.subTotal) || 0,
        tax: Number(ri.totalTax) || 0,
        unit: ri.schedule?.unit ?? 'UNKNOWN',
        period: ri.schedule?.period ?? 1,
        nextScheduledDate: ri.schedule?.nextScheduledDate ?? null,
        endDate: ri.schedule?.endDate ?? null,
        monthlyEquivalent: Math.round(monthly * 100) / 100,
        description: ri.lineItems?.[0]?.description ?? '',
      }
    }

    // Recurring revenue (what clients owe us regularly)
    const incomeSchedules = all.filter(ri => ri.type === 'ACCREC' && isActive(ri)).map(buildSchedule)
    const mrr = incomeSchedules.reduce((sum, s) => sum + s.monthlyEquivalent, 0)

    // Recurring costs (what we pay out regularly — Adobe, Google Cloud, etc.)
    const costSchedules = all.filter(ri => ri.type === 'ACCPAY' && ri.status === 'AUTHORISED').map(buildSchedule)
    const recurringMonthlyCosts = costSchedules.reduce((sum, s) => sum + s.monthlyEquivalent, 0)

    const byContact = new Map<string, { contact: string; contactId: string; monthly: number; schedules: number }>()
    for (const s of incomeSchedules) {
      const key = s.contactId || s.contact
      const current = byContact.get(key) ?? { contact: s.contact, contactId: s.contactId, monthly: 0, schedules: 0 }
      current.monthly += s.monthlyEquivalent
      current.schedules += 1
      byContact.set(key, current)
    }
    const topClients = Array.from(byContact.values())
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 10)
      .map(c => ({ ...c, monthly: Math.round(c.monthly * 100) / 100 }))

    // Top recurring vendors on the cost side.
    const byVendor = new Map<string, { vendor: string; monthly: number; schedules: number }>()
    for (const s of costSchedules) {
      const current = byVendor.get(s.contact) ?? { vendor: s.contact, monthly: 0, schedules: 0 }
      current.monthly += s.monthlyEquivalent
      current.schedules += 1
      byVendor.set(s.contact, current)
    }
    const topVendors = Array.from(byVendor.values())
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 10)
      .map(v => ({ ...v, monthly: Math.round(v.monthly * 100) / 100 }))

    return {
      summary: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        activeCount: incomeSchedules.length,
        draftCount: incomeSchedules.filter(s => s.status === 'DRAFT').length,
        authorisedCount: incomeSchedules.filter(s => s.status === 'AUTHORISED').length,
        totalCount: all.length,
        clientCount: byContact.size,
        recurringMonthlyCosts: Math.round(recurringMonthlyCosts * 100) / 100,
        recurringCostCount: costSchedules.length,
        netRecurring: Math.round((mrr - recurringMonthlyCosts) * 100) / 100,
      },
      schedules: incomeSchedules.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent),
      topClients,
      costSchedules: costSchedules.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent),
      topVendors,
    }
  })
})
