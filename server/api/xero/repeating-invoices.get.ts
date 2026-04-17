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

    const active = all.filter(ri => ri.status === 'AUTHORISED' && ri.type === 'ACCREC')

    const schedules = active.map(ri => {
      const monthly = toMonthly(Number(ri.total) || 0, ri.schedule)
      return {
        id: ri.repeatingInvoiceID ?? '',
        reference: ri.reference ?? '',
        contact: ri.contact?.name ?? 'Unknown',
        contactId: ri.contact?.contactID ?? '',
        currency: ri.currencyCode ?? 'AUD',
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
    })

    const mrr = schedules.reduce((sum, s) => sum + s.monthlyEquivalent, 0)
    const arr = mrr * 12

    // Group by contact for a clean top-clients view
    const byContact = new Map<string, { contact: string; contactId: string; monthly: number; schedules: number }>()
    for (const s of schedules) {
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

    return {
      summary: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        activeCount: schedules.length,
        totalCount: all.length,
        clientCount: byContact.size,
      },
      schedules: schedules.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent),
      topClients,
    }
  })
})
