/**
 * GET /api/customers/[contactId]/pipeline
 *
 * Forward-looking revenue for a single contact:
 *   • Open quotes (DRAFT / SENT / ACCEPTED) — live Xero call, filtered by ContactID
 *   • Active repeating invoices — live Xero call, filtered in JS to the contact
 *
 * Both are short fetches per contact; cached 5 minutes per (tenant, contact).
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'

interface QuoteSummary {
  id: string
  quoteNumber: string | null
  reference: string | null
  status: string
  date: string | null
  expiryDate: string | null
  total: number
  currency: string
}

interface RepeatingSchedule {
  id: string
  reference: string | null
  status: string
  total: number
  monthlyEquivalent: number
  currency: string
  unit: string
  period: number
  nextScheduledDate: string | null
  endDate: string | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

function toMonthlyEquiv(total: number, period: number, unit: string): number {
  if (!total) return 0
  const safePeriod = Math.max(1, period || 1)
  const u = String(unit || 'MONTHLY').toUpperCase()
  if (u === 'WEEKLY')  return (total / safePeriod) * (52 / 12)
  if (u === 'MONTHLY') return total / safePeriod
  if (u === 'YEARLY')  return (total / safePeriod) / 12
  return 0
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

  const token = await getActiveTokenForSession(event)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }

  return cachedFetch(event, `xero:pipeline:${tenantId}:${contactId}`, 300, async () => {
    const accessToken = token.access_token!

    // Quotes: Xero supports filtering quotes by ContactID — much cheaper
    // than pulling every quote in the org and filtering in JS.
    let quotes: QuoteSummary[] = []
    let openQuoteValue = 0
    try {
      const quotesParams = new URLSearchParams({
        ContactID: contactId,
        order: 'Date DESC',
      })
      const quotesBody = await xeroFetch<any>({
        accessToken,
        tenantId,
        path: `Quotes?${quotesParams.toString()}`,
      })
      const raw = (quotesBody?.quotes ?? []) as any[]
      quotes = raw
        // Open = anything not declined / invoiced
        .filter(q => ['DRAFT', 'SENT', 'ACCEPTED'].includes(String(q.status).toUpperCase()))
        .map((q) => ({
          id: q.quoteID,
          quoteNumber: q.quoteNumber ?? null,
          reference: q.reference ?? null,
          status: q.status,
          date: q.date ? String(q.date).slice(0, 10) : null,
          expiryDate: q.expiryDate ? String(q.expiryDate).slice(0, 10) : null,
          total: n(q.total),
          currency: q.currencyCode ?? 'AUD',
        }))
      openQuoteValue = quotes.reduce((s, q) => s + q.total, 0)
    } catch (err: any) {
      // Quotes endpoint can 404 if the org has no quotes at all — soft-fail.
      console.warn('[pipeline] quotes fetch failed:', err?.statusMessage ?? err?.message)
    }

    // Repeating invoices: no per-contact filter on the Xero side, so we
    // pull all and filter in JS. Repeating invoices are typically a small
    // list (tens of schedules across the whole org).
    let repeating: RepeatingSchedule[] = []
    let mrrTotal = 0
    try {
      const repBody = await xeroFetch<any>({
        accessToken,
        tenantId,
        path: 'RepeatingInvoices',
      })
      const raw = (repBody?.repeatingInvoices ?? []) as any[]
      repeating = raw
        .filter(r =>
          r.type === 'ACCREC'
          && String(r.status).toUpperCase() === 'AUTHORISED'
          && r.contact?.contactID === contactId,
        )
        .map((r) => {
          const total = n(r.total)
          const period = n(r.schedule?.period) || 1
          const unit = String(r.schedule?.unit ?? 'MONTHLY')
          return {
            id: r.repeatingInvoiceID,
            reference: r.reference ?? null,
            status: r.status,
            total,
            monthlyEquivalent: Math.round(toMonthlyEquiv(total, period, unit) * 100) / 100,
            currency: r.currencyCode ?? 'AUD',
            unit,
            period,
            nextScheduledDate: r.schedule?.nextScheduledDate
              ? String(r.schedule.nextScheduledDate).slice(0, 10)
              : null,
            endDate: r.schedule?.endDate
              ? String(r.schedule.endDate).slice(0, 10)
              : null,
          }
        })
      mrrTotal = repeating.reduce((s, r) => s + r.monthlyEquivalent, 0)
    } catch (err: any) {
      console.warn('[pipeline] repeating invoices fetch failed:', err?.statusMessage ?? err?.message)
    }

    return {
      quotes,
      repeating,
      summary: {
        openQuoteCount: quotes.length,
        openQuoteValue: Math.round(openQuoteValue * 100) / 100,
        mrr: Math.round(mrrTotal * 100) / 100,
        annualisedRecurring: Math.round(mrrTotal * 12 * 100) / 100,
      },
    }
  })
})
